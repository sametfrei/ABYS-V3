"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

interface LabelRow {
  label: string;
  numericPoints: number;
  totalPoints: number;
  lastAt: string | null;
  forecastable: boolean;
}

interface ForecastPoint {
  step: number;
  value: number;
  p10: number;
  p90: number;
}

interface BacktestRow {
  model: string;
  mae: number;
  rmse: number;
  mape: number | null;
  points: number;
  params: Record<string, number>;
}

interface AnomalySummary {
  label: string;
  points: number;
  anomalies: { score: number; direction: "above" | "below"; timestamp: string | null }[];
}

interface ForecastData {
  label: string;
  history: { values: number[]; timestamps: string[] };
  forecast: {
    model: string;
    horizon: number;
    points: ForecastPoint[];
    backtest: BacktestRow[];
    selectedMae: number;
    evidence: "low" | "medium" | "high";
    note: string;
  } | null;
  insufficientData: boolean;
  minRequired: number;
  provenance: {
    numericPoints: number;
    excludedPoints: number;
    lastAt: string | null;
    engine: string;
    assumptions: string[];
  };
}

const EVIDENCE_LABEL: Record<string, string> = {
  high: "Yüksek kanıt",
  medium: "Orta kanıt",
  low: "Düşük kanıt",
};

const MODEL_LABEL: Record<string, string> = {
  naive: "Naif (son değer)",
  ses: "Üstel düzeltme (SES)",
  "linear-trend": "Doğrusal trend",
};

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

/** Basit tarih serisi grafiği — geçmiş + tahmin aralığı. */
function SeriesChart({ history, points }: { history: number[]; points: ForecastPoint[] }) {
  const all = [
    ...history,
    ...points.flatMap((p) => [p.p10, p.p90]),
  ];
  if (all.length === 0) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max > min ? max - min : 1;
  const width = 640;
  const height = 160;
  const pad = 8;
  const total = history.length + points.length;
  const x = (i: number) => pad + ((width - pad * 2) * i) / Math.max(1, total - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const histPath = history.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const offset = history.length;
  const forecastLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(offset + i)},${y(p.value)}`).join(" ");
  const band =
    points.length > 0
      ? [
          ...points.map((p, i) => `${i === 0 ? "M" : "L"}${x(offset + i)},${y(p.p90)}`),
          ...[...points].reverse().map((p, i) => `L${x(offset + points.length - 1 - i)},${y(p.p10)}`),
          "Z",
        ].join(" ")
      : "";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" role="img" aria-label="Geçmiş ve tahmin grafiği">
      {band && <path d={band} className="fill-abys-accent/15" />}
      <path d={histPath} fill="none" className="stroke-abys-navy" strokeWidth={2} />
      {points.length > 0 && (
        <path d={forecastLine} fill="none" className="stroke-abys-accent" strokeWidth={2} strokeDasharray="6 4" />
      )}
    </svg>
  );
}

export default function ForecastPage() {
  const [labels, setLabels] = useState<LabelRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<ForecastData | null>(null);
  const [alerts, setAlerts] = useState<AnomalySummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/forecast", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "Bu sayfayı görme yetkiniz yok." : `KPI listesi yüklenemedi (HTTP ${res.status}).`);
        const body = (await res.json()) as { labels: LabelRow[] };
        if (!cancelled) setLabels(body.labels);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Yükleme başarısız.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/anomalies", { cache: "no-store" })
      .then(async (res) =>
        res.ok ? (((await res.json()) as { results: AnomalySummary[] }).results ?? []) : []
      )
      .then((results) => {
        if (!cancelled) setAlerts(results);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(label: string) {
    setSelected(label);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/forecast?label=${encodeURIComponent(label)}&horizon=3`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Tahmin yüklenemedi (HTTP ${res.status}).`);
      setData(body as ForecastData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tahmin yüklenemedi.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="TAHMİN"
        title="Gelecek tek bir sayı"
        accent="değildir"
        desc="KPI geçmişinden geriye dönük test edilmiş tahminler. Model karşılaştırması, hata metrikleri ve olasılık aralığı birlikte sunulur; yetersiz veride tahmin üretilmez."
      />

      <div className="px-10 pb-16 max-w-4xl space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}

        {labels === null && !error && <p className="text-sm text-abys-muted">Yükleniyor…</p>}

        {labels && labels.length === 0 && (
          <p className="text-sm text-abys-muted">
            Henüz KPI serisi bulunmuyor.{" "}
            <Link href="/dashboard/kpi" className="text-abys-accent hover:underline">
              KPI Verisi
            </Link>{" "}
            ekranından metriği ve geçmiş değerleri ekleyin; tahmin burada otomatik görünür.
          </p>
        )}

        {labels && labels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => (
              <button
                key={l.label}
                onClick={() => pick(l.label)}
                className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                  selected === l.label
                    ? "bg-abys-navy text-white border-abys-navy"
                    : "border-abys-ink/15 text-abys-ink hover:bg-white/60"
                }`}
              >
                {l.label}
                <span className="ml-2 text-[11px] opacity-70">{l.numericPoints} sayısal</span>
              </button>
            ))}
          </div>
        )}

        {alerts && alerts.length > 0 && (
          <div className="rounded-xl border border-abys-critical/30 bg-abys-critical-soft px-4 py-3">
            <p className="text-xs tracking-widest text-abys-critical font-semibold mb-1">
              ERKEN UYARI — {alerts.length} SERİDE SAPMA
            </p>
            <ul className="space-y-0.5">
              {alerts.map((a) => {
                const last = a.anomalies[a.anomalies.length - 1];
                return (
                  <li key={a.label} className="text-xs text-abys-ink">
                    <span className="font-medium">{a.label}</span> · skor {last.score} (
                    {last.direction === "above" ? "üst" : "alt"}) ·{" "}
                    {last.timestamp ? new Date(last.timestamp).toLocaleDateString("tr-TR") : "—"}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-abys-muted mt-1">
              Median/MAD tabanlı istatistiksel sinyal; nedensellik iddiası değildir.
            </p>
          </div>
        )}

        {loading && <p className="text-sm text-abys-muted" role="status">Hesaplanıyor…</p>}

        {data && !loading && (
          <div className="space-y-4">
            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-abys-ink">{data.label}</p>
                {data.forecast && (
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-abys-muted">
                    {EVIDENCE_LABEL[data.forecast.evidence]} · MAE {fmt(data.forecast.selectedMae)}
                  </span>
                )}
              </div>

              {data.insufficientData || !data.forecast ? (
                <p className="text-sm text-abys-muted">
                  Tahmin için en az {data.minRequired} sayısal gözlem gerekir. Mevcut:{" "}
                  {data.provenance.numericPoints}.{" "}
                  <Link href="/dashboard/kpi" className="text-abys-accent hover:underline">
                    Eksik geçmişi ekle →
                  </Link>
                </p>
              ) : (
                <>
                  <SeriesChart history={data.history.values} points={data.forecast.points} />
                  <p className="text-xs text-abys-muted mt-1">
                    Seçilen model: <span className="text-abys-ink">{MODEL_LABEL[data.forecast.model] ?? data.forecast.model}</span>
                    {data.forecast.model === "ses" && ` (α=${data.forecast.backtest.find((b) => b.model === "ses")?.params.alpha ?? "-"})`}
                  </p>

                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {data.forecast.points.map((p) => (
                      <div key={p.step} className="rounded-lg bg-white/70 px-3 py-2">
                        <p className="text-[11px] text-abys-muted">+{p.step} dönem</p>
                        <p className="font-mono text-lg text-abys-navy">{fmt(p.value)}</p>
                        <p className="text-[11px] text-abys-muted">
                          {fmt(p.p10)} – {fmt(p.p90)}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {data.forecast && (
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">MODEL KARŞILAŞTIRMASI — GERİYE DÖNÜK TEST</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-abys-muted">
                      <th className="py-1 font-medium">Model</th>
                      <th className="py-1 font-medium">MAE</th>
                      <th className="py-1 font-medium">RMSE</th>
                      <th className="py-1 font-medium">MAPE</th>
                      <th className="py-1 font-medium">Nokta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.forecast.backtest.map((b) => (
                      <tr key={b.model} className={b.model === data.forecast?.model ? "text-abys-navy font-medium" : "text-abys-ink"}>
                        <td className="py-1">{MODEL_LABEL[b.model] ?? b.model}</td>
                        <td className="py-1 font-mono">{fmt(b.mae)}</td>
                        <td className="py-1 font-mono">{fmt(b.rmse)}</td>
                        <td className="py-1 font-mono">{b.mape === null ? "—" : `${Math.round(b.mape * 100)}%`}</td>
                        <td className="py-1 font-mono">{b.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-abys-muted mt-3">{data.forecast.note}</p>
              </div>
            )}

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 text-xs text-abys-muted space-y-1">
              <p className="text-[11px] tracking-widest font-semibold">HESAP KAYNAĞI</p>
              <p>Motor: {data.provenance.engine}</p>
              <p>
                Kullanılan gözlem: {data.provenance.numericPoints} · dışlanan (sayısal olmayan): {data.provenance.excludedPoints}
              </p>
              <p>Son gözlem: {data.provenance.lastAt ? new Date(data.provenance.lastAt).toLocaleString("tr-TR") : "—"}</p>
              <ul className="space-y-0.5 pt-1">
                {data.provenance.assumptions.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
