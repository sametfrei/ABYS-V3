/**
 * Tahmin anlık görüntülerinin CSV dışa aktarımı — saf, deterministik.
 * Analistin kalibrasyonu Excel/BI tarafında bağımsız doğrulayabilmesi için
 * her satır tek bir anlık görüntü ve varsa gerçekleşen değerlendirmesidir.
 */

import type { ForecastSnapshotRecord } from "@/lib/db/repos/forecast-snapshots";
import { csvCell } from "@/lib/ledger-csv";

export const SNAPSHOT_CSV_HEADER = [
  "snapshot_id",
  "label",
  "model",
  "horizon",
  "series_points",
  "p10",
  "p50",
  "p90",
  "last_observed_at",
  "created_by",
  "created_at",
  "evaluation_status",
  "actual",
  "inside_range",
  "abs_error",
  "range_width",
] as const;

function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return value;
}

export function snapshotToRow(record: ForecastSnapshotRecord): string[] {
  const evaluation = record.evaluation;
  const evaluated = evaluation.status === "evaluated";
  return [
    record.id,
    record.label,
    record.model,
    text(record.horizon),
    text(record.seriesPoints),
    text(record.p10),
    text(record.p50),
    text(record.p90),
    record.lastObservedAt,
    record.createdBy,
    record.createdAt,
    evaluation.status,
    evaluated ? text(evaluation.actual) : "",
    evaluated ? (evaluation.insideRange ? "true" : "false") : "",
    evaluated ? text(evaluation.absError) : "",
    evaluated ? text(evaluation.rangeWidth) : "",
  ];
}

export function toSnapshotCsv(records: ForecastSnapshotRecord[]): string {
  const lines = [SNAPSHOT_CSV_HEADER.map(csvCell).join(",")];
  for (const record of records) {
    lines.push(snapshotToRow(record).map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
