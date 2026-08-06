import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { insertDocument } from "@/lib/db/repos/documents";
import { extractText } from "@/lib/documents/extract";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * İkili dosya yükleme (PDF/DOCX/TXT/CSV) — çıkarılan metin insertDocument ile
 * kaydedilir. Metin-yapıştırma yolu (POST /api/documents) ayrıca kalır.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: "Dosya çok büyük (10MB sınırı)." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Geçersiz form verisi." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Dosya çok büyük (10MB sınırı)." }, { status: 413 });
  }

  const title = String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");

  let allowedRoles: string[] | undefined;
  const allowedRolesRaw = form.get("allowedRoles");
  if (typeof allowedRolesRaw === "string" && allowedRolesRaw.trim()) {
    try {
      const parsed = JSON.parse(allowedRolesRaw);
      if (Array.isArray(parsed)) allowedRoles = parsed.map(String);
    } catch {
      return NextResponse.json({ error: "allowedRoles geçerli bir JSON dizi olmalı." }, { status: 400 });
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  let sourceType: string;
  try {
    ({ text, sourceType } = await extractText(buf, file.type || "", file.name));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dosyadan metin çıkarılamadı.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { documentId, chunkCount } = await insertDocument({
    orgId: session.orgId,
    title,
    sourceType,
    mime: file.type || undefined,
    text,
    uploadedBy: session.displayName,
    allowedRoles,
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "document_ingested",
    summary: `Belge dosyadan eklendi: ${title} (${chunkCount} parça, ${sourceType})`,
    detail: documentId,
  });

  return NextResponse.json({ documentId, chunkCount });
}
