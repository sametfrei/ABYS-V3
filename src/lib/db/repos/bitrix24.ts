import { getDb, migrate } from "../client";
import { recordAuditEvent } from "./audit";
import type { SyncRunResult } from "@/lib/integrations/bitrix24/sync";

/**
 * Bitrix24 senkron geçmişi — ayrı bir tablo AÇILMAZ, mevcut audit_events
 * zincirine "bitrix24_sync" tipiyle yazılır ve en son kayıt okunarak
 * /api/integrations/bitrix24/status beslenir. İkinci paralel bir depolama
 * ailesi kurmamak için tercih edildi (bkz. kuyruk maddesi kısıtı).
 */
export const BITRIX24_SYNC_AUDIT_TYPE = "bitrix24_sync";
export const BITRIX24_CONNECTOR_ID = "bitrix24";

/**
 * Bitrix24 mapped kayıtlarını mevcut kanonik konnektör deposuna bağlayan,
 * sır taşımayan deterministik konfigürasyonu garanti eder.
 */
export async function ensureBitrixConnectorConfig(orgId: string, actor: string): Promise<string> {
  await migrate();
  const configId = `bitrix24:${orgId}`;
  await getDb().transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      "SELECT id FROM connector_configs WHERE id = $1 AND org_id = $2",
      [configId, orgId]
    );
    if (existing.rows[0]) return;

    const config = { kind: "bitrix24", source: "native", readOnly: true, version: 1 };
    await tx.query(
      `INSERT INTO connector_configs
         (id, org_id, connector_id, name, config, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [configId, orgId, BITRIX24_CONNECTOR_ID, "Bitrix24", JSON.stringify(config), actor]
    );
    await tx.query(
      `INSERT INTO connector_config_versions
         (id, org_id, config_id, version, config, change_summary, created_by)
       VALUES ($1, $2, $3, 1, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        `${configId}:v1`,
        orgId,
        configId,
        JSON.stringify(config),
        "Bitrix24 native connector bootstrap",
        actor,
      ]
    );
  });
  return configId;
}

export interface StoredBitrixSyncRun {
  runId: string;
  mode: "demo" | "live";
  status: "ok" | "error" | "credentials_missing";
  importedCounts: Partial<Record<string, number>>;
  errors: { entity: string; message: string }[];
  cursor: Partial<Record<string, string | null>>;
  finishedAt: string;
  persistedCount?: number;
}

export async function recordBitrixSyncRun(
  orgId: string,
  actor: string,
  result: SyncRunResult,
  persistedCount?: number
): Promise<void> {
  const totalImported = Object.values(result.importedCounts).reduce((sum: number, n) => sum + (n ?? 0), 0);
  const stored: StoredBitrixSyncRun = {
    runId: result.runId,
    mode: result.mode,
    status: result.status,
    importedCounts: result.importedCounts,
    errors: result.errors,
    cursor: result.cursor,
    finishedAt: result.finishedAt,
    persistedCount,
  };
  await recordAuditEvent({
    orgId,
    actor,
    type: BITRIX24_SYNC_AUDIT_TYPE,
    summary: `Bitrix24 ${result.mode} senkronu ${result.status} (${totalImported} kayıt içe alındı)`,
    detail: JSON.stringify(stored),
  });
}

/** Org'un en son Bitrix24 senkron kaydını döner (yoksa null). */
export async function getLastBitrixSyncRun(orgId: string): Promise<StoredBitrixSyncRun | null> {
  await migrate();
  const r = await getDb().query<{ detail: string | null }>(
    `SELECT detail FROM audit_events WHERE org_id = $1 AND type = $2
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [orgId, BITRIX24_SYNC_AUDIT_TYPE]
  );
  const raw = r.rows[0]?.detail;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredBitrixSyncRun;
  } catch {
    return null;
  }
}
