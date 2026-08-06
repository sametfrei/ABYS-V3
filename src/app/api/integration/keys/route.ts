import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { createApiKey, listApiKeys, revokeApiKey, type Scope } from "@/lib/integrations/api-key";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/**
 * API anahtarı yönetimi (insan oturumu gerekir — makine anahtarı kendi
 * kendine anahtar üretemez). ingest_data izni zorunlu.
 */

const VALID_SCOPES: Scope[] = ["events:write", "read:advisors", "read:all"];

export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }
  return NextResponse.json({ keys: await listApiKeys(session.orgId) });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  let body: { name?: string; scopes?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Anahtar adı gerekli." }, { status: 400 });

  const scopes = (body.scopes ?? ["events:write"]).filter((s): s is Scope =>
    VALID_SCOPES.includes(s as Scope)
  );
  if (scopes.length === 0) {
    return NextResponse.json(
      { error: `Geçerli kapsam gerekli: ${VALID_SCOPES.join(", ")}` },
      { status: 400 }
    );
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
    warning: "Bu anahtar bir daha gösterilmeyecek. Güvenli bir yere kaydedin.",
  });
}

export async function DELETE(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }
  const keyId = req.nextUrl.searchParams.get("id");
  if (!keyId) return NextResponse.json({ error: "id gerekli." }, { status: 400 });

  const ok = await revokeApiKey(session.orgId, keyId);
  if (!ok) return NextResponse.json({ error: "Anahtar bulunamadı ya da zaten iptal." }, { status: 404 });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "api_key_revoked",
    summary: "API anahtarı iptal edildi",
    detail: keyId,
  });
  return NextResponse.json({ ok: true });
}
