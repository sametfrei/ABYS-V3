import type { BitrixConnectorConfig } from "./config";
import { checkLiveCredentials } from "./config";
import { buildMethodRequest } from "./auth";
import type {
  BitrixActivityRaw,
  BitrixCompanyRaw,
  BitrixContactRaw,
  BitrixDealRaw,
  BitrixDepartmentRaw,
  BitrixLeadRaw,
  BitrixSmartProcessItemRaw,
  BitrixTaskRaw,
  BitrixUserRaw,
} from "./types";

/**
 * Bitrix24 REST istemcisi — LIVE mod hazırlığı. checkLiveCredentials()
 * geçmeden hiçbir ağ isteği DENENMEZ (bkz. requestBitrixMethod). Bu dosya
 * demo modunda hiç import edilse bile ağa çıkmaz; yalnızca sync.ts'in live
 * dalından çağrılır.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const PAGE_SIZE = 50; // Bitrix24 list uçlarının sabit sayfa boyutu
const MAX_PAGES = 200; // güvenlik: sonsuz sayfalamaya karşı üst sınır

export class BitrixApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "BitrixApiError";
    this.code = code;
  }
}

// Bellek-içi, ana bilgisayar başına basit hız sınırlayıcı (Bitrix24 webhook
// sınırı tipik olarak ~2 istek/sn). Çok örnekli dağıtımda paylaşılmaz —
// DEPLOYMENT.md'deki genel not burada da geçerli.
const lastRequestAtByHost = new Map<string, number>();
const MIN_INTERVAL_MS = 500;

async function throttle(hostKey: string): Promise<void> {
  const last = lastRequestAtByHost.get(hostKey) ?? 0;
  const wait = last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAtByHost.set(hostKey, Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface BitrixListResponse<T> {
  result: T[] | Record<string, unknown>;
  next?: number;
  total?: number;
}

/**
 * Tek bir Bitrix24 REST yöntemini çağırır. Kimlik bilgisi eksikse (canlı
 * modda) ağa hiç çıkmadan BitrixApiError("credentials_missing") fırlatır —
 * sahte başarı dönmez, demo verisine sessizce düşmez.
 */
export async function requestBitrixMethod<T = unknown>(
  config: BitrixConnectorConfig,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  if (config.mode !== "live") {
    throw new BitrixApiError("Bu istemci yalnızca live modda kullanılır.", "not_live");
  }
  const credCheck = checkLiveCredentials(config);
  if (!credCheck.ok) {
    throw new BitrixApiError(`Live bağlantı yapılandırılmamış: ${credCheck.missing.join(", ")}`, "credentials_missing");
  }

  const { url, authHeaders } = await buildMethodRequest(config, method);
  const hostKey = new URL(url).host;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await throttle(hostKey);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.status === 503 || res.status === 429) {
        // Bitrix24 hız sınırı — üstel geri çekilme ile yeniden dene.
        lastError = new BitrixApiError(`Hız sınırı (HTTP ${res.status}).`, "rate_limited");
        await sleep(2 ** attempt * 500);
        continue;
      }
      if (!res.ok) {
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new BitrixApiError(`Sunucu hatası (HTTP ${res.status}).`, "server_error");
          await sleep(2 ** attempt * 300);
          continue;
        }
        throw new BitrixApiError(`Bitrix24 isteği başarısız (HTTP ${res.status}).`, "http_error");
      }

      const body = (await res.json()) as { error?: string; error_description?: string } & Record<string, unknown>;
      if (body.error) {
        if (body.error === "QUERY_LIMIT_EXCEEDED" && attempt < MAX_RETRIES) {
          lastError = new BitrixApiError(body.error_description ?? body.error, body.error);
          await sleep(2 ** attempt * 500);
          continue;
        }
        throw new BitrixApiError(body.error_description ?? body.error, body.error);
      }
      return body as T;
    } catch (err) {
      if (err instanceof BitrixApiError && err.code && !["rate_limited", "server_error"].includes(err.code)) {
        throw err;
      }
      lastError = err;
      if (attempt >= MAX_RETRIES) break;
      await sleep(2 ** attempt * 300);
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new BitrixApiError("Bitrix24 isteği bilinmeyen nedenle başarısız oldu.");
}

/** start=0,50,100... ile tüm sayfaları toplar; MAX_PAGES üst sınırını aşmaz. */
export async function paginateBitrixList<T>(
  config: BitrixConnectorConfig,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const items: T[] = [];
  let start = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await requestBitrixMethod<BitrixListResponse<T>>(config, method, { ...params, start });
    const batch = Array.isArray(res.result) ? res.result : [];
    items.push(...batch);
    if (res.next === undefined || batch.length < PAGE_SIZE) break;
    start = res.next;
  }
  return items;
}

export interface ConnectionTestResult {
  ok: boolean;
  reason?: "credentials_missing" | "connection_failed";
  message: string;
}

/** Live bağlantıyı doğrular. Kimlik bilgisi eksikse ağa HİÇ çıkmaz. */
export async function testConnection(config: BitrixConnectorConfig): Promise<ConnectionTestResult> {
  if (config.mode !== "live") {
    return { ok: false, reason: "credentials_missing", message: "Konnektör demo modda; live bağlantı testi geçerli değil." };
  }
  const credCheck = checkLiveCredentials(config);
  if (!credCheck.ok) {
    return {
      ok: false,
      reason: "credentials_missing",
      message: `Live bağlantı yapılandırılmamış: ${credCheck.missing.join(", ")}`,
    };
  }
  try {
    await requestBitrixMethod(config, "profile");
    return { ok: true, message: "Bağlantı başarılı." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    return { ok: false, reason: "connection_failed", message };
  }
}

// --- Nesne türüne göre listeleme yardımcıları (yalnızca live modda çağrılır) ---
// Artan senkron için `>DATE_MODIFY` filtresi kullanılır; ilk senkronizasyonda
// sinceIso verilmez.

function incrementalFilter(field: string, sinceIso: string | undefined): Record<string, unknown> {
  return sinceIso ? { filter: { [`>${field}`]: sinceIso } } : {};
}

export function fetchCompanies(config: BitrixConnectorConfig, sinceIso?: string) {
  return paginateBitrixList<BitrixCompanyRaw>(config, "crm.company.list", incrementalFilter("DATE_MODIFY", sinceIso));
}
export function fetchContacts(config: BitrixConnectorConfig, sinceIso?: string) {
  return paginateBitrixList<BitrixContactRaw>(config, "crm.contact.list", incrementalFilter("DATE_MODIFY", sinceIso));
}
export function fetchLeads(config: BitrixConnectorConfig, sinceIso?: string) {
  return paginateBitrixList<BitrixLeadRaw>(config, "crm.lead.list", incrementalFilter("DATE_MODIFY", sinceIso));
}
export function fetchDeals(config: BitrixConnectorConfig, sinceIso?: string) {
  return paginateBitrixList<BitrixDealRaw>(config, "crm.deal.list", incrementalFilter("DATE_MODIFY", sinceIso));
}
export function fetchActivities(config: BitrixConnectorConfig, sinceIso?: string) {
  return paginateBitrixList<BitrixActivityRaw>(config, "crm.activity.list", incrementalFilter("DATE_MODIFY", sinceIso));
}
export function fetchTasks(config: BitrixConnectorConfig, sinceIso?: string) {
  return paginateBitrixList<BitrixTaskRaw>(config, "tasks.task.list", sinceIso ? { filter: { ">CHANGED_DATE": sinceIso } } : {});
}
export function fetchUsers(config: BitrixConnectorConfig) {
  return paginateBitrixList<BitrixUserRaw>(config, "user.get", {});
}
export function fetchDepartments(config: BitrixConnectorConfig) {
  return paginateBitrixList<BitrixDepartmentRaw>(config, "department.get", {});
}
export function fetchSmartProcessItems(config: BitrixConnectorConfig, entityTypeId: number, sinceIso?: string) {
  return paginateBitrixList<BitrixSmartProcessItemRaw>(config, "crm.item.list", {
    entityTypeId,
    ...incrementalFilter("updatedTime", sinceIso),
  });
}
