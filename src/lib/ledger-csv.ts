/**
 * Karar defteri CSV üreticisi — saf ve deterministik.
 * Amaç: kurumsal kararları denetlenebilir biçimde Excel/BI araçlarına
 * aktarmak. Alan sırası sabittir; RFC 4180 kaçışı uygulanır. Sayısal
 * değerler biçimlendirilmez, ham haliyle (nokta ondalık) yazılır ki
 * elektronik tabloda yeniden hesaplanabilsin.
 */

import type { LedgerEntry } from "@/lib/db/repos/decision-ledger";

export const LEDGER_CSV_HEADER = [
  "decision_id",
  "case_id",
  "title",
  "severity",
  "confidence",
  "business_impact",
  "choice",
  "decided_by",
  "decided_at",
  "decision_state",
  "action_id",
  "action_title",
  "action_owner",
  "action_status",
  "action_due_at",
  "expected_value",
  "expected_currency",
  "actual_value",
  "actual_currency",
  "variance_value",
  "variance_pct",
  "outcome",
  "outcome_note",
  "lesson",
  "recorded_by",
  "recorded_at",
  "kpi_label",
  "kpi_before_value",
  "kpi_before_at",
  "kpi_after_value",
  "kpi_after_at",
  "kpi_delta",
  "kpi_pct_change",
  "kpi_result",
  "kpi_before_source",
  "kpi_after_source",
  "kpi_verified",
  "kpi_unit",
  "kpi_definition_source",
  "kpi_definition_ref",
  "kpi_formula_hash",
  "kpi_definition_id",
  "kpi_formula_text",
  "kpi_version_known",
  "kpi_definition_captured_at",
  "decided_by_id",
  "decided_role",
  "approval_permission",
  "approval_source",
  "approved_at",
  "approval_audit_id",
] as const;

const NUMERIC_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * RFC 4180 kaçışı + formül enjeksiyonu koruması.
 *
 * Excel/Sheets, `=`, `+`, `-`, `@`, sekme veya CR ile başlayan hücreleri
 * formül olarak çalıştırabilir. Kullanıcı kontrollü başlık, not ve kanıt
 * alanları dışa aktarıldığı için bu tür metinlerin başına kesme işareti
 * eklenir; böylece hücre düz metin olarak açılır. Saf sayısal metinler
 * (ör. negatif varyans `-20000`) değiştirilmez ki BI tarafında sayı kalsın.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const lead = text.trimStart();
  const safe =
    FORMULA_LEAD.test(lead) && !NUMERIC_TEXT.test(lead) ? `'${text}` : text;
  if (/[",\r\n\t]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(value);
}

export function ledgerEntryToRow(entry: LedgerEntry): string[] {
  return [
    entry.decisionId,
    entry.caseId,
    entry.title,
    entry.severity,
    num(entry.confidence),
    entry.businessImpact ?? "",
    entry.choice,
    entry.decidedBy,
    entry.decidedAt,
    entry.decisionState,
    entry.execution?.actionId ?? "",
    entry.execution?.title ?? "",
    entry.execution?.owner ?? "",
    entry.execution?.status ?? "",
    entry.execution?.dueAt ?? "",
    num(entry.expectedImpact?.value),
    entry.expectedImpact?.currency ?? "",
    num(entry.actualImpact?.value),
    entry.actualImpact?.currency ?? "",
    num(entry.economicVariance?.amount),
    num(entry.economicVariance?.percent),
    entry.outcome?.result ?? "",
    entry.outcome?.note ?? "",
    entry.outcome?.lesson ?? "",
    entry.outcome?.recordedBy ?? "",
    entry.outcome?.recordedAt ?? "",
    entry.measurement?.kpiLabel ?? "",
    num(entry.measurement?.before.value),
    entry.measurement?.before.at ?? "",
    num(entry.measurement?.after.value),
    entry.measurement?.after.at ?? "",
    num(entry.measurement?.delta),
    num(entry.measurement?.pctChange),
    entry.measurement?.result ?? "",
    entry.measurement?.before.sourceLabel ?? "",
    entry.measurement?.after.sourceLabel ?? "",
    entry.measurement ? "true" : "",
    entry.measurement?.definition?.unit ?? "",
    entry.measurement?.definition?.source ?? "",
    entry.measurement?.definition?.sourceRef ?? "",
    entry.measurement?.definition?.formulaHash ?? "",
    entry.measurement?.definition?.id ?? "",
    entry.measurement?.definition?.formulaText ?? "",
    entry.measurement?.definition ? String(entry.measurement.definition.versionKnown) : "",
    entry.measurement?.definition?.capturedAt ?? "",
    entry.approval?.decidedById ?? "",
    entry.approval?.decidedRole ?? "",
    entry.approval?.permission ?? "",
    entry.approval?.source ?? "",
    entry.approval?.approvedAt ?? "",
    entry.approval?.auditId ?? "",
  ];
}

/** Başlık + satırlar; satır sonu CRLF (RFC 4180). Girdi sırası korunur. */
export function toLedgerCsv(entries: LedgerEntry[]): string {
  const lines = [LEDGER_CSV_HEADER.map(csvCell).join(",")];
  for (const entry of entries) {
    lines.push(ledgerEntryToRow(entry).map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
