import type { BitrixConnectorConfig } from "./config";
import { resolveAuthMode } from "./config";

/**
 * Kimlik doğrulama hazırlığı — yalnızca LIVE modda ve kimlik bilgisi
 * mevcutken çağrılır (bkz. client.ts / sync.ts checkLiveCredentials).
 * Bu dosyadaki hiçbir fonksiyon demo modunda tetiklenmez.
 */

export class BitrixAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BitrixAuthError";
  }
}

/** Gelen (inbound) webhook URL'sini kurar: {baseUrl}/rest/{userId}/{token}/{method} */
export function buildWebhookMethodUrl(config: BitrixConnectorConfig, method: string): string {
  if (!config.baseUrl || !config.webhookToken) {
    throw new BitrixAuthError("Webhook kimlik bilgisi eksik.");
  }
  const base = config.baseUrl.replace(/\/+$/, "");
  const tokenPath = config.webhookToken.replace(/^\/+|\/+$/g, "");
  return `${base}/rest/${tokenPath}/${method}.json`;
}

export interface BitrixAccessToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: BitrixAccessToken | null = null;

/**
 * OAuth erişim jetonunu yeniler. HAZIRLIK amaçlıdır — demo modunda ve
 * kimlik bilgisi eksikken ÇAĞRILMAZ. Hata mesajları sır değeri İÇERMEZ.
 */
export async function refreshOAuthToken(config: BitrixConnectorConfig): Promise<BitrixAccessToken> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new BitrixAuthError("OAuth kimlik bilgisi eksik (client id/secret/refresh token).");
  }
  const url = new URL("https://oauth.bitrix.info/oauth/token/");
  url.searchParams.set("grant_type", "refresh_token");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);
  url.searchParams.set("refresh_token", config.refreshToken);

  let res: Response;
  try {
    res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new BitrixAuthError("OAuth jeton yenileme isteği başarısız oldu.");
  }
  if (!res.ok) {
    throw new BitrixAuthError(`OAuth jeton yenileme reddedildi (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new BitrixAuthError("OAuth yanıtında access_token yok.");
  }
  const token: BitrixAccessToken = {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - 30_000,
  };
  cachedToken = token;
  return token;
}

export async function getAccessToken(config: BitrixConnectorConfig): Promise<BitrixAccessToken> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken;
  return refreshOAuthToken(config);
}

/** Test amaçlı: bellek-içi jeton önbelleğini sıfırlar. */
export function resetTokenCache(): void {
  cachedToken = null;
}

export function buildOAuthMethodUrl(config: BitrixConnectorConfig, method: string): string {
  if (!config.baseUrl) {
    throw new BitrixAuthError("BITRIX24_BASE_URL eksik.");
  }
  const base = config.baseUrl.replace(/\/+$/, "");
  return `${base}/rest/${method}.json`;
}

/** Modu (webhook/oauth) çözüp ilgili yöntem URL'sini kurar. */
export async function buildMethodRequest(
  config: BitrixConnectorConfig,
  method: string
): Promise<{ url: string; authHeaders: Record<string, string> }> {
  const mode = resolveAuthMode(config);
  if (mode === "webhook") {
    return { url: buildWebhookMethodUrl(config, method), authHeaders: {} };
  }
  if (mode === "oauth") {
    const token = await getAccessToken(config);
    return { url: buildOAuthMethodUrl(config, method), authHeaders: { Authorization: `Bearer ${token.accessToken}` } };
  }
  throw new BitrixAuthError("Kimlik bilgisi yapılandırılmamış (ne webhook ne oauth).");
}
