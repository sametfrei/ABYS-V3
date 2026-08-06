import { NextRequest, NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db/client";
import { resolveBitrixConfig } from "@/lib/integrations/bitrix24/config";
import {
  parseIncomingWebhookEvent,
  verifyWebhookToken,
  computeEventIdempotencyKey,
  redactWebhookEvent,
  MAX_EVENT_PAYLOAD_BYTES,
} from "@/lib/integrations/bitrix24/events";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const AUDIT_TYPE = "bitrix24_webhook_event";

/**
 * Gelecekteki Bitrix24 outbound webhook alımı için HAZIR uç. Bu uç OTURUM
 * GEREKTİRMEZ (Bitrix24 portalı çağırır) — güvenlik application_token
 * karşılaştırmasına dayanır, tıpkı /api/webhook/[orgId]'nin imzaya
 * dayanması gibi. org_id burada oturumdan DEĞİL, ?orgId= sorgu
 * parametresinden gelir (tenant izolasyonu: org var mı + token doğru mu).
 *
 * Bitrix24 outbound webhook'ları application/x-www-form-urlencoded
 * gönderir (event, data[FIELDS][ID], ts, auth[application_token]); JSON
 * gövde de kabul edilir (test/entegrasyon kolaylığı için).
 */
export async function POST(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId sorgu parametresi gerekli." }, { status: 400 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf-8") > MAX_EVENT_PAYLOAD_BYTES) {
    return NextResponse.json({ error: `Gövde ${MAX_EVENT_PAYLOAD_BYTES} bayt sınırını aşıyor.` }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = parseEventBody(rawBody, req.headers.get("content-type"));
  } catch {
    return NextResponse.json({ error: "Gövde ayrıştırılamadı." }, { status: 400 });
  }

  const parsed = parseIncomingWebhookEvent(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }
  const event = parsed.event;

  const config = resolveBitrixConfig();
  if (!verifyWebhookToken(config, event.auth?.application_token)) {
    return NextResponse.json({ error: "Geçersiz veya eksik application_token." }, { status: 401 });
  }

  await migrate();
  const db = getDb();
  const org = await db.query("SELECT 1 FROM organizations WHERE id = $1", [orgId]);
  if (org.rows.length === 0) {
    return NextResponse.json({ error: "Kurum bulunamadı." }, { status: 404 });
  }

  const idempotencyKey = computeEventIdempotencyKey(event);
  const dup = await db.query(
    `SELECT 1 FROM audit_events WHERE org_id = $1 AND type = $2 AND detail LIKE $3 LIMIT 1`,
    [orgId, AUDIT_TYPE, `%${idempotencyKey}%`]
  );
  if (dup.rows.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true, idempotencyKey });
  }

  await recordAuditEvent({
    orgId,
    actor: "bitrix24-webhook",
    type: AUDIT_TYPE,
    summary: `Bitrix24 olayı alındı: ${event.event}`,
    detail: JSON.stringify({ idempotencyKey, ...redactWebhookEvent(event) }),
  });

  return NextResponse.json({ ok: true, event: event.event, idempotencyKey });
}

function parseEventBody(rawBody: string, contentType: string | null): unknown {
  if (contentType?.includes("application/json")) {
    return rawBody.trim() ? JSON.parse(rawBody) : {};
  }
  return formUrlEncodedToObject(rawBody);
}

/** "data[FIELDS][ID]=5&event=x" gibi köşeli parantez yollarını iç içe nesneye çevirir. */
function formUrlEncodedToObject(rawBody: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const params = new URLSearchParams(rawBody);
  for (const [key, value] of params.entries()) {
    const path = key
      .replace(/\]/g, "")
      .split("[")
      .filter((segment) => segment.length > 0);
    let cursor = result;
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      if (typeof cursor[segment] !== "object" || cursor[segment] === null) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
    const lastSegment = path[path.length - 1];
    if (lastSegment !== undefined) cursor[lastSegment] = value;
  }
  return result;
}
