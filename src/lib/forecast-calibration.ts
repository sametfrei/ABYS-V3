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

export const INTERVAL_TARGET_COVERAGE = 0.8;
export const MIN_CALIBRATION_EVALUATIONS = 5;

export interface IntervalAdjustment {
  status: "insufficient_evidence" | "applied";
  evaluated: number;
  observedHitRate: number | null;
  targetCoverage: number;
  /** P10–P90 yarı genişliğine uygulanacak çarpan (0.5–3). */
  factor: number;
  note: string;
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

/**
 * Geçmişte ölçülen aralık kapsamasını hedefe (%80) göre ayarlar.
 *
 * Az değerlendirme varsa (n < 5) ayar üretilmez. Çarpan, hedef kapsamanın
 * gözlenen kapsamaya oranıdır; [0.5, 3] aralığına sıkıştırılır ki tek bir
 * dönem tüm aralıkları sıfıra indirmesin. Bu bir olasılık modeli değil,
 * ampirik kapsama düzeltmesidir.
 */
export function computeIntervalAdjustment(
  evaluations: ForecastSnapshotEvaluation[]
): IntervalAdjustment {
  const evaluated = evaluations.filter((item) => item.status === "evaluated");
  if (evaluated.length < MIN_CALIBRATION_EVALUATIONS) {
    return {
      status: "insufficient_evidence",
      evaluated: evaluated.length,
      observedHitRate: null,
      targetCoverage: INTERVAL_TARGET_COVERAGE,
      factor: 1,
      note:
        `Aralık kalibrasyonu için en az ${MIN_CALIBRATION_EVALUATIONS} ölçülmüş tahmin gerekir; ` +
        `şu an ${evaluated.length}. Aralıklar modelin geriye dönük hatalarından geliyor.`,
    };
  }
  const hits = evaluated.filter((item) => item.insideRange === true).length;
  const observed = hits / evaluated.length;
  const raw = observed === 0 ? 3 : INTERVAL_TARGET_COVERAGE / observed;
  const factor = Math.round(Math.min(3, Math.max(0.5, raw)) * 100) / 100;
  return {
    status: "applied",
    evaluated: evaluated.length,
    observedHitRate: Math.round(observed * 1000) / 1000,
    targetCoverage: INTERVAL_TARGET_COVERAGE,
    factor,
    note:
      `Geçmiş ${evaluated.length} ölçümde aralık kapsaması %${Math.round(observed * 100)}; ` +
      `hedef %${Math.round(INTERVAL_TARGET_COVERAGE * 100)}. P10–P90 yarı genişliği ${factor}× ` +
      `ölçeklendi (0,5–3 sınırları içinde). Ampirik düzeltmedir, olasılık garantisi değildir.`,
  };
}

/** Tahmin noktalarının aralıklarını merkez değer etrafında ölçekler. */
export function applyIntervalAdjustment<
  T extends { value: number; p10: number; p90: number },
>(points: T[], factor: number): T[] {
  if (factor === 1) return points;
  return points.map((point) => ({
    ...point,
    p10: Math.round((point.value + (point.p10 - point.value) * factor) * 100) / 100,
    p90: Math.round((point.value + (point.p90 - point.value) * factor) * 100) / 100,
  }));
}
