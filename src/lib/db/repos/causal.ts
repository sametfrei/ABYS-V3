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
