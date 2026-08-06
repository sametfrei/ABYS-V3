import { readFileSync } from "fs";
import defaultFieldMappingJson from "../../../../config/bitrix24-field-mapping.example.json";

/**
 * Bitrix24 konnektörü yapılandırması (master plan md.16 hazırlığı).
 *
 * MOD AYRIMI (zorunlu kural): DEMO modunda gerçek bağlantı hiç denenmez;
 * LIVE modunda kimlik bilgisi eksikse bağlantı KURULMAYA ÇALIŞILMAZ ve
 * demoya sessizce düşülmez — açık "credentials missing" durumu döner
 * (bkz. checkLiveCredentials / sync.ts).
 */

export type BitrixMode = "demo" | "live";

export interface BitrixSmartProcessFieldMapping {
  entityTypeId: number;
  categoryField?: string;
  locationField?: string;
  customerField?: string;
  matchedTaskField?: string;
  openedAtField?: string;
}

export interface BitrixFieldMapping {
  company?: { districtField?: string; categoryField?: string };
  contact?: { roleField?: string };
  lead?: { categoryField?: string };
  deal?: { categoryField?: string; renewalDateField?: string; startDateField?: string };
  activity?: { followUpField?: string };
  task?: { categoryField?: string; locationField?: string; customerField?: string };
  user?: { roleField?: string };
  smartProcess?: {
    serviceRequest?: BitrixSmartProcessFieldMapping;
    complaint?: BitrixSmartProcessFieldMapping;
    qualityIssue?: BitrixSmartProcessFieldMapping;
  };
}

const defaultFieldMapping = defaultFieldMappingJson as unknown as BitrixFieldMapping;

/**
 * Özel alan adlarını KODA sabitlemek yerine dosyadan okur. Gerçek TAIS
 * portalı bağlandığında yalnızca BITRIX24_FIELD_MAPPING_PATH ile gösterilen
 * dosya değişir; mapper.ts hiç değişmez.
 */
export type BitrixEnv = Record<string, string | undefined>;

export function loadFieldMapping(env: BitrixEnv = process.env): BitrixFieldMapping {
  const overridePath = env.BITRIX24_FIELD_MAPPING_PATH?.trim();
  if (!overridePath) return defaultFieldMapping;
  try {
    const raw = readFileSync(overridePath, "utf-8");
    return JSON.parse(raw) as BitrixFieldMapping;
  } catch {
    // Bozuk/okunamayan özel eşleme dosyası demoyu çökertmemeli; varsayılana düş.
    return defaultFieldMapping;
  }
}

export interface BitrixConnectorConfig {
  mode: BitrixMode;
  baseUrl: string | null;
  webhookToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  fieldMapping: BitrixFieldMapping;
}

function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveBitrixConfig(env: BitrixEnv = process.env): BitrixConnectorConfig {
  const modeRaw = env.BITRIX24_MODE?.trim().toLowerCase();
  const mode: BitrixMode = modeRaw === "live" ? "live" : "demo";
  return {
    mode,
    baseUrl: normalize(env.BITRIX24_BASE_URL),
    webhookToken: normalize(env.BITRIX24_WEBHOOK_TOKEN),
    clientId: normalize(env.BITRIX24_CLIENT_ID),
    clientSecret: normalize(env.BITRIX24_CLIENT_SECRET),
    refreshToken: normalize(env.BITRIX24_REFRESH_TOKEN),
    fieldMapping: loadFieldMapping(env),
  };
}

export type BitrixAuthMode = "webhook" | "oauth" | "none";

export function resolveAuthMode(config: BitrixConnectorConfig): BitrixAuthMode {
  if (config.webhookToken) return "webhook";
  if (config.clientId && config.clientSecret && config.refreshToken) return "oauth";
  return "none";
}

export interface LiveCredentialCheck {
  ok: boolean;
  missing: string[];
}

/** Live moda geçmeden ÖNCE kontrol edilir — eksikse bağlantı hiç denenmez. */
export function checkLiveCredentials(config: BitrixConnectorConfig): LiveCredentialCheck {
  const missing: string[] = [];
  if (!config.baseUrl) missing.push("BITRIX24_BASE_URL");
  if (resolveAuthMode(config) === "none") {
    missing.push("BITRIX24_WEBHOOK_TOKEN ya da (BITRIX24_CLIENT_ID + BITRIX24_CLIENT_SECRET + BITRIX24_REFRESH_TOKEN)");
  }
  return { ok: missing.length === 0, missing };
}

export interface BitrixConnectorPublicStatus {
  mode: BitrixMode;
  authMode: BitrixAuthMode;
  configured: boolean;
  baseHost: string | null;
}

/**
 * Dışarıya (API yanıtı, log) verilebilecek HASSAS OLMAYAN özet. Token/secret
 * asla döndürülmez; yalnızca portal host'u (URL'nin kendisi bile değil) ve
 * yapılandırma durumu görünür.
 */
export function getConnectorPublicStatus(config: BitrixConnectorConfig): BitrixConnectorPublicStatus {
  const authMode = resolveAuthMode(config);
  let baseHost: string | null = null;
  if (config.baseUrl) {
    try {
      baseHost = new URL(config.baseUrl).host;
    } catch {
      baseHost = null;
    }
  }
  return {
    mode: config.mode,
    authMode,
    configured: config.mode === "live" ? checkLiveCredentials(config).ok : true,
    baseHost,
  };
}

/** Test/log amaçlı: config nesnesini sır alanları maskelenmiş biçimde döner. */
export function redactConfig(config: BitrixConnectorConfig): Record<string, unknown> {
  const mask = (v: string | null) => (v ? "***redacted***" : null);
  return {
    mode: config.mode,
    baseUrl: config.baseUrl,
    webhookToken: mask(config.webhookToken),
    clientId: mask(config.clientId),
    clientSecret: mask(config.clientSecret),
    refreshToken: mask(config.refreshToken),
  };
}
