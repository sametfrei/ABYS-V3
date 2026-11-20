import {
  claimScheduledSyncRun,
  listDueConnectorConfigs,
  type ConnectorSyncTrigger,
} from "@/lib/db/repos/connectors";
import { executeConnectorSync } from "@/lib/connectors/sync-execution";

export type ScheduledSyncOutcomeStatus = "success" | "failed" | "busy" | "not_due";

export interface ScheduledSyncOutcome {
  orgId: string;
  configId: string;
  name: string;
  status: ScheduledSyncOutcomeStatus;
  trigger: ConnectorSyncTrigger;
  runId: string | null;
  nextRunAt: string | null;
  writtenCount: number;
  error: string | null;
}

export interface SchedulerRunSummary {
  startedAt: string;
  finishedAt: string;
  scope: "organization" | "all";
  dueCount: number;
  succeeded: number;
  failed: number;
  skipped: number;
  outcomes: ScheduledSyncOutcome[];
}

/**
 * Zamanı gelen konnektörleri sırayla çalıştırır. Yalnızca bu işlev due
 * kayıtları sahiplenir; kullanıcı isteğiyle başlatılan manuel çalıştırmalar
 * schedule alanlarını değiştirmez. Bir konnektördeki hata diğerlerinin
 * işlenmesini durdurmaz.
 */
export async function runDueConnectorSyncs(params: {
  orgId?: string;
  now?: Date;
  limit?: number;
  actor?: string;
} = {}): Promise<SchedulerRunSummary> {
  const started = params.now ?? new Date();
  const due = await listDueConnectorConfigs({
    now: started,
    limit: params.limit ?? 5,
    orgId: params.orgId,
  });
  const outcomes: ScheduledSyncOutcome[] = [];

  for (const configRow of due) {
    const base = {
      orgId: configRow.orgId,
      configId: configRow.id,
      name: configRow.name,
      trigger: "scheduled" as const,
    };
    let claim;
    try {
      claim = await claimScheduledSyncRun({
        orgId: configRow.orgId,
        configId: configRow.id,
        now: started,
      });
    } catch (err) {
      outcomes.push({
        ...base,
        status: "failed",
        runId: null,
        nextRunAt: configRow.nextRunAt,
        writtenCount: 0,
        error: err instanceof Error ? err.message : "Zamanlanmış senkron sahiplenilemedi.",
      });
      continue;
    }

    if (!claim.runId) {
      outcomes.push({
        ...base,
        status: claim.skippedReason === "busy" ? "busy" : "not_due",
        runId: null,
        nextRunAt: claim.nextRunAt,
        writtenCount: 0,
        error:
          claim.skippedReason === "busy"
            ? "Konnektörde aktif bir çalıştırma var; bu pencere atlandı."
            : null,
      });
      continue;
    }

    try {
      const result = await executeConnectorSync({
        configRow,
        runId: claim.runId,
        actor: params.actor ?? "system:scheduler",
        trigger: "scheduled",
      });
      outcomes.push({
        ...base,
        status: "success",
        runId: claim.runId,
        nextRunAt: claim.nextRunAt,
        writtenCount: result.writtenCount,
        error: null,
      });
    } catch (err) {
      outcomes.push({
        ...base,
        status: "failed",
        runId: claim.runId,
        nextRunAt: claim.nextRunAt,
        writtenCount: 0,
        error: err instanceof Error ? err.message : "Zamanlanmış senkron başarısız oldu.",
      });
    }
  }

  const finished = new Date();
  return {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    scope: params.orgId ? "organization" : "all",
    dueCount: due.length,
    succeeded: outcomes.filter((outcome) => outcome.status === "success").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    skipped: outcomes.filter(
      (outcome) => outcome.status === "busy" || outcome.status === "not_due"
    ).length,
    outcomes,
  };
}
