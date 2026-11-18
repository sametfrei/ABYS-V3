import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";

/**
 * Veri kalitesi karantinası — entegrasyonlarda eşleştirilemeyen veya
 * doğrulanamayan satırlar burada izlenir. Her kayıt org_id ile kapsanır;
 * çağıran org_id'yi oturumdan/doğrulanmış anahtardan verir.
 *
 * payload yalnızca teşhis için gereken alanları taşımalı; bağlantı sırrı,
 * token veya kişisel veri kopyası ASLA konmaz.
 */

export type QualityStatus = "pending" | "resolved" | "discarded";

export interface QualityIssue {
  id: string;
  source: string;
  entity: string;
  sourceRef: string | null;
  reason: string;
  payload: unknown;
  status: QualityStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

interface QualityDbRow {
  id: string;
  source: string;
  entity: string;
  source_ref: string | null;
  reason: string;
  payload: unknown;
  status: string;
  created_at: string | Date;
  resolved_at: string | Date | null;
  resolved_by: string | null;
}

const COLUMNS =
  "id, source, entity, source_ref, reason, payload, status, created_at, resolved_at, resolved_by";

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapIssue(row: QualityDbRow): QualityIssue {
  return {
    id: row.id,
    source: row.source,
    entity: row.entity,
    sourceRef: row.source_ref,
    reason: row.reason,
    payload: row.payload,
    status:
      row.status === "resolved" || row.status === "discarded" ? row.status : "pending",
    createdAt: iso(row.created_at) ?? "",
    resolvedAt: iso(row.resolved_at),
    resolvedBy: row.resolved_by,
  };
}

export async function quarantineIssue(params: {
  orgId: string;
  source: string;
  entity: string;
  sourceRef?: string | null;
  reason: string;
  payload?: unknown;
}): Promise<QualityIssue> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  const r = await getDb().query<QualityDbRow>(
    `INSERT INTO data_quality_issues (id, org_id, source, entity, source_ref, reason, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [
      id,
      params.orgId,
      params.source,
      params.entity,
      params.sourceRef ?? null,
      params.reason,
      params.payload === undefined ? null : JSON.stringify(params.payload),
    ]
  );
  return mapIssue(r.rows[0]);
}

export async function listIssues(
  orgId: string,
  status: QualityStatus | "all" = "pending",
  limit = 100
): Promise<QualityIssue[]> {
  await migrate();
  const r = await getDb().query<QualityDbRow>(
    `SELECT ${COLUMNS} FROM data_quality_issues
     WHERE org_id = $1 AND ($2 = 'all' OR status = $2)
     ORDER BY created_at DESC LIMIT $3`,
    [orgId, status, limit]
  );
  return r.rows.map(mapIssue);
}

export async function resolveIssue(params: {
  orgId: string;
  id: string;
  resolution: Exclude<QualityStatus, "pending">;
  resolvedBy: string;
}): Promise<QualityIssue | null> {
  await migrate();
  const r = await getDb().query<QualityDbRow>(
    `UPDATE data_quality_issues
        SET status = $3, resolved_at = now(), resolved_by = $4
      WHERE org_id = $1 AND id = $2
      RETURNING ${COLUMNS}`,
    [params.orgId, params.id, params.resolution, params.resolvedBy]
  );
  return r.rows[0] ? mapIssue(r.rows[0]) : null;
}
