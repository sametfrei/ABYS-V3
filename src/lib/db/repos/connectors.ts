import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import type { CanonicalRecord, ConnectorConfig } from "@/lib/connectors/types";

/**
 * Konnektör konfigürasyonu, senkron çalıştırmaları ve kanonik kayıt deposu.
 * Tüm sorgular org_id kapsamlıdır. Kimlik bilgisi saklanmaz; konfigürasyon
 * yalnızca ortam değişkeni adını taşır.
 */

export interface ConnectorConfigRow {
  id: string;
  connectorId: string;
  name: string;
  config: ConnectorConfig;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

export interface SyncRunRow {
  id: string;
  configId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  pages: number;
  readCount: number;
  writtenCount: number;
  skippedCount: number;
  checkpoint: string | null;
  error: string | null;
  warnings: string[];
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function createConnectorConfig(params: {
  orgId: string;
  connectorId: string;
  name: string;
  config: ConnectorConfig;
  createdBy: string;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  await getDb().query(
    `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, params.orgId, params.connectorId, params.name, JSON.stringify(params.config), params.createdBy]
  );
  return id;
}

export async function listConnectorConfigs(orgId: string): Promise<ConnectorConfigRow[]> {
  await migrate();
  const r = await getDb().query<{
    id: string;
    connector_id: string;
    name: string;
    config: ConnectorConfig;
    enabled: boolean;
    created_by: string;
    created_at: string | Date;
  }>(
    `SELECT id, connector_id, name, config, enabled, created_by, created_at
       FROM connector_configs WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    connectorId: row.connector_id,
    name: row.name,
    config: row.config,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  }));
}

export async function getConnectorConfig(
  orgId: string,
  id: string
): Promise<ConnectorConfigRow | null> {
  await migrate();
  const r = await getDb().query<{
    id: string;
    connector_id: string;
    name: string;
    config: ConnectorConfig;
    enabled: boolean;
    created_by: string;
    created_at: string | Date;
  }>(
    `SELECT id, connector_id, name, config, enabled, created_by, created_at
       FROM connector_configs WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    connectorId: row.connector_id,
    name: row.name,
    config: row.config,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

export async function startSyncRun(orgId: string, configId: string): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  await getDb().query(
    `INSERT INTO connector_sync_runs (id, org_id, config_id, status) VALUES ($1, $2, $3, 'running')`,
    [id, orgId, configId]
  );
  return id;
}

export async function finishSyncRun(params: {
  orgId: string;
  runId: string;
  status: "success" | "failed";
  pages: number;
  readCount: number;
  writtenCount: number;
  skippedCount: number;
  checkpoint: string | null;
  error?: string | null;
  warnings?: string[];
}): Promise<void> {
  await migrate();
  await getDb().query(
    `UPDATE connector_sync_runs
        SET status = $3, finished_at = now(), pages = $4, read_count = $5,
            written_count = $6, skipped_count = $7, checkpoint = $8, error = $9, warnings = $10
      WHERE id = $1 AND org_id = $2`,
    [
      params.runId,
      params.orgId,
      params.status,
      params.pages,
      params.readCount,
      params.writtenCount,
      params.skippedCount,
      params.checkpoint,
      params.error ?? null,
      JSON.stringify(params.warnings ?? []),
    ]
  );
}

/** Idempotent kanonik kayıt yazımı: aynı (config, entity, external_id) güncellenir. */
export async function upsertCanonicalRecords(
  orgId: string,
  configId: string,
  records: CanonicalRecord[]
): Promise<number> {
  if (records.length === 0) return 0;
  await migrate();
  const db = getDb();
  let written = 0;
  for (const record of records) {
    await db.query(
      `INSERT INTO connector_records
         (id, org_id, config_id, entity, external_id, data, source_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (org_id, config_id, entity, external_id)
       DO UPDATE SET data = EXCLUDED.data, source_updated_at = EXCLUDED.source_updated_at, synced_at = now()`,
      [
        randomBytes(8).toString("hex"),
        orgId,
        configId,
        record.entity,
        record.externalId,
        JSON.stringify({ fields: record.fields }),
        record.sourceUpdatedAt,
      ]
    );
    written++;
  }
  return written;
}

export async function getLastCheckpoint(orgId: string, configId: string): Promise<string | null> {
  await migrate();
  const r = await getDb().query<{ checkpoint: string | null }>(
    `SELECT checkpoint FROM connector_sync_runs
      WHERE org_id = $1 AND config_id = $2 AND status = 'success'
      ORDER BY finished_at DESC NULLS LAST LIMIT 1`,
    [orgId, configId]
  );
  return r.rows[0]?.checkpoint ?? null;
}

export async function listSyncRuns(
  orgId: string,
  configId: string,
  limit = 20
): Promise<SyncRunRow[]> {
  await migrate();
  const r = await getDb().query<{
    id: string;
    config_id: string;
    status: string;
    started_at: string | Date;
    finished_at: string | Date | null;
    pages: number;
    read_count: number;
    written_count: number;
    skipped_count: number;
    checkpoint: string | null;
    error: string | null;
    warnings: string[] | null;
  }>(
    `SELECT id, config_id, status, started_at, finished_at, pages, read_count,
            written_count, skipped_count, checkpoint, error, warnings
       FROM connector_sync_runs WHERE org_id = $1 AND config_id = $2
      ORDER BY started_at DESC LIMIT $3`,
    [orgId, configId, limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    configId: row.config_id,
    status: row.status,
    startedAt: iso(row.started_at),
    finishedAt: row.finished_at ? iso(row.finished_at) : null,
    pages: Number(row.pages),
    readCount: Number(row.read_count),
    writtenCount: Number(row.written_count),
    skippedCount: Number(row.skipped_count),
    checkpoint: row.checkpoint,
    error: row.error,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
  }));
}

export async function countRecordsByEntity(
  orgId: string,
  configId: string
): Promise<{ entity: string; count: number }[]> {
  await migrate();
  const r = await getDb().query<{ entity: string; count: number }>(
    `SELECT entity, count(*)::int AS count FROM connector_records
      WHERE org_id = $1 AND config_id = $2 GROUP BY entity ORDER BY entity`,
    [orgId, configId]
  );
  return r.rows.map((row) => ({ entity: row.entity, count: Number(row.count) }));
}
