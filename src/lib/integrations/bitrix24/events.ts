import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import type { BitrixConnectorConfig } from "./config";

/**
 * Gelen Bitrix24 outbound webhook olaylarının ayrıştırılması/doğrulanması —
 * HAZIRLIK katmanı. Gerçek uç (POST /api/integrations/bitrix24/events) ayrı
 * bir kuyruk maddesinde eklenecek; bu modül o uç ile paylaşılacak saf
 * mantığı barındırır (oturum/DB'ye dokunmaz).
 *
 * Not: Bitrix24 outbound webhook'ları genelde application/x-www-form-urlencoded
 * gönderir (event, data[FIELDS][ID], ts, auth[application_token]...). Form
 * gövdesini bu şekle çeviren kod API route'unda olacak; burada yalnızca
 * NORMALLEŞTİRİLMİŞ nesne doğrulanır.
 */

export const MAX_EVENT_PAYLOAD_BYTES = 200_000;

const bitrixWebhookEventSchema = z.object({
  event: z.string().trim().min(1).max(200),
  data: z.record(z.string(), z.unknown()).default({}),
  ts: z.union([z.string(), z.number()]).optional(),
  auth: z
    .object({
      application_token: z.string().optional(),
      domain: z.string().optional(),
    })
    .optional(),
});

export type BitrixWebhookEvent = z.infer<typeof bitrixWebhookEventSchema>;

export type ParseEventResult = { ok: true; event: BitrixWebhookEvent } | { ok: false; message: string };

export function parseIncomingWebhookEvent(raw: unknown): ParseEventResult {
  const result = bitrixWebhookEventSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "geçersiz Bitrix24 olayı" };
  }
  return { ok: true, event: result.data };
}

/**
 * application_token'ı yapılandırılmış BITRIX24_WEBHOOK_TOKEN ile zamanlama
 * saldırısına dayanıklı biçimde karşılaştırır. Token yapılandırılmamışsa ya
 * da uzunluklar farklıysa daima reddeder.
 */
export function verifyWebhookToken(config: BitrixConnectorConfig, providedToken: string | null | undefined): boolean {
  if (!config.webhookToken || !providedToken) return false;
  const expected = Buffer.from(config.webhookToken, "utf8");
  const actual = Buffer.from(providedToken, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Idempotency anahtarı: aynı olay Bitrix24 tarafından tekrar gönderilirse
 * (yeniden deneme, ağ hatası) aynı anahtar üretilir — çağıran taraf bunu
 * benzersiz bir indeksle eşleştirerek tekrar işlemeyi önleyebilir.
 */
export function computeEventIdempotencyKey(event: BitrixWebhookEvent): string {
  const entityId = typeof event.data.FIELDS === "object" && event.data.FIELDS !== null
    ? (event.data.FIELDS as Record<string, unknown>).ID
    : undefined;
  const basis = `${event.event}:${entityId ?? ""}:${event.ts ?? ""}`;
  return createHash("sha256").update(basis).digest("hex");
}

/** Log/hata mesajlarında sır sızdırmamak için auth bölümünü maskeler. */
export function redactWebhookEvent(event: BitrixWebhookEvent): Record<string, unknown> {
  return {
    event: event.event,
    ts: event.ts ?? null,
    hasAuth: Boolean(event.auth?.application_token),
  };
}
