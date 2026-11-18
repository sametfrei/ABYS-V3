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
// IP güvenilir değilse (XFF istemci kontrollü) tüm istemciler ortak bir
// yüksek tavanı paylaşır; per-IP 5'lik dar pencere uygulanamaz.
const ANON_UNKNOWN_MAX = 100;

// Bellek üst sınırı: anahtar başına pencere dolduğunda değil, harita
// büyüdüğünde temizle. Dönen XFF/e-posta ile sınırsız anahtar üretilip
// belleğin büyümesini engellemek için sert bir tavan da uygulanır.
const PRUNE_THRESHOLD = 500;
const MAX_BUCKETS = 5000;

function prune(now: number) {
  if (buckets.size < PRUNE_THRESHOLD) return;
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  // Süresi dolmamış ama sayıca taşan eski anahtarları at (Map ekleme sırası).
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

/**
 * İstemci IP'si yalnızca `ABYS_TRUST_PROXY=1` iken istek başlıklarından
 * okunur (ters proxy başlığı ekliyorsa). Aksi halde `X-Forwarded-For`
 * istemci tarafından serbestçe belirlenebilir olduğu için GÜVENİLMEZ; null
 * döner ve çağıranlar IP'siz davranışa düşer.
 * Güvenilen modda proxy'nin eklediği SON hop kullanılır; ilk hop istemci
 * tarafından sahte gönderilebilir.
 */
export function trustedClientIp(request: Request): string | null {
  const flag = process.env.ABYS_TRUST_PROXY?.trim().toLowerCase();
  if (!(flag === "1" || flag === "true")) return null;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return hops.length > 0 ? hops[hops.length - 1]! : null;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
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

  const ip = trustedClientIp(request);
  const key = ip ? `anon:ip:${ip}` : "anon:unknown";
  const max = ip ? ANON_MAX : ANON_UNKNOWN_MAX;

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + ANON_WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfterSec,
      message: `Oturumsuz istek sınırı aşıldı (${max} istek / 10 dk). Kurumsal oturum açın ya da ${retryAfterSec} sn sonra tekrar deneyin.`,
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

// Giriş (kaba kuvvet) koruması, 15 dk penceresi:
// - E-posta başına 5 başarısız deneme → IP'den BAĞIMSIZ kilit. XFF değiştirmek
//   hesap kilidini atlatamaz.
// - Güvenilir IP varsa (ABYS_TRUST_PROXY=1) IP başına 20 başarısız deneme.
// - IP güvenilir değilse tüm istemciler ortak 100'lük yüksek tavanı paylaşır;
//   böylece tek bir istemci tüm kullanıcıları hızla kilitleyemez.
// Yalnızca başarısız denemeler sayılır.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_EMAIL_MAX = 5;
const LOGIN_IP_MAX = 20;
const LOGIN_UNKNOWN_GLOBAL_MAX = 100;

function loginKeys(request: Request, email: string): { email: string; ip: string | null } {
  const ip = trustedClientIp(request);
  return {
    email: `login:email:${email.trim().toLowerCase()}`,
    ip: ip ? `login:ip:${ip}` : null,
  };
}

// IP bilinmiyorken kullanılan ortak anahtar (yüksek tavan).
const LOGIN_UNKNOWN_KEY = "login:unknown";

function loginLimits(keys: { email: string; ip: string | null }): Array<[string, number]> {
  const limits: Array<[string, number]> = [[keys.email, LOGIN_EMAIL_MAX]];
  if (keys.ip) limits.push([keys.ip, LOGIN_IP_MAX]);
  else limits.push([LOGIN_UNKNOWN_KEY, LOGIN_UNKNOWN_GLOBAL_MAX]);
  return limits;
}

/**
 * Giriş denemesinden ÖNCE çağrılır; sayacı artırmaz.
 * Aşımda `allowed: false` ve `retryAfterSec` döner (route 429 + Retry-After üretir).
 */
export function checkLoginRate(request: Request, email: string): RateVerdict {
  const now = Date.now();
  prune(now);
  const keys = loginKeys(request, email);

  for (const [key, max] of loginLimits(keys)) {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt >= now && bucket.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return {
        allowed: false,
        retryAfterSec,
        message: `Çok fazla başarısız giriş denemesi. ${retryAfterSec} saniye sonra tekrar deneyin.`,
      };
    }
  }

  return { allowed: true };
}

/** Başarısız girişte e-posta ve (varsa güvenilir) IP/global sayaçlarını artırır. */
export function recordLoginFailure(request: Request, email: string): void {
  const now = Date.now();
  prune(now);
  const keys = loginKeys(request, email);

  for (const [key] of loginLimits(keys)) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      bucket.count++;
    }
  }
}

/** Başarılı girişte e-posta sayacını sıfırlar; IP/global sayaç rolling kalır. */
export function resetLoginRate(request: Request, email: string): void {
  buckets.delete(loginKeys(request, email).email);
}

/** Test/bakım için sayaçları sıfırlar. */
export function resetRateLimits() {
  buckets.clear();
}

// Parola değiştirmede mevcut parola denemeleri: oturum çalınmış olsa bile
// saldırgan mevcut parolayı sınırsız denemesin. Kullanıcı başına 15 dk'da 5.
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_MAX = 5;

function passwordKey(userId: string): string {
  return `password:user:${userId}`;
}

export function checkPasswordRate(userId: string): RateVerdict {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(passwordKey(userId));
  if (bucket && bucket.resetAt >= now && bucket.count >= PASSWORD_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfterSec,
      message: `Çok fazla hatalı parola denemesi. ${retryAfterSec} saniye sonra tekrar deneyin.`,
    };
  }
  return { allowed: true };
}

export function recordPasswordFailure(userId: string): void {
  const now = Date.now();
  prune(now);
  const key = passwordKey(userId);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + PASSWORD_WINDOW_MS });
  } else {
    bucket.count++;
  }
}

export function resetPasswordRate(userId: string): void {
  buckets.delete(passwordKey(userId));
}
