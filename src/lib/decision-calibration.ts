import type { ConfidenceBucketSummary } from "./decision-economics";

/**
 * Kapalı döngü kalibrasyon — gerçekleşen karar sonuçlarını, sistemin ilan
 * ettiği güven düzeyine geri besler.
 *
 * Bu modül istatistiksel bir garanti üretmez. Yalnızca kendi kayıtlı
 * sonuçlarımızdan gözlenen iyileşme oranını, ilan edilen güven aralığıyla
 * karşılaştırır ve yeterli örnek varsa sönümlemeli bir düzeltme önerir.
 * Sönümleme: (n·gözlem + k·ilan) / (n + k); k = önceki örnek ağırlığı.
 */

export const MIN_CALIBRATION_SAMPLES = 5;
export const CALIBRATION_PRIOR_SAMPLES = 5;
export const CALIBRATION_ALIGNMENT_TOLERANCE = 0.1;

export type CalibrationDirection = "overconfident" | "aligned" | "underconfident";

export interface CalibrationBucket {
  key: string;
  label: string;
  min: number;
  max: number;
  /** Aralığın orta noktası — ilan edilen güvenin temsil değeri. */
  statedConfidence: number;
  withOutcome: number;
  improvedRate: number | null;
  rangeHitRate: number | null;
  status: "measured" | "insufficient_evidence";
  /** Gözlenen iyileşme oranı − ilan edilen güven (0–1 ölçeği). */
  gap: number | null;
  direction: CalibrationDirection | null;
  /** Sönümlemeli, 0–100 aralığına sıkıştırılmış düzeltilmiş güven. */
  adjustedConfidence: number | null;
  samplesNeeded: number;
}

export interface DecisionCalibration {
  status: "measured" | "partial" | "insufficient_evidence";
  totalWithOutcome: number;
  threshold: number;
  buckets: CalibrationBucket[];
  note: string;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function directionOf(gap: number): CalibrationDirection {
  if (gap > CALIBRATION_ALIGNMENT_TOLERANCE) return "underconfident";
  if (gap < -CALIBRATION_ALIGNMENT_TOLERANCE) return "overconfident";
  return "aligned";
}

/**
 * Güven kovalarını (bkz. summarizeDecisionLearning) kalibrasyon profiline
 * çevirir. Yetersiz örnekte düzeltme üretilmez; `null` döner.
 */
export function buildDecisionCalibration(
  buckets: ConfidenceBucketSummary[]
): DecisionCalibration {
  const mapped: CalibrationBucket[] = buckets.map((bucket) => {
    const statedConfidence = clampPercent((bucket.min + bucket.max) / 2);
    const measured = bucket.withOutcome >= MIN_CALIBRATION_SAMPLES && bucket.improvedRate !== null;
    if (!measured || bucket.improvedRate === null) {
      return {
        key: bucket.key,
        label: bucket.label,
        min: bucket.min,
        max: bucket.max,
        statedConfidence,
        withOutcome: bucket.withOutcome,
        improvedRate: bucket.improvedRate,
        rangeHitRate: bucket.rangeHitRate,
        status: "insufficient_evidence",
        gap: null,
        direction: null,
        adjustedConfidence: null,
        samplesNeeded: Math.max(0, MIN_CALIBRATION_SAMPLES - bucket.withOutcome),
      };
    }
    const empirical = bucket.improvedRate;
    const gap = empirical - statedConfidence / 100;
    const n = bucket.withOutcome;
    const adjusted =
      (n * empirical * 100 + CALIBRATION_PRIOR_SAMPLES * statedConfidence) /
      (n + CALIBRATION_PRIOR_SAMPLES);
    return {
      key: bucket.key,
      label: bucket.label,
      min: bucket.min,
      max: bucket.max,
      statedConfidence,
      withOutcome: bucket.withOutcome,
      improvedRate: empirical,
      rangeHitRate: bucket.rangeHitRate,
      status: "measured",
      gap,
      direction: directionOf(gap),
      adjustedConfidence: clampPercent(adjusted),
      samplesNeeded: 0,
    };
  });

  const measuredCount = mapped.filter((bucket) => bucket.status === "measured").length;
  const totalWithOutcome = mapped.reduce((sum, bucket) => sum + bucket.withOutcome, 0);
  const status: DecisionCalibration["status"] =
    measuredCount === 0 ? "insufficient_evidence" : measuredCount === mapped.length ? "measured" : "partial";

  return {
    status,
    totalWithOutcome,
    threshold: MIN_CALIBRATION_SAMPLES,
    buckets: mapped,
    note:
      "Kalibrasyon yalnızca kendi kayıtlı sonuçlarımızdan türetilir: her güven kovasında gözlenen " +
      `iyileşme oranı, ilan edilen güvenle karşılaştırılır; en az ${MIN_CALIBRATION_SAMPLES} sonuç ` +
      `yoksa düzeltme üretilmez. Düzeltilmiş güven, örnek sayısı ağırlıklı sönümlemedir (önceki ağırlık ` +
      `${CALIBRATION_PRIOR_SAMPLES}). Bu bir istatistiksel garanti değildir.`,
  };
}

/** Verilen güven yüzdesinin düştüğü kalibrasyon kovasını döndürür. */
export function calibrationForConfidence(
  confidence: number,
  calibration: DecisionCalibration
): CalibrationBucket | null {
  if (!Number.isFinite(confidence)) return null;
  const value = Math.max(0, Math.min(100, confidence));
  return (
    calibration.buckets.find((bucket) => value >= bucket.min && value <= bucket.max) ?? null
  );
}
