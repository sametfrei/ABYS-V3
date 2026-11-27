import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { createApiKey, listApiKeys, revokeApiKey, type Scope } from "@/lib/integrations/api-key";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError, localizedErrorWith, requestLocale } from "@/lib/api-i18n";
import { t } from "@/lib/i18n";

/**
 * API anahtarı yönetimi (insan oturumu gerekir — makine anahtarı kendi
 * kendine anahtar üretemez). ingest_data izni zorunlu.
 */

const VALID_SCOPES: Scope[] = ["events:write", "read:advisors", "read:all"];

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }
  return NextResponse.json({ keys: await listApiKeys(session.orgId) });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  let body: { name?: string; scopes?: string[] };
  try {
    body = await req.json();
  } catch {
    return localizedError(req, "api.scenarios.invalidBody", 400);
  }
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (!name) return localizedError(req, "api.integration.keyNameRequired", 400);

  // Yanlış tipli scopes 500 yerine varsayılana düşer; geçersiz kapsamlar elenir.
  const scopes = (Array.isArray(body.scopes) ? body.scopes : ["events:write"]).filter(
    (s): s is Scope => VALID_SCOPES.includes(s as Scope)
  );
  if (scopes.length === 0) {
    return localizedErrorWith(req, "api.integration.invalidScope", 400, {
      scopes: VALID_SCOPES.join(", "),
    });
  }

  const created = await createApiKey({ orgId: session.orgId, name, scopes, createdBy: session.displayName });
  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "api_key_created",
    summary: `API anahtarı üretildi: ${name}`,
    detail: created.id,
  });

  // Düz metin anahtar YALNIZCA burada döner — bir daha gösterilemez.
  return NextResponse.json({
    id: created.id,
    key: created.plainKey,
    prefix: created.prefix,
    scopes,
    warning: t(requestLocale(req), "api.integration.keyWarning"),
  });
}

export async function DELETE(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }
  const keyId = req.nextUrl.searchParams.get("id");
  if (!keyId) return localizedError(req, "api.integration.keyIdRequired", 400);

  const ok = await revokeApiKey(session.orgId, keyId);
  if (!ok) return localizedError(req, "api.integration.keyNotFound", 404);

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "api_key_revoked",
    summary: "API anahtarı iptal edildi",
    detail: keyId,
  });
  return NextResponse.json({ ok: true });
}
