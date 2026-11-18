import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";

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
}

export interface KpiEntryInput {
  label: string;
  value: number;
  observedAt: string;
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
  for (const entry of entries) {
    await db.query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomBytes(8).toString("hex"),
        orgId,
        datasetId,
        entry.label,
        String(entry.value),
        entry.observedAt,
      ]
    );
  }
  return entries.length;
}

export async function listKpiPoints(orgId: string, label: string, limit = 200): Promise<KpiPoint[]> {
  await migrate();
  const r = await getDb().query<{ id: string; label: string; value: string; created_at: string | Date }>(
    `SELECT id, label, value, created_at
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
    });
  }
  return points;
}

export async function deleteKpiPoint(orgId: string, id: string): Promise<boolean> {
  await migrate();
  const r = await getDb().query("DELETE FROM kpi_values WHERE id = $1 AND org_id = $2", [id, orgId]);
  return (r.affectedRows ?? 0) > 0;
}
