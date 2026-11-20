import { getDb, migrate } from "../client";
import type { CanonicalEntity, CanonicalRecord } from "@/lib/connectors/types";
import {
  selectGoldenRecord,
  type GoldenRecordSelection,
  type GoldenRecordSource,
} from "@/lib/canonical-survivorship";

interface SourceRow {
  entity: CanonicalEntity;
  canonical_entity_id: string;
  source_config_id: string;
  source_external_id: string;
  source_updated_at: string | Date | null;
  synced_at: string | Date;
  priority: number | null;
  data: { fields?: CanonicalRecord["fields"] };
}

export interface GoldenRecord extends GoldenRecordSelection {
  canonicalEntityId: string;
  sources: Array<{
    sourceConfigId: string;
    sourceExternalId: string;
    sourceUpdatedAt: string | null;
    syncedAt: string;
    priority: number | null;
  }>;
}

export interface GoldenRecordSummary {
  canonicalEntityId: string;
  entity: CanonicalEntity;
  label: string;
  sourceCount: number;
  recordCount: number;
  latestSyncedAt: string;
  conflictCount: number;
  policyApplied: boolean;
}

export interface SurvivorshipPolicy {
  entity: CanonicalEntity;
  sourceConfigId: string;
  priority: number;
  updatedBy: string;
  updatedAt: string;
}

export class SurvivorshipPolicyError extends Error {
  constructor(
    public readonly code: "INVALID_SOURCE" | "INVALID_ENTITY" | "DUPLICATE_PRIORITY",
    message: string
  ) {
    super(message);
    this.name = "SurvivorshipPolicyError";
  }
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function labelFromFields(fields: CanonicalRecord["fields"], fallback: string): string {
  for (const field of ["name", "displayName", "display_name", "title", "code", "sku", "email"]) {
    const value = fields[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function toSource(row: SourceRow): GoldenRecordSource {
  return {
    sourceConfigId: row.source_config_id,
    sourceExternalId: row.source_external_id,
    sourceUpdatedAt: iso(row.source_updated_at),
    syncedAt: iso(row.synced_at) ?? "",
    priority: row.priority === null ? null : Number(row.priority),
    fields: row.data?.fields ?? {},
  };
}

/** Kanonik kimlik için kaynak kayıtlarını birleştirir; kaynak kayıtlarını değiştirmez. */
export async function getGoldenRecord(
  orgId: string,
  canonicalEntityId: string,
  entity?: CanonicalEntity
): Promise<GoldenRecord | null> {
  await migrate();
  const rows = await getDb().query<SourceRow>(
    `SELECT l.entity, l.canonical_entity_id, l.source_config_id, l.source_external_id,
            r.source_updated_at, r.synced_at, p.priority, r.data
       FROM canonical_entity_links l
       JOIN connector_records r
         ON r.org_id = l.org_id
        AND r.config_id = l.source_config_id
        AND r.entity = l.entity
        AND r.external_id = l.source_external_id
       LEFT JOIN canonical_survivorship_policies p
         ON p.org_id = l.org_id
        AND p.entity = l.entity
        AND p.source_config_id = l.source_config_id
      WHERE l.org_id = $1 AND l.canonical_entity_id = $2
        AND ($3::text IS NULL OR l.entity = $3)
      ORDER BY l.entity, l.source_config_id, l.source_external_id`,
    [orgId, canonicalEntityId, entity ?? null]
  );
  if (rows.rows.length === 0) return null;
  const selectedEntity = rows.rows[0].entity;
  if (rows.rows.some((row) => row.entity !== selectedEntity)) {
    throw new Error("Kanonik kimlik birden fazla varlık türüyle eşleşiyor.");
  }
  const sources = rows.rows.map(toSource);
  const selection = selectGoldenRecord(selectedEntity, sources);
  if (!selection) return null;
  return {
    canonicalEntityId,
    ...selection,
    sources: sources.map((source) => ({
      sourceConfigId: source.sourceConfigId,
      sourceExternalId: source.sourceExternalId,
      sourceUpdatedAt: source.sourceUpdatedAt,
      syncedAt: source.syncedAt,
      priority: source.priority,
    })),
  };
}

/** Çok kaynaklı kanonik varlıkları, altın kayıt incelemesi için listeler. */
export async function listGoldenRecordSummaries(
  orgId: string,
  options: { entity?: CanonicalEntity; limit?: number } = {}
): Promise<GoldenRecordSummary[]> {
  await migrate();
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20)));
  const rows = await getDb().query<{
    canonical_entity_id: string;
    entity: CanonicalEntity;
    source_count: number;
    record_count: number;
    latest_synced_at: string | Date;
  }>(
    `SELECT l.canonical_entity_id, l.entity,
            count(DISTINCT l.source_config_id)::int AS source_count,
            count(*)::int AS record_count,
            max(r.synced_at) AS latest_synced_at
       FROM canonical_entity_links l
       JOIN connector_records r
         ON r.org_id = l.org_id
        AND r.config_id = l.source_config_id
        AND r.entity = l.entity
        AND r.external_id = l.source_external_id
      WHERE l.org_id = $1 AND ($2::text IS NULL OR l.entity = $2)
      GROUP BY l.canonical_entity_id, l.entity
     HAVING count(DISTINCT l.source_config_id) > 1
      ORDER BY max(r.synced_at) DESC, l.canonical_entity_id
      LIMIT $3`,
    [orgId, options.entity ?? null, limit]
  );
  const summaries: GoldenRecordSummary[] = [];
  for (const row of rows.rows) {
    const golden = await getGoldenRecord(orgId, row.canonical_entity_id, row.entity);
    summaries.push({
      canonicalEntityId: row.canonical_entity_id,
      entity: row.entity,
      label: golden ? labelFromFields(golden.fields, `${row.entity}:${row.canonical_entity_id}`) : row.entity,
      sourceCount: Number(row.source_count),
      recordCount: Number(row.record_count),
      latestSyncedAt: iso(row.latest_synced_at) ?? "",
      conflictCount: golden?.conflictCount ?? 0,
      policyApplied: golden?.policy.applied ?? false,
    });
  }
  return summaries;
}

export async function listSurvivorshipPolicies(
  orgId: string,
  entity?: CanonicalEntity
): Promise<SurvivorshipPolicy[]> {
  await migrate();
  const rows = await getDb().query<{
    entity: CanonicalEntity;
    source_config_id: string;
    priority: number;
    updated_by: string;
    updated_at: string | Date;
  }>(
    `SELECT entity, source_config_id, priority, updated_by, updated_at
       FROM canonical_survivorship_policies
      WHERE org_id = $1 AND ($2::text IS NULL OR entity = $2)
      ORDER BY entity, priority, source_config_id`,
    [orgId, entity ?? null]
  );
  return rows.rows.map((row) => ({
    entity: row.entity,
    sourceConfigId: row.source_config_id,
    priority: Number(row.priority),
    updatedBy: row.updated_by,
    updatedAt: iso(row.updated_at) ?? "",
  }));
}

/** Bir varlık için kaynak güven sırasını atomik olarak değiştirir. */
export async function replaceSurvivorshipPolicy(params: {
  orgId: string;
  entity: CanonicalEntity;
  priorities: Array<{ sourceConfigId: string; priority: number }>;
  updatedBy: string;
}): Promise<SurvivorshipPolicy[]> {
  await migrate();
  const seenConfigs = new Set<string>();
  const seenPriorities = new Set<number>();
  for (const item of params.priorities) {
    if (seenConfigs.has(item.sourceConfigId)) {
      throw new SurvivorshipPolicyError("INVALID_SOURCE", "Aynı kaynak birden fazla kez gönderildi.");
    }
    if (seenPriorities.has(item.priority)) {
      throw new SurvivorshipPolicyError("DUPLICATE_PRIORITY", "Kaynak öncelikleri benzersiz olmalı.");
    }
    seenConfigs.add(item.sourceConfigId);
    seenPriorities.add(item.priority);
  }

  await getDb().transaction(async (tx) => {
    if (params.priorities.length > 0) {
      const ids = params.priorities.map((item) => item.sourceConfigId);
      const configs = await tx.query<{ id: string; config: { entity?: string } }>(
        `SELECT id, config FROM connector_configs
          WHERE org_id = $1 AND id = ANY($2::text[])`,
        [params.orgId, ids]
      );
      if (configs.rows.length !== ids.length) {
        throw new SurvivorshipPolicyError(
          "INVALID_SOURCE",
          "Kaynak konfigürasyonlarından biri bu organizasyonda bulunamadı."
        );
      }
      if (configs.rows.some((row) => row.config?.entity !== params.entity)) {
        throw new SurvivorshipPolicyError(
          "INVALID_ENTITY",
          "Kaynak konfigürasyonu bu varlık türü için değil."
        );
      }
    }

    await tx.query(
      "DELETE FROM canonical_survivorship_policies WHERE org_id = $1 AND entity = $2",
      [params.orgId, params.entity]
    );
    for (const item of params.priorities) {
      await tx.query(
        `INSERT INTO canonical_survivorship_policies
           (org_id, entity, source_config_id, priority, updated_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [params.orgId, params.entity, item.sourceConfigId, item.priority, params.updatedBy]
      );
    }
  });

  return listSurvivorshipPolicies(params.orgId, params.entity);
}
