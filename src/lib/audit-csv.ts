/**
 * Denetim günlüğü CSV üreticisi — saf, deterministik.
 * Denetçinin zinciri bağımsız bir araçta (Excel, script) doğrulayabilmesi
 * için hash alanları da dışa aktarılır.
 */

import { csvCell } from "@/lib/ledger-csv";

export const AUDIT_CSV_HEADER = [
  "id",
  "created_at",
  "actor",
  "type",
  "summary",
  "detail",
  "prev_hash",
  "entry_hash",
] as const;

export interface AuditCsvRow {
  id: string;
  created_at: string | Date;
  actor: string;
  type: string;
  summary: string;
  detail: string | null;
  prev_hash: string | null;
  entry_hash: string | null;
}

export function auditRowToCells(row: AuditCsvRow): string[] {
  return [
    row.id,
    row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    row.actor,
    row.type,
    row.summary,
    row.detail ?? "",
    row.prev_hash ?? "",
    row.entry_hash ?? "",
  ];
}

export function toAuditCsv(rows: AuditCsvRow[]): string {
  const lines = [AUDIT_CSV_HEADER.map(csvCell).join(",")];
  for (const row of rows) lines.push(auditRowToCells(row).map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
