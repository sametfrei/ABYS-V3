import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getDb, migrate } from "@/lib/db/client";

/**
 * İmzalı webhook güvenliği (Faz 7, master plan md.16).
 *
 * Katmanlar (hepsi zorunlu):
 *  1. Kurum başına gizli anahtar (webhook_secrets)
 *  2. HMAC-SHA256 imza — gövde + zaman damgası üzerinden, timing-safe karşılaştırma
 *  3. Zaman penceresi — eski istekler reddedilir (replay saldırısına karşı)
 *  4. Idempotency anahtarı — aynı teslimat iki kez işlenmez (benzersiz indeks)
 *  5. Hız sınırı — kurum başına dakikalık teslimat tavanı
 * Her deneme (kabul/ret) webhook_deliveries'e ve denetim günlüğüne yazılır.
 */

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 dakika
const RATE_LIMIT_PER_MINUTE = 60;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Kurumun webhook sırrını döner; yoksa üretir. */
export async function ensureSecret(orgId: string): Promise<string> {
  await migrate();
  const db = getDb();
  const r = await db.query<{ secret: string }>("SELECT secret FROM webhook_secrets WHERE org_id = $1", [orgId]);
  if (r.rows[0]) return r.rows[0].secret;
  const secret = randomBytes(32).toString("hex");
  await db.query("INSERT INTO webhook_secrets (org_id, secret) VALUES ($1, $2)", [orgId, secret]);
  return secret;
}

export async function rotateSecret(orgId: string): Promise<string> {
  await migrate();
  const secret = randomBytes(32).toString("hex");
  await getDb().query(
    `INSERT INTO webhook_secrets (org_id, secret, rotated_at) VALUES ($1, $2, now())
     ON CONFLICT (org_id) DO UPDATE SET secret = $2, rotated_at = now()`,
    [orgId, secret]
  );
  return secret;
}

export type VerifyFailure =
  | "org_bulunamadi"
  | "imza_eksik"
  | "zaman_damgasi_eksik"
  | "zaman_damgasi_gecersiz"
  | "zaman_penceresi_disi"
  | "imza_gecersiz"
  | "idempotency_eksik"
  | "hiz_siniri";

export interface VerifyResult {
  ok: boolean;
  reason?: VerifyFailure;
  message?: string;
}

export async function verifyWebhook(params: {
  orgId: string;
  signature: string | null;
  timestamp: string | null;
  idempotencyKey: string | null;
  rawBody: string;
}): Promise<VerifyResult> {
  await migrate();
  const db = getDb();

  if (!params.signature) return { ok: false, reason: "imza_eksik", message: "X-ABYS-Signature başlığı gerekli." };
  if (!params.timestamp) return { ok: false, reason: "zaman_damgasi_eksik", message: "X-ABYS-Timestamp başlığı gerekli." };
  if (!params.idempotencyKey) {
    return { ok: false, reason: "idempotency_eksik", message: "X-ABYS-Idempotency-Key başlığı gerekli." };
  }

  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "zaman_damgasi_gecersiz", message: "Zaman damgası sayısal olmalı (epoch ms)." };
  }
  if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
    return {
      ok: false,
      reason: "zaman_penceresi_disi",
      message: "İstek zaman penceresi dışında (±5 dk) — replay koruması.",
    };
  }

  const secretRow = await db.query<{ secret: string }>("SELECT secret FROM webhook_secrets WHERE org_id = $1", [
    params.orgId,
  ]);
  if (!secretRow.rows[0]) {
    return { ok: false, reason: "org_bulunamadi", message: "Bu kurum için webhook yapılandırılmamış." };
  }

  const expected = signPayload(secretRow.rows[0].secret, params.timestamp, params.rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(params.signature, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "imza_gecersiz", message: "İmza doğrulanamadı." };
  }

  // Hız sınırı — son 1 dakikadaki teslimat sayısı
  const recent = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM webhook_deliveries
     WHERE org_id = $1 AND created_at > now() - interval '1 minute'`,
    [params.orgId]
  );
  if ((recent.rows[0]?.n ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, reason: "hiz_siniri", message: `Hız sınırı aşıldı (dakikada ${RATE_LIMIT_PER_MINUTE}).` };
  }

  return { ok: true };
}

/** Teslimat kaydı. Idempotency çakışması "zaten işlendi" olarak döner. */
export async function recordDelivery(params: {
  orgId: string;
  idempotencyKey: string;
  signature: string;
  payloadSize: number;
  accepted: boolean;
  reason?: string;
  datasetId?: string | null;
}): Promise<{ duplicate: boolean }> {
  await migrate();
  try {
    await getDb().query(
      `INSERT INTO webhook_deliveries (id, org_id, idempotency_key, signature, payload_size, accepted, reason, dataset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomBytes(8).toString("hex"),
        params.orgId,
        params.idempotencyKey,
        params.signature,
        params.payloadSize,
        params.accepted,
        params.reason ?? null,
        params.datasetId ?? null,
      ]
    );
    return { duplicate: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key") || msg.includes("unique")) return { duplicate: true };
    throw err;
  }
}
