import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb, migrate } from "@/lib/db/client";
import { authenticateApiKey, hasScope } from "@/lib/integrations/api-key";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { integrationEventSchema, integrationSourceSchema } from "@/lib/validation";
import { checkApiKeyRate } from "@/lib/rate-limit";

/**
 * Integration Gateway — olay alıcısı (Faz 1).
 * POST /api/integration/events
 *   Authorization: Bearer abys_...
 *
 * Tek olay ya da TOPLU dizi kabul eder (kenar toplama için: portal 10-30 sn
 * biriktirip tek istekte gönderir — hacim 100 kat düşer).
 *
 * Idempotency: dahili `id` HER ZAMAN sunucuda üretilir; portalın gönderdiği
 * `id` `external_event_id`de saklanır ve tekillik (org_id, source,
 * external_event_id) üzerinden kontrol edilir — aynı olay iki kez gönderilirse
 * yok sayılır, farklı kurumların aynı harici id'yi kullanması çakışmaz.
 *
 * GİZLİLİK: Bu uç İŞ olaylarını alır (lead.updated, call.completed...).
 * Tuş vuruşu/mouse izi gibi kişisel davranış verisi BEKLENMEZ ve saklanmaz;
 * istenen tüm metrikler iş olaylarının zaman damgalarından hesaplanabilir.
 */

const MAX_BATCH = 500;
const MAX_BODY = 2_000_000; // 2 MB

// Yanlış saatli bir portal, danışman süre metriklerini (aktif/boşta,
// satış döngüsü) bozmasın diye occurred_at makul bir aralıkla sınırlanır.
const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000; // 1 saat ileri
const MAX_PAST_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // 2 yıl geri

interface IncomingEvent {
  id?: string;
  event_type?: string;
  advisor_id?: string | number;
  actor_ref?: string | number;
  lead_id?: string | number;
  subject_ref?: string | number;
  session_ref?: string;
  schema_version?: string;
  occurred_at?: string;
  data?: unknown;
}

export async function POST(req: NextRequest) {
  const ctx = await authenticateApiKey(req);
  if (!ctx) {
    return NextResponse.json(
      { error: "Geçersiz ya da eksik API anahtarı (Authorization: Bearer abys_...)." },
      { status: 401 }
    );
  }
  if (!hasScope(ctx, "events:write")) {
    return NextResponse.json({ error: "Bu anahtarda events:write kapsamı yok." }, { status: 403 });
  }

  const rate = checkApiKeyRate(ctx.keyId, "events", 120);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } }
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "Gövde çok büyük (2 MB sınırı)." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Gövde geçerli JSON değil." }, { status: 400 });
  }

  const body = parsed as { source?: string; events?: IncomingEvent[] } & IncomingEvent;
  const sourceResult = integrationSourceSchema.safeParse((body.source ?? "portal").toString());
  if (!sourceResult.success) {
    return NextResponse.json({ error: `Geçersiz source: ${sourceResult.error.issues[0].message}` }, { status: 400 });
  }
  const source = sourceResult.data;
  const incoming: IncomingEvent[] = Array.isArray(body.events) ? body.events : [body];

  if (incoming.length === 0) {
    return NextResponse.json({ error: "Olay listesi boş." }, { status: 400 });
  }
  if (incoming.length > MAX_BATCH) {
    return NextResponse.json({ error: `Toplu gönderim sınırı ${MAX_BATCH} olay.` }, { status: 400 });
  }

  await migrate();
  const db = getDb();
  const batchId = randomBytes(6).toString("hex");

  let accepted = 0;
  let duplicate = 0;
  const rejected: { index: number; reason: string }[] = [];

  // Tek transaction: istek ortasında çökme kısmi kayıt bırakmaz. Her olay
  // doğrulama/duplicate reddi savepoint ile izole edilir ki bir olayın
  // reddi diğerlerini rollback'e sürüklemesin.
  await db.transaction(async (tx) => {
    for (let i = 0; i < incoming.length; i++) {
      const e = incoming[i];

      const eventResult = integrationEventSchema.safeParse(e);
      if (!eventResult.success) {
        rejected.push({ index: i, reason: eventResult.error.issues[0]?.message ?? "geçersiz olay" });
        continue;
      }
      const type = eventResult.data.event_type;

      // occurred_at yoksa alım zamanı kullanılır; geçersizse ya da makul
      // aralığın dışındaysa (yanlış saatli portal) reddedilir.
      let occurredAt = new Date();
      if (e.occurred_at) {
        const d = new Date(e.occurred_at);
        if (Number.isNaN(d.getTime())) {
          rejected.push({ index: i, reason: "occurred_at geçersiz tarih" });
          continue;
        }
        const skewMs = d.getTime() - Date.now();
        if (skewMs > MAX_FUTURE_SKEW_MS) {
          rejected.push({ index: i, reason: "occurred_at 1 saatten fazla gelecekte" });
          continue;
        }
        if (-skewMs > MAX_PAST_AGE_MS) {
          rejected.push({ index: i, reason: "occurred_at 2 yıldan eski" });
          continue;
        }
        occurredAt = d;
      }

      const actorRef = (e.advisor_id ?? e.actor_ref)?.toString() ?? null;
      const subjectRef = (e.lead_id ?? e.subject_ref)?.toString() ?? null;
      const sessionRef = e.session_ref?.toString() ?? null;
      const schemaVersion = e.schema_version?.toString() ?? "1.0";
      // Dahili id her zaman sunucuda üretilir; portalın gönderdiği kimlik
      // (varsa) external_event_id'de tutulur ve (org_id, source,
      // external_event_id) üzerinden tekillik sağlanır.
      const eventId = randomBytes(10).toString("hex");
      const externalEventId = e.id?.toString() ?? null;

      // Postgres bir ifade hata verince transaction'ı "aborted" durumuna
      // düşürür (sonraki komutlar reddedilir); SAVEPOINT bu olayı diğerlerinden
      // izole eder, bir duplicate/hata tüm batch'i rollback'e sürüklemez.
      const savepoint = `sp_${i}`;
      try {
        await tx.query(`SAVEPOINT ${savepoint}`);
        await tx.query(
          `INSERT INTO integration_events
             (id, org_id, event_type, actor_ref, subject_ref, occurred_at, payload, source, batch_id, external_event_id, session_ref, schema_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            eventId,
            ctx.orgId,
            type,
            actorRef,
            subjectRef,
            occurredAt.toISOString(),
            JSON.stringify(e.data ?? {}),
            source,
            batchId,
            externalEventId,
            sessionRef,
            schemaVersion,
          ]
        );
        await tx.query(`RELEASE SAVEPOINT ${savepoint}`);
        accepted++;
      } catch (err) {
        await tx.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("duplicate key") || msg.includes("unique")) {
          duplicate++;
        } else {
          rejected.push({ index: i, reason: "kayıt hatası" });
        }
      }
    }
  });

  // Toplu gönderim tek denetim olayı üretir (gürültü yapmaz).
  if (accepted > 0) {
    await recordAuditEvent({
      orgId: ctx.orgId,
      actor: `api:${ctx.name}`,
      type: "events_ingested",
      summary: `${accepted} olay alındı (${source})`,
      detail: batchId,
    });
  }

  return NextResponse.json({
    batchId,
    accepted,
    duplicate,
    rejected: rejected.length,
    rejectedDetail: rejected.slice(0, 10),
  });
}
