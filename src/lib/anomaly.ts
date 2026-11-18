/**
 * Erken uyarı — KPI serilerinde sağlam (robust) aykırı değer tespiti.
 *
 * Yöntem: her nokta, kendisinden önceki `window` gözlemin medyanına ve
 * medyan mutlak sapmasına (MAD) göre değerlendirilir. Skor = |x − medyan| /
 * (1.4826 × MAD). Eşik aşılırsa aykırı işaretlenir. Medyan/MAD, tek bir
 * aykırı değerden etkilenmediği için klasik z-skorundan daha dayanıklıdır.
 *
 * Sınırlar: Bu bir istatistiksel sinyaldir, nedensel teşhis değildir.
 * Seri kısaysa veya ölçek sıfırsa uyarı üretilmez; sonuçlar kanıt düzeyiyle
 * birlikte sunulur.
 */

export const ANOMALY_DEFAULT_WINDOW = 8;
export const ANOMALY_DEFAULT_THRESHOLD = 3.5;
export const ANOMALY_MIN_POINTS = ANOMALY_DEFAULT_WINDOW + 2;

export interface AnomalyPoint {
  index: number;
  value: number;
  baseline: number;
  scale: number;
  score: number;
  direction: "above" | "below";
  timestamp: string | null;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mad(values: number[], center: number): number {
  return median(values.map((v) => Math.abs(v - center)));
}

export interface DetectOptions {
  window?: number;
  threshold?: number;
  timestamps?: string[];
  maxResults?: number;
}

/**
 * Serideki aykırı noktaları döner (eskiden yeniye). Yetersiz veride boş dizi.
 */
export function detectAnomalies(series: number[], options: DetectOptions = {}): AnomalyPoint[] {
  const window = Math.max(3, Math.round(options.window ?? ANOMALY_DEFAULT_WINDOW));
  const threshold = options.threshold ?? ANOMALY_DEFAULT_THRESHOLD;
  const maxResults = options.maxResults ?? 20;
  if (series.length < window + 2) return [];

  const found: AnomalyPoint[] = [];
  for (let i = window; i < series.length; i++) {
    const x = series[i];
    if (!Number.isFinite(x)) continue;
    const baselineWindow = series.slice(i - window, i);
    const center = median(baselineWindow);
    let scale = 1.4826 * mad(baselineWindow, center);
    if (!(scale > 0)) {
      // MAD sıfırsa ortalama mutlak sapmaya düş; o da sıfırsa uyarı üretme.
      scale =
        baselineWindow.reduce((acc, v) => acc + Math.abs(v - center), 0) / baselineWindow.length;
    }
    if (!(scale > 0)) continue;
    const score = Math.abs(x - center) / scale;
    if (score >= threshold) {
      found.push({
        index: i,
        value: x,
        baseline: Math.round(center * 100) / 100,
        scale: Math.round(scale * 100) / 100,
        score: Math.round(score * 100) / 100,
        direction: x > center ? "above" : "below",
        timestamp: options.timestamps?.[i] ?? null,
      });
    }
  }
  return found.slice(-maxResults);
}
