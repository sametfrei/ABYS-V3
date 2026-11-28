import { generateKpiAnomalySignals } from "@/lib/db/repos/kpi-signals";
import { generateDecisionCasesFromKpiSignals } from "@/lib/db/repos/kpi-signal-cases";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/** Tenant-scoped shared KPI signal and decision-draft orchestration. */
export async function runKpiIntelligencePipeline(orgId: string, actor: string) {
  const signals = await generateKpiAnomalySignals(orgId);
  if (signals.generated > 0) {
    await recordAuditEvent({
      orgId,
      actor,
      type: "kpi_anomaly_signals_generated",
      summary: `${signals.generated} KPI aykırılık sinyali üretildi (${signals.scannedLabels} seri tarandı).`,
      detail: JSON.stringify({
        generated: signals.generated,
        existing: signals.existing,
        scannedLabels: signals.scannedLabels,
        signalIds: signals.signals.map((signal) => signal.id),
      }),
    });
  }
  const decisionCases = await generateDecisionCasesFromKpiSignals(orgId);
  return { signals, decisionCases };
}
