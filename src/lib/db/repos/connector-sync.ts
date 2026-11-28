import { getDb, migrate } from "../client";
import type {
  CanonicalRecord,
  ConnectorRecordRejection,
  ObservedSourceField,
  ConnectorConfig,
} from "@/lib/connectors/types";
import { CANONICAL_CONTRACT_VERSION, type MappingSuggestion } from "@/lib/connectors/contracts";
import { quarantineIssue } from "./data-quality";
import { promoteConnectorRecords, type ConnectorPromotionResult } from "./connector-promotion";
import { finishSyncRun, upsertCanonicalRecords } from "./connectors";

/**
 * Bir connector çalıştırmasının kalıcı sonucunu tek transaction'da yazar.
 *
 * Sıra önemlidir: run satırı hâlâ `running` olduğu doğrulanır, karantina ve
 * kanonik kayıtlar yazılır, aynı transaction içinde KPI/olay promosyonu
 * yapılır ve run başarıyla kapatılır. Herhangi bir adım başarısız olursa
 * kanonik yazım, karantina ve promosyon birlikte geri alınır.
 */
export interface ConnectorSyncCommitInput {
  orgId: string;
  configId: string;
  configName: string;
  config: ConnectorConfig;
  runId: string;
  records: CanonicalRecord[];
  rejected: ConnectorRecordRejection[];
  pages: number;
  readCount: number;
  skippedCount: number;
  checkpoint: string | null;
  warnings: string[];
  sourceSchema: ObservedSourceField[];
  mappingSuggestions: MappingSuggestion[];
}

export interface ConnectorSyncCommitResult {
  written: number;
  promotion: ConnectorPromotionResult;
  warnings: string[];
}

export async function commitConnectorSync(
  input: ConnectorSyncCommitInput
): Promise<ConnectorSyncCommitResult> {
  await migrate();
  const db = getDb();
  return db.transaction(async (tx) => {
    const run = await tx.query<{ config_id: string; status: string }>(
      `SELECT config_id, status FROM connector_sync_runs
        WHERE id = $1 AND org_id = $2
        FOR UPDATE`,
      [input.runId, input.orgId]
    );
    const current = run.rows[0];
    if (!current || current.config_id !== input.configId) {
      throw new Error("Senkron çalıştırması bu konnektöre ait değil.");
    }
    if (current.status !== "running") {
      throw new Error(`Senkron çalıştırması '${current.status}' durumunda; sonuç yazılamaz.`);
    }

    for (const item of input.rejected) {
      await quarantineIssue({
        orgId: input.orgId,
        source: `connector:${input.configId}`,
        entity: item.entity,
        sourceRef: item.sourceRef,
        code: item.code,
        connectorRunId: input.runId,
        reason: item.reason.slice(0, 500),
        payload: { contractVersion: CANONICAL_CONTRACT_VERSION, code: item.code },
        tx,
      });
    }

    const written = await upsertCanonicalRecords(
      input.orgId,
      input.configId,
      input.records,
      tx,
      { runId: input.runId }
    );
    const promotion = await promoteConnectorRecords({
      orgId: input.orgId,
      configId: input.configId,
      configName: input.configName,
      config: input.config,
      records: input.records,
      runId: input.runId,
      tx,
    });
    const warnings = [...input.warnings, ...promotion.warnings];
    if (input.rejected.length > 0) {
      warnings.push(`${input.rejected.length} kayıt kanonik sözleşme nedeniyle karantinaya alındı.`);
    }

    await finishSyncRun({
      orgId: input.orgId,
      runId: input.runId,
      status: "success",
      pages: input.pages,
      readCount: input.readCount,
      writtenCount: written,
      skippedCount: input.skippedCount,
      rejectedCount: input.rejected.length,
      checkpoint: input.checkpoint,
      warnings: warnings.slice(0, 50),
      sourceSchema: input.sourceSchema,
      mappingSuggestions: input.mappingSuggestions,
      tx,
    });

    return { written, promotion, warnings };
  });
}
