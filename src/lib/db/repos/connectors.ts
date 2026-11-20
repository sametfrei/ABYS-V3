import { randomBytes } from "crypto";
import type { Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import type { CanonicalRecord, ConnectorConfig, ObservedSourceField } from "@/lib/connectors/types";
import { CANONICAL_CONTRACT_VERSION, type MappingSuggestion } from "@/lib/connectors/contracts";
import {
  buildCanonicalEntityLink,
  type EntityMatchStrategy,
} from "@/lib/connectors/entity-resolution";
import { quarantineIssue } from "./data-quality";
import { recordAuditEventInTransaction } from "./audit";

/**
 * Konnektör konfigürasyonu, senkron çalıştırmaları ve kanonik kayıt deposu.
 * Tüm sorgular org_id kapsamlıdır. Kimlik bilgisi saklanmaz; konfigürasyon
 * yalnızca ortam değişkeni adını taşır.
 */

export interface ConnectorConfigRow {
  id: string;
  orgId: string;
  connectorId: string;
  name: string;
  config: ConnectorConfig;
  configVersion: number;
  enabled: boolean;
  scheduleIntervalMinutes: number | null;
  nextRunAt: string | null;
  lastScheduledAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SyncRunRow {
  id: string;
  configId: string;
  status: string;
  trigger: ConnectorSyncTrigger;
  startedAt: string;
  finishedAt: string | null;
  pages: number;
  readCount: number;
  writtenCount: number;
  skippedCount: number;
  rejectedCount: number;
  checkpoint: string | null;
  error: string | null;
  warnings: string[];
  sourceSchema: ObservedSourceField[];
  mappingSuggestions: MappingSuggestion[];
}

export interface ConnectorConfigVersionRow {
  id: string;
  configId: string;
  version: number;
  config: ConnectorConfig;
  changeSummary: string;
  sourceRunId: string | null;
  approvedSuggestions: MappingSuggestion[];
  createdBy: string;
  createdAt: string;
}

/** Aynı konnektör için eşzamanlı senkron başlatılmasını engelleyen hata. */
export class ConnectorSyncBusyError extends Error {
  readonly code = "CONNECTOR_SYNC_BUSY";

  constructor(public readonly runId: string) {
    super("Bu konnektör için zaten çalışan bir senkronizasyon var.");
    this.name = "ConnectorSyncBusyError";
  }
}

/** Eşleme onayı sırasında konfigürasyon başka bir oturumda değişmişse. */
export class ConnectorMappingConflictError extends Error {
  readonly code = "CONNECTOR_MAPPING_CONFLICT";

  constructor(public readonly currentVersion: number) {
    super("Konnektör konfigürasyonu bu sırada değişti. Güncel eşlemeyi yeniden yükleyin.");
    this.name = "ConnectorMappingConflictError";
  }
}

const STALE_SYNC_AFTER_MS = 2 * 60 * 60 * 1000;
export const MIN_CONNECTOR_SCHEDULE_MINUTES = 5;
export const MAX_CONNECTOR_SCHEDULE_MINUTES = 525_600;

export type ConnectorSyncTrigger = "manual" | "scheduled";

interface ConnectorConfigDbRow {
  id: string;
  org_id: string;
  connector_id: string;
  name: string;
  config: ConnectorConfig;
  config_version: number;
  enabled: boolean;
  schedule_interval_minutes: number | null;
  next_run_at: string | Date | null;
  last_scheduled_at: string | Date | null;
  created_by: string;
  created_at: string | Date;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function optionalIso(value: string | Date | null): string | null {
  return value === null ? null : iso(value);
}

function mapConnectorConfig(row: ConnectorConfigDbRow): ConnectorConfigRow {
  return {
    id: row.id,
    orgId: row.org_id,
    connectorId: row.connector_id,
    name: row.name,
    config: row.config,
    configVersion: Number(row.config_version),
    enabled: row.enabled,
    scheduleIntervalMinutes:
      row.schedule_interval_minutes === null ? null : Number(row.schedule_interval_minutes),
    nextRunAt: optionalIso(row.next_run_at),
    lastScheduledAt: optionalIso(row.last_scheduled_at),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

function validateScheduleInterval(intervalMinutes: number): number {
  if (
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < MIN_CONNECTOR_SCHEDULE_MINUTES ||
    intervalMinutes > MAX_CONNECTOR_SCHEDULE_MINUTES
  ) {
    throw new Error(
      `Senkron aralığı ${MIN_CONNECTOR_SCHEDULE_MINUTES}–${MAX_CONNECTOR_SCHEDULE_MINUTES} dakika arasında bir tam sayı olmalı.`
    );
  }
  return intervalMinutes;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function fieldFingerprint(fields: CanonicalRecord["fields"]): string {
  return JSON.stringify(
    Object.keys(fields)
      .sort()
      .map((key) => [key, fields[key]])
  );
}

function timestampFingerprint(value: string | Date | null): string | null {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export async function createConnectorConfig(params: {
  orgId: string;
  connectorId: string;
  name: string;
  config: ConnectorConfig;
  createdBy: string;
  scheduleIntervalMinutes?: number | null;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  const interval =
    params.scheduleIntervalMinutes === undefined || params.scheduleIntervalMinutes === null
      ? null
      : validateScheduleInterval(params.scheduleIntervalMinutes);
  const nextRunAt = interval === null ? null : addMinutes(new Date(), interval).toISOString();
  await getDb().transaction(async (tx) => {
    await tx.query(
      `INSERT INTO connector_configs
         (id, org_id, connector_id, name, config, created_by, schedule_interval_minutes, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        params.orgId,
        params.connectorId,
        params.name,
        JSON.stringify(params.config),
        params.createdBy,
        interval,
        nextRunAt,
      ]
    );
    await tx.query(
      `INSERT INTO connector_config_versions
         (id, org_id, config_id, version, config, change_summary, created_by)
       VALUES ($1, $2, $3, 1, $4, $5, $6)`,
      [
        randomBytes(8).toString("hex"),
        params.orgId,
        id,
        JSON.stringify(params.config),
        "Başlangıç konfigürasyonu.",
        params.createdBy,
      ]
    );
  });
  return id;
}

export async function listConnectorConfigs(orgId: string): Promise<ConnectorConfigRow[]> {
  await migrate();
  const r = await getDb().query<ConnectorConfigDbRow>(
    `SELECT id, org_id, connector_id, name, config, config_version, enabled,
            schedule_interval_minutes, next_run_at, last_scheduled_at,
            created_by, created_at
       FROM connector_configs WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return r.rows.map(mapConnectorConfig);
}

export async function getConnectorConfig(
  orgId: string,
  id: string
): Promise<ConnectorConfigRow | null> {
  await migrate();
  const r = await getDb().query<ConnectorConfigDbRow>(
    `SELECT id, org_id, connector_id, name, config, config_version, enabled,
            schedule_interval_minutes, next_run_at, last_scheduled_at,
            created_by, created_at
       FROM connector_configs WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapConnectorConfig(row);
}

export async function listConnectorConfigVersions(
  orgId: string,
  configId: string,
  limit = 20
): Promise<ConnectorConfigVersionRow[]> {
  await migrate();
  const r = await getDb().query<{
    id: string;
    config_id: string;
    version: number;
    config: ConnectorConfig;
    change_summary: string;
    source_run_id: string | null;
    approved_suggestions: MappingSuggestion[] | null;
    created_by: string;
    created_at: string | Date;
  }>(
    `SELECT id, config_id, version, config, change_summary, source_run_id,
            approved_suggestions, created_by, created_at
       FROM connector_config_versions
      WHERE org_id = $1 AND config_id = $2
      ORDER BY version DESC LIMIT $3`,
    [orgId, configId, Math.max(1, Math.min(100, Math.trunc(limit)))]
  );
  return r.rows.map((row) => ({
    id: row.id,
    configId: row.config_id,
    version: Number(row.version),
    config: row.config,
    changeSummary: row.change_summary,
    sourceRunId: row.source_run_id,
    approvedSuggestions: Array.isArray(row.approved_suggestions) ? row.approved_suggestions : [],
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  }));
}

/**
 * Onaylanmış eşlemeyi iyimser sürüm kilidiyle yazar. Eski sürümü görmüş bir
 * istemci başka bir değişikliğin üzerine yazamaz. Yeni sürüm ve mevcut
 * konfigürasyon aynı transaction içinde güncellenir.
 */
export async function approveConnectorMapping(params: {
  orgId: string;
  configId: string;
  expectedVersion: number;
  config: ConnectorConfig;
  changeSummary: string;
  sourceRunId?: string | null;
  approvedSuggestions?: MappingSuggestion[];
  actor: string;
  audit: {
    type: string;
    summary: string;
    detail: string;
  };
  auditWriter?: (
    tx: Transaction,
    event: { orgId: string; actor: string; type: string; summary: string; detail: string }
  ) => Promise<string>;
}): Promise<{ configVersion: number; config: ConnectorConfig } | null> {
  await migrate();
  return getDb().transaction(async (tx) => {
    const current = await tx.query<{ config_version: number }>(
      `SELECT config_version FROM connector_configs
        WHERE org_id = $1 AND id = $2 FOR UPDATE`,
      [params.orgId, params.configId]
    );
    const row = current.rows[0];
    if (!row) return null;
    const currentVersion = Number(row.config_version);
    if (currentVersion !== params.expectedVersion) {
      throw new ConnectorMappingConflictError(currentVersion);
    }

    const nextVersion = currentVersion + 1;
    const updated = await tx.query(
      `UPDATE connector_configs
          SET config = $3, config_version = $4, updated_at = now()
        WHERE org_id = $1 AND id = $2 AND config_version = $5`,
      [params.orgId, params.configId, JSON.stringify(params.config), nextVersion, currentVersion]
    );
    if (updated.affectedRows !== 1) {
      throw new ConnectorMappingConflictError(currentVersion);
    }

    await tx.query(
      `INSERT INTO connector_config_versions
         (id, org_id, config_id, version, config, change_summary, source_run_id,
          approved_suggestions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomBytes(8).toString("hex"),
        params.orgId,
        params.configId,
        nextVersion,
        JSON.stringify(params.config),
        params.changeSummary,
        params.sourceRunId ?? null,
        JSON.stringify(params.approvedSuggestions ?? []),
        params.actor,
      ]
    );
    const writeAudit = params.auditWriter ?? recordAuditEventInTransaction;
    await writeAudit(tx, {
      orgId: params.orgId,
      actor: params.actor,
      type: params.audit.type,
      summary: params.audit.summary,
      detail: params.audit.detail,
    });
    return { configVersion: nextVersion, config: params.config };
  });
}

export async function setConnectorSchedule(params: {
  orgId: string;
  configId: string;
  intervalMinutes: number | null;
  now?: Date;
}): Promise<ConnectorConfigRow | null> {
  await migrate();
  const interval =
    params.intervalMinutes === null
      ? null
      : validateScheduleInterval(params.intervalMinutes);
  const now = params.now ?? new Date();
  const nextRunAt = interval === null ? null : addMinutes(now, interval).toISOString();
  const r = await getDb().query<ConnectorConfigDbRow>(
    `UPDATE connector_configs
        SET schedule_interval_minutes = $3,
            next_run_at = $4,
            updated_at = now()
      WHERE org_id = $1 AND id = $2
      RETURNING id, org_id, connector_id, name, config, config_version, enabled,
                schedule_interval_minutes, next_run_at, last_scheduled_at,
                created_by, created_at`,
    [params.orgId, params.configId, interval, nextRunAt]
  );
  return r.rows[0] ? mapConnectorConfig(r.rows[0]) : null;
}

export async function listDueConnectorConfigs(params: {
  now: Date;
  limit: number;
  orgId?: string;
}): Promise<ConnectorConfigRow[]> {
  await migrate();
  const limit = Math.max(1, Math.min(50, Math.trunc(params.limit)));
  const columns = `id, org_id, connector_id, name, config, config_version, enabled,
                   schedule_interval_minutes, next_run_at, last_scheduled_at,
                   created_by, created_at`;
  const r = params.orgId
    ? await getDb().query<ConnectorConfigDbRow>(
        `SELECT ${columns}
           FROM connector_configs
          WHERE org_id = $1 AND enabled = true
            AND schedule_interval_minutes IS NOT NULL
            AND next_run_at IS NOT NULL AND next_run_at <= $2
          ORDER BY next_run_at ASC LIMIT $3`,
        [params.orgId, params.now.toISOString(), limit]
      )
    : await getDb().query<ConnectorConfigDbRow>(
        `SELECT ${columns}
           FROM connector_configs
          WHERE enabled = true
            AND schedule_interval_minutes IS NOT NULL
            AND next_run_at IS NOT NULL AND next_run_at <= $1
          ORDER BY next_run_at ASC LIMIT $2`,
        [params.now.toISOString(), limit]
      );
  return r.rows.map(mapConnectorConfig);
}

async function reclaimOrRejectActiveRun(
  tx: Transaction,
  params: { orgId: string; configId: string; now: Date }
): Promise<{ busyRunId: string | null; staleRunId: string | null }> {
  const active = await tx.query<{ id: string; started_at: string | Date }>(
    `SELECT id, started_at FROM connector_sync_runs
      WHERE org_id = $1 AND config_id = $2 AND status = 'running'
      ORDER BY started_at DESC LIMIT 1
      FOR UPDATE`,
    [params.orgId, params.configId]
  );
  const running = active.rows[0];
  if (!running) return { busyRunId: null, staleRunId: null };
  const startedAt = new Date(running.started_at).getTime();
  const stale = Number.isFinite(startedAt) && params.now.getTime() - startedAt > STALE_SYNC_AFTER_MS;
  if (!stale) return { busyRunId: running.id, staleRunId: null };
  // Süreç çöktüğünde kalan kilidi sınırsız süre canlı tutmayız; ancak
  // iki saatten kısa süren aktif bir çalıştırmayı ikinci istek gasbetmez.
  await tx.query(
    `UPDATE connector_sync_runs
        SET status = 'failed', finished_at = now(),
            error = COALESCE(error, 'Stale running sync reclaimed before a new run.')
      WHERE id = $1 AND org_id = $2 AND status = 'running'`,
    [running.id, params.orgId]
  );
  return { busyRunId: null, staleRunId: running.id };
}

export async function startSyncRun(
  orgId: string,
  configId: string,
  options: { trigger?: ConnectorSyncTrigger } = {}
): Promise<string> {
  await migrate();
  const db = getDb();
  return db.transaction(async (tx) => {
    // Aynı konnektörün başlangıç kontrolü ile run kaydı arasında yarış olmamalı.
    // Konfigürasyon satırı, ikinci isteği birinci tamamlanana kadar sıraya alır.
    const owned = await tx.query<{ id: string }>(
      "SELECT id FROM connector_configs WHERE id = $1 AND org_id = $2 FOR UPDATE",
      [configId, orgId]
    );
    if (!owned.rows[0]) {
      throw new Error("Konnektör konfigürasyonu bu organizasyona ait değil.");
    }

    const active = await reclaimOrRejectActiveRun(tx, { orgId, configId, now: new Date() });
    if (active.busyRunId) throw new ConnectorSyncBusyError(active.busyRunId);

    const id = randomBytes(8).toString("hex");
    await tx.query(
      `INSERT INTO connector_sync_runs (id, org_id, config_id, status, trigger)
       VALUES ($1, $2, $3, 'running', $4)`,
      [id, orgId, configId, options.trigger ?? "manual"]
    );
    return id;
  });
}

export interface ScheduledSyncClaim {
  runId: string | null;
  skippedReason: "not_due" | "busy" | null;
  nextRunAt: string | null;
}

/**
 * Zamanlayıcı için due konnektörü atomik olarak sahiplenir. `next_run_at`
 * çalıştırma başlamadan ilerletilir; böylece çöken bir süreç aynı kaydı her
 * tetiklemede yeniden başlatmaz. Aktif bir manuel/zamanlanmış çalıştırma varsa
 * yeni run açılmaz ve bir sonraki pencereye geçilir.
 */
export async function claimScheduledSyncRun(params: {
  orgId: string;
  configId: string;
  now?: Date;
}): Promise<ScheduledSyncClaim> {
  await migrate();
  const now = params.now ?? new Date();
  return getDb().transaction(async (tx) => {
    const config = await tx.query<{
      id: string;
      enabled: boolean;
      schedule_interval_minutes: number | null;
      next_run_at: string | Date | null;
    }>(
      `SELECT id, enabled, schedule_interval_minutes, next_run_at
         FROM connector_configs
        WHERE org_id = $1 AND id = $2
        FOR UPDATE`,
      [params.orgId, params.configId]
    );
    const row = config.rows[0];
    if (
      !row ||
      !row.enabled ||
      row.schedule_interval_minutes === null ||
      row.next_run_at === null ||
      new Date(row.next_run_at).getTime() > now.getTime()
    ) {
      return {
        runId: null,
        skippedReason: "not_due" as const,
        nextRunAt: row?.next_run_at ? iso(row.next_run_at) : null,
      };
    }

    const interval = Number(row.schedule_interval_minutes);
    const nextRunAt = addMinutes(now, interval).toISOString();
    const active = await reclaimOrRejectActiveRun(tx, {
      orgId: params.orgId,
      configId: params.configId,
      now,
    });
    if (active.busyRunId) {
      await tx.query(
        `UPDATE connector_configs
            SET next_run_at = $3, updated_at = now()
          WHERE org_id = $1 AND id = $2`,
        [params.orgId, params.configId, nextRunAt]
      );
      return { runId: null, skippedReason: "busy" as const, nextRunAt };
    }

    await tx.query(
      `UPDATE connector_configs
          SET next_run_at = $3, last_scheduled_at = $4, updated_at = now()
        WHERE org_id = $1 AND id = $2`,
      [params.orgId, params.configId, nextRunAt, now.toISOString()]
    );
    const runId = randomBytes(8).toString("hex");
    await tx.query(
      `INSERT INTO connector_sync_runs (id, org_id, config_id, status, trigger)
       VALUES ($1, $2, $3, 'running', 'scheduled')`,
      [runId, params.orgId, params.configId]
    );
    return { runId, skippedReason: null, nextRunAt };
  });
}

export async function finishSyncRun(params: {
  orgId: string;
  runId: string;
  status: "success" | "failed";
  pages: number;
  readCount: number;
  writtenCount: number;
  skippedCount: number;
  rejectedCount?: number;
  checkpoint: string | null;
  error?: string | null;
  warnings?: string[];
  sourceSchema?: ObservedSourceField[];
  mappingSuggestions?: MappingSuggestion[];
  tx?: Transaction;
}): Promise<void> {
  if (!params.tx) await migrate();
  const db = params.tx ?? getDb();
  await db.query(
    `UPDATE connector_sync_runs
        SET status = $3, finished_at = now(), pages = $4, read_count = $5,
            written_count = $6, skipped_count = $7, rejected_count = $8,
            checkpoint = $9, error = $10, warnings = $11,
            source_schema = $12, mapping_suggestions = $13
      WHERE id = $1 AND org_id = $2`,
    [
      params.runId,
      params.orgId,
      params.status,
      params.pages,
      params.readCount,
      params.writtenCount,
      params.skippedCount,
      params.rejectedCount ?? 0,
      params.checkpoint,
      params.error ?? null,
      JSON.stringify(params.warnings ?? []),
      params.sourceSchema ? JSON.stringify(params.sourceSchema) : null,
      params.mappingSuggestions ? JSON.stringify(params.mappingSuggestions) : null,
    ]
  );
}

/** Idempotent kanonik kayıt yazımı: aynı (config, entity, external_id) güncellenir. */
export async function upsertCanonicalRecords(
  orgId: string,
  configId: string,
  records: CanonicalRecord[],
  tx?: Transaction,
  options: { runId?: string } = {}
): Promise<number> {
  if (records.length === 0) return 0;
  if (!tx) await migrate();
  let written = 0;
  const write = async (executor: Transaction) => {
    const owned = await executor.query<{ id: string }>(
      "SELECT id FROM connector_configs WHERE id = $1 AND org_id = $2",
      [configId, orgId]
    );
    if (!owned.rows[0]) {
      throw new Error("Konnektör konfigürasyonu bu organizasyona ait değil.");
    }
    for (const record of records) {
      const existingRecord = await executor.query<{
        data: { fields?: CanonicalRecord["fields"] };
        source_updated_at: string | Date | null;
      }>(
        `SELECT data, source_updated_at FROM connector_records
          WHERE org_id = $1 AND config_id = $2 AND entity = $3 AND external_id = $4
          FOR UPDATE`,
        [orgId, configId, record.entity, record.externalId]
      );
      const recordData = { contractVersion: CANONICAL_CONTRACT_VERSION, fields: record.fields };
      await executor.query(
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
          JSON.stringify(recordData),
          record.sourceUpdatedAt,
        ]
      );

      const proposedLink = buildCanonicalEntityLink(orgId, configId, record);
      const currentLink = await executor.query<{
        canonical_entity_id: string;
        match_strategy: EntityMatchStrategy;
        match_confidence: number;
      }>(
        `SELECT canonical_entity_id, match_strategy, match_confidence
           FROM canonical_entity_links
          WHERE org_id = $1 AND source_config_id = $2 AND entity = $3 AND source_external_id = $4`,
        [orgId, configId, record.entity, record.externalId]
      );
      const current = currentLink.rows[0];
      let link = proposedLink;

      if (current) {
        const currentStrong = current.match_strategy === "email" || current.match_strategy === "sku";
        const proposedStrong =
          proposedLink.matchStrategy === "email" || proposedLink.matchStrategy === "sku";
        const identityChanged = current.canonical_entity_id !== proposedLink.canonicalEntityId;

        // Güçlü kimlik, sonraki bir kaynak kaydında e-posta/SKU kaybolduğunda
        // kaynak-kapsamlı kimliğe gerilemez. Aynı kaynak kaydının güçlü kimliği
        // değişirse otomatik yeniden bağlama yapılmaz; inceleme kaydı açılır.
        if (currentStrong && (!proposedStrong || identityChanged)) {
          if (proposedStrong && identityChanged) {
            const existingIssue = await executor.query<{ id: string }>(
              `SELECT id FROM data_quality_issues
                WHERE org_id = $1 AND source = $2 AND code = 'IDENTITY_LINK_CONFLICT'
                  AND source_ref = $3 AND status = 'pending'
                LIMIT 1`,
              [orgId, `connector:${configId}`, record.externalId]
            );
            if (!existingIssue.rows[0]) {
              await quarantineIssue({
                orgId,
                source: `connector:${configId}`,
                entity: record.entity,
                sourceRef: record.externalId,
                code: "IDENTITY_LINK_CONFLICT",
                connectorRunId: options.runId ?? null,
                reason:
                  "Kaynak kaydın güçlü kimliği önceki bağlantıdan farklı. Otomatik kimlik değişimi durduruldu; inceleme gerekiyor.",
                payload: {
                  previousCanonicalEntityId: current.canonical_entity_id,
                  proposedCanonicalEntityId: proposedLink.canonicalEntityId,
                  previousStrategy: current.match_strategy,
                  proposedStrategy: proposedLink.matchStrategy,
                },
                tx: executor,
              });
            }
          }
          link = {
            ...link,
            canonicalEntityId: current.canonical_entity_id,
            matchStrategy: current.match_strategy,
            matchConfidence: Number(current.match_confidence),
          };
        }
      }

      await executor.query(
        `INSERT INTO canonical_entity_links
           (id, org_id, canonical_entity_id, entity, source_config_id,
            source_external_id, match_strategy, match_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (org_id, source_config_id, entity, source_external_id)
         DO UPDATE SET canonical_entity_id = EXCLUDED.canonical_entity_id,
                       match_strategy = EXCLUDED.match_strategy,
                       match_confidence = EXCLUDED.match_confidence,
                       resolved_at = now()`,
        [
          link.id,
          orgId,
          link.canonicalEntityId,
          link.entity,
          link.sourceConfigId,
          link.sourceExternalId,
          link.matchStrategy,
          link.matchConfidence,
        ]
      );
      const previous = existingRecord.rows[0];
      const recordChanged =
        !previous ||
        fieldFingerprint(previous.data?.fields ?? {}) !== fieldFingerprint(record.fields) ||
        timestampFingerprint(previous.source_updated_at) !==
          timestampFingerprint(record.sourceUpdatedAt) ||
        current?.canonical_entity_id !== link.canonicalEntityId;
      if (recordChanged) {
        await executor.query(
          `INSERT INTO connector_record_history
             (id, org_id, config_id, entity, external_id, canonical_entity_id,
              data, source_updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomBytes(8).toString("hex"),
            orgId,
            configId,
            record.entity,
            record.externalId,
            link.canonicalEntityId,
            JSON.stringify(recordData),
            record.sourceUpdatedAt,
          ]
        );
      }
      written++;
    }
  };
  if (tx) {
    await write(tx);
  } else {
    await getDb().transaction(write);
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
    trigger: ConnectorSyncTrigger;
    started_at: string | Date;
    finished_at: string | Date | null;
    pages: number;
    read_count: number;
    written_count: number;
    skipped_count: number;
    rejected_count: number;
    checkpoint: string | null;
    error: string | null;
    warnings: string[] | null;
    source_schema: ObservedSourceField[] | null;
    mapping_suggestions: MappingSuggestion[] | null;
  }>(
    `SELECT id, config_id, status, trigger, started_at, finished_at, pages, read_count,
            written_count, skipped_count, rejected_count, checkpoint, error, warnings,
            source_schema, mapping_suggestions
       FROM connector_sync_runs WHERE org_id = $1 AND config_id = $2
      ORDER BY started_at DESC LIMIT $3`,
    [orgId, configId, limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    configId: row.config_id,
    status: row.status,
    trigger: row.trigger === "scheduled" ? "scheduled" : "manual",
    startedAt: iso(row.started_at),
    finishedAt: row.finished_at ? iso(row.finished_at) : null,
    pages: Number(row.pages),
    readCount: Number(row.read_count),
    writtenCount: Number(row.written_count),
    skippedCount: Number(row.skipped_count),
    rejectedCount: Number(row.rejected_count),
    checkpoint: row.checkpoint,
    error: row.error,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    sourceSchema: Array.isArray(row.source_schema) ? row.source_schema : [],
    mappingSuggestions: Array.isArray(row.mapping_suggestions) ? row.mapping_suggestions : [],
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
