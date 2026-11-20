import { getDb, migrate } from "../client";

/**
 * Tahmin verisi repository'si. Yalnızca sayısal olarak ayrıştırılabilen KPI
 * değerleri kullanılır; metin/para birimi karışık değerler sessizce dışarıda
 * bırakılmaz — kaç değerin kullanıldığı ve kaçının dışlandığı raporlanır.
 * Tüm sorgular org_id kapsamlıdır.
 */

export const NUMERIC_VALUE_REGEX = "^[+-]?[0-9]+(\\.[0-9]+)?$";

export interface KpiLabelSummary {
  label: string;
  numericPoints: number;
  totalPoints: number;
  lastAt: string | null;
}

export interface KpiSeries {
  label: string;
  values: number[];
  timestamps: string[];
  numericPoints: number;
  excludedPoints: number;
}

export async function listKpiLabels(orgId: string): Promise<KpiLabelSummary[]> {
  await migrate();
  const r = await getDb().query<{
    label: string;
    numeric_points: number;
    total_points: number;
    last_at: string | Date | null;
  }>(
    `SELECT label,
            count(*) FILTER (WHERE value ~ $2)::int AS numeric_points,
            count(*)::int AS total_points,
            max(created_at) AS last_at
       FROM kpi_values
      WHERE org_id = $1
      GROUP BY label
      ORDER BY label`,
    [orgId, NUMERIC_VALUE_REGEX]
  );
  return r.rows.map((row) => ({
    label: row.label,
    numericPoints: Number(row.numeric_points),
    totalPoints: Number(row.total_points),
    lastAt: row.last_at
      ? row.last_at instanceof Date
        ? row.last_at.toISOString()
        : String(row.last_at)
      : null,
  }));
}

/**
 * Kurumun tüm etiketleri için son `limitPerLabel` sayısal gözlemi tek
 * sorguda toplar. Erken uyarı taraması için kullanılır.
 */
export async function getAllKpiSeries(
  orgId: string,
  limitPerLabel = 120
): Promise<Map<string, { values: number[]; timestamps: string[] }>> {
  await migrate();
  const r = await getDb().query<{ label: string; value: string; created_at: string | Date }>(
    `SELECT label, value, created_at
       FROM kpi_values
      WHERE org_id = $1 AND value ~ $2
      ORDER BY label ASC, created_at ASC`,
    [orgId, NUMERIC_VALUE_REGEX]
  );
  const out = new Map<string, { values: number[]; timestamps: string[] }>();
  for (const row of r.rows) {
    const n = Number(row.value);
    if (!Number.isFinite(n)) continue;
    const entry = out.get(row.label) ?? { values: [], timestamps: [] };
    entry.values.push(n);
    entry.timestamps.push(
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
    );
    out.set(row.label, entry);
  }
  for (const [label, entry] of out) {
    if (entry.values.length > limitPerLabel) {
      out.set(label, {
        values: entry.values.slice(-limitPerLabel),
        timestamps: entry.timestamps.slice(-limitPerLabel),
      });
    }
  }
  return out;
}

export async function getKpiSeries(
  orgId: string,
  label: string,
  limit = 120
): Promise<KpiSeries> {
  await migrate();
  const r = await getDb().query<{ value: string; created_at: string | Date }>(
    `SELECT value, created_at
       FROM (
         SELECT id, value, created_at
           FROM kpi_values
          WHERE org_id = $1 AND label = $2
          ORDER BY created_at DESC, id DESC
          LIMIT $3
       ) recent
      ORDER BY created_at ASC, id ASC`,
    [orgId, label, limit]
  );
  const values: number[] = [];
  const timestamps: string[] = [];
  let excluded = 0;
  for (const row of r.rows) {
    const n = Number(row.value);
    if (!Number.isFinite(n)) {
      excluded++;
      continue;
    }
    values.push(n);
    timestamps.push(
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
    );
  }
  return {
    label,
    values,
    timestamps,
    numericPoints: values.length,
    excludedPoints: excluded,
  };
}
