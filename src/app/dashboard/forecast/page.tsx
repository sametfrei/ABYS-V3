"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportLink } from "@/components/ExportLink";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

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
  intervalAdjustment?: {
    status: "insufficient_evidence" | "applied";
    evaluated: number;
    observedHitRate: number | null;
    targetCoverage: number;
    factor: number;
    note: string;
  };
  adjustedPoints?: ForecastPoint[] | null;
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

const EVIDENCE_LABEL: Record<string, ShellKey> = {
  high: "forecast.evidenceHigh",
  medium: "forecast.evidenceMedium",
  low: "forecast.evidenceLow",
};

const MODEL_LABEL: Record<string, ShellKey> = {
  naive: "forecast.modelNaive",
  ses: "forecast.modelSes",
  "linear-trend": "forecast.modelLinearTrend",
};

function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
}

function formatMessage(
  locale: Locale,
  key: ShellKey,
  values: Record<string, string | number>
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    t(locale, key)
  );
}

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function formatObservationTime(value: string | null, locale: Locale): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(locale);
}

function ForecastEvidencePanel({ data }: { data: ForecastData }) {
  const locale = useLocale();
  const forecast = data.forecast;
  const firstPoint = forecast?.points[0];
  const evidenceLabel = forecast
    ? EVIDENCE_LABEL[forecast.evidence]
      ? t(locale, EVIDENCE_LABEL[forecast.evidence])
      : t(locale, "forecast.evidenceUnknown")
    : null;
  const hasMae = forecast !== null && Number.isFinite(forecast.selectedMae);
  const observationTime = formatObservationTime(data.provenance.lastAt, locale);
  const hasRange = Boolean(firstPoint && Number.isFinite(firstPoint.p10) && Number.isFinite(firstPoint.p90));
  const assumptions = data.provenance.assumptions ?? [];

  return (
    <section aria-labelledby="forecast-evidence-heading" className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <h2 id="forecast-evidence-heading" className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
        {t(locale, "forecast.evidenceHeading").toLocaleUpperCase(locale)}
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-white/70 px-3 py-2">
          <dt className="text-[10px] tracking-wide text-abys-muted uppercase">
            {t(locale, "forecast.evidenceLevel")}
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-abys-ink">
            {evidenceLabel ?? t(locale, "forecast.missingInResponse")}
          </dd>
          <dd className="mt-0.5 text-[11px] text-abys-muted">
            {forecast && hasMae
              ? formatMessage(locale, "forecast.backtestMae", { mae: fmt(forecast.selectedMae) })
              : t(locale, "forecast.maeMissing")}
          </dd>
        </div>
        <div className="rounded-lg bg-white/70 px-3 py-2">
          <dt className="text-[10px] tracking-wide text-abys-muted uppercase">
            {t(locale, "forecast.dataFreshness")}
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-abys-ink">
            {observationTime ?? t(locale, "forecast.missingInResponse")}
          </dd>
          <dd className="mt-0.5 text-[11px] text-abys-muted">
            {observationTime
              ? t(locale, "forecast.lastObservationTime")
              : t(locale, "forecast.lastObservationMissing")}
          </dd>
        </div>
        <div className="rounded-lg bg-white/70 px-3 py-2">
          <dt className="text-[10px] tracking-wide text-abys-muted uppercase">
            {t(locale, "forecast.uncertaintyRange")}
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-abys-ink">
            {firstPoint && hasRange
              ? `${fmt(firstPoint.p10)} – ${fmt(firstPoint.p90)}`
              : t(locale, "forecast.missingInResponse")}
          </dd>
          <dd className="mt-0.5 text-[11px] text-abys-muted">
            {firstPoint && hasRange
              ? t(locale, "forecast.firstPeriodP10P90")
              : t(locale, "forecast.p10P90Missing")}
          </dd>
        </div>
      </dl>
      {!forecast && (
        <p className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-abys-muted">
          {t(locale, "forecast.insufficientEvidenceBody")}
        </p>
      )}
      <div className="mt-4 pt-3 border-t border-abys-cream-border">
        <p className="text-[10px] tracking-wide text-abys-muted font-semibold uppercase mb-1">
          {t(locale, "forecast.assumptionsHeading")}
        </p>
        {assumptions.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-abys-muted">
            {assumptions.map((assumption, index) => (
              <li key={index}>• {assumption}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-abys-muted">{t(locale, "forecast.noAssumptions")}</p>
        )}
      </div>
    </section>
  );
}

/** Basit tarih serisi grafiği — geçmiş + tahmin aralığı. */
function SeriesChart({ history, points }: { history: number[]; points: ForecastPoint[] }) {
  const locale = useLocale();
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
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" role="img" aria-label={t(locale, "forecast.chartAria")}>
      {band && <path d={band} className="fill-abys-accent/15" />}
      <path d={histPath} fill="none" className="stroke-abys-navy" strokeWidth={2} />
      {points.length > 0 && (
        <path d={forecastLine} fill="none" className="stroke-abys-accent" strokeWidth={2} strokeDasharray="6 4" />
      )}
    </svg>
  );
}

export default function ForecastPage() {
  const locale = useLocale();
  const [labels, setLabels] = useState<LabelRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<ForecastData | null>(null);
  const [alerts, setAlerts] = useState<AnomalySummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const effectLocale = readLocale();
    let cancelled = false;
    fetch("/api/forecast", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? t(effectLocale, "forecast.forbidden")
              : formatMessage(effectLocale, "forecast.kpiListLoadFailedHttp", {
                  status: res.status,
                })
          );
        }
        const body = (await res.json()) as { labels: LabelRow[] };
        if (!cancelled) setLabels(body.labels);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t(effectLocale, "forecast.loadFailed")
          );
        }
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
      if (!res.ok) {
        throw new Error(
          body.error ??
            formatMessage(locale, "forecast.forecastLoadFailedHttp", { status: res.status })
        );
      }
      setData(body as ForecastData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "forecast.forecastLoadFailed"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "nav.forecast").toLocaleUpperCase(locale)}
        title={t(locale, "forecast.title")}
        accent={t(locale, "forecast.titleAccent")}
        desc={t(locale, "forecast.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-4xl space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}

        {labels === null && !error && (
          <p className="text-sm text-abys-muted">{t(locale, "forecast.loading")}</p>
        )}

        {labels && labels.length === 0 && (
          <p className="text-sm text-abys-muted">
            {t(locale, "forecast.noSeries")}{" "}
            <Link href="/dashboard/kpi" className="text-abys-accent hover:underline">
              {t(locale, "forecast.kpiDataLink")}
            </Link>{" "}
            {t(locale, "forecast.noSeriesHelp")}
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
                <span className="ml-2 text-[11px] opacity-70">
                  {formatMessage(locale, "forecast.seriesNumeric", { count: l.numericPoints })}
                </span>
              </button>
            ))}
          </div>
        )}

        {alerts && alerts.length > 0 && (
          <div className="rounded-xl border border-abys-critical/30 bg-abys-critical-soft px-4 py-3">
            <p className="text-xs tracking-widest text-abys-critical font-semibold mb-1">
              {t(locale, "forecast.earlyWarning")
                .replace("{count}", String(alerts.length))
                .toLocaleUpperCase(locale)}
            </p>
            <ul className="space-y-0.5">
              {alerts.map((a) => {
                const last = a.anomalies[a.anomalies.length - 1];
                return (
                  <li key={a.label} className="text-xs text-abys-ink">
                    <span className="font-medium">{a.label}</span> ·{" "}
                    {formatMessage(locale, "forecast.anomalyScore", { score: last.score })} (
                    {last.direction === "above"
                      ? t(locale, "forecast.above")
                      : t(locale, "forecast.below")}) ·{" "}
                    {last.timestamp ? new Date(last.timestamp).toLocaleDateString(locale) : "—"}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-abys-muted mt-1">
              {t(locale, "forecast.medianMadNote")}
            </p>
          </div>
        )}

        {loading && (
          <p className="text-sm text-abys-muted" role="status">
            {t(locale, "forecast.calculating")}
          </p>
        )}

        {data && !loading && (
          <div className="space-y-4">
            <ForecastEvidencePanel data={data} />

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-abys-ink">{data.label}</p>
                {data.forecast && (
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-abys-muted">
                    {formatMessage(locale, "forecast.evidenceMae", {
                      evidence: EVIDENCE_LABEL[data.forecast.evidence]
                        ? t(locale, EVIDENCE_LABEL[data.forecast.evidence])
                        : t(locale, "forecast.evidenceUnknown"),
                      mae: fmt(data.forecast.selectedMae),
                    })}
                  </span>
                )}
              </div>

              {data.insufficientData || !data.forecast ? (
                <p className="text-sm text-abys-muted">
                  {formatMessage(locale, "forecast.insufficientData", {
                    min: data.minRequired,
                    current: data.provenance.numericPoints,
                  })}{" "}
                  <Link href="/dashboard/kpi" className="text-abys-accent hover:underline">
                    {t(locale, "forecast.addMissingHistory")}
                  </Link>
                </p>
              ) : (
                <>
                  <SeriesChart
                    history={data.history.values}
                    points={data.adjustedPoints ?? data.forecast.points}
                  />
                  {data.intervalAdjustment?.status === "applied" && (
                    <p className="text-[11px] text-abys-warning mt-1" data-testid="interval-adjustment">
                      {formatMessage(locale, "forecast.intervalAdjusted", {
                        factor: data.intervalAdjustment.factor,
                      })}{" "}
                      {data.intervalAdjustment.note}
                    </p>
                  )}
                  <p className="text-xs text-abys-muted mt-1">
                    {t(locale, "forecast.selectedModel")}:{" "}
                    <span className="text-abys-ink">{MODEL_LABEL[data.forecast.model] ? t(locale, MODEL_LABEL[data.forecast.model]) : data.forecast.model}</span>
                    {data.forecast.model === "ses" && ` (α=${data.forecast.backtest.find((b) => b.model === "ses")?.params.alpha ?? "-"})`}
                  </p>

                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {(data.adjustedPoints ?? data.forecast.points).map((p) => (
                      <div key={p.step} className="rounded-lg bg-white/70 px-3 py-2">
                        <p className="text-[11px] text-abys-muted">
                          {formatMessage(locale, "forecast.period", { step: p.step })}
                        </p>
                        <p className="font-mono text-lg text-abys-navy">{fmt(p.value)}</p>
                        <p className="text-[11px] text-abys-muted">
                          P10–P90: {fmt(p.p10)} – {fmt(p.p90)}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {data.forecast && <ForecastSnapshotPanel label={data.label} />}

            {data.forecast && (
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2 uppercase">
                  {t(locale, "forecast.modelComparisonHeading")}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-abys-muted">
                      <th className="py-1 font-medium">{t(locale, "forecast.tableModel")}</th>
                      <th className="py-1 font-medium">{t(locale, "forecast.tableMae")}</th>
                      <th className="py-1 font-medium">{t(locale, "forecast.tableRmse")}</th>
                      <th className="py-1 font-medium">{t(locale, "forecast.tableMape")}</th>
                      <th className="py-1 font-medium">{t(locale, "forecast.tablePoints")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.forecast.backtest.map((b) => (
                      <tr key={b.model} className={b.model === data.forecast?.model ? "text-abys-navy font-medium" : "text-abys-ink"}>
                        <td className="py-1">
                          {MODEL_LABEL[b.model] ? t(locale, MODEL_LABEL[b.model]) : b.model}
                        </td>
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
              <p className="text-[11px] tracking-widest font-semibold uppercase">
                {t(locale, "forecast.provenanceHeading")}
              </p>
              <p>{formatMessage(locale, "forecast.engine", { engine: data.provenance.engine })}</p>
              <p>
                {formatMessage(locale, "forecast.observations", {
                  used: data.provenance.numericPoints,
                  excluded: data.provenance.excludedPoints,
                })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SnapshotRow {
  id: string;
  model: string;
  p10: number;
  p50: number;
  p90: number;
  createdAt: string;
  createdBy: string;
  evaluation: {
    status: "pending" | "evaluated";
    actual: number | null;
    insideRange: boolean | null;
    absError: number | null;
  };
}

interface SnapshotSummary {
  total: number;
  evaluated: number;
  pending: number;
  hits: number;
  misses: number;
  hitRate: number | null;
  meanAbsError: number | null;
}

function ForecastSnapshotPanel({ label }: { label: string }) {
  const locale = useLocale();
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [summary, setSummary] = useState<SnapshotSummary | null>(null);
  const [retention, setRetention] = useState<{
    total: number;
    archiveCount: number;
    policy: { maxAgeDays: number; maxPerLabel: number };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    const res = await fetch(`/api/forecast/snapshots?label=${encodeURIComponent(label)}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { snapshots?: SnapshotRow[]; summary?: SnapshotSummary };
    setSnapshots(Array.isArray(body.snapshots) ? body.snapshots : []);
    setSummary(body.summary ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/forecast/snapshots?label=${encodeURIComponent(label)}`, { cache: "no-store" })
      .then(async (res) =>
        res.ok ? ((await res.json()) as { snapshots?: SnapshotRow[]; summary?: SnapshotSummary }) : null
      )
      .then((body) => {
        if (cancelled || !body) return;
        setSnapshots(Array.isArray(body.snapshots) ? body.snapshots : []);
        setSummary(body.summary ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [label]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/forecast/snapshots/retention", { cache: "no-store" })
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as {
              total?: number;
              archiveCount?: number;
              policy?: { maxAgeDays: number; maxPerLabel: number };
            })
          : null
      )
      .then((body) => {
        if (cancelled || !body || !body.policy) return;
        setRetention({
          total: body.total ?? 0,
          archiveCount: body.archiveCount ?? 0,
          policy: body.policy,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/forecast/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t(locale, "forecast.snapshotSaveFailed"));
      }
      setNote(t(locale, "forecast.snapshotSaved"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "forecast.snapshotSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs tracking-widest text-abys-muted font-semibold uppercase">
          {t(locale, "forecast.calibrationHeading")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {summary && summary.total > 0 && (
            <ExportLink
              href={`/api/forecast/snapshots/export?label=${encodeURIComponent(label)}`}
              label={t(locale, "forecast.exportCsv")}
            />
          )}
          <button
            onClick={save}
            disabled={busy}
            className="text-xs rounded-full border border-abys-navy/25 text-abys-navy px-3 py-1.5 hover:bg-white/60 disabled:opacity-50"
          >
            {busy ? t(locale, "forecast.saving") : t(locale, "forecast.saveSnapshot")}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-abys-muted">
        {t(locale, "forecast.calibrationDescription")}
      </p>
      {error && <p className="mt-2 text-xs text-abys-critical">{error}</p>}
      {note && <p className="mt-2 text-xs text-abys-healthy">{note}</p>}
      {summary && summary.total > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
            <p className="text-abys-muted">{t(locale, "forecast.measured")}</p>
            <p className="mt-1 font-semibold text-abys-ink">
              {summary.evaluated}/{summary.total}
            </p>
            <p className="text-[11px] text-abys-muted">
              {formatMessage(locale, "forecast.pendingCount", { count: summary.pending })}
            </p>
          </div>
          <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
            <p className="text-abys-muted">{t(locale, "forecast.rangeHit")}</p>
            <p className="mt-1 font-semibold text-abys-ink">
              {summary.hitRate === null ? "—" : `%${Math.round(summary.hitRate * 100)}`}
            </p>
            <p className="text-[11px] text-abys-muted">
              {formatMessage(locale, "forecast.hitsMisses", {
                hits: summary.hits,
                misses: summary.misses,
              })}
            </p>
          </div>
          <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
            <p className="text-abys-muted">{t(locale, "forecast.meanAbsError")}</p>
            <p className="mt-1 font-semibold text-abys-ink">
              {summary.meanAbsError === null ? "—" : fmt(summary.meanAbsError)}
            </p>
          </div>
          <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
            <p className="text-abys-muted">{t(locale, "forecast.lastRecord")}</p>
            <p className="mt-1 font-semibold text-abys-ink">
              {snapshots[0] ? new Date(snapshots[0].createdAt).toLocaleDateString(locale) : "—"}
            </p>
          </div>
        </div>
      )}
      {snapshots.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] list-none p-0 m-0">
          {snapshots.slice(0, 5).map((snap) => (
            <li key={snap.id} className="flex flex-wrap items-center gap-2 text-abys-muted">
              <span className="text-abys-ink">
                {new Date(snap.createdAt).toLocaleDateString(locale)}
              </span>
              <span>
                P10–P90 {fmt(snap.p10)} – {fmt(snap.p90)}
              </span>
              {snap.evaluation.status === "evaluated" ? (
                <span className={snap.evaluation.insideRange ? "text-abys-healthy" : "text-abys-critical"}>
                  {formatMessage(locale, "forecast.actual", {
                    value: fmt(snap.evaluation.actual ?? 0),
                  })}{" "}
                  ·{" "}
                  {snap.evaluation.insideRange
                    ? t(locale, "forecast.insideRange")
                    : t(locale, "forecast.outsideRange")}
                  {snap.evaluation.absError !== null &&
                    ` · ${formatMessage(locale, "forecast.absError", {
                      value: fmt(snap.evaluation.absError),
                    })}`}
                </span>
              ) : (
                <span>{t(locale, "forecast.evaluationPending")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {summary && summary.total === 0 && (
        <p className="mt-2 text-xs text-abys-muted">{t(locale, "forecast.noSnapshots")}</p>
      )}
      {retention && (
        <p className="mt-2 text-[11px] text-abys-muted">
          {formatMessage(locale, "forecast.retentionPolicy", {
            maxAgeDays: retention.policy.maxAgeDays,
            maxPerLabel: retention.policy.maxPerLabel,
            total: retention.total,
            archive:
              retention.archiveCount === 0
                ? t(locale, "forecast.noArchiveCandidates")
                : formatMessage(locale, "forecast.archiveCandidates", {
                    count: retention.archiveCount,
                  }),
          })}
        </p>
      )}
    </div>
  );
}
