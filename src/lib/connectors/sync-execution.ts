import { lookup } from "dns/promises";
import { fetchPinned, fetchPinnedTokenRequest } from "@/lib/net/pinned-fetch";
import { SsrfError } from "@/lib/net/ssrf";
import {
  partitionCanonicalRecords,
  suggestCanonicalMappings,
  type MappingSuggestion,
} from "@/lib/connectors/contracts";
import { getAdapter } from "@/lib/connectors/registry";
import type { ObservedSourceField, SyncContext } from "@/lib/connectors/types";
import {
  finishSyncRun,
  getLastCheckpoint,
  type ConnectorConfigRow,
  type ConnectorSyncTrigger,
} from "@/lib/db/repos/connectors";
import { commitConnectorSync } from "@/lib/db/repos/connector-sync";
import { recordAuditEvent } from "@/lib/db/repos/audit";

export interface ConnectorSyncExecutionResult {
  runId: string;
  status: "success";
  trigger: ConnectorSyncTrigger;
  pages: number;
  readCount: number;
  writtenCount: number;
  fetchedCount: number;
  canonicalizedCount: number;
  kpiObservationCount: number;
  computedKpiObservationCount: number;
  processEventCount: number;
  rejectedCount: number;
  quarantinedCount: number;
  promotionSkippedCount: number;
  skippedCount: number;
  checkpoint: string | null;
  warnings: string[];
  sourceSchema: ObservedSourceField[];
  mappingSuggestions: MappingSuggestion[];
}

export class ConnectorSyncExecutionError extends Error {
  readonly code = "CONNECTOR_SYNC_FAILED";

  constructor(
    message: string,
    public readonly runId: string,
    public readonly cause: unknown
  ) {
    super(message);
    this.name = "ConnectorSyncExecutionError";
  }
}

function syncErrorMessage(err: unknown): string {
  if (err instanceof SsrfError) return err.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Senkron başarısız oldu.";
}

/**
 * Başlatılmış bir senkron çalıştırmasını yürütür ve sonucu tek transaction'da
 * kalıcılaştırır. Manuel ve zamanlanmış yollar aynı kod hattını kullanır; bu
 * yüzden kanonik yazım, KPI/olay promosyonu, checkpoint ve audit kuralları
 * aralarında farklılaşamaz.
 */
export async function executeConnectorSync(params: {
  configRow: ConnectorConfigRow;
  runId: string;
  actor: string;
  trigger: ConnectorSyncTrigger;
}): Promise<ConnectorSyncExecutionResult> {
  const { configRow, runId, actor, trigger } = params;
  const checkpoint = await getLastCheckpoint(configRow.orgId, configRow.id);

  try {
    const adapter = getAdapter(configRow.connectorId);
    if (!adapter) throw new Error("Adaptör bulunamadı.");

    const resolveHost = async (hostname: string) =>
      (await lookup(hostname, { all: true })).map((result) => result.address);
    const ctx: SyncContext = {
      orgId: configRow.orgId,
      configId: configRow.id,
      checkpoint,
      fetchImpl: (input, init) =>
        fetchPinned(input instanceof Request ? input.url : input, init),
      fetchTokenImpl: (input, init) =>
        fetchPinnedTokenRequest(input instanceof Request ? input.url : input, init, resolveHost),
      resolveHost,
      resolveSecret: (envVarName: string) => process.env[envVarName],
      now: () => new Date(),
      sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    };

    const outcome = await adapter.sync(configRow.config, ctx);
    const partition = partitionCanonicalRecords(outcome.records);
    const rejected = [
      ...outcome.rejected,
      ...partition.rejected.map((item) => ({
        entity: item.record.entity,
        sourceRef: item.record.externalId,
        code: item.violations[0]?.code ?? "CONTRACT_VALIDATION_FAILED",
        reason: item.violations.map((violation) => violation.message).join("; "),
      })),
    ];
    const mappingSuggestions = suggestCanonicalMappings(
      configRow.config.entity,
      outcome.sourceSchema
    );
    const committed = await commitConnectorSync({
      orgId: configRow.orgId,
      configId: configRow.id,
      configName: configRow.name,
      config: configRow.config,
      records: partition.accepted,
      rejected,
      runId,
      pages: outcome.pages,
      readCount: outcome.readCount,
      skippedCount: outcome.skipped,
      checkpoint: outcome.checkpoint,
      warnings: outcome.warnings,
      sourceSchema: outcome.sourceSchema,
      mappingSuggestions,
    });

    const warnings = [...committed.warnings];
    try {
      await recordAuditEvent({
        orgId: configRow.orgId,
        actor,
        type: "connector_sync_completed",
        summary:
          `${trigger === "scheduled" ? "Zamanlanmış konnektör senkronu" : "Konnektör senkronu"}: ` +
          `${configRow.name} (${committed.written} kanonik kayıt, ` +
          `${committed.promotion.kpiObservationCount} KPI, ` +
          `${committed.promotion.computedKpiObservationCount} hesaplanan KPI, ` +
          `${committed.promotion.processEventCount} olay)`,
        detail: runId,
      });
    } catch (auditErr) {
      warnings.push(
        `Senkron tamamlandı ancak denetim kaydı yazılamadı: ${
          auditErr instanceof Error ? auditErr.message : "bilinmeyen hata"
        }`
      );
    }

    return {
      runId,
      status: "success",
      trigger,
      pages: outcome.pages,
      readCount: outcome.readCount,
      writtenCount: committed.written,
      fetchedCount: outcome.readCount,
      canonicalizedCount: committed.written,
      kpiObservationCount: committed.promotion.kpiObservationCount,
      computedKpiObservationCount: committed.promotion.computedKpiObservationCount,
      processEventCount: committed.promotion.processEventCount,
      rejectedCount: rejected.length,
      quarantinedCount: rejected.length,
      promotionSkippedCount:
        committed.promotion.skippedKpiCount +
        committed.promotion.skippedComputedKpiCount +
        committed.promotion.skippedEventCount,
      skippedCount: outcome.skipped,
      checkpoint: outcome.checkpoint,
      warnings: warnings.slice(0, 50),
      sourceSchema: outcome.sourceSchema,
      mappingSuggestions,
    };
  } catch (err) {
    const message = syncErrorMessage(err);
    try {
      await finishSyncRun({
        orgId: configRow.orgId,
        runId,
        status: "failed",
        pages: 0,
        readCount: 0,
        writtenCount: 0,
        skippedCount: 0,
        checkpoint,
        error: message,
        warnings: [],
      });
    } catch {
      // Run kaydı kapatılamazsa iki saatlik stale-kilit kurtarması devreye girer.
    }
    try {
      await recordAuditEvent({
        orgId: configRow.orgId,
        actor,
        type: "connector_sync_failed",
        summary: `Konnektör senkronu başarısız: ${configRow.name}`,
        detail: runId,
      });
    } catch {
      // Asıl hata çağırana döner; denetim yazımı sonucu değiştirmez.
    }
    throw new ConnectorSyncExecutionError(message, runId, err);
  }
}
