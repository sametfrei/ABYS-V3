/**
 * Veri kalitesi karantinası CSV üreticisi — saf ve deterministik.
 * Amaç: karantina kayıtlarını denetlenebilir biçimde Excel/BI araçlarına
 * aktarmak. Alan sırası sabittir; RFC 4180 kaçışı paylaşılan `csvCell` ile
 * uygulanır. Payload dışa aktarılmaz: içinde müşteri verisi olabilir.
 */

import type { QualityIssue } from "@/lib/db/repos/data-quality";
import { csvCell } from "@/lib/ledger-csv";

export const DATA_QUALITY_CSV_HEADER = [
  "issue_id",
  "source",
  "entity",
  "source_ref",
  "code",
  "status",
  "reason",
  "created_at",
  "resolved_at",
  "resolved_by",
] as const;

export function issueToRow(issue: QualityIssue): string[] {
  return [
    issue.id,
    issue.source,
    issue.entity,
    issue.sourceRef ?? "",
    issue.code ?? "",
    issue.status,
    issue.reason,
    issue.createdAt,
    issue.resolvedAt ?? "",
    issue.resolvedBy ?? "",
  ];
}

export function toDataQualityCsv(issues: QualityIssue[]): string {
  const rows = [DATA_QUALITY_CSV_HEADER.join(",")];
  for (const issue of issues) rows.push(issueToRow(issue).map(csvCell).join(","));
  return `${rows.join("\r\n")}\r\n`;
}
