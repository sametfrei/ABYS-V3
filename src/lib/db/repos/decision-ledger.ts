import { getDb, migrate } from "../client";

/**
 * Decision Value Ledger — alınan kararlar ve kaydedilmiş sonuçları.
 * ABYS'nin kurumsal öğrenme mekanizmasının veri tabanı: hangi karar ne
 * sonuç verdi, hangi ders çıkarıldı. Tüm sorgular org_id kapsamlıdır.
 */

export interface LedgerEntry {
  decisionId: string;
  caseId: string;
  title: string;
  severity: string;
  confidence: number;
  businessImpact: string | null;
  choice: string;
  decidedBy: string;
  decidedAt: string;
  outcome: {
    result: "improved" | "unchanged" | "worsened";
    note: string;
    lesson: string | null;
    recordedBy: string;
    recordedAt: string;
  } | null;
}

export interface LedgerSummary {
  totalDecisions: number;
  withOutcome: number;
  improved: number;
  unchanged: number;
  worsened: number;
}

interface EntryDbRow {
  decision_id: string;
  case_id: string;
  title: string;
  severity: string;
  confidence: number;
  business_impact: string | null;
  choice: string;
  decided_by: string;
  decided_at: string | Date;
  result: string | null;
  note: string | null;
  lesson: string | null;
  recorded_by: string | null;
  recorded_at: string | Date | null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function getLedgerEntries(
  orgId: string,
  limit = 50
): Promise<LedgerEntry[]> {
  await migrate();
  const r = await getDb().query<EntryDbRow>(
    `SELECT r.id AS decision_id, r.case_id, c.title, c.severity, c.confidence,
            (c.payload->>'businessImpact') AS business_impact,
            r.choice, r.decided_by, r.created_at AS decided_at,
            o.result, o.note, o.lesson, o.recorded_by, o.created_at AS recorded_at
       FROM decision_records r
       JOIN decision_cases c ON c.id = r.case_id AND c.org_id = r.org_id
       LEFT JOIN outcomes o ON o.decision_id = r.id AND o.org_id = r.org_id
      WHERE r.org_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2`,
    [orgId, limit]
  );

  return r.rows.map((row) => ({
    decisionId: row.decision_id,
    caseId: row.case_id,
    title: row.title,
    severity: row.severity,
    confidence: Number(row.confidence),
    businessImpact: row.business_impact,
    choice: row.choice,
    decidedBy: row.decided_by,
    decidedAt: iso(row.decided_at),
    outcome:
      row.result === null
        ? null
        : {
            result:
              row.result === "improved" || row.result === "worsened"
                ? row.result
                : "unchanged",
            note: row.note ?? "",
            lesson: row.lesson,
            recordedBy: row.recorded_by ?? "",
            recordedAt: row.recorded_at ? iso(row.recorded_at) : "",
          },
  }));
}

export async function getLedgerSummary(orgId: string): Promise<LedgerSummary> {
  await migrate();
  const r = await getDb().query<{
    total: number;
    with_outcome: number;
    improved: number;
    unchanged: number;
    worsened: number;
  }>(
    `SELECT count(*)::int AS total,
            count(o.id)::int AS with_outcome,
            count(*) FILTER (WHERE o.result = 'improved')::int AS improved,
            count(*) FILTER (WHERE o.result = 'unchanged')::int AS unchanged,
            count(*) FILTER (WHERE o.result = 'worsened')::int AS worsened
       FROM decision_records r
       LEFT JOIN outcomes o ON o.decision_id = r.id AND o.org_id = r.org_id
      WHERE r.org_id = $1`,
    [orgId]
  );
  const row = r.rows[0];
  return {
    totalDecisions: Number(row?.total ?? 0),
    withOutcome: Number(row?.with_outcome ?? 0),
    improved: Number(row?.improved ?? 0),
    unchanged: Number(row?.unchanged ?? 0),
    worsened: Number(row?.worsened ?? 0),
  };
}
