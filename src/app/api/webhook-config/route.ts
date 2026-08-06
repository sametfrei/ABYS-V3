import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { ensureSecret, rotateSecret } from "@/lib/integrations/webhook";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/**
 * Webhook yapılandırması (uç URL + gizli anahtar). ingest_data izni gerekir.
 * Gizli anahtar yalnızca yetkili kullanıcıya gösterilir; her görüntüleme
 * denetime yazılır.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const secret = await ensureSecret(session.orgId);
  await migrate();
  const stats = await getDb().query<{ n: number; accepted: number }>(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE accepted)::int AS accepted
     FROM webhook_deliveries WHERE org_id = $1`,
    [session.orgId]
  );

  return NextResponse.json({
    url: `/api/webhook/${session.orgId}`,
    secret,
    headers: {
      "X-ABYS-Signature": "HMAC-SHA256(secret, `${timestamp}.${rawBody}`) hex",
      "X-ABYS-Timestamp": "epoch ms (±5 dk pencere)",
      "X-ABYS-Idempotency-Key": "benzersiz teslimat anahtarı",
    },
    deliveries: { total: stats.rows[0]?.n ?? 0, accepted: stats.rows[0]?.accepted ?? 0 },
  });
}

/** Gizli anahtarı döndürür (rotasyon). */
export async function POST() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }
  const secret = await rotateSecret(session.orgId);
  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "webhook_secret_rotated",
    summary: "Webhook gizli anahtarı yenilendi",
  });
  return NextResponse.json({ secret });
}
