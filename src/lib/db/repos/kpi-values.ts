import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import { listKpiDefinitionSnapshots } from "./kpi-definition-provenance";

/**
 * KPI zaman serisi girişi — kurumun kendi metrik geçmişini kaydetmesi için
 * genel amaçlı repository. Her giriş bir `datasets` kaydına bağlanır (veri
 * soyu); aynı org için tek bir "Manuel KPI girişi" veri seti yeniden kullanılır.
 *
 * Tüm sorgular org_id kapsamlıdır; başka kurumun satırı okunamaz/silinemez.
 */

export const MANUAL_KPI_SOURCE_LABEL = "Manuel KPI girişi";

export interface KpiPoint {
  id: string;
  label: string;
  value: number;
  observedAt: string;
  period: string | null;
}

export interface KpiEntryInput {
  label: string;
  value: number;
  observedAt: string;
  /** Gözlem dönemi (ör. "2026-Q1"). Bilinmiyorsa null; raporlama sıklığı değildir. */
  period?: string | null;
}

export async function getManualDatasetId(orgId: string): Promise<string> {
  await migrate();
  const db = getDb();
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM datasets WHERE org_id = $1 AND source_label = $2 ORDER BY created_at ASC LIMIT 1",
    [orgId, MANUAL_KPI_SOURCE_LABEL]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const sector = await db.query<{ sector_id: string }>(
    "SELECT sector_id FROM organizations WHERE id = $1",
    [orgId]
  );
  const datasetId = randomBytes(8).toString("hex");
  await db.query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ($1, $2, $3, $4, $5, 'kullanici')`,
    [
      datasetId,
      orgId,
      sector.rows[0]?.sector_id ?? "other",
      MANUAL_KPI_SOURCE_LABEL,
      JSON.stringify({
        description: "Kullanıcı tarafından kaydedilen KPI zaman serisi",
        valueOrder: "kpi_values.created_at = gözlem zamanı",
      }),
    ]
  );
  return datasetId;
}

/** Tek veya toplu KPI noktası yazar. Girdi doğrulaması çağıran katmanda yapılır. */
export async function recordKpiValues(
  orgId: string,
  entries: KpiEntryInput[]
): Promise<number> {
  if (entries.length === 0) return 0;
  const datasetId = await getManualDatasetId(orgId);
  const db = getDb();
  const definitions = await listKpiDefinitionSnapshots(db, orgId);
  for (const entry of entries) {
    const definition = definitions.get(entry.label);
    await db.query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version, period)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        randomBytes(8).toString("hex"),
        orgId,
        datasetId,
        entry.label,
        String(entry.value),
        entry.observedAt,
        definition?.id ?? null,
        definition?.formulaHash ?? null,
        definition?.sourceRef ?? null,
        // Tanımın update_frequency değeri raporlama sıklığıdır; gözlem dönemi
        // yalnızca çağıran açıkça verdiyse yazılır.
        entry.period ?? null,
      ]
    );
  }
  return entries.length;
}

export async function listKpiPoints(orgId: string, label: string, limit = 200): Promise<KpiPoint[]> {
  await migrate();
  const r = await getDb().query<{ id: string; label: string; value: string; created_at: string | Date; period: string | null }>(
    `SELECT id, label, value, created_at, period
       FROM kpi_values
      WHERE org_id = $1 AND label = $2 AND value ~ '^[+-]?[0-9]+(\\.[0-9]+)?$'
      ORDER BY created_at ASC
      LIMIT $3`,
    [orgId, label, limit]
  );
  const points: KpiPoint[] = [];
  for (const row of r.rows) {
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    points.push({
      id: row.id,
      label: row.label,
      value,
      observedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      period: row.period,
    });
  }
  return points;
}

export async function deleteKpiPoint(orgId: string, id: string): Promise<boolean> {
  await migrate();
  const r = await getDb().query("DELETE FROM kpi_values WHERE id = $1 AND org_id = $2", [id, orgId]);
  return (r.affectedRows ?? 0) > 0;
}

export interface KpiObservationSummary {
  label: string;
  observationCount: number;
  /** Sayısal olarak ayrıştırılabilen gözlem sayısı; geçersiz değerler de sayılır. */
  numericCount: number;
  latestValue: string | null;
  latestObservedAt: string | null;
  /** Gözlemlerin geldiği veri setleri (köken). */
  sourceLabels: string[];
  /** Tanımın kaynağı: 'manual' veya 'industry-pack'. */
  definitionSource: string | null;
  definitionSourceRef: string | null;
  formulaText: string | null;
}

/**
 * Org kapsamlı KPI gözlem özeti. "KPI hesaplanabilir" ile "KPI gerçekten
 * hesaplandı" ayrımını kanıtla göstermek için kullanılır: etiket başına
 * gözlem sayısı, son değer/zaman ve veri kökeni. Başka kurumun satırı sayılmaz.
 */
export async function listKpiObservationSummaries(
  orgId: string
): Promise<KpiObservationSummary[]> {
  await migrate();
  const r = await getDb().query<{
    label: string;
    observation_count: number;
    numeric_count: number;
    latest_value: string | null;
    latest_observed_at: string | Date | null;
    source_labels: string[] | null;
    definition_source: string | null;
    definition_source_ref: string | null;
    formula_text: string | null;
  }>(
    `SELECT v.label,
            count(*)::int AS observation_count,
            count(*) FILTER (WHERE v.value ~ '^[+-]?[0-9]+(\\.[0-9]+)?$')::int AS numeric_count,
            (array_agg(v.value ORDER BY v.created_at DESC, v.id DESC))[1] AS latest_value,
            max(v.created_at) AS latest_observed_at,
            array_agg(DISTINCT d.source_label)
              FILTER (WHERE d.source_label IS NOT NULL) AS source_labels,
            max(kd.source) AS definition_source,
            max(kd.source_ref) AS definition_source_ref,
            max(kd.formula_text) AS formula_text
       FROM kpi_values v
       LEFT JOIN datasets d ON d.id = v.dataset_id AND d.org_id = v.org_id
       LEFT JOIN kpi_definitions kd ON kd.org_id = v.org_id AND kd.name = v.label
      WHERE v.org_id = $1
      GROUP BY v.label
      ORDER BY v.label`,
    [orgId]
  );
  return r.rows.map((row) => ({
    label: row.label,
    observationCount: Number(row.observation_count),
    numericCount: Number(row.numeric_count),
    latestValue: row.latest_value,
    latestObservedAt:
      row.latest_observed_at === null
        ? null
        : row.latest_observed_at instanceof Date
          ? row.latest_observed_at.toISOString()
          : String(row.latest_observed_at),
    sourceLabels: row.source_labels ?? [],
    definitionSource: row.definition_source,
    definitionSourceRef: row.definition_source_ref,
    formulaText: row.formula_text,
  }));
}

export interface LatestNumericKpi {
  label: string;
  value: number;
  observedAt: string;
  numericPoints: number;
  sourceLabels: string[];
}

/**
 * Org kapsamlı, etiket başına en güncel SAYISAL KPI değeri. Senaryo
 * değişkenlerini gerçek ölçümle beslemek için kullanılır; geçersiz değerler
 * ve başka kurumun satırları dışlanır.
 */
export async function listLatestNumericKpis(orgId: string): Promise<LatestNumericKpi[]> {
  await migrate();
  const r = await getDb().query<{
    label: string;
    numeric_points: number;
    latest_value: string;
    latest_at: string | Date;
    source_labels: string[] | null;
  }>(
    `SELECT v.label,
            count(*)::int AS numeric_points,
            (array_agg(v.value ORDER BY v.created_at DESC, v.id DESC))[1] AS latest_value,
            max(v.created_at) AS latest_at,
            array_agg(DISTINCT d.source_label)
              FILTER (WHERE d.source_label IS NOT NULL) AS source_labels
       FROM kpi_values v
       LEFT JOIN datasets d ON d.id = v.dataset_id AND d.org_id = v.org_id
      WHERE v.org_id = $1 AND v.value ~ '^[+-]?[0-9]+(\\.[0-9]+)?$'
      GROUP BY v.label
      ORDER BY v.label`,
    [orgId]
  );
  const out: LatestNumericKpi[] = [];
  for (const row of r.rows) {
    const value = Number(row.latest_value);
    if (!Number.isFinite(value)) continue;
    out.push({
      label: row.label,
      value,
      observedAt:
        row.latest_at instanceof Date ? row.latest_at.toISOString() : String(row.latest_at),
      numericPoints: Number(row.numeric_points),
      sourceLabels: row.source_labels ?? [],
    });
  }
  return out;
}

export interface KpiObservationRow {
  label: string;
  value: string | null;
  createdAt: string;
}

/**
 * Veri kalitesi skoru için ham gözlemler. Sayısal filtre UYGULANMAZ: geçersiz
 * değerler de dönmeli ki "geçerlilik" boyutu gerçekten ölçülebilsin.
 * Kurum kapsamlıdır ve üst sınırla korunur.
 */
export async function listKpiObservations(
  orgId: string,
  options: { label?: string; limit?: number } = {}
): Promise<KpiObservationRow[]> {
  await migrate();
  const limit = Math.min(2000, Math.max(1, options.limit ?? 1000));
  const r = await getDb().query<{ label: string; value: string | null; created_at: string | Date }>(
    `SELECT label, value, created_at
       FROM kpi_values
      WHERE org_id = $1
        AND ($2::text IS NULL OR label = $2)
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [orgId, options.label ?? null, limit]
  );
  return r.rows.map((row) => ({
    label: row.label,
    value: row.value,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}
