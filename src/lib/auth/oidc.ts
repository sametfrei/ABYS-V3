import { randomBytes, createHash } from "crypto";

/**
 * Sağlayıcıdan bağımsız OIDC Authorization Code + PKCE akışı (Faz 8).
 * Ortam değişkenlerinden biri bile eksikse SSO tamamen kapalı sayılır —
 * mevcut parola girişi tek yol olarak kalır (bkz. getOidcConfig).
 */

export const OIDC_STATE_COOKIE = "abys_oidc_state";
export const OIDC_VERIFIER_COOKIE = "abys_oidc_verifier";
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
}

let discoveryCache: { issuer: string; doc: OidcDiscoveryDocument; fetchedAt: number } | null = null;
const DISCOVERY_TTL_MS = 1000 * 60 * 60; // 1 saat

/** issuer'ın /.well-known/openid-configuration belgesini çeker ve önbellekler. */
export async function getDiscoveryDocument(issuer: string): Promise<OidcDiscoveryDocument> {
  if (
    discoveryCache &&
    discoveryCache.issuer === issuer &&
    Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS
  ) {
    return discoveryCache.doc;
  }
  const url = new URL("/.well-known/openid-configuration", issuer).toString();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OIDC discovery belgesi alınamadı (${res.status}): ${url}`);
  }
  const doc = (await res.json()) as OidcDiscoveryDocument;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC discovery belgesi eksik: authorization_endpoint/token_endpoint yok.");
  }
  discoveryCache = { issuer, doc, fetchedAt: Date.now() };
  return doc;
}

/** Yalnızca test/tekrar-deneme amaçlı: önbelleği sıfırlar. */
export function resetDiscoveryCache(): void {
  discoveryCache = null;
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
}): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
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
  const res = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
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
  exp?: number;
  email?: string;
  email_verified?: boolean;
}

/**
 * id_token'ı çözer ve iss/aud/exp iddialarını doğrular, e-postayı döner.
 * NOT: id_token doğrudan token uç noktasından (sunucu-sunucu, client_secret ile
 * kimlik doğrulanmış) alınır — implicit flow'un aksine tarayıcı üzerinden
 * geçmez. Bu yüzden imza/JWKS doğrulaması burada yapılmıyor; güven, token
 * uç noktasına yapılan doğrudan TLS çağrısına dayanıyor. Bilinen sınır —
 * bkz. docs/SECURITY_MODEL.md.
 */
export function decodeAndValidateIdToken(
  idToken: string,
  expected: { issuer: string; clientId: string }
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
  if (payload.iss !== expected.issuer) {
    throw new Error("Kimlik jetonu beklenmeyen sağlayıcıdan geliyor (iss uyuşmuyor).");
  }
  if (!payload.email) {
    throw new Error("Kimlik jetonunda e-posta bilgisi yok.");
  }
  return payload.email.trim().toLowerCase();
}
