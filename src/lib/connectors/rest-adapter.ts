import {
  type CanonicalEntity,
  type CanonicalRecord,
  type ConnectorAdapter,
  type ConnectorConfig,
  type RestConnectorConfig,
  type SyncOutcome,
  type SyncContext,
} from "./types";
import { validateOutboundUrl } from "../net/ssrf";

/**
 * Genel REST adaptörü — SAP/Oracle/Dynamics/Salesforce/HubSpot/NetSuite gibi
 * sistemlerin REST/OData uçlarına alan eşlemesi ve sayfalama ile bağlanır.
 * SOAP/JDBC adaptörleri ayrı iş olarak planlıdır; bu adaptör yalnızca JSON
 * yanıtı olan HTTP uçları için geçerlidir.
 *
 * Davranış sözleşmesi:
 * - Sayfalama: none | page | cursor
 * - Artımlı: `updatedSinceParam` varsa checkpoint değeri gönderilir
 * - Tekrar deneme: 429 ve 5xx için üstel bekleme (en fazla 3 deneme)
 * - Sır: yalnızca ortam değişkeninden okunur, asla kaydedilmez
 * - SSRF: çözümlenen her istek public adrese gitmelidir
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const ENTITIES: CanonicalEntity[] = [
  "customer",
  "supplier",
  "employee",
  "product",
  "order",
  "invoice",
  "payment",
  "account",
  "project",
  "inventory",
  "event",
];

function getPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  let current: unknown = obj;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function toPrimitive(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function validateRestConfig(input: unknown): string[] {
  const errors: string[] = [];
  if (input === null || typeof input !== "object") return ["Konfigürasyon nesnesi gerekli."];
  const c = input as Partial<RestConnectorConfig>;
  if (c.kind !== "rest") errors.push("kind 'rest' olmalı.");
  if (!c.baseUrl || typeof c.baseUrl !== "string") errors.push("baseUrl gerekli.");
  if (!c.path || typeof c.path !== "string") errors.push("path gerekli.");
  if (!c.entity || !ENTITIES.includes(c.entity)) errors.push("Geçerli bir kanonik varlık seçin.");
  if (!c.idField || typeof c.idField !== "string") errors.push("idField gerekli.");
  if (!c.fieldMap || typeof c.fieldMap !== "object" || Object.keys(c.fieldMap).length === 0) {
    errors.push("En az bir alan eşlemesi gerekli.");
  }
  if (c.authType === "bearer_token" || c.authType === "api_key" || c.authType === "basic") {
    if (!c.secretEnvVar || typeof c.secretEnvVar !== "string") {
      errors.push("Bu kimlik türü için secretEnvVar (ortam değişkeni adı) gerekli.");
    }
  }
  if (c.authType === "api_key" && !c.apiKeyHeader) {
    errors.push("api_key kimlik türü için apiKeyHeader gerekli.");
  }
  if (c.pagination) {
    if (c.pagination.type === "page") {
      if (!c.pagination.pageParam) errors.push("Sayfalama için pageParam gerekli.");
      if (!(c.pagination.pageSize > 0)) errors.push("Sayfalama için pageSize > 0 olmalı.");
    }
    if (c.pagination.type === "cursor" && (!c.pagination.cursorParam || !c.pagination.cursorPath)) {
      errors.push("Cursor sayfalaması için cursorParam ve cursorPath gerekli.");
    }
  }
  if (c.maxPages !== undefined && (!(c.maxPages > 0) || c.maxPages > 100)) {
    errors.push("maxPages 1–100 aralığında olmalı.");
  }
  return errors;
}

function buildHeaders(config: RestConnectorConfig, ctx: SyncContext): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", ...(config.headers ?? {}) };
  if (config.authType === "none") return headers;
  const secret = config.secretEnvVar ? ctx.resolveSecret(config.secretEnvVar) : undefined;
  if (!secret) {
    throw new Error(
      `Kimlik bilgisi bulunamadı: ${config.secretEnvVar ?? "(tanımsız)"} ortam değişkeni ayarlanmamış.`
    );
  }
  if (config.authType === "bearer_token") headers.Authorization = `Bearer ${secret}`;
  else if (config.authType === "api_key") headers[config.apiKeyHeader ?? "X-API-Key"] = secret;
  else if (config.authType === "basic") headers.Authorization = `Basic ${secret}`;
  return headers;
}

async function readCapped(res: Response): Promise<string> {
  const text = await res.text();
  if (Buffer.byteLength(text, "utf-8") > MAX_RESPONSE_BYTES) {
    throw new Error("Yanıt gövdesi 2MB sınırını aşıyor.");
  }
  return text;
}

async function fetchWithRetry(url: URL, init: RequestInit, ctx: SyncContext, warnings: string[]): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await ctx.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        warnings.push(`Deneme ${attempt}: HTTP ${res.status} (${url.hostname})`);
        lastError = new Error(`Uzak sunucu hata döndü: ${res.status}`);
        if (attempt < MAX_ATTEMPTS) {
          await ctx.sleep(250 * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        throw new Error(`Uzak sunucu hata döndü: ${res.status}`);
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("İstek başarısız oldu.");
      const retryable =
        lastError.name === "TimeoutError" ||
        lastError.name === "TypeError" ||
        /hata döndü: (429|5\d\d)/.test(lastError.message);
      if (attempt < MAX_ATTEMPTS && retryable) {
        await ctx.sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("İstek başarısız oldu.");
}

export const restAdapter: ConnectorAdapter = {
  id: "rest-generic",
  status: "ready",

  validate(config: unknown): string[] {
    return validateRestConfig(config);
  },

  async sync(rawConfig: ConnectorConfig, ctx: SyncContext): Promise<SyncOutcome> {
    const config = rawConfig;
    const errors = validateRestConfig(config);
    if (errors.length > 0) throw new Error(errors.join("; "));
    if (config.kind !== "rest") throw new Error("Desteklenmeyen konfigürasyon türü.");

    const base = new URL(config.baseUrl);
    const target = new URL(config.path.replace(/^\//, ""), base.href.endsWith("/") ? base.href : `${base.href}/`);
    const { url: validated } = await validateOutboundUrl(target.href, ctx.resolveHost);
    const headers = buildHeaders(config, ctx);

    const maxPages = config.maxPages ?? 10;
    const pagination = config.pagination ?? { type: "none" };
    const pageSize = config.pageSize ?? (pagination.type === "page" ? pagination.pageSize : undefined);

    let page = pagination.type === "page" ? (pagination.startPage ?? 1) : 1;
    let pagesFetched = 0;
    let cursor: string | null = null;
    const records: CanonicalRecord[] = [];
    const warnings: string[] = [];
    let readCount = 0;
    let skipped = 0;

    for (let iteration = 0; iteration < maxPages; iteration++) {
      const pageUrl = new URL(validated.href);
      if (pagination.type === "page") {
        pageUrl.searchParams.set(pagination.pageParam, String(page));
        if (pagination.limitParam && pageSize) pageUrl.searchParams.set(pagination.limitParam, String(pageSize));
      } else if (pagination.type === "cursor" && cursor) {
        pageUrl.searchParams.set(pagination.cursorParam, cursor);
      }
      if (config.updatedSinceParam) {
        const since = ctx.checkpoint;
        if (since) pageUrl.searchParams.set(config.updatedSinceParam, since);
      }

      const res = await fetchWithRetry(pageUrl, { method: config.method ?? "GET", headers }, ctx, warnings);
      pagesFetched += 1;
      const text = await readCapped(res);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Yanıt geçerli JSON değil.");
      }

      const items = getPath(json, config.recordsPath);
      if (!Array.isArray(items)) {
        throw new Error(`recordsPath "${config.recordsPath ?? "(kök)"}" bir dizi döndürmedi.`);
      }
      readCount += items.length;

      for (const item of items) {
        const externalIdRaw = getPath(item, config.idField);
        const externalId =
          typeof externalIdRaw === "string" || typeof externalIdRaw === "number"
            ? String(externalIdRaw)
            : null;
        if (!externalId) {
          skipped++;
          continue;
        }
        const fields: CanonicalRecord["fields"] = {};
        for (const [canonical, sourcePath] of Object.entries(config.fieldMap)) {
          fields[canonical] = toPrimitive(getPath(item, sourcePath));
        }
        records.push({
          entity: config.entity,
          externalId,
          sourceUpdatedAt: config.updatedAtField ? toIso(getPath(item, config.updatedAtField)) : null,
          fields,
        });
      }

      if (pagination.type === "none") break;
      if (pagination.type === "page") {
        if (pageSize && items.length < pageSize) break;
        page += 1;
        continue;
      }
      const nextCursor = getPath(json, pagination.cursorPath);
      cursor = typeof nextCursor === "string" && nextCursor.length > 0 ? nextCursor : null;
      if (!cursor) break;
    }

    let checkpoint: string | null = ctx.checkpoint;
    for (const record of records) {
      if (record.sourceUpdatedAt && (!checkpoint || record.sourceUpdatedAt > checkpoint)) {
        checkpoint = record.sourceUpdatedAt;
      }
    }

    return {
      records,
      pages: pagesFetched,
      readCount,
      skipped,
      warnings,
      checkpoint,
    };
  },
};
