import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";

/**
 * Kök neden zinciri repository'si — tüm sorgular org-farkındalıklı.
 * Korelasyon asla kanıtlanmış nedensellik olarak sunulmaz; ilişki durumu
 * insan onayıyla ilerler (bkz. RELATION_STATUSES).
 */

export const RELATION_STATUSES = [
  "observed_correlation",
  "inferred",
  "expert_confirmed",
  "data_confirmed",
  "disputed",
] as const;

export type RelationStatus = (typeof RELATION_STATUSES)[number];

export interface CausalEvidenceMetadata {
  method: string | null;
  sampleSize: number | null;
  dataQuality: "high" | "medium" | "low" | null;
  uncertainty: "low" | "medium" | "high" | null;
}

export interface CausalLink extends CausalEvidenceMetadata {
  id: string;
  orgId: string;
  caseId: string;
  fromLabel: string;
  toLabel: string;
  relationStatus: RelationStatus;
  confidence: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export async function insertLink(params: {
  orgId: string;
  caseId: string;
  fromLabel: string;
  toLabel: string;
  relationStatus?: RelationStatus;
  confidence: number;
  note?: string;
  createdBy: string;
} & Partial<CausalEvidenceMetadata>): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  await getDb().query(
    `INSERT INTO causal_links
       (id, org_id, case_id, from_label, to_label, relation_status, confidence, note, created_by,
        method, sample_size, data_quality, uncertainty)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      params.orgId,
      params.caseId,
      params.fromLabel,
      params.toLabel,
      params.relationStatus ?? "observed_correlation",
      Math.round(params.confidence),
      params.note ?? null,
      params.createdBy,
      params.method ?? null,
      params.sampleSize ?? null,
      params.dataQuality ?? null,
      params.uncertainty ?? null,
    ]
  );
  return id;
}

export async function listLinks(orgId: string, caseId: string): Promise<CausalLink[]> {
  await migrate();
  const r = await getDb().query<{
    id: string;
    case_id: string;
    from_label: string;
    to_label: string;
    relation_status: string;
    confidence: number;
    note: string | null;
    created_by: string;
    created_at: string;
    method: string | null;
    sample_size: number | string | null;
    data_quality: string | null;
    uncertainty: string | null;
  }>(
    `SELECT id, case_id, from_label, to_label, relation_status, confidence, note, created_by, created_at,
            method, sample_size, data_quality, uncertainty
     FROM causal_links WHERE org_id = $1 AND case_id = $2 ORDER BY created_at DESC`,
    [orgId, caseId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    orgId,
    caseId: row.case_id,
    fromLabel: row.from_label,
    toLabel: row.to_label,
    relationStatus: row.relation_status as RelationStatus,
    confidence: row.confidence,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    method: row.method,
    sampleSize: row.sample_size === null ? null : Number(row.sample_size),
    dataQuality:
      row.data_quality === "high" || row.data_quality === "medium" || row.data_quality === "low"
        ? row.data_quality
        : null,
    uncertainty:
      row.uncertainty === "low" || row.uncertainty === "medium" || row.uncertainty === "high"
        ? row.uncertainty
        : null,
  }));
}

export async function updateStatus(orgId: string, linkId: string, status: RelationStatus): Promise<boolean> {
  await migrate();
  const r = await getDb().query(
    "UPDATE causal_links SET relation_status = $1 WHERE id = $2 AND org_id = $3",
    [status, linkId, orgId]
  );
  return (r.affectedRows ?? 0) > 0;
}

export interface CausalCandidate {
  fromLabel: string;
  toLabel: string;
  associationRatePct: number;
  sampleSize: number;
  matchedEffects: number;
  averageLagDays: number;
  dataQuality: "high" | "medium" | "low";
  uncertainty: "medium" | "high";
  note: string;
}

/**
 * Finds repeated, time-ordered associations for the KPI signals attached to a case.
 * Candidates are scoped to the same tenant, dataset and entity; only verified
 * KPI scopes/definitions participate. This is observational evidence, never a
 * causal conclusion. At least three target events and two matched precedences
 * are required before a candidate is surfaced.
 */
export async function suggestCausalCandidates(
  orgId: string,
  caseId: string
): Promise<CausalCandidate[]> {
  await migrate();
  const result = await getDb().query<{
    cause_label: string;
    effect_label: string;
    effect_count: number | string;
    matched_effects: number | string;
    average_lag_days: number | string;
  }>(
    `WITH target AS (
       SELECT DISTINCT s.dataset_id,
              COALESCE(s.payload #>> '{series,entity}', '') AS entity,
              s.payload->>'label' AS effect_label
         FROM decision_case_signals l
         JOIN signals s ON s.id = l.signal_id AND s.org_id = l.org_id
        WHERE l.org_id = $1 AND l.case_id = $2
          AND s.dataset_id IS NOT NULL
          AND s.payload->>'label' IS NOT NULL
          AND s.payload #>> '{series,scopeVerified}' = 'true'
          AND s.payload #>> '{series,definitionVerified}' = 'true'
     ), effect_history AS (
       SELECT DISTINCT e.id, e.dataset_id,
              COALESCE(e.payload #>> '{series,entity}', '') AS entity,
              e.payload->>'label' AS effect_label, e.created_at
         FROM signals e
         JOIN target t ON t.dataset_id = e.dataset_id
                      AND t.entity = COALESCE(e.payload #>> '{series,entity}', '')
                      AND t.effect_label = e.payload->>'label'
        WHERE e.org_id = $1
          AND e.created_at >= now() - interval '180 days'
          AND e.payload #>> '{series,scopeVerified}' = 'true'
          AND e.payload #>> '{series,definitionVerified}' = 'true'
     ), effect_counts AS (
       SELECT dataset_id, entity, effect_label, COUNT(*)::int AS effect_count
         FROM effect_history
        GROUP BY dataset_id, entity, effect_label
     ), pair_lags AS (
       SELECT eh.dataset_id, eh.entity, eh.effect_label, eh.id AS effect_id,
              p.payload->>'label' AS cause_label,
              MIN(EXTRACT(EPOCH FROM (eh.created_at - p.created_at)) / 86400.0) AS lag_days
         FROM effect_history eh
         JOIN signals p ON p.org_id = $1
                       AND p.dataset_id = eh.dataset_id
                       AND COALESCE(p.payload #>> '{series,entity}', '') = eh.entity
                       AND p.payload->>'label' IS NOT NULL
                       AND p.payload->>'label' <> eh.effect_label
                       AND p.payload #>> '{series,scopeVerified}' = 'true'
                       AND p.payload #>> '{series,definitionVerified}' = 'true'
                       AND p.created_at < eh.created_at
                       AND p.created_at >= eh.created_at - interval '30 days'
        GROUP BY eh.dataset_id, eh.entity, eh.effect_label, eh.id, p.payload->>'label'
     ), associations AS (
       SELECT dataset_id, entity, effect_label, cause_label,
              COUNT(DISTINCT effect_id)::int AS matched_effects,
              AVG(lag_days) AS average_lag_days
         FROM pair_lags
        GROUP BY dataset_id, entity, effect_label, cause_label
     )
     SELECT a.cause_label, a.effect_label, ec.effect_count,
            a.matched_effects, a.average_lag_days
       FROM associations a
       JOIN effect_counts ec USING (dataset_id, entity, effect_label)
      WHERE ec.effect_count >= 3
        AND a.matched_effects >= 2
        AND (a.matched_effects::numeric / ec.effect_count) >= 0.5
      ORDER BY (a.matched_effects::numeric / ec.effect_count) DESC,
               a.matched_effects DESC, a.average_lag_days ASC
      LIMIT 8`,
    [orgId, caseId]
  );

  return result.rows.map((row) => {
    const sampleSize = Number(row.effect_count);
    const matchedEffects = Number(row.matched_effects);
    const rate = Math.round((matchedEffects / sampleSize) * 100);
    const averageLagDays = Math.round(Number(row.average_lag_days) * 10) / 10;
    const dataQuality = sampleSize >= 30 ? "high" : sampleSize >= 10 ? "medium" : "low";
    const uncertainty = sampleSize >= 10 ? "medium" : "high";
    return {
      fromLabel: row.cause_label,
      toLabel: row.effect_label,
      associationRatePct: rate,
      sampleSize,
      matchedEffects,
      averageLagDays,
      dataQuality,
      uncertainty,
      note: `Otomatik gözlemsel aday: ${matchedEffects}/${sampleSize} hedef sinyalinden önce aynı veri seti/varlıkta ortalama ${averageLagDays} gün önce görüldü. Korelasyon nedensellik kanıtı değildir; uzman incelemesi gerekir.`,
    };
  });
}
