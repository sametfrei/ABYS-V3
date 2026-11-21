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
] as const;

/** RFC 4180: alan tırnak, virgül veya satır sonu içeriyorsa çift tırnakla sarılır. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
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
