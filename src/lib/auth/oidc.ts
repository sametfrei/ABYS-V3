import {
  randomBytes,
  createHash,
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey as NodeJsonWebKey,
} from "crypto";

/**
 * Sağlayıcıdan bağımsız OIDC Authorization Code + PKCE akışı (Faz 8).
 * Ortam değişkenlerinden biri bile eksikse SSO tamamen kapalı sayılır —
 * mevcut parola girişi tek yol olarak kalır (bkz. getOidcConfig).
 */

export const OIDC_STATE_COOKIE = "abys_oidc_state";
export const OIDC_VERIFIER_COOKIE = "abys_oidc_verifier";
export const OIDC_NONCE_COOKIE = "abys_oidc_nonce";
export const OIDC_COOKIE_TTL_SECONDS = 60 * 10; // 10 dakika

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Dört ortam değişkeninden biri bile eksikse null döner — SSO kapalı sayılır. */
export function getOidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  return { issuer, clientId, clientSecret, redirectUri };
}

export function isSsoConfigured(): boolean {
  return getOidcConfig() !== null;
}

export interface OidcDiscoveryDocument {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  /** id_token imzasının doğrulanacağı anahtar kümesi (OIDC keşif belgesinde zorunlu). */
  jwks_uri?: string;
}

let discoveryCache: { issuer: string; doc: OidcDiscoveryDocument; fetchedAt: number } | null = null;
const DISCOVERY_TTL_MS = 1000 * 60 * 60; // 1 saat

const OIDC_FETCH_TIMEOUT_MS = 5000;

/**
 * Sağlayıcı uç noktaları HTTPS olmalıdır. Yerel geliştirme için yalnızca
 * localhost/127.0.0.1 üzerinde http kabul edilir. Bu kontrol, discovery
 * belgesindeki bir yönlendirme veya kötü niyetli jwks_uri'nin istemci
 * sırrını/id_token'ı açık metin taşımasını engeller.
 */
function assertTrustedEndpoint(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`OIDC ${label} geçerli bir URL değil.`);
  }
  if (url.protocol === "https:") return;
  const isLocalHttp =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (!isLocalHttp) {
    throw new Error(`OIDC ${label} HTTPS olmalıdır (yalnızca localhost http kabul edilir).`);
  }
}

/** issuer'ın /.well-known/openid-configuration belgesini çeker ve önbellekler. */
export async function getDiscoveryDocument(issuer: string): Promise<OidcDiscoveryDocument> {
  if (
    discoveryCache &&
    discoveryCache.issuer === issuer &&
    Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS
  ) {
    return discoveryCache.doc;
  }
  assertTrustedEndpoint(issuer, "issuer");
  const url = new URL("/.well-known/openid-configuration", issuer).toString();
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(OIDC_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error("OIDC discovery belgesi alınamadı: ağ hatası veya zaman aşımı.");
  }
  if (!res.ok) {
    throw new Error(`OIDC discovery belgesi alınamadı (${res.status}): ${url}`);
  }
  const doc = (await res.json()) as OidcDiscoveryDocument;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC discovery belgesi eksik: authorization_endpoint/token_endpoint yok.");
  }
  // Sağlayıcının kendini bildirdiği issuer, yapılandırılan issuer ile AYNI olmalı.
  // Aksi halde yönlendirilmiş/DNS ele geçirilmiş bir discovery belgesi kabul edilirdi.
  if (doc.issuer !== issuer) {
    throw new Error("OIDC discovery belgesindeki issuer yapılandırmayla eşleşmiyor.");
  }
  assertTrustedEndpoint(doc.authorization_endpoint, "authorization_endpoint");
  assertTrustedEndpoint(doc.token_endpoint, "token_endpoint");
  if (doc.jwks_uri) assertTrustedEndpoint(doc.jwks_uri, "jwks_uri");
  discoveryCache = { issuer, doc, fetchedAt: Date.now() };
  return doc;
}

/** Yalnızca test/tekrar-deneme amaçlı: önbelleği sıfırlar. */
export function resetDiscoveryCache(): void {
  discoveryCache = null;
}

export interface OidcJwk {
  kty?: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

let jwksCache: { uri: string; keys: OidcJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 1000 * 60 * 60; // 1 saat

/**
 * jwks_uri'den imza anahtarlarını çeker ve önbellekler.
 * `forceRefresh`, anahtar döndürmesi (key rotation) sırasında `kid` bulunamazsa
 * bir kez yeniden çekmek için kullanılır.
 */
export async function getJwks(jwksUri: string, forceRefresh = false): Promise<OidcJwk[]> {
  if (
    !forceRefresh &&
    jwksCache &&
    jwksCache.uri === jwksUri &&
    Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS
  ) {
    return jwksCache.keys;
  }
  assertTrustedEndpoint(jwksUri, "jwks_uri");
  let res: Response;
  try {
    res = await fetch(jwksUri, {
      redirect: "error",
      signal: AbortSignal.timeout(OIDC_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error("OIDC imza anahtarları (JWKS) alınamadı: ağ hatası veya zaman aşımı.");
  }
  if (!res.ok) {
    throw new Error(`OIDC imza anahtarları (JWKS) alınamadı (${res.status}): ${jwksUri}`);
  }
  const json = (await res.json()) as { keys?: unknown };
  if (!Array.isArray(json.keys)) {
    throw new Error("OIDC JWKS belgesi geçersiz: 'keys' dizisi yok.");
  }
  const keys = json.keys.filter(
    (k): k is OidcJwk => typeof k === "object" && k !== null
  );
  jwksCache = { uri: jwksUri, keys, fetchedAt: Date.now() };
  return keys;
}

/** Yalnızca test/tekrar-deneme amaçlı: JWKS önbelleğini sıfırlar. */
export function resetJwksCache(): void {
  jwksCache = null;
}

export function generateState(): string {
  return randomBytes(32).toString("hex");
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** RFC 7636 S256: code_verifier rastgele üretilir, code_challenge onun sha256/base64url'idir. */
export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  /** OIDC nonce — id_token'ı bu tarayıcı oturumuna bağlar. */
  nonce?: string;
}): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.nonce) url.searchParams.set("nonce", params.nonce);
  return url.toString();
}

export async function exchangeCodeForToken(params: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{ idToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
  });
  assertTrustedEndpoint(params.tokenEndpoint, "token_endpoint");
  let res: Response;
  try {
    res = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      redirect: "error",
      signal: AbortSignal.timeout(OIDC_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error("OIDC token değişimi başarısız: ağ hatası veya zaman aşımı.");
  }
  if (!res.ok) {
    throw new Error(`OIDC token değişimi başarısız (${res.status}).`);
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) {
    throw new Error("OIDC token yanıtında id_token yok.");
  }
  return { idToken: json.id_token };
}

interface IdTokenPayload {
  iss?: string;
  aud?: string | string[];
  azp?: string;
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
}

/**
 * E-posta, ABYS hesabıyla eşleştirilen TEK kimlik anahtarıdır. Bu yüzden
 * IdP'nin e-postayı doğruladığını (`email_verified: true`) şart koşarız;
 * aksi halde doğrulanmamış e-posta ile hesap devralma riski doğar.
 * Doğrulanmamış e-posta kabul eden sağlayıcılar için bilinçli opt-out:
 * `OIDC_ALLOW_UNVERIFIED_EMAIL=1`.
 */
function requireVerifiedEmail(): boolean {
  const flag = process.env.OIDC_ALLOW_UNVERIFIED_EMAIL?.trim().toLowerCase();
  return !(flag === "1" || flag === "true");
}

/**
 * id_token'ı çözer ve iss/aud/exp iddialarını doğrular, e-postayı döner.
 * NOT: Bu fonksiyon yalnızca İDDİALARI doğrular; imzayı doğrulamaz. Üretim
 * akışında önce `verifyIdToken` çağrılır (JWKS imza doğrulaması), o da
 * sonunda bu fonksiyonu kullanır. İmza doğrulanmamış bir jeton asla kabul
 * edilmemelidir.
 */
export function decodeAndValidateIdToken(
  idToken: string,
  expected: { issuer: string; clientId: string; nonce?: string }
): string {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Kimlik jetonu (id_token) biçimi geçersiz.");
  }
  let payload: IdTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Kimlik jetonu (id_token) çözülemedi.");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error("Kimlik jetonunun süresi dolmuş.");
  }
  const audOk =
    payload.aud === expected.clientId ||
    (Array.isArray(payload.aud) && payload.aud.includes(expected.clientId));
  if (!audOk) {
    throw new Error("Kimlik jetonu bu istemciye ait değil (aud uyuşmuyor).");
  }
  // Birden çok audience varsa OIDC gereği azp zorunludur ve bu istemci olmalı.
  if (
    Array.isArray(payload.aud) &&
    payload.aud.length > 1 &&
    payload.azp !== expected.clientId
  ) {
    throw new Error("Kimlik jetonu yetkilendirilmiş taraf (azp) uyuşmuyor.");
  }
  if (expected.nonce !== undefined && payload.nonce !== expected.nonce) {
    throw new Error("Kimlik jetonu nonce değeri eşleşmiyor.");
  }
  if (payload.iss !== expected.issuer) {
    throw new Error("Kimlik jetonu beklenmeyen sağlayıcıdan geliyor (iss uyuşmuyor).");
  }
  if (!payload.email) {
    throw new Error("Kimlik jetonunda e-posta bilgisi yok.");
  }
  if (requireVerifiedEmail() && payload.email_verified !== true) {
    throw new Error("Kimlik jetonundaki e-posta doğrulanmamış (email_verified).");
  }
  return payload.email.trim().toLowerCase();
}

interface IdTokenHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

/**
 * id_token imzasını sağlayıcının JWKS anahtarlarıyla doğrular, ardından
 * iss/aud/exp/e-posta iddialarını kontrol eder ve e-postayı döner.
 *
 * Güvenlik kararları:
 * - Yalnızca RS256 kabul edilir. `alg: none` ve HS* reddedilir; böylece
 *   "algoritma karışıklığı" (alg confusion) saldırısı engellenir.
 * - İmza, tam olarak alınan `header.payload` baytları üzerinden doğrulanır.
 * - Anahtar `kid` ile eşleştirilir; eşleşme yoksa istek reddedilir.
 */
export async function verifyIdToken(
  idToken: string,
  expected: { issuer: string; clientId: string; jwksUri: string; nonce?: string }
): Promise<string> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Kimlik jetonu (id_token) biçimi geçersiz.");
  }
  if (!expected.jwksUri) {
    throw new Error("OIDC jwks_uri tanımlı değil; kimlik jetonu imzası doğrulanamaz.");
  }

  let header: IdTokenHeader;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as IdTokenHeader;
  } catch {
    throw new Error("Kimlik jetonu başlığı çözülemedi.");
  }

  if (header.alg !== "RS256") {
    throw new Error(`Desteklenmeyen imza algoritması (${header.alg ?? "yok"}); yalnızca RS256 kabul edilir.`);
  }
  if (!header.kid) {
    throw new Error("Kimlik jetonu başlığında anahtar kimliği (kid) yok.");
  }

  const findKey = (keys: OidcJwk[]) =>
    keys.find((k) => k.kid === header.kid && (k.kty === undefined || k.kty === "RSA"));

  let jwk = findKey(await getJwks(expected.jwksUri));
  if (!jwk) {
    // Anahtar döndürmesi olabilir: önbelleği yok sayıp bir kez daha dene.
    jwk = findKey(await getJwks(expected.jwksUri, true));
  }
  if (!jwk) {
    throw new Error("Kimlik jetonunu imzalayan anahtar JWKS içinde bulunamadı.");
  }

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({ key: jwk as unknown as NodeJsonWebKey, format: "jwk" });
  } catch {
    throw new Error("JWKS anahtarı geçersiz; açık anahtar oluşturulamadı.");
  }

  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], "base64url");
  const signatureOk = verifySignature("RSA-SHA256", signingInput, publicKey, signature);
  if (!signatureOk) {
    throw new Error("Kimlik jetonu imzası geçersiz.");
  }

  return decodeAndValidateIdToken(idToken, {
    issuer: expected.issuer,
    clientId: expected.clientId,
    nonce: expected.nonce,
  });
}
