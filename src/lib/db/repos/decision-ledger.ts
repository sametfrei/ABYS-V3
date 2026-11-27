import { getDb, migrate } from "../client";
import {
  computeEconomicVariance,
  summarizeDecisionEconomics,
  summarizeDecisionLearning,
  type DecisionEconomicsSummary,
  type DecisionLearningSummary,
  type EconomicVariance,
  type ExpectedEconomicImpact,
  type RealizedEconomicImpact,
} from "@/lib/decision-economics";
import { buildDecisionCalibration, type DecisionCalibration } from "@/lib/decision-calibration";

/**
 * Decision Value Ledger — alınan kararlar, kaydedilmiş sonuçları ve
 * sayısallaştırılmış ekonomik etkisi. Tüm sorgular org_id kapsamlıdır.
 */

export interface LedgerMeasurement {
  kpiLabel: string;
  direction: "lower_is_better" | "higher_is_better";
  before: { value: number; at: string; datasetId: string; sourceLabel: string };
  after: { value: number; at: string; datasetId: string; sourceLabel: string };
  delta: number;
  pctChange: number | null;
  result: "improved" | "unchanged" | "worsened";
  actionStartedAt: string;
  actionDoneAt: string;
  measurementAt: string;
  method: string;
  definition: {
    id: string;
    name: string;
    unit: string | null;
    source: string;
    sourceRef: string | null;
    formulaHash: string | null;
    versionKnown: boolean;
    formulaText: string | null;
    capturedAt: string;
  } | null;
  verified: true;
}

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
  decisionState: string;
  execution: {
    actionId: string;
    title: string;
    owner: string;
    status: string;
    dueAt: string | null;
    progressNote: string | null;
    updatedAt: string;
    eventCount: number;
  } | null;
  expectedImpact: ExpectedEconomicImpact | null;
  actualImpact: RealizedEconomicImpact | null;
  economicVariance: EconomicVariance | null;
  /** İnsan onayı provenance'ı; eski/sistem kayıtlarında null. */
  approval: {
    decidedById: string;
    decidedRole: string | null;
    permission: string | null;
    source: "human" | "system" | "unknown";
    approvedAt: string | null;
    auditId: string | null;
  } | null;
  /** KPI gözlemine dayanan doğrulanmış ölçüm; yoksa null. */
  measurement: LedgerMeasurement | null;
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
  withVerifiedMeasurement: number;
  improved: number;
  unchanged: number;
  worsened: number;
  economics: DecisionEconomicsSummary;
  learning: DecisionLearningSummary;
  calibration: DecisionCalibration;
  execution: {
    totalActions: number;
    open: number;
    inProgress: number;
    done: number;
    cancelled: number;
  };
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
  decision_state: string;
  decided_by_id: string | null;
  decided_role: string | null;
  approval_permission: string | null;
  approval_source: string | null;
  approved_at: string | Date | null;
  approval_audit_id: string | null;
  expected_value: string | number | null;
  expected_value_low: string | number | null;
  expected_value_high: string | number | null;
  value_currency: string | null;
  value_basis: string | null;
  value_assumptions: unknown;
  result: string | null;
  note: string | null;
  lesson: string | null;
  recorded_by: string | null;
  recorded_at: string | Date | null;
  actual_value: string | number | null;
  actual_currency: string | null;
  measurement_start: string | Date | null;
  measurement_end: string | Date | null;
  evidence: string | null;
  action_id: string | null;
  action_title: string | null;
  action_owner: string | null;
  action_status: string | null;
  action_due_at: string | Date | null;
  action_progress_note: string | null;
  action_updated_at: string | Date | null;
  action_event_count: number | string | null;
  measurement_id: string | null;
  kpi_label: string | null;
  kpi_direction: string | null;
  kpi_before_value: string | number | null;
  kpi_before_at: string | Date | null;
  kpi_before_dataset_id: string | null;
  kpi_before_source: string | null;
  kpi_after_value: string | number | null;
  kpi_after_at: string | Date | null;
  kpi_after_dataset_id: string | null;
  kpi_after_source: string | null;
  kpi_delta: string | number | null;
  kpi_pct_change: string | number | null;
  kpi_result: string | null;
  kpi_measurement_at: string | Date | null;
  kpi_method: string | null;
  kpi_action_started_at: string | null;
  kpi_action_done_at: string | null;
  kpi_definition: unknown;
}

interface EconomicsDbRow {
  expected_value: string | number | null;
  expected_value_low: string | number | null;
  expected_value_high: string | number | null;
  value_currency: string | null;
  value_basis: string | null;
  value_assumptions: unknown;
  actual_value: string | number | null;
  actual_currency: string | null;
  measurement_start: string | Date | null;
  measurement_end: string | Date | null;
  evidence: string | null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function optionalIso(value: string | Date | null): string | null {
  return value === null ? null : iso(value);
}

function numeric(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assumptions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function expectedImpact(row: EconomicsDbRow): ExpectedEconomicImpact | null {
  const value = numeric(row.expected_value);
  if (value === null || !row.value_currency) return null;
  return {
    value,
    low: numeric(row.expected_value_low),
    high: numeric(row.expected_value_high),
    currency: row.value_currency,
    basis: row.value_basis,
    assumptions: assumptions(row.value_assumptions),
  };
}

function actualImpact(row: EconomicsDbRow): RealizedEconomicImpact | null {
  const value = numeric(row.actual_value);
  if (value === null || !row.actual_currency) return null;
  return {
    value,
    currency: row.actual_currency,
    measurementStart: optionalIso(row.measurement_start),
    measurementEnd: optionalIso(row.measurement_end),
    evidence: row.evidence,
  };
}

function ledgerDefinition(value: unknown): LedgerMeasurement["definition"] {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.source !== "string" ||
    typeof record.capturedAt !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    unit: typeof record.unit === "string" ? record.unit : null,
    source: record.source,
    sourceRef: typeof record.sourceRef === "string" ? record.sourceRef : null,
    formulaHash: typeof record.formulaHash === "string" ? record.formulaHash : null,
    versionKnown: record.versionKnown === true,
    formulaText: typeof record.formulaText === "string" ? record.formulaText : null,
    capturedAt: record.capturedAt,
  };
}

function ledgerMeasurement(row: EntryDbRow): LedgerMeasurement | null {
  if (row.measurement_id === null || !row.kpi_label) return null;
  const beforeValue = numeric(row.kpi_before_value);
  const afterValue = numeric(row.kpi_after_value);
  const delta = numeric(row.kpi_delta);
  if (
    beforeValue === null ||
    afterValue === null ||
    delta === null ||
    !row.kpi_before_at ||
    !row.kpi_after_at ||
    !row.kpi_before_dataset_id ||
    !row.kpi_after_dataset_id ||
    !row.kpi_measurement_at ||
    !row.kpi_method ||
    !row.kpi_action_started_at ||
    !row.kpi_action_done_at
  ) {
    return null;
  }
  const direction =
    row.kpi_direction === "lower_is_better" || row.kpi_direction === "higher_is_better"
      ? row.kpi_direction
      : null;
  const result =
    row.kpi_result === "improved" ||
    row.kpi_result === "unchanged" ||
    row.kpi_result === "worsened"
      ? row.kpi_result
      : null;
  if (!direction || !result) return null;
  return {
    kpiLabel: row.kpi_label,
    direction,
    before: {
      value: beforeValue,
      at: iso(row.kpi_before_at),
      datasetId: row.kpi_before_dataset_id,
      sourceLabel: row.kpi_before_source ?? "",
    },
    after: {
      value: afterValue,
      at: iso(row.kpi_after_at),
      datasetId: row.kpi_after_dataset_id,
      sourceLabel: row.kpi_after_source ?? "",
    },
    delta,
    pctChange: numeric(row.kpi_pct_change),
    result,
    actionStartedAt: row.kpi_action_started_at,
    actionDoneAt: row.kpi_action_done_at,
    measurementAt: iso(row.kpi_measurement_at),
    method: row.kpi_method,
    definition: ledgerDefinition(row.kpi_definition),
    verified: true,
  };
}

export async function getLedgerEntries(
  orgId: string,
  limit = 50
): Promise<LedgerEntry[]> {
  await migrate();
  const r = await getDb().query<EntryDbRow>(
    `SELECT r.id AS decision_id, r.case_id, c.title, c.severity, c.confidence,
            (c.payload->>'businessImpact') AS business_impact,
            r.choice, r.decided_by, r.created_at AS decided_at, r.state AS decision_state,
            r.decided_by_id, r.decided_role, r.approval_permission,
            r.approval_source, r.approved_at, r.approval_audit_id,
            r.expected_value, r.expected_value_low, r.expected_value_high,
            r.value_currency, r.value_basis, r.value_assumptions,
            o.result, o.note, o.lesson, o.recorded_by, o.recorded_at,
            o.actual_value, o.actual_currency, o.measurement_start, o.measurement_end, o.evidence,
            a.id AS action_id, a.title AS action_title, a.owner AS action_owner,
            a.status AS action_status, a.due_at AS action_due_at,
            a.progress_note AS action_progress_note, a.updated_at AS action_updated_at,
            (SELECT count(*)::int FROM action_events ae
              WHERE ae.org_id = r.org_id AND ae.action_id = a.id) AS action_event_count,
            m.id AS measurement_id, m.kpi_label, m.direction AS kpi_direction,
            m.before_value AS kpi_before_value, m.before_at AS kpi_before_at,
            m.before_dataset_id AS kpi_before_dataset_id, m.before_source AS kpi_before_source,
            m.after_value AS kpi_after_value, m.after_at AS kpi_after_at,
            m.after_dataset_id AS kpi_after_dataset_id, m.after_source AS kpi_after_source,
            m.delta AS kpi_delta, m.pct_change AS kpi_pct_change, m.result AS kpi_result,
            m.measurement_at AS kpi_measurement_at, m.method AS kpi_method,
            m.provenance->>'actionStartedAt' AS kpi_action_started_at,
            m.provenance->>'actionDoneAt' AS kpi_action_done_at,
            m.definition_snapshot AS kpi_definition
       FROM decision_records r
       JOIN decision_cases c ON c.id = r.case_id AND c.org_id = r.org_id
       LEFT JOIN decision_kpi_measurements m
         ON m.org_id = r.org_id AND m.decision_id = r.id
       LEFT JOIN LATERAL (
         SELECT result, note, lesson, recorded_by, created_at AS recorded_at,
                actual_value, value_currency AS actual_currency,
                measurement_start, measurement_end, evidence
           FROM outcomes
          WHERE org_id = r.org_id AND decision_id = r.id
          ORDER BY created_at DESC
           LIMIT 1
       ) o ON true
       LEFT JOIN LATERAL (
         SELECT a.id, a.title, a.owner, a.status, a.due_at, a.progress_note, a.updated_at
           FROM actions a
          WHERE a.org_id = r.org_id AND a.decision_id = r.id
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 1
       ) a ON true
      WHERE r.org_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2`,
    [orgId, limit]
  );

  return r.rows.map((row) => {
    const expected = expectedImpact(row);
    const actual = actualImpact(row);
    return {
      decisionId: row.decision_id,
      caseId: row.case_id,
      title: row.title,
      severity: row.severity,
      confidence: Number(row.confidence),
      businessImpact: row.business_impact,
      choice: row.choice,
      decidedBy: row.decided_by,
      decidedAt: iso(row.decided_at),
      decisionState: row.decision_state,
      execution:
        row.action_id === null
          ? null
          : {
              actionId: row.action_id,
              title: row.action_title ?? "",
              owner: row.action_owner ?? "",
              status: row.action_status ?? "open",
              dueAt: row.action_due_at ? iso(row.action_due_at) : null,
              progressNote: row.action_progress_note,
              updatedAt: row.action_updated_at ? iso(row.action_updated_at) : "",
              eventCount: Number(row.action_event_count ?? 0),
            },
      expectedImpact: expected,
      actualImpact: actual,
      economicVariance: computeEconomicVariance(expected, actual),
      approval:
        row.decided_by_id === null &&
        row.approval_source === null &&
        row.approved_at === null &&
        row.approval_audit_id === null
          ? null
          : {
              decidedById: row.decided_by_id ?? "",
              decidedRole: row.decided_role,
              permission: row.approval_permission,
              source:
                row.approval_source === "system"
                  ? "system"
                  : row.approval_source === "human"
                    ? "human"
                    : "unknown",
              approvedAt: row.approved_at ? iso(row.approved_at) : null,
              auditId: row.approval_audit_id,
            },
      measurement: ledgerMeasurement(row),
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
    };
  });
}

/**
 * Yalnızca güven kalibrasyonu için hafif sorgu: karar kayıtları ve son
 * sonuç. Ekonomik etki kolonları okunmaz; kovalar güven + sonuçtan türer.
 */
export async function getConfidenceCalibration(orgId: string): Promise<DecisionCalibration> {
  await migrate();
  const r = await getDb().query<{ confidence: number; result: string | null }>(
    `SELECT c.confidence, o.result
       FROM decision_records r
       JOIN decision_cases c ON c.id = r.case_id AND c.org_id = r.org_id
       LEFT JOIN LATERAL (
         SELECT result FROM outcomes
          WHERE outcomes.org_id = r.org_id AND outcomes.decision_id = r.id
          ORDER BY created_at DESC LIMIT 1
       ) o ON true
      WHERE r.org_id = $1`,
    [orgId]
  );
  const learning = summarizeDecisionLearning(
    r.rows.map((row) => ({
      confidence: Number(row.confidence),
      choice: "",
      result:
        row.result === "improved" || row.result === "worsened" || row.result === "unchanged"
          ? row.result
          : null,
      expectedImpact: null,
      actualImpact: null,
    }))
  );
  return buildDecisionCalibration(learning.confidenceBuckets);
}

export async function getLedgerSummary(orgId: string): Promise<LedgerSummary> {
  await migrate();
  const r = await getDb().query<
    EconomicsDbRow & {
      result: string | null;
      confidence: number;
      choice: string;
      measurement_id: string | null;
    }
  >(
    `SELECT r.expected_value, r.expected_value_low, r.expected_value_high,
            r.value_currency, r.value_basis, r.value_assumptions,
            r.choice, c.confidence,
            o.result, o.actual_value, o.value_currency AS actual_currency,
            o.measurement_start, o.measurement_end, o.evidence,
            m.id AS measurement_id
       FROM decision_records r
       JOIN decision_cases c ON c.id = r.case_id AND c.org_id = r.org_id
       LEFT JOIN decision_kpi_measurements m
         ON m.org_id = r.org_id AND m.decision_id = r.id
       LEFT JOIN LATERAL (
         SELECT result, actual_value, value_currency, measurement_start,
                measurement_end, evidence
           FROM outcomes
          WHERE org_id = r.org_id AND decision_id = r.id
          ORDER BY created_at DESC
          LIMIT 1
       ) o ON true
      WHERE r.org_id = $1`,
    [orgId]
  );
  const rows = r.rows;
  const actionRows = await getDb().query<{ status: string; count: number | string }>(
    `SELECT a.status, count(*)::int AS count
       FROM actions a
       JOIN decision_records d ON d.id = a.decision_id AND d.org_id = a.org_id
      WHERE a.org_id = $1
      GROUP BY a.status`,
    [orgId]
  );
  const counts = new Map(
    actionRows.rows.map((row) => [row.status, Number(row.count)])
  );
  const learning = summarizeDecisionLearning(
    rows.map((row) => ({
      confidence: Number(row.confidence),
      choice: row.choice,
      result:
        row.result === "improved" || row.result === "worsened" || row.result === "unchanged"
          ? row.result
          : null,
      expectedImpact: expectedImpact(row),
      actualImpact: actualImpact(row),
    }))
  );
  return {
    totalDecisions: rows.length,
    withOutcome: rows.filter((row) => row.result !== null).length,
    withVerifiedMeasurement: rows.filter((row) => row.measurement_id !== null).length,
    improved: rows.filter((row) => row.result === "improved").length,
    unchanged: rows.filter((row) => row.result === "unchanged").length,
    worsened: rows.filter((row) => row.result === "worsened").length,
    economics: summarizeDecisionEconomics(
      rows.map((row) => ({
        expectedImpact: expectedImpact(row),
        actualImpact: actualImpact(row),
      }))
    ),
    learning,
    calibration: buildDecisionCalibration(learning.confidenceBuckets),
    execution: {
      totalActions: actionRows.rows.reduce((sum, row) => sum + Number(row.count), 0),
      open: counts.get("open") ?? 0,
      inProgress: counts.get("in_progress") ?? 0,
      done: counts.get("done") ?? 0,
      cancelled: counts.get("cancelled") ?? 0,
    },
  };
}
