import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { insertDocument, listDocuments } from "@/lib/db/repos/documents";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { documentPostSchema } from "@/lib/data/route-schemas";
import { localizedError, localizedErrorFromCookies } from "@/lib/api-i18n";

/** Kurumun belgeleri — yalnızca rolün erişebildikleri (yetki-farkındalıklı). */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const documents = await listDocuments(session.orgId, session.role);
  return NextResponse.json({ documents });
}

/**
 * Belge içe alma — ingest_data izni gerekir.
 * GÜVENLİK: belge içeriği ASLA talimat olarak yorumlanmaz; yalnızca veri
 * olarak saklanır ve erişimde alıntılanır (prompt injection koruması,
 * master plan md.14).
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const parsed = await parseBody(req, documentPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const title = body.title;
  const text = body.text;
  const sourceType = body.sourceType ?? "txt";

  const { documentId, chunkCount } = await insertDocument({
    orgId: session.orgId,
    title,
    sourceType,
    text,
    uploadedBy: session.displayName,
    allowedRoles: body.allowedRoles,
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "document_ingested",
    summary: `Belge eklendi: ${title} (${chunkCount} parça)`,
    detail: documentId,
  });

  return NextResponse.json({ documentId, chunkCount });
}
