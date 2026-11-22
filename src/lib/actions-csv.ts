/**
 * Aksiyon listesi CSV üreticisi — saf ve deterministik.
 * Amaç: yürütmedeki aksiyonları sahiplik/tarih/olay kanıtıyla Excel/BI
 * araçlarına aktarmak. Alan sırası sabittir; RFC 4180 kaçışı paylaşılan
 * `csvCell` ile uygulanır. Sır/not içeriği olduğu gibi yazılır.
 */

import type { ActionRow } from "@/lib/db/repos/actions";
import { csvCell } from "@/lib/ledger-csv";

export const ACTIONS_CSV_HEADER = [
  "action_id",
  "decision_id",
  "case_id",
  "title",
  "owner",
  "due_at",
  "status",
  "progress_note",
  "decision_state",
  "event_count",
  "last_event_at",
  "last_event_by",
  "created_at",
  "updated_at",
  "expected_impact_value",
  "expected_impact_currency",
  "expected_impact_basis",
  "outcome_result",
  "outcome_note",
  "outcome_lesson",
  "outcome_recorded_by",
  "outcome_recorded_at",
  "actual_impact_value",
  "actual_impact_currency",
  "measurement_start",
  "measurement_end",
  "actual_impact_evidence",
] as const;

export function actionToRow(action: ActionRow): string[] {
  return [
    action.id,
    action.decision_id,
    action.case_id,
    action.title,
    action.owner,
    action.due_at ?? "",
    action.status,
    action.progress_note ?? "",
    action.decision_state,
    String(action.event_count),
    action.last_event_at ?? "",
    action.last_event_by ?? "",
    action.created_at,
    action.updated_at,
    action.expected_impact ? String(action.expected_impact.value) : "",
    action.expected_impact?.currency ?? "",
    action.expected_impact?.basis ?? "",
    action.latest_outcome?.result ?? "",
    action.latest_outcome?.note ?? "",
    action.latest_outcome?.lesson ?? "",
    action.latest_outcome?.recorded_by ?? "",
    action.latest_outcome?.recorded_at ?? "",
    action.latest_outcome?.actual_impact
      ? String(action.latest_outcome.actual_impact.value)
      : "",
    action.latest_outcome?.actual_impact?.currency ?? "",
    action.latest_outcome?.actual_impact?.measurement_start ?? "",
    action.latest_outcome?.actual_impact?.measurement_end ?? "",
    action.latest_outcome?.actual_impact?.evidence ?? "",
  ];
}

export function toActionsCsv(actions: ActionRow[]): string {
  const rows = [ACTIONS_CSV_HEADER.join(",")];
  for (const action of actions) rows.push(actionToRow(action).map(csvCell).join(","));
  return `${rows.join("\r\n")}\r\n`;
}
