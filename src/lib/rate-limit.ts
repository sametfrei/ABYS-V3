/**
 * Basit bellek-içi hız sınırlayıcı (Faz 7 güvenlik düzeltmesi).
 *
 * Neden: /api/analyze, /api/briefing, /api/ingest uçları prototip akışını
 * (localStorage modu) desteklemek için oturumsuz çalışabiliyor. Bu, kimliksiz
 * bir istemcinin AI hesap kaynağını tüketmesine açık kapı bırakıyordu.
 * Oturumlu istekler kurum kotasına tabidir; oturumsuz istekler IP başına
 * dar bir pencereyle sınırlanır.
 *
 * Sınır: tek süreç belleğinde tutulur (PGlite gibi tek-süreç dağıtımına uygun).
 * Çok örnekli dağıtımda paylaşımlı bir sayaç (Redis) gerekir — DEPLOYMENT.md'de
 * not edilmelidir.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Oturumsuz AI istekleri: 10 dakikada 5 istek (demo/deneme için yeterli,
// kaynak tüketimi için değil).
const ANON_WINDOW_MS = 10 * 60 * 1000;
const ANON_MAX = 5;

function prune(now: number) {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}

export interface RateVerdict {
  allowed: boolean;
  retryAfterSec?: number;
  message?: string;
}

/**
 * Oturumsuz istekleri IP başına sınırlar. Oturum varsa sınır uygulanmaz
 * (kimlik ve denetim izi zaten mevcut).
 */
export function checkAnonymousRate(request: Request, hasSession: boolean): RateVerdict {
  if (hasSession) return { allowed: true };

  const now = Date.now();
  prune(now);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "bilinmeyen";
  const key = `anon:${ip}`;

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + ANON_WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= ANON_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfterSec,
      message: `Oturumsuz istek sınırı aşıldı (${ANON_MAX} istek / 10 dk). Kurumsal oturum açın ya da ${retryAfterSec} sn sonra tekrar deneyin.`,
    };
  }

  bucket.count++;
  return { allowed: true };
}

/**
 * API anahtarı başına dakikalık istek sınırı (Integration Gateway).
 * route parametresi aynı anahtarın farklı uçlardaki kullanımını ayrı sayaçlarda tutar.
 */
export function checkApiKeyRate(keyId: string, route: string, limitPerMinute: number): RateVerdict {
  const now = Date.now();
  prune(now);

  const key = `apikey:${route}:${keyId}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }

  if (bucket.count >= limitPerMinute) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfterSec,
      message: `API anahtarı hız sınırı aşıldı (dakikada ${limitPerMinute}). ${retryAfterSec} sn sonra tekrar deneyin.`,
    };
  }

  bucket.count++;
  return { allowed: true };
}

/** Test/bakım için sayaçları sıfırlar. */
export function resetRateLimits() {
  buckets.clear();
}
