import { Client, type QueryResultRow } from "pg";
import * as mssql from "mssql";
import * as mysql from "mysql2/promise";
import {
  type CanonicalEntity,
  type CanonicalRecord,
  type ConnectorAdapter,
  type ConnectorProbeResult,
  type SqlConnectorConfig,
  type SyncContext,
  type SyncOutcome,
} from "./types";
import { canonicalFieldName, validateCanonicalRecord } from "./contracts";
import { observeSourceSchema } from "./schema-discovery";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENTITIES: CanonicalEntity[] = [
  "customer", "supplier", "employee", "product", "order", "invoice",
  "payment", "account", "project", "inventory", "event",
];
const QUERY_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ROWS = 5_000;

type SourceRow = QueryResultRow & Record<string, unknown>;

function getPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function primitive(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function checkpointPlaceholder(driver: SqlConnectorConfig["driver"]): RegExp {
  if (driver === "postgres") return /\$1(?!\d)/;
  if (driver === "mssql") return /@p1\b/i;
  return /\?/;
}

function hasCheckpointPlaceholder(driver: SqlConnectorConfig["driver"], query: string): boolean {
  return checkpointPlaceholder(driver).test(query);
}

export function validateSqlConfig(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return ["SQL konfigürasyonu gerekli."];
  const config = input as Partial<SqlConnectorConfig>;
  if (config.kind !== "sql" || !["postgres", "mssql", "mysql"].includes(config.driver ?? "")) {
    errors.push("Desteklenen sürücüler PostgreSQL, Microsoft SQL Server ve MySQL'dir.");
  }
  if (!config.connectionStringEnvVar || !ENV_NAME.test(config.connectionStringEnvVar)) {
    errors.push("connectionStringEnvVar geçerli bir ortam değişkeni adı olmalı.");
  }
  const query = typeof config.query === "string" ? config.query.trim() : "";
  if (!query || query.length > 20_000) errors.push("SQL sorgusu 1–20000 karakter olmalı.");
  if (query && !/^SELECT\b/i.test(query)) {
    errors.push("Yalnızca SELECT sorguları kabul edilir.");
  }
  if (query && query.includes(";")) errors.push("Tek bir SQL ifadesi kullanılmalı; noktalı virgül kabul edilmez.");
  if (/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|SET|RESET|PREPARE|EXECUTE|INTO\s+OUTFILE|INTO\s+DUMPFILE|LOAD_FILE|OPENROWSET|OPENQUERY|WAITFOR|XP_CMDSHELL|SLEEP|BENCHMARK)\b/i.test(query)) {
    errors.push("Yazma, dosya erişimi veya yönetim komutları içeren SQL sorguları kabul edilmez.");
  }
  if (config.driver === "mssql" && /^WITH\b/i.test(query)) {
    errors.push("SQL Server adaptörü şu anda doğrudan SELECT sorgusu bekliyor; CTE sorguları önce bir VIEW olarak tanımlanmalı.");
  }
  if (config.checkpointParam && query && !hasCheckpointPlaceholder(config.driver as SqlConnectorConfig["driver"], query)) {
    const marker = config.driver === "postgres" ? "$1" : config.driver === "mssql" ? "@p1" : "?";
    errors.push(`checkpointParam açıkken sorgu önceki senkron zamanını ${marker} parametresiyle kullanmalı.`);
  }
  if (!config.checkpointParam && query) {
    const hasMarker = config.driver === "postgres"
      ? /\$\d+/.test(query)
      : config.driver === "mssql"
        ? /@p1\b/i.test(query)
        : /\?/.test(query);
    if (hasMarker) errors.push("Parametreli sorgular için checkpointParam açılmalı.");
  }
  if (!config.entity || !ENTITIES.includes(config.entity)) errors.push("Geçerli bir kanonik varlık seçilmeli.");
  if (!config.idField || typeof config.idField !== "string") errors.push("idField gerekli.");
  if (!config.fieldMap || typeof config.fieldMap !== "object" || Object.keys(config.fieldMap).length === 0) {
    errors.push("En az bir kanonik alan eşlemesi gerekli.");
  }
  for (const [field, label] of Object.entries(config.kpiFieldMap ?? {})) {
    if (!(field in (config.fieldMap ?? {}))) errors.push(`KPI alanı '${field}' fieldMap içinde olmalı.`);
    if (!label.trim() || label.length > 100) errors.push(`KPI etiketi '${field}' 1–100 karakter olmalı.`);
  }
  const canonical = new Set<string>();
  for (const field of Object.keys(config.fieldMap ?? {})) {
    const key = canonicalFieldName(config.entity as CanonicalEntity, field);
    if (canonical.has(key)) errors.push(`Birden fazla alan aynı kanonik alana ('${key}') eşleniyor.`);
    canonical.add(key);
  }
  if (config.maxRows !== undefined && (!Number.isInteger(config.maxRows) || config.maxRows < 1 || config.maxRows > DEFAULT_MAX_ROWS)) {
    errors.push(`maxRows 1–${DEFAULT_MAX_ROWS} arasında bir tam sayı olmalı.`);
  }
  return errors;
}

function sqlStatement(config: SqlConnectorConfig, maxRows: number): string {
  const query = config.query.trim();
  if (config.driver === "mssql") return `SELECT TOP (${maxRows}) * FROM (${query}) AS abys_source`;
  return `SELECT * FROM (${query}) AS abys_source LIMIT ${maxRows}`;
}

async function queryPostgres(
  config: SqlConnectorConfig,
  ctx: SyncContext,
  connectionString: string,
  statement: string
): Promise<{ rows: SourceRow[]; rowCount: number }> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    application_name: "ABYS-readonly-connector",
  });
  let transactionStarted = false;
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    transactionStarted = true;
    await client.query(`SET LOCAL statement_timeout = '${QUERY_TIMEOUT_MS}'`);
    const result = await client.query(statement, config.checkpointParam ? [ctx.checkpoint] : []);
    await client.query("COMMIT");
    transactionStarted = false;
    return { rows: result.rows as SourceRow[], rowCount: result.rowCount ?? result.rows.length };
  } catch {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    throw new Error("PostgreSQL bağlantısı veya salt-okunur sorgu başarısız oldu. Sunucu günlüğünü kontrol edin.");
  } finally {
    await client.end().catch(() => {});
  }
}

async function queryMysql(
  config: SqlConnectorConfig,
  ctx: SyncContext,
  connectionString: string,
  statement: string
): Promise<{ rows: SourceRow[]; rowCount: number }> {
  let connection: mysql.Connection | null = null;
  let transactionStarted = false;
  try {
    connection = await mysql.createConnection(connectionString);
    await connection.query("SET TRANSACTION READ ONLY");
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      { sql: statement, timeout: QUERY_TIMEOUT_MS },
      config.checkpointParam ? [ctx.checkpoint] : []
    );
    if (!Array.isArray(rows)) throw new Error("Beklenmeyen MySQL sorgu sonucu.");
    await connection.commit();
    transactionStarted = false;
    return { rows: rows as SourceRow[], rowCount: rows.length };
  } catch {
    if (transactionStarted && connection) await connection.rollback().catch(() => {});
    throw new Error("MySQL bağlantısı veya salt-okunur sorgu başarısız oldu. Sunucu günlüğünü kontrol edin.");
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

async function queryMssql(
  config: SqlConnectorConfig,
  ctx: SyncContext,
  connectionString: string,
  statement: string
): Promise<{ rows: SourceRow[]; rowCount: number }> {
  let pool: mssql.ConnectionPool | null = null;
  try {
    const parsedConfig = mssql.ConnectionPool.parseConnectionString(connectionString);
    pool = new mssql.ConnectionPool({
      ...parsedConfig,
      connectionTimeout: QUERY_TIMEOUT_MS,
      requestTimeout: QUERY_TIMEOUT_MS,
      pool: { ...parsedConfig.pool, max: 1, min: 0 },
    });
    await pool.connect();
    const request = pool.request();
    if (config.checkpointParam) {
      request.input("p1", mssql.DateTime2, ctx.checkpoint ? new Date(ctx.checkpoint) : null);
    }
    const result = await request.query(statement);
    const rows = (result.recordset ?? []) as SourceRow[];
    return { rows, rowCount: rows.length };
  } catch {
    // SQL Server, PostgreSQL/MySQL gibi işlem düzeyinde READ ONLY bayrağı sunmaz.
    // Erişim denetimi yalnızca SELECT yetkili bir veritabanı kullanıcısıyla sağlanır.
    throw new Error("SQL Server bağlantısı veya salt-okunur sorgu başarısız oldu. Sunucu günlüğünü kontrol edin.");
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
}

async function queryRows(
  config: SqlConnectorConfig,
  ctx: SyncContext,
  sample = false
): Promise<{ rows: SourceRow[]; rowCount: number }> {
  const connectionString = ctx.resolveSecret(config.connectionStringEnvVar);
  if (!connectionString) {
    throw new Error(`Veritabanı bağlantısı için ${config.connectionStringEnvVar} ayarlanmamış.`);
  }

  if (config.driver === "postgres") {
    let parsed: URL;
    try {
      parsed = new URL(connectionString);
    } catch {
      throw new Error("PostgreSQL bağlantı adresi geçerli bir URL değil.");
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("Bağlantı adresi postgres:// veya postgresql:// ile başlamalı.");
    }
  } else if (config.driver === "mysql") {
    let parsed: URL;
    try {
      parsed = new URL(connectionString);
    } catch {
      throw new Error("MySQL bağlantı adresi geçerli bir URL değil.");
    }
    if (parsed.protocol !== "mysql:") {
      throw new Error("MySQL bağlantı adresi mysql:// ile başlamalı.");
    }
  } else if (connectionString.length > 4_000 || !/^(Server|Data Source|Address|Addr|Network Address)\s*=/i.test(connectionString.trim())) {
    throw new Error("SQL Server bağlantısı geçerli bir Server= veya Data Source= bağlantı dizesi olmalı.");
  }

  const maxRows = sample
    ? Math.min(config.maxRows ?? DEFAULT_MAX_ROWS, 50)
    : (config.maxRows ?? DEFAULT_MAX_ROWS);
  const statement = sqlStatement(config, maxRows);
  if (config.driver === "postgres") return queryPostgres(config, ctx, connectionString, statement);
  if (config.driver === "mysql") return queryMysql(config, ctx, connectionString, statement);
  return queryMssql(config, ctx, connectionString, statement);
}

function mapRows(
  config: SqlConnectorConfig,
  rows: SourceRow[]
): Pick<SyncOutcome, "records" | "skipped" | "rejected" | "checkpoint"> {
  const records: CanonicalRecord[] = [];
  const rejected: SyncOutcome["rejected"] = [];
  let skipped = 0;
  let checkpoint: string | null = null;

  for (const row of rows) {
    const externalIdRaw = getPath(row, config.idField);
    const externalId =
      typeof externalIdRaw === "string" || typeof externalIdRaw === "number"
        ? String(externalIdRaw)
        : null;
    if (!externalId) {
      rejected.push({
        entity: config.entity,
        sourceRef: null,
        code: "MISSING_EXTERNAL_ID",
        reason: `Kaynak satırın '${config.idField}' dış kimliği boş.`,
      });
      skipped++;
      continue;
    }

    const fields: CanonicalRecord["fields"] = {};
    let invalidField: string | null = null;
    for (const [canonical, sourcePath] of Object.entries(config.fieldMap)) {
      const value = getPath(row, sourcePath);
      if (value !== null && value !== undefined && typeof value === "object" && !(value instanceof Date)) {
        invalidField = canonical;
        break;
      }
      fields[canonical] = primitive(value);
    }
    if (invalidField) {
      rejected.push({
        entity: config.entity,
        sourceRef: externalId,
        code: "INVALID_FIELD_TYPE",
        reason: `'${invalidField}' alanı ilkel bir değer gerektiriyor.`,
      });
      skipped++;
      continue;
    }

    const updatedAtRaw = config.updatedAtField ? getPath(row, config.updatedAtField) : null;
    const sourceUpdatedAt = toIso(updatedAtRaw);
    if (updatedAtRaw !== null && updatedAtRaw !== undefined && sourceUpdatedAt === null) {
      rejected.push({
        entity: config.entity,
        sourceRef: externalId,
        code: "INVALID_SOURCE_UPDATED_AT",
        reason: `'${config.updatedAtField}' geçerli bir tarih değil.`,
      });
      skipped++;
      continue;
    }
    if (sourceUpdatedAt && (!checkpoint || sourceUpdatedAt > checkpoint)) checkpoint = sourceUpdatedAt;

    const validation = validateCanonicalRecord({
      entity: config.entity,
      externalId,
      sourceUpdatedAt,
      fields,
    });
    if (!validation.record) {
      rejected.push({
        entity: config.entity,
        sourceRef: externalId,
        code: validation.violations[0]?.code ?? "CONTRACT_VALIDATION_FAILED",
        reason: validation.violations.map((issue) => issue.message).join("; "),
      });
      skipped++;
      continue;
    }
    records.push(validation.record);
  }

  return { records, skipped, rejected, checkpoint };
}

function createSqlAdapter(id: string, driver: SqlConnectorConfig["driver"]): ConnectorAdapter {
  const validate = (rawConfig: unknown): string[] => {
    const errors = validateSqlConfig(rawConfig);
    if (rawConfig && typeof rawConfig === "object" && (rawConfig as Partial<SqlConnectorConfig>).driver !== driver) {
      errors.push(`Bu adaptör ${driver} sürücüsü için yapılandırılmalı.`);
    }
    return errors;
  };

  return {
    id,
    status: "ready",
    validate,

    async probe(rawConfig, ctx): Promise<ConnectorProbeResult> {
      const started = Date.now();
      try {
        const errors = validate(rawConfig);
        if (errors.length) throw new Error(errors.join("; "));
        if (!rawConfig || typeof rawConfig !== "object" || (rawConfig as Partial<SqlConnectorConfig>).kind !== "sql") {
          throw new Error("SQL konfigürasyonu bekleniyordu.");
        }
        const config = rawConfig as SqlConnectorConfig;
        const result = await queryRows(config, ctx, true);
        const observedFields = observeSourceSchema(result.rows);
        const observedPaths = new Set(observedFields.map((field) => field.path.replace(/\[\]$/, "")));
        const missingMappedFields = Object.entries(config.fieldMap)
          .filter(([, sourcePath]) => !observedPaths.has(sourcePath))
          .map(([canonical]) => canonical);
        const warnings = driver === "mssql"
          ? [
              "SQL Server bağlantısı salt-okunur veritabanı kullanıcısı gerektirir; sorgu kullanıcı yetkileriyle sınırlandırılır.",
              "SQL Server bağlantısında Encrypt=true ve TrustServerCertificate=false kullanılması önerilir.",
            ]
          : [
              "Bağlantı testi salt-okunur transaction içinde çalıştı; kaynak sisteme kayıt yazılmadı.",
              "Veritabanı kullanıcısına ayrıca SELECT yetkisi dışında yetki verilmemelidir.",
            ];
        return {
          ok: true,
          latencyMs: Date.now() - started,
          httpStatus: null,
          recordsSeen: result.rows.length,
          observedFields,
          missingMappedFields,
          warnings,
          error: null,
        };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          httpStatus: null,
          recordsSeen: 0,
          observedFields: [],
          missingMappedFields: [],
          warnings: [],
          error: err instanceof Error ? err.message : "SQL bağlantı testi başarısız oldu.",
        };
      }
    },

    async sync(rawConfig, ctx): Promise<SyncOutcome> {
      const errors = validate(rawConfig);
      if (errors.length) throw new Error(errors.join("; "));
      if (!rawConfig || typeof rawConfig !== "object" || (rawConfig as Partial<SqlConnectorConfig>).kind !== "sql") {
        throw new Error("SQL konfigürasyonu bekleniyordu.");
      }
      const config = rawConfig as SqlConnectorConfig;
      const result = await queryRows(config, ctx);
      const mapped = mapRows(config, result.rows);
      const maxRows = config.maxRows ?? DEFAULT_MAX_ROWS;
      const reachedLimit = result.rows.length >= maxRows;
      const candidateCheckpoint =
        mapped.checkpoint && (!ctx.checkpoint || mapped.checkpoint > ctx.checkpoint)
          ? mapped.checkpoint
          : ctx.checkpoint;
      // Sonuç kırpılmış olabilir: eksik satırları atlamamak için checkpoint ilerletilmez.
      const checkpoint = reachedLimit ? ctx.checkpoint : candidateCheckpoint;
      const readonlyWarning = driver === "mssql"
        ? "SQL Server için ayrıcalığı yalnızca SELECT olan veritabanı kullanıcısı zorunludur; uygulama işlem düzeyinde READ ONLY kipi sunmaz."
        : `${driver === "postgres" ? "PostgreSQL" : "MySQL"} kaynağı salt-okunur transaction içinde sorgulandı; ayrıca SELECT-only kullanıcı önerilir.`;
      return {
        ...mapped,
        pages: 1,
        readCount: result.rows.length,
        warnings: [
          readonlyWarning,
          ...(reachedLimit
            ? [`Sorgu ${maxRows} satır sınırına ulaştı; eksik kayıtları atlamamak için checkpoint ilerletilmedi. Veriyi daha küçük tarih aralıklarıyla içe aktarın.`]
            : []),
        ],
        checkpoint,
        sourceSchema: observeSourceSchema(result.rows.slice(0, 200)),
      };
    },
  };
}

export const sqlAdapter = createSqlAdapter("postgresql", "postgres");
export const sqlServerAdapter = createSqlAdapter("sqlserver", "mssql");
export const mysqlAdapter = createSqlAdapter("mysql", "mysql");
