/**
 * Tahmin kalibrasyonu — kaydedilmiş bir tahmin anlık görüntüsünü, sonradan
 * gelen gerçek KPI gözlemiyle karşılaştırır.
 *
 * Yalnızca ilk adım (horizon +1) ölçülür: anlık görüntüden sonraki ilk
 * sayısal gözlem gerçek değer sayılır. Aralık isabeti P10–P90 kapsamasıdır;
 * kapsamama "ıska" olarak raporlanır. Hiçbir sayı üretilmez.
 */

export interface ForecastSnapshotLike {
  p10: number;
  p50: number;
  p90: number;
}

export type ForecastSnapshotStatus = "pending" | "evaluated";

export interface ForecastSnapshotEvaluation {
  status: ForecastSnapshotStatus;
  actual: number | null;
  insideRange: boolean | null;
  absError: number | null;
  rangeWidth: number;
}

export interface ForecastCalibrationSummary {
  total: number;
  evaluated: number;
  pending: number;
  hits: number;
  misses: number;
  hitRate: number | null;
  meanAbsError: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** İlk sonraki gözlemle karşılaştırır; gözlem yoksa pending döner. */
export function evaluateForecastSnapshot(
  snapshot: ForecastSnapshotLike,
  nextActual: number | null
): ForecastSnapshotEvaluation {
  const low = Math.min(snapshot.p10, snapshot.p90);
  const high = Math.max(snapshot.p10, snapshot.p90);
  const rangeWidth = round2(high - low);
  if (nextActual === null || !Number.isFinite(nextActual)) {
    return { status: "pending", actual: null, insideRange: null, absError: null, rangeWidth };
  }
  return {
    status: "evaluated",
    actual: round2(nextActual),
    insideRange: nextActual >= low && nextActual <= high,
    absError: round2(Math.abs(nextActual - snapshot.p50)),
    rangeWidth,
  };
}

export function summarizeForecastCalibration(
  evaluations: ForecastSnapshotEvaluation[]
): ForecastCalibrationSummary {
  const evaluated = evaluations.filter((item) => item.status === "evaluated");
  const hits = evaluated.filter((item) => item.insideRange === true).length;
  const misses = evaluated.filter((item) => item.insideRange === false).length;
  const errors = evaluated
    .map((item) => item.absError)
    .filter((value): value is number => value !== null);
  return {
    total: evaluations.length,
    evaluated: evaluated.length,
    pending: evaluations.length - evaluated.length,
    hits,
    misses,
    hitRate: evaluated.length === 0 ? null : hits / evaluated.length,
    meanAbsError: errors.length === 0 ? null : round2(errors.reduce((a, b) => a + b, 0) / errors.length),
  };
}
