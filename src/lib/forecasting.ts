/**
 * Tahmin motoru — zaman serisi için deterministik, geriye dönük test edilmiş
 * modeller. Dil modeli sayı üretmez; her tahmin modeli, hata metriği ve
 * belirsizlik aralığıyla birlikte döner.
 *
 * Modeller: naive (son değer), üstel düzeltme (SES, ızgara ile seçilen alpha),
 * doğrusal trend (en küçük kareler). Model seçimi tek adımlı geriye dönük
 * testte en düşük MAE'ye göre yapılır. Aralıklar artık hataların ampirik
 * yüzdeliklerinden türetilir; ufukla birlikte √h ölçeğinde genişler.
 *
 * Bu, kanıtlanmış bir istatistiksel garanti değil, açıkça sınırları belirtilen
 * bir yaklaşımdır. Yetersiz veride tahmin üretilmez.
 */

export const MIN_FORECAST_POINTS = 6;
export const MAX_FORECAST_HORIZON = 12;
export const SES_ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;

export type ForecastModelId = "naive" | "ses" | "linear-trend";

export interface BacktestMetrics {
  model: ForecastModelId;
  mae: number;
  rmse: number;
  mape: number | null;
  points: number;
  params: Record<string, number>;
}

export interface ForecastPoint {
  step: number;
  value: number;
  p10: number;
  p90: number;
}

export interface ForecastResult {
  model: ForecastModelId;
  params: Record<string, number>;
  horizon: number;
  points: ForecastPoint[];
  backtest: BacktestMetrics[];
  selectedMae: number;
  evidence: "low" | "medium" | "high";
  note: string;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Tek adımlı tahmin üreticileri: geçmiş seriden bir sonraki değeri tahmin eder. */
function predictNext(series: number[], model: ForecastModelId, alpha = 0.3): number {
  if (series.length === 0) return 0;
  if (model === "naive") return series[series.length - 1];
  if (model === "ses") {
    let level = series[0];
    for (let i = 1; i < series.length; i++) {
      level = alpha * series[i] + (1 - alpha) * level;
    }
    return level;
  }
  // linear-trend
  const n = series.length;
  if (n < 2) return series[0];
  const xMean = (n - 1) / 2;
  const yMean = mean(series);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return intercept + slope * n;
}

function errorsFor(
  series: number[],
  model: ForecastModelId,
  alpha: number,
  minTrain = 3
): number[] {
  const errors: number[] = [];
  for (let t = minTrain; t < series.length; t++) {
    const pred = predictNext(series.slice(0, t), model, alpha);
    errors.push(series[t] - pred);
  }
  return errors;
}

function metricsFrom(
  series: number[],
  errors: number[],
  model: ForecastModelId,
  params: Record<string, number>
): BacktestMetrics {
  const abs = errors.map((e) => Math.abs(e));
  const mae = mean(abs);
  const rmse = Math.sqrt(mean(errors.map((e) => e * e)));
  const pct: number[] = [];
  for (let i = 0; i < errors.length; i++) {
    const actual = series[3 + i];
    if (actual !== undefined && actual !== 0) {
      pct.push(Math.abs(errors[i] / actual));
    }
  }
  return {
    model,
    mae: round2(mae),
    rmse: round2(rmse),
    mape: pct.length > 0 ? round2(mean(pct)) : null,
    points: errors.length,
    params,
  };
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Seriyi geriye dönük test eder ve en düşük MAE'li modeli seçer.
 * Yetersiz veride `null` döner — tahmin uydurulmaz.
 */
export function forecastSeries(series: number[], horizon = 1): ForecastResult | null {
  const clean = series.filter((x) => Number.isFinite(x));
  if (clean.length < MIN_FORECAST_POINTS) return null;
  const h = Math.min(MAX_FORECAST_HORIZON, Math.max(1, Math.round(horizon)));

  const candidates: BacktestMetrics[] = [];
  for (const model of ["naive", "linear-trend"] as const) {
    candidates.push(metricsFrom(clean, errorsFor(clean, model, 0), model, {}));
  }
  let bestSes: BacktestMetrics | null = null;
  for (const alpha of SES_ALPHAS) {
    const m = metricsFrom(clean, errorsFor(clean, "ses", alpha), "ses", { alpha });
    if (!bestSes || m.mae < bestSes.mae) bestSes = m;
  }
  if (bestSes) candidates.push(bestSes);

  candidates.sort((a, b) => a.mae - b.mae || a.rmse - b.rmse);
  const selected = candidates[0];
  const alpha = selected.model === "ses" ? selected.params.alpha ?? 0.3 : 0;
  const residuals = errorsFor(clean, selected.model, alpha);
  const residualBias = mean(residuals);
  const centeredResiduals = residuals.map((error) => error - residualBias).sort((a, b) => a - b);
  const q10 = quantile(centeredResiduals, 0.1);
  const q90 = quantile(centeredResiduals, 0.9);

  // Çok adımlı tahmin: seçilen modelin yapısına göre özyinelemeli.
  const points: ForecastPoint[] = [];
  if (selected.model === "linear-trend") {
    const n = clean.length;
    const xMean = (n - 1) / 2;
    const yMean = mean(clean);
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (clean[i] - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    for (let step = 1; step <= h; step++) {
      const v = intercept + slope * (n - 1 + step) + residualBias;
      const scale = Math.sqrt(step);
      points.push({
        step,
        value: round2(v),
        p10: round2(v + q10 * scale),
        p90: round2(v + q90 * scale),
      });
    }
  } else {
    const v = predictNext(clean, selected.model, alpha) + residualBias;
    for (let step = 1; step <= h; step++) {
      const scale = Math.sqrt(step);
      points.push({
        step,
        value: round2(v),
        p10: round2(v + q10 * scale),
        p90: round2(v + q90 * scale),
      });
    }
  }

  const evidence: ForecastResult["evidence"] =
    selected.mape !== null && selected.mape < 0.1 && clean.length >= 12
      ? "high"
      : selected.mape !== null && selected.mape < 0.25 && clean.length >= 8
        ? "medium"
        : "low";

  return {
    model: selected.model,
    params: selected.params,
    horizon: h,
    points,
    backtest: candidates.map((c) => ({
      ...c,
      model: c.model,
    })),
    selectedMae: selected.mae,
    evidence,
    note:
      "Modeller tek adımlı geriye dönük testte MAE ile karşılaştırıldı; merkez tahmin geriye dönük hata " +
      "ortalamasıyla düzeltilir, aralıklar merkezlenmiş hataların P10–P90 yüzdeliklerinden türetilir ve " +
      "ufukla √h ölçeğinde genişler. Bu bir istatistiksel garanti değildir.",
  };
}
