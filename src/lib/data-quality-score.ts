/**
 * Veri kalitesi skoru — saf, deterministik. Girdi KPI gözlemleridir; dört
 * boyut hesaplanır: tamlık, geçerlilik, tekillik, tazelik. Sayı uydurulmaz;
 * her boyut yalnızca verilen satırlardan türetilir ve örneklem büyüklüğü
 * raporla birlikte döner.
 */

export type QualityDimension = "completeness" | "validity" | "uniqueness" | "freshness";

export interface QualityObservation {
  label: string;
  value: string | null;
  createdAt: string;
}

export interface DimensionScore {
  dimension: QualityDimension;
  /** 0..1 arası; örneklem yoksa null. */
  score: number | null;
  sample: number;
}

export interface DataQualityReport {
  dimensions: DimensionScore[];
  /** Boyutların eşit ağırlıklı ortalaması; hiç boyut yoksa null. */
  overall: number | null;
  worst: QualityDimension | null;
  total: number;
}

export interface QualityOptions {
  /** Tazelik eşiği: bu günden eski gözlem "bayat" sayılır. */
  maxAgeDays?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NUMERIC = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

export function scoreDataQuality(
  rows: QualityObservation[],
  now: Date,
  options: QualityOptions = {}
): DataQualityReport {
  const total = rows.length;
  const maxAgeDays = Math.min(3650, Math.max(1, Math.trunc(options.maxAgeDays ?? 30)));
  const nowMs = now.getTime();

  const nonEmpty = rows.filter((row) => (row.value ?? "").trim() !== "");
  const numeric = nonEmpty.filter((row) => NUMERIC.test(String(row.value).trim()));

  // Tekillik yalnızca dolu değerler üzerinde ölçülür; boşluk tamlığın konusudur.
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of nonEmpty) {
    const key = `${row.label}\u0000${row.createdAt}\u0000${String(row.value ?? "").trim()}`;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }

  let fresh = 0;
  let dated = 0;
  for (const row of rows) {
    const t = new Date(row.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    dated += 1;
    if (nowMs - t <= maxAgeDays * MS_PER_DAY) fresh += 1;
  }

  const dimensions: DimensionScore[] = [
    { dimension: "completeness", score: ratio(nonEmpty.length, total), sample: total },
    { dimension: "validity", score: ratio(numeric.length, nonEmpty.length), sample: nonEmpty.length },
    { dimension: "uniqueness", score: ratio(nonEmpty.length - duplicates, nonEmpty.length), sample: nonEmpty.length },
    { dimension: "freshness", score: ratio(fresh, dated), sample: dated },
  ];

  const scored = dimensions.filter((d) => d.score !== null);
  const overall = scored.length
    ? Math.round((scored.reduce((sum, d) => sum + (d.score ?? 0), 0) / scored.length) * 10000) / 10000
    : null;
  const worst = scored.length
    ? scored.reduce((min, d) => ((d.score ?? 0) < (min.score ?? 0) ? d : min)).dimension
    : null;

  return { dimensions, overall, worst, total };
}
