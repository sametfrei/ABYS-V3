import type { ScenarioTemplate } from "./scenario-engine";

/**
 * Belirsizlik simülasyonu — senaryo motorunun olasılıksal katmanı.
 *
 * TEMEL KURAL: Sonuçlar tohumlanmış (seeded) deterministik PRNG ile üretilir;
 * aynı girdi + aynı tohum her zaman aynı dağılımı verir. Dil modeli sayı
 * üretmez. Her dağılım kullandığı varsayımları (her değişkenin alt/mod/üst
 * değeri) ve motor kimliğini yanında taşır.
 *
 * Bu katman tek bir kesin tahmin sunmaz: P10/P50/P90 aralığı, ortalama,
 * standart sapma ve taban değerin aşılma olasılığını birlikte verir.
 */

export const SIMULATION_DEFAULT_SEED = 20260101;
export const SIMULATION_DEFAULT_SAMPLES = 4000;
export const SIMULATION_MIN_SAMPLES = 200;
export const SIMULATION_MAX_SAMPLES = 20000;

export interface VariableAssumption {
  id: string;
  label: string;
  unit: string;
  low: number;
  mode: number;
  high: number;
}

export interface SimulationDistribution {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface SimulationHistogramBucket {
  from: number;
  to: number;
  count: number;
}

export interface SimulationResult {
  samples: number;
  seed: number;
  engine: string;
  metric: { label: string; unit: string };
  distribution: SimulationDistribution;
  baseValue: number;
  /** Örneklerin taban değeri aşma oranı (0..1). */
  probabilityAboveBase: number;
  /** Örneklerin taban değerin %20 üzerini aşma oranı (0..1). */
  probabilityAboveBase20: number;
  assumptions: VariableAssumption[];
  histogram: SimulationHistogramBucket[];
  note: string;
}

/** Deterministik PRNG (mulberry32). Aynı tohum → aynı dizi. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Üçgensel dağılımdan ters-CDF ile örnekleme. */
export function sampleTriangular(
  u: number,
  low: number,
  mode: number,
  high: number
): number {
  if (!(high > low)) return low;
  const c = Math.min(high, Math.max(low, mode));
  const f = (c - low) / (high - low);
  if (u < f) {
    return low + Math.sqrt(Math.max(0, u * (high - low) * (c - low)));
  }
  return high - Math.sqrt(Math.max(0, (1 - u) * (high - low) * (high - c)));
}

/** Doğrusal interpolasyonlu yüzdelik (0..1). Girdi sıralı olmalıdır. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.min(1, Math.max(0, p));
  const idx = clamped * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function clampSamples(value: number | undefined): number {
  if (!Number.isFinite(value)) return SIMULATION_DEFAULT_SAMPLES;
  const n = Math.round(value as number);
  return Math.min(SIMULATION_MAX_SAMPLES, Math.max(SIMULATION_MIN_SAMPLES, n));
}

function buildAssumptions(template: ScenarioTemplate, inputs: Record<string, number>): VariableAssumption[] {
  return template.variables.map((v) => {
    const mode = Math.max(v.min, Math.min(v.max, inputs[v.id] ?? v.value));
    // Varsayım: her değişken mod değerinin ±%15/%25 bandında üçgensel dağılır.
    // Bant şablonun kendi min/max sınırlarıyla kırpılır; gizli varsayım yok.
    const rawLow = mode * 0.85;
    const rawHigh = mode === 0 ? Math.max(v.step * 2, v.min) : mode * 1.25;
    const low = Math.max(v.min, Math.min(v.max, rawLow));
    const high = Math.max(low, Math.min(v.max, rawHigh));
    return { id: v.id, label: v.label, unit: v.unit, low, mode, high };
  });
}

/**
 * Şablonun son çıktısını (toplam/ana metrik) belirsizlik altında simüle eder.
 * `inputs` çağıran tarafından şablon sınırlarına kırpılmış olmalıdır.
 */
export function runMonteCarlo(
  template: ScenarioTemplate,
  inputs: Record<string, number>,
  options: { samples?: number; seed?: number } = {}
): SimulationResult {
  const samples = clampSamples(options.samples);
  const seed = Number.isFinite(options.seed) ? (options.seed as number) >>> 0 : SIMULATION_DEFAULT_SEED;
  const assumptions = buildAssumptions(template, inputs);

  const baseInputs: Record<string, number> = {};
  for (const a of assumptions) baseInputs[a.id] = a.mode;
  const baseResults = template.compute(baseInputs);
  const baseMetric = baseResults[baseResults.length - 1] ?? { label: "Toplam", value: 0, unit: "" };

  const rng = mulberry32(seed);
  const totals: number[] = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const draw: Record<string, number> = {};
    for (const a of assumptions) {
      draw[a.id] = sampleTriangular(rng(), a.low, a.mode, a.high);
    }
    const results = template.compute(draw);
    totals[i] = results[results.length - 1]?.value ?? 0;
  }

  const sorted = [...totals].sort((x, y) => x - y);
  const sum = totals.reduce((acc, x) => acc + x, 0);
  const mean = sum / samples;
  const variance = totals.reduce((acc, x) => acc + (x - mean) ** 2, 0) / samples;
  const threshold20 = baseMetric.value * 1.2;
  let above = 0;
  let above20 = 0;
  for (const x of totals) {
    if (x > baseMetric.value) above++;
    if (x > threshold20) above20++;
  }

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const bucketCount = 10;
  const width = max > min ? (max - min) / bucketCount : 0;
  const histogram: SimulationHistogramBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    from: min + width * i,
    to: i === bucketCount - 1 ? max : min + width * (i + 1),
    count: 0,
  }));
  if (width === 0) {
    histogram.length = 1;
    histogram[0] = { from: min, to: max, count: samples };
  } else {
    for (const x of totals) {
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((x - min) / width)));
      histogram[idx].count++;
    }
  }

  return {
    samples,
    seed,
    engine: "monte-carlo/triangular (scenario-simulation.ts)",
    metric: { label: baseMetric.label, unit: baseMetric.unit },
    distribution: {
      p10: Math.round(percentile(sorted, 0.1)),
      p50: Math.round(percentile(sorted, 0.5)),
      p90: Math.round(percentile(sorted, 0.9)),
      mean: Math.round(mean),
      stdDev: Math.round(Math.sqrt(variance)),
      min: Math.round(min),
      max: Math.round(max),
    },
    baseValue: Math.round(baseMetric.value),
    probabilityAboveBase: Math.round((above / samples) * 1000) / 1000,
    probabilityAboveBase20: Math.round((above20 / samples) * 1000) / 1000,
    assumptions,
    histogram,
    note: "Tohumlanmış PRNG; aynı girdi ve tohum aynı dağılımı verir. Dağılım varsayımları şablon sınırlarıyla kırpılmıştır.",
  };
}
