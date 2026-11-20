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
import { listKpiSpecCandidates, resolveKpiSpec } from "../industry/packs";
import { canonicalFieldName, validateCanonicalRecord } from "./contracts";
import { observeSourceSchema } from "./schema-discovery";

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
const ENV_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
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
  return null;
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
  if (c.baseUrl && typeof c.baseUrl === "string") {
    try {
      const base = new URL(c.baseUrl);
      if (base.protocol !== "http:" && base.protocol !== "https:") errors.push("baseUrl http/https olmalı.");
      if (base.username || base.password) errors.push("baseUrl içinde kimlik bilgisi olamaz.");
    } catch {
      errors.push("baseUrl geçerli bir URL olmalı.");
    }
  }
  if (c.method && c.method !== "GET") errors.push("Kaynak konnektörleri yalnızca GET kullanabilir.");
  for (const header of Object.keys(c.headers ?? {})) {
    if (/^(authorization|proxy-authorization|cookie|set-cookie|host)$/i.test(header) || /(api[-_]?key|token|secret|password)/i.test(header)) {
      errors.push(`'${header}' başlığında kimlik bilgisi saklanamaz; secretEnvVar kullanın.`);
    }
  }
  if (!c.entity || !ENTITIES.includes(c.entity)) errors.push("Geçerli bir kanonik varlık seçin.");
  if (!c.idField || typeof c.idField !== "string") errors.push("idField gerekli.");
  if (!c.fieldMap || typeof c.fieldMap !== "object" || Object.keys(c.fieldMap).length === 0) {
    errors.push("En az bir alan eşlemesi gerekli.");
  }
  for (const [field, label] of Object.entries(c.kpiFieldMap ?? {})) {
    if (!c.fieldMap || !(field in c.fieldMap)) errors.push(`KPI alanı '${field}' fieldMap içinde olmalı.`);
    if (!label.trim() || label.length > 100) errors.push(`KPI etiketi '${field}' için 1–100 karakter olmalı.`);
  }
  const availableFields = c.fieldMap
    ? [...new Set(Object.keys(c.fieldMap).map((field) => canonicalFieldName(c.entity as CanonicalEntity, field)))]
    : [];
  const canonicalKeys = new Map<string, string>();
  for (const field of Object.keys(c.fieldMap ?? {})) {
    const canonical = canonicalFieldName(c.entity as CanonicalEntity, field);
    const previous = canonicalKeys.get(canonical);
    if (previous) {
      errors.push(`'${previous}' ve '${field}' aynı kanonik alana ('${canonical}') eşleniyor.`);
    } else {
      canonicalKeys.set(canonical, field);
    }
  }
  for (const [key, label] of Object.entries(c.computedKpiMap ?? {})) {
    const located = resolveKpiSpec(key, availableFields);
    if (!located) {
      const [packId, id] = key.includes(":") ? key.split(":", 2) : [undefined, key];
      const candidates = listKpiSpecCandidates(id).filter(
        (candidate) => !packId || candidate.packId === packId
      );
      errors.push(
        candidates.length > 1
          ? `Hesaplanan KPI '${key}' belirsiz; ${candidates.map((candidate) => `${candidate.packId}:${id}`).join(", ")} biçimlerinden birini kullanın.`
          : `Hesaplanan KPI '${key}' katalogda bulunamadı.`
      );
    }
    if (!label.trim() || label.length > 100) {
      errors.push(`Hesaplanan KPI '${key}' etiketi 1–100 karakter olmalı.`);
    }
    if (located) {
      const missing = located.spec.requiredFields.filter((field) => !availableFields.includes(field));
      if (missing.length > 0) {
        errors.push(
          `Hesaplanan KPI '${key}' için eksik kanonik alanlar: ${missing.join(", ")}.`
        );
      }
    }
  }
  for (const [name, field] of [
    ["kpiObservedAtField", c.kpiObservedAtField],
    ["eventTypeField", c.eventTypeField],
    ["eventSubjectField", c.eventSubjectField],
    ["eventTimeField", c.eventTimeField],
  ] as const) {
    if (field && (!c.fieldMap || !(field in c.fieldMap))) {
      errors.push(`${name} '${field}' fieldMap içinde olmalı.`);
    }
  }
  if (c.entity === "event" && !c.eventTypeField) {
    errors.push("event varlığı için eventTypeField gerekli.");
  }
  if (c.authType === "bearer_token" || c.authType === "api_key" || c.authType === "basic") {
    if (!c.secretEnvVar || typeof c.secretEnvVar !== "string") {
      errors.push("Bu kimlik türü için secretEnvVar (ortam değişkeni adı) gerekli.");
    }
  }
  if (c.secretEnvVar && !ENV_VAR_NAME.test(c.secretEnvVar)) {
    errors.push("secretEnvVar geçerli bir ortam değişkeni adı olmalı.");
  }
  if (c.authType === "api_key" && !c.apiKeyHeader) {
    errors.push("api_key kimlik türü için apiKeyHeader gerekli.");
  }
  if (c.authType === "oauth2_client_credentials") {
    if (!c.secretEnvVar) errors.push("OAuth2 için istemci sırrını taşıyan secretEnvVar gerekli.");
    if (!c.oauth2ClientIdEnvVar) errors.push("OAuth2 için oauth2ClientIdEnvVar gerekli.");
    if (!c.oauth2TokenUrl) errors.push("OAuth2 için oauth2TokenUrl gerekli.");
    if (c.oauth2ClientIdEnvVar && !ENV_VAR_NAME.test(c.oauth2ClientIdEnvVar)) {
      errors.push("oauth2ClientIdEnvVar geçerli bir ortam değişkeni adı olmalı.");
    }
    if (c.oauth2TokenUrl) {
      try {
        const tokenUrl = new URL(c.oauth2TokenUrl);
        if (tokenUrl.protocol !== "https:") errors.push("OAuth2 token endpoint'i HTTPS olmalı.");
        if (tokenUrl.username || tokenUrl.password) {
          errors.push("OAuth2 token endpoint'i URL içinde kimlik bilgisi taşıyamaz.");
        }
      } catch {
        errors.push("oauth2TokenUrl geçerli bir URL olmalı.");
      }
    }
    for (const [name, value] of [
      ["oauth2Scope", c.oauth2Scope],
      ["oauth2Audience", c.oauth2Audience],
      ["oauth2Resource", c.oauth2Resource],
    ] as const) {
      if (value && value.length > 1000) errors.push(`${name} en fazla 1000 karakter olabilir.`);
    }
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

async function resolveOAuth2AccessToken(
  config: RestConnectorConfig,
  ctx: SyncContext
): Promise<string> {
  if (!ctx.fetchTokenImpl) throw new Error("OAuth2 token istemcisi yapılandırılmamış.");
  if (!config.oauth2TokenUrl || !config.oauth2ClientIdEnvVar || !config.secretEnvVar) {
    throw new Error("OAuth2 token, istemci kimliği ve istemci sırrı yapılandırması eksik.");
  }
  const clientId = ctx.resolveSecret(config.oauth2ClientIdEnvVar);
  const clientSecret = ctx.resolveSecret(config.secretEnvVar);
  if (!clientId || !clientSecret) {
    const missing = [
      !clientId ? config.oauth2ClientIdEnvVar : null,
      !clientSecret ? config.secretEnvVar : null,
    ].filter(Boolean);
    throw new Error(`OAuth2 kimlik bilgisi bulunamadı: ${missing.join(", ")} ortam değişkeni ayarlanmamış.`);
  }

  const tokenUrl = new URL(config.oauth2TokenUrl);
  await validateOutboundUrl(tokenUrl.href, ctx.resolveHost);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (config.oauth2Scope) body.set("scope", config.oauth2Scope);
  if (config.oauth2Audience) body.set("audience", config.oauth2Audience);
  if (config.oauth2Resource) body.set("resource", config.oauth2Resource);

  const res = await fetchWithRetry(
    tokenUrl,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
    ctx,
    [],
    ctx.fetchTokenImpl
  );
  const text = await readCapped(res);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OAuth2 token endpoint'i geçerli JSON döndürmedi.");
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("OAuth2 token yanıtı geçersiz.");
  }
  const token = parsed as { access_token?: unknown; token_type?: unknown };
  if (typeof token.access_token !== "string" || token.access_token.length === 0 || token.access_token.length > 16_384) {
    throw new Error("OAuth2 token yanıtında geçerli access_token yok.");
  }
  if (typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer") {
    throw new Error("OAuth2 token türü Bearer olmalı.");
  }
  return token.access_token;
}

async function buildHeaders(config: RestConnectorConfig, ctx: SyncContext): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: "application/json", ...(config.headers ?? {}) };
  if (config.authType === "none") return headers;
  if (config.authType === "oauth2_client_credentials") {
    headers.Authorization = `Bearer ${await resolveOAuth2AccessToken(config, ctx)}`;
    return headers;
  }
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

async function fetchWithRetry(
  url: URL,
  init: RequestInit,
  ctx: SyncContext,
  warnings: string[],
  fetchImpl: typeof fetch = ctx.fetchImpl
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchImpl(url, {
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
    const headers = await buildHeaders(config, ctx);

    const maxPages = config.maxPages ?? 10;
    const pagination = config.pagination ?? { type: "none" };
    const pageSize = config.pageSize ?? (pagination.type === "page" ? pagination.pageSize : undefined);

    let page = pagination.type === "page" ? (pagination.startPage ?? 1) : 1;
    let pagesFetched = 0;
    let cursor: string | null = null;
    const records: CanonicalRecord[] = [];
    const rejected: SyncOutcome["rejected"] = [];
    const observedItems: unknown[] = [];
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
        if (observedItems.length >= 200) break;
        observedItems.push(item);
      }

      for (const item of items) {
        const externalIdRaw = getPath(item, config.idField);
        const externalId =
          typeof externalIdRaw === "string" || typeof externalIdRaw === "number"
            ? String(externalIdRaw)
            : null;
        if (!externalId) {
          rejected.push({
            entity: config.entity,
            sourceRef: null,
            code: "MISSING_EXTERNAL_ID",
            reason: `Kaynak kaydın '${config.idField}' dış kimliği boş.`,
          });
          skipped++;
          continue;
        }
        const fields: CanonicalRecord["fields"] = {};
        let invalidSourceField: string | null = null;
        for (const [canonical, sourcePath] of Object.entries(config.fieldMap)) {
          const raw = getPath(item, sourcePath);
          if (raw !== null && raw !== undefined && typeof raw === "object") {
            invalidSourceField = canonical;
            break;
          }
          fields[canonical] = toPrimitive(raw);
        }
        if (invalidSourceField) {
          rejected.push({
            entity: config.entity,
            sourceRef: externalId,
            code: "INVALID_FIELD_TYPE",
            reason: `'${invalidSourceField}' kanonik alanı nesne/dizi yerine ilkel bir değer gerektiriyor.`,
          });
          skipped++;
          continue;
        }
        const updatedAtRaw = config.updatedAtField ? getPath(item, config.updatedAtField) : null;
        const sourceUpdatedAt = toIso(updatedAtRaw);
        if (updatedAtRaw !== null && updatedAtRaw !== undefined && sourceUpdatedAt === null) {
          rejected.push({
            entity: config.entity,
            sourceRef: externalId,
            code: "INVALID_SOURCE_UPDATED_AT",
            reason: `Kaynak güncelleme zamanı '${config.updatedAtField}' geçerli bir tarih değil.`,
          });
          skipped++;
          continue;
        }

        const candidate: CanonicalRecord = {
          entity: config.entity,
          externalId,
          sourceUpdatedAt,
          fields,
        };
        const validation = validateCanonicalRecord(candidate);
        if (!validation.record) {
          rejected.push({
            entity: config.entity,
            sourceRef: externalId,
            code: validation.violations[0]?.code ?? "CONTRACT_VALIDATION_FAILED",
            reason: validation.violations.map((violation) => violation.message).join("; "),
          });
          skipped++;
          continue;
        }
        records.push(validation.record);
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
      sourceSchema: observeSourceSchema(observedItems),
      rejected,
    };
  },
};
