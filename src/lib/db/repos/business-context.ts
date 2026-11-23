import { createHash, randomBytes } from "node:crypto";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import { discoverBusiness } from "@/lib/industry/classifier";
import { getPack, INDUSTRY_PACKS } from "@/lib/industry/packs";
import { hasKpiCalculator } from "@/lib/industry/kpi-calculators";
import type { DiscoveryInput, DiscoveryResult, IndustryPack } from "@/lib/industry/types";

export interface ObservedFieldSchema {
  field: string;
  types: Record<string, number>;
  observations: number;
  nulls: number;
}

export interface ObservedEntitySchema {
  entity: string;
  records: number;
  fields: ObservedFieldSchema[];
}

export interface DiscoveryInputSummary {
  sectorId: string | null;
  entityCounts: Record<string, number>;
  fieldNames: string[];
  kpiLabels: string[];
}

export interface DiscoveryBuild {
  result: DiscoveryResult;
  inputs: DiscoveryInputSummary;
  schema: ObservedEntitySchema[];
  fingerprint: string;
}

export interface ActivatedKpiDefinition {
  id: string;
  name: string;
  sourceRef: string;
  created: boolean;
}

export interface KpiActivationResult {
  createdCount: number;
  preservedCount: number;
  definitions: ActivatedKpiDefinition[];
}

export interface BusinessProfileSnapshot {
  schemaVersion: 1;
  discovery: DiscoveryResult;
  inputs: DiscoveryInputSummary;
  observedSchema: ObservedEntitySchema[];
  activation: {
    packId: string;
    packVersion: number;
    subsectorId: string | null;
  };
}

export interface ConfirmedBusinessProfile {
  id: string;
  orgId: string;
  version: number;
  status: string;
  industryPackId: string;
  industryPackVersion: number;
  subsectorId: string | null;
  confidence: number;
  sourceFingerprint: string;
  snapshot: BusinessProfileSnapshot;
  createdBy: string;
  createdAt: string;
}

export type BusinessProfileErrorCode =
  | "NO_DISCOVERY_EVIDENCE"
  | "PACK_NOT_DETECTED"
  | "INVALID_SUBSECTOR"
  | "CONFIRMATION_REQUIRED";

export class BusinessProfileError extends Error {
  constructor(
    public readonly code: BusinessProfileErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BusinessProfileError";
  }
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

async function loadObservedSchema(orgId: string): Promise<ObservedEntitySchema[]> {
  const db = getDb();
  const [recordCounts, typeCounts] = await Promise.all([
    db.query<{ entity: string; count: number }>(
      `SELECT entity, count(*)::int AS count
         FROM connector_records WHERE org_id = $1 GROUP BY entity ORDER BY entity`,
      [orgId]
    ),
    db.query<{
      entity: string;
      field: string;
      value_type: string;
      observations: number;
      nulls: number;
    }>(
      `SELECT r.entity,
              f.key AS field,
              coalesce(jsonb_typeof(f.value), 'null') AS value_type,
              count(*)::int AS observations,
              count(*) FILTER (WHERE f.value IS NULL OR f.value = 'null'::jsonb)::int AS nulls
         FROM connector_records r
         CROSS JOIN LATERAL jsonb_each(r.data->'fields') f
        WHERE r.org_id = $1
        GROUP BY r.entity, f.key, jsonb_typeof(f.value)
        ORDER BY r.entity, f.key, value_type`,
      [orgId]
    ),
  ]);

  const byEntity = new Map<string, ObservedEntitySchema>();
  for (const row of recordCounts.rows) {
    byEntity.set(row.entity, { entity: row.entity, records: Number(row.count), fields: [] });
  }
  const fieldMap = new Map<string, ObservedFieldSchema>();
  for (const row of typeCounts.rows) {
    const entity = byEntity.get(row.entity) ?? {
      entity: row.entity,
      records: 0,
      fields: [],
    };
    if (!byEntity.has(row.entity)) byEntity.set(row.entity, entity);
    const key = `${row.entity}\u001f${row.field}`;
    const field = fieldMap.get(key) ?? {
      field: row.field,
      types: {},
      observations: 0,
      nulls: 0,
    };
    const observations = Number(row.observations);
    field.types[row.value_type] = (field.types[row.value_type] ?? 0) + observations;
    field.observations += observations;
    field.nulls += Number(row.nulls);
    fieldMap.set(key, field);
    if (!entity.fields.some((candidate) => candidate.field === row.field)) {
      entity.fields.push(field);
    }
  }
  return [...byEntity.values()].sort((a, b) => a.entity.localeCompare(b.entity));
}

function fingerprint(input: DiscoveryInputSummary, schema: ObservedEntitySchema[]): string {
  const canonical = {
    sectorId: input.sectorId,
    entities: Object.entries(input.entityCounts).sort(([a], [b]) => a.localeCompare(b)),
    fields: [...input.fieldNames].sort(),
    schema: schema.map((entity) => ({
      entity: entity.entity,
      fields: entity.fields.map((field) => ({
        field: field.field,
        types: Object.entries(field.types).sort(([a], [b]) => a.localeCompare(b)),
      })),
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Keşif girdisini org'un gerçek konnektör kayıtlarından ve KPI defterinden üretir. */
export async function buildDiscovery(orgId: string): Promise<DiscoveryBuild> {
  await migrate();
  const db = getDb();
  const [orgResult, schema, labelResult, definitionResult] = await Promise.all([
    db.query<{ sector_id: string | null }>(
      "SELECT sector_id FROM organizations WHERE id = $1",
      [orgId]
    ),
    loadObservedSchema(orgId),
    db.query<{ label: string }>(
      "SELECT DISTINCT label FROM kpi_values WHERE org_id = $1 ORDER BY label",
      [orgId]
    ),
    db.query<{ name: string }>(
      "SELECT name FROM kpi_definitions WHERE org_id = $1 ORDER BY name",
      [orgId]
    ),
  ]);

  const entityCounts: Record<string, number> = {};
  for (const entity of schema) entityCounts[entity.entity] = entity.records;
  const fieldNames = [...new Set(schema.flatMap((entity) => entity.fields.map((f) => f.field)))].sort();
  const kpiLabels = [
    ...new Set([...labelResult.rows.map((row) => row.label), ...definitionResult.rows.map((row) => row.name)]),
  ].sort();
  const sectorId = orgResult.rows[0]?.sector_id ?? null;
  // KPI kullanılabilirliği varlık bazında değerlendirilir: alanların farklı
  // varlıklara dağılmış olması "hesaplanabilir" sayılmaz.
  const entityFields: Record<string, string[]> = {};
  const entityFieldTypes: Record<string, Record<string, Record<string, number>>> = {};
  for (const entity of schema) {
    entityFields[entity.entity] = entity.fields.map((f) => f.field);
    const fields: Record<string, Record<string, number>> = {};
    for (const field of entity.fields) fields[field.field] = field.types;
    entityFieldTypes[entity.entity] = fields;
  }
  const discoveryInput: DiscoveryInput = {
    sectorId,
    entityCounts,
    fieldNames,
    kpiLabels,
    entityFields,
    entityFieldTypes,
  };
  const inputs = { sectorId, entityCounts, fieldNames, kpiLabels };

  return {
    result: discoverBusiness(discoveryInput),
    inputs,
    schema,
    fingerprint: fingerprint(inputs, schema),
  };
}

function mapProfile(row: {
  id: string;
  org_id: string;
  version: number;
  status: string;
  industry_pack_id: string;
  industry_pack_version: number;
  subsector_id: string | null;
  confidence: number;
  source_fingerprint: string;
  snapshot: BusinessProfileSnapshot;
  created_by: string;
  created_at: string | Date;
}): ConfirmedBusinessProfile {
  return {
    id: row.id,
    orgId: row.org_id,
    version: Number(row.version),
    status: row.status,
    industryPackId: row.industry_pack_id,
    industryPackVersion: Number(row.industry_pack_version),
    subsectorId: row.subsector_id,
    confidence: Number(row.confidence),
    sourceFingerprint: row.source_fingerprint,
    snapshot: row.snapshot,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

const PROFILE_COLUMNS =
  "id, org_id, version, status, industry_pack_id, industry_pack_version, subsector_id, confidence, source_fingerprint, snapshot, created_by, created_at";

type QueryExecutor = Pick<PGlite, "query"> | Pick<Transaction, "query">;

async function queryConfirmedBusinessProfile(
  db: QueryExecutor,
  orgId: string
): Promise<ConfirmedBusinessProfile | null> {
  const r = await db.query<Parameters<typeof mapProfile>[0]>(
    `SELECT ${PROFILE_COLUMNS} FROM business_profiles
      WHERE org_id = $1 ORDER BY version DESC LIMIT 1`,
    [orgId]
  );
  return r.rows[0] ? mapProfile(r.rows[0]) : null;
}

export async function getConfirmedBusinessProfile(
  orgId: string
): Promise<ConfirmedBusinessProfile | null> {
  await migrate();
  return queryConfirmedBusinessProfile(getDb(), orgId);
}

export async function listBusinessProfileVersions(
  orgId: string,
  limit = 20
): Promise<ConfirmedBusinessProfile[]> {
  await migrate();
  const r = await getDb().query<Parameters<typeof mapProfile>[0]>(
    `SELECT ${PROFILE_COLUMNS} FROM business_profiles
      WHERE org_id = $1 ORDER BY version DESC LIMIT $2`,
    [orgId, limit]
  );
  return r.rows.map(mapProfile);
}

/**
 * Paket KPI'larını kayıt defterine ekler. Aynı isimde elle yazılmış bir tanım
 * varsa korunur; sektör paketi operatörün sahibi olduğu tanımı ezmez.
 */
export async function activateIndustryPack(
  orgId: string,
  pack: IndustryPack
): Promise<KpiActivationResult> {
  await migrate();
  return activateIndustryPackWith(getDb(), orgId, pack);
}

async function activateIndustryPackWith(
  db: QueryExecutor,
  orgId: string,
  pack: IndustryPack
): Promise<KpiActivationResult> {
  const sourceRef = `${pack.id}@${pack.version}`;
  const definitions: ActivatedKpiDefinition[] = [];
  let createdCount = 0;
  let preservedCount = 0;

  for (const spec of pack.kpis) {
    if (!hasKpiCalculator(spec.functionName)) {
      throw new Error(`Paket KPI '${spec.id}' için hesaplayıcı yok (${spec.functionName}).`);
    }
    const id = stableId("industry-kpi", orgId, pack.id, String(pack.version), spec.id);
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO kpi_definitions
         (id, org_id, name, description, unit, formula_text, owner, department,
          update_frequency, source, source_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'on-demand', 'industry-pack', $9)
       ON CONFLICT (org_id, name) DO NOTHING
       RETURNING id`,
      [
        id,
        orgId,
        spec.name,
        `${pack.label} sektör paketi v${pack.version}; ${spec.formula}`,
        spec.unit,
        spec.formula,
        "Sektör zekâ paketi",
        spec.category,
        sourceRef,
      ]
    );
    if (inserted.rows[0]) {
      createdCount++;
      definitions.push({ id: inserted.rows[0].id, name: spec.name, sourceRef, created: true });
    } else {
      preservedCount++;
      const existing = await db.query<{ id: string }>(
        "SELECT id FROM kpi_definitions WHERE org_id = $1 AND name = $2",
        [orgId, spec.name]
      );
      if (existing.rows[0]) {
        definitions.push({ id: existing.rows[0].id, name: spec.name, sourceRef, created: false });
      }
    }
  }

  return { createdCount, preservedCount, definitions };
}

export async function confirmBusinessProfile(params: {
  orgId: string;
  packId: string;
  subsectorId?: string | null;
  acknowledgeConfidence?: boolean;
  actor: string;
}): Promise<{
  profile: ConfirmedBusinessProfile;
  activation: KpiActivationResult;
  idempotent: boolean;
}> {
  await migrate();
  const pack = getPack(params.packId);
  if (!pack) throw new BusinessProfileError("PACK_NOT_DETECTED", "Bilinmeyen sektör paketi.");
  if (params.subsectorId && !pack.subsectors.some((sub) => sub.id === params.subsectorId)) {
    throw new BusinessProfileError("INVALID_SUBSECTOR", "Alt sektör seçilen pakete ait değil.");
  }

  const build = await buildDiscovery(params.orgId);
  const ranking = build.result.rankings.find((candidate) => candidate.packId === pack.id);
  if (!ranking) {
    throw new BusinessProfileError(
      "NO_DISCOVERY_EVIDENCE",
      "Seçilen sektör paketini destekleyen yeterli yapısal veri sinyali yok."
    );
  }
  if (build.result.requiresConfirmation && params.acknowledgeConfidence !== true) {
    throw new BusinessProfileError(
      "CONFIRMATION_REQUIRED",
      "Keşif güveni düşük veya alternatifler yakın; düşük güveni açıkça onaylayın."
    );
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    // Aynı org için eşzamanlı onayları sıraya alır. Sürüm max+1 yarışı ve
    // profil insert'i ile KPI aktivasyonunun ayrışması böylece engellenir.
    await tx.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [params.orgId]);

    const previous = await queryConfirmedBusinessProfile(tx, params.orgId);
    if (
      previous &&
      previous.industryPackId === pack.id &&
      previous.industryPackVersion === pack.version &&
      previous.subsectorId === (params.subsectorId ?? null) &&
      previous.sourceFingerprint === build.fingerprint
    ) {
      return {
        profile: previous,
        activation: { createdCount: 0, preservedCount: pack.kpis.length, definitions: [] },
        idempotent: true,
      };
    }

    const activation = await activateIndustryPackWith(tx, params.orgId, pack);
    const snapshot: BusinessProfileSnapshot = {
      schemaVersion: 1,
      discovery: build.result,
      inputs: build.inputs,
      observedSchema: build.schema,
      activation: {
        packId: pack.id,
        packVersion: pack.version,
        subsectorId: params.subsectorId ?? null,
      },
    };
    const id = randomBytes(12).toString("hex");
    const inserted = await tx.query<Parameters<typeof mapProfile>[0]>(
      `INSERT INTO business_profiles
         (id, org_id, version, industry_pack_id, industry_pack_version, subsector_id,
          confidence, source_fingerprint, snapshot, created_by)
       VALUES (
         $1, $2,
         (SELECT coalesce(max(version), 0) + 1 FROM business_profiles WHERE org_id = $2),
         $3, $4, $5, $6, $7, $8, $9
       )
       RETURNING ${PROFILE_COLUMNS}`,
      [
        id,
        params.orgId,
        pack.id,
        pack.version,
        params.subsectorId ?? null,
        ranking.score,
        build.fingerprint,
        JSON.stringify(snapshot),
        params.actor,
      ]
    );

    return { profile: mapProfile(inserted.rows[0]), activation, idempotent: false };
  });
}

export function listIndustryPackCatalog() {
  return INDUSTRY_PACKS.map((pack) => ({
    id: pack.id,
    label: pack.label,
    version: pack.version,
    subsectors: pack.subsectors,
    kpis: pack.kpis.length,
  }));
}
