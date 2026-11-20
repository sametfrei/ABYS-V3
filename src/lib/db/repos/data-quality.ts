import { randomBytes } from "crypto";
import type { Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import type { EntityMatchStrategy } from "@/lib/connectors/entity-resolution";

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
  code: string | null;
  connectorRunId: string | null;
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
  code: string | null;
  connector_run_id: string | null;
  reason: string;
  payload: unknown;
  status: string;
  created_at: string | Date;
  resolved_at: string | Date | null;
  resolved_by: string | null;
}

const COLUMNS =
  "id, source, entity, source_ref, code, connector_run_id, reason, payload, status, created_at, resolved_at, resolved_by";

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
    code: row.code,
    connectorRunId: row.connector_run_id,
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
  code?: string | null;
  connectorRunId?: string | null;
  reason: string;
  payload?: unknown;
  tx?: Transaction;
}): Promise<QualityIssue> {
  if (!params.tx) await migrate();
  const db = params.tx ?? getDb();
  const id = randomBytes(8).toString("hex");
  const r = await db.query<QualityDbRow>(
    `INSERT INTO data_quality_issues
       (id, org_id, source, entity, source_ref, code, connector_run_id, reason, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      id,
      params.orgId,
      params.source,
      params.entity,
      params.sourceRef ?? null,
      params.code ?? null,
      params.connectorRunId ?? null,
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

export async function getIssue(orgId: string, id: string): Promise<QualityIssue | null> {
  await migrate();
  const r = await getDb().query<QualityDbRow>(
    `SELECT ${COLUMNS} FROM data_quality_issues WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  );
  return r.rows[0] ? mapIssue(r.rows[0]) : null;
}

export type IdentityConflictAction = "accept_proposed" | "keep_existing";

export class IdentityConflictResolutionError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "NOT_PENDING"
      | "NOT_IDENTITY_CONFLICT"
      | "INVALID_PAYLOAD"
      | "LINK_CHANGED",
    message: string
  ) {
    super(message);
    this.name = "IdentityConflictResolutionError";
  }
}

function isStrongStrategy(value: unknown): value is Extract<EntityMatchStrategy, "email" | "sku"> {
  return value === "email" || value === "sku";
}

/**
 * Kimlik çakışmasını yönetici kararıyla kapatır. `accept_proposed` yalnızca
 * kaynak bağlantısı hâlâ çakışmanın kaydedildiği eski kimliği gösteriyorsa
 * uygulanır; bu, arada başka bir senkronun bağlantıyı değiştirmesini ezmez.
 */
export async function resolveIdentityConflict(params: {
  orgId: string;
  id: string;
  action: IdentityConflictAction;
  resolvedBy: string;
}): Promise<QualityIssue> {
  await migrate();
  return getDb().transaction(async (tx) => {
    const found = await tx.query<QualityDbRow>(
      `SELECT ${COLUMNS} FROM data_quality_issues
        WHERE org_id = $1 AND id = $2
        FOR UPDATE`,
      [params.orgId, params.id]
    );
    const issue = found.rows[0];
    if (!issue) {
      throw new IdentityConflictResolutionError("NOT_FOUND", "Karantina kaydı bulunamadı.");
    }
    if (issue.code !== "IDENTITY_LINK_CONFLICT") {
      throw new IdentityConflictResolutionError(
        "NOT_IDENTITY_CONFLICT",
        "Bu kayıt kimlik çakışması değil; genel karantina çözümü kullanılmalı."
      );
    }
    if (issue.status !== "pending") {
      throw new IdentityConflictResolutionError(
        "NOT_PENDING",
        "Kimlik çakışması daha önce kapatılmış."
      );
    }

    if (params.action === "accept_proposed") {
      const payload = issue.payload as {
        previousCanonicalEntityId?: unknown;
        proposedCanonicalEntityId?: unknown;
        proposedStrategy?: unknown;
      } | null;
      const previousId = payload?.previousCanonicalEntityId;
      const proposedId = payload?.proposedCanonicalEntityId;
      const proposedStrategy = payload?.proposedStrategy;
      const sourceConfigId = issue.source.startsWith("connector:")
        ? issue.source.slice("connector:".length)
        : "";
      if (
        typeof previousId !== "string" ||
        typeof proposedId !== "string" ||
        !isStrongStrategy(proposedStrategy) ||
        !sourceConfigId ||
        !issue.source_ref
      ) {
        throw new IdentityConflictResolutionError(
          "INVALID_PAYLOAD",
          "Kimlik çakışması kaydı uygulanabilir bir öneri taşımıyor."
        );
      }
      const updated = await tx.query<{ id: string }>(
        `UPDATE canonical_entity_links
            SET canonical_entity_id = $6, match_strategy = $7,
                match_confidence = 100, resolved_at = now()
          WHERE org_id = $1 AND source_config_id = $2 AND entity = $3
            AND source_external_id = $4 AND canonical_entity_id = $5`,
        [
          params.orgId,
          sourceConfigId,
          issue.entity,
          issue.source_ref,
          previousId,
          proposedId,
          proposedStrategy,
        ]
      );
      if (updated.affectedRows === 0) {
        throw new IdentityConflictResolutionError(
          "LINK_CHANGED",
          "Kaynak bağlantısı çakışma kaydından sonra değişmiş; yeniden inceleme gerekiyor."
        );
      }
      const sourceRecord = await tx.query<{
        data: { contractVersion?: string; fields?: Record<string, unknown> };
        source_updated_at: string | Date | null;
      }>(
        `SELECT data, source_updated_at FROM connector_records
          WHERE org_id = $1 AND config_id = $2 AND entity = $3 AND external_id = $4`,
        [params.orgId, sourceConfigId, issue.entity, issue.source_ref]
      );
      if (sourceRecord.rows[0]) {
        await tx.query(
          `INSERT INTO connector_record_history
             (id, org_id, config_id, entity, external_id, canonical_entity_id,
              data, source_updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomBytes(8).toString("hex"),
            params.orgId,
            sourceConfigId,
            issue.entity,
            issue.source_ref,
            proposedId,
            JSON.stringify(sourceRecord.rows[0].data),
            sourceRecord.rows[0].source_updated_at,
          ]
        );
      }
    }

    const resolved = await tx.query<QualityDbRow>(
      `UPDATE data_quality_issues
          SET status = 'resolved', resolved_at = now(), resolved_by = $3
        WHERE org_id = $1 AND id = $2
        RETURNING ${COLUMNS}`,
      [params.orgId, params.id, params.resolvedBy]
    );
    return mapIssue(resolved.rows[0]);
  });
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
