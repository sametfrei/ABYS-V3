import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { localizedError, localizedErrorWith } from "@/lib/api-i18n";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { insertDocument } from "@/lib/db/repos/documents";
import { extractText } from "@/lib/documents/extract";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { documentUploadTitleSchema, parseAllowedRoles } from "@/lib/data/route-schemas";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * İkili dosya yükleme (PDF/DOCX/TXT/CSV) — çıkarılan metin insertDocument ile
 * kaydedilir. Metin-yapıştırma yolu (POST /api/documents) ayrıca kalır.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    return localizedError(req, "api.documents.fileTooLarge", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return localizedError(req, "api.documents.invalidForm", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return localizedError(req, "api.documents.fileRequired", 400);
  }
  if (file.size > MAX_BYTES) {
    return localizedError(req, "api.documents.fileTooLarge", 413);
  }

  // Başlık: trim + 200 karakter sınırı; boşsa dosya adına düş (mevcut davranış).
  const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
  const titleParsed = documentUploadTitleSchema.safeParse(
    String(form.get("title") ?? "").trim() || fallbackTitle
  );
  if (!titleParsed.success) {
    const message = titleParsed.error.issues
      .map((issue) => `${issue.path.join(".") || "başlık"}: ${issue.message}`)
      .join("; ");
    return localizedErrorWith(req, "api.documents.invalidTitle", 400, { details: message });
  }
  const title = titleParsed.data;

  // allowedRoles: yalnızca tanımlı RBAC rolleri; bilinmeyen rol 400.
  const rolesParsed = parseAllowedRoles(form.get("allowedRoles"));
  if (!rolesParsed.ok) {
    return NextResponse.json({ error: rolesParsed.error }, { status: 400 });
  }
  const allowedRoles = rolesParsed.allowedRoles;

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
