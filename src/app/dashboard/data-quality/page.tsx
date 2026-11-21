"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

interface QualityIssue {
  id: string;
  source: string;
  entity: string;
  sourceRef: string | null;
  code: string | null;
  reason: string;
  status: "pending" | "resolved" | "discarded";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

type ScoreDimension = "completeness" | "validity" | "uniqueness" | "freshness";

interface ScoreReport {
  dimensions: { dimension: ScoreDimension; score: number | null; sample: number }[];
  overall: number | null;
  worst: ScoreDimension | null;
  total: number;
  maxAgeDays: number;
  label: string | null;
  sampled: boolean;
}

const DIMENSION_KEY: Record<ScoreDimension, ShellKey> = {
  completeness: "dataQuality.score.dimension.completeness",
  validity: "dataQuality.score.dimension.validity",
  uniqueness: "dataQuality.score.dimension.uniqueness",
  freshness: "dataQuality.score.dimension.freshness",
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

function statusLabel(locale: Locale, status: QualityIssue["status"]): string {
  return t(locale, `dataQuality.status.${status}` as ShellKey);
}

function formatDate(value: string, locale: Locale): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(locale);
}

function formatPercent(value: number, locale: Locale): string {
  return `${(value * 100).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

async function readError(res: Response, locale: Locale): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // JSON değilse yedek.
  }
  return formatMessage(locale, "dataQuality.errorHttp", { status: res.status });
}

/**
 * Veri kalitesi karantinası — entegrasyonlardan gelen sorunlu satırlar.
 * Yalnızca ingest_data izni; kapsam sunucuda (org_id oturumdan).
 */
export default function DataQualityPage() {
  const locale = useLocale();
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [score, setScore] = useState<ScoreReport | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [scoreError, setScoreError] = useState("");
  const [scoreLabel, setScoreLabel] = useState("");
  const [labelOptions, setLabelOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/kpi-values", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { labels: { label: string }[] };
      if (!cancelled) setLabelOptions(body.labels.map((row) => row.label));
    })().catch(() => {
      // Metrik listesi alınamazsa filtre boş kalır; skor yine yüklenir.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const effectLocale = readLocale();
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ maxAgeDays: "30" });
        if (scoreLabel) query.set("label", scoreLabel);
        const res = await fetch(`/api/data-quality/score?${query.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) throw new Error(t(effectLocale, "dataQuality.errorUnauthorized"));
          if (res.status === 403) throw new Error(t(effectLocale, "dataQuality.errorForbidden"));
          throw new Error(await readError(res, effectLocale));
        }
        const data = (await res.json()) as ScoreReport;
        if (!cancelled) {
          setScore(data);
          setScoreError("");
        }
      } catch (err) {
        if (!cancelled) {
          setScoreError(
            err instanceof Error ? err.message : t(effectLocale, "dataQuality.score.error")
          );
        }
      } finally {
        if (!cancelled) setScoreLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scoreLabel]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/data-quality?status=${scope}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) throw new Error(t(locale, "dataQuality.errorUnauthorized"));
          if (res.status === 403) throw new Error(t(locale, "dataQuality.errorForbidden"));
          throw new Error(await readError(res, locale));
        }
        const data = (await res.json()) as { issues?: QualityIssue[] };
        if (cancelled) return;
        setIssues(Array.isArray(data.issues) ? data.issues : []);
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t(locale, "dataQuality.errorLoadFailed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, reloadKey, locale]);

  async function resolve(
    id: string,
    resolution: "resolved" | "discarded",
    action?: "accept_proposed" | "keep_existing"
  ) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/data-quality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolution, action }),
      });
      if (!res.ok) {
        setError(await readError(res, locale));
        return;
      }
      setNotice(
        action === "accept_proposed"
          ? t(locale, "dataQuality.noticeAcceptProposed")
          : action === "keep_existing"
            ? t(locale, "dataQuality.noticeKeepExisting")
            : resolution === "resolved"
              ? t(locale, "dataQuality.noticeResolved")
              : t(locale, "dataQuality.noticeDiscarded")
      );
      setLoading(true);
      setReloadKey((k) => k + 1);
    } catch {
      setError(t(locale, "dataQuality.errorNetwork"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "dataQuality.eyebrow")}
        title={t(locale, "dataQuality.title")}
        accent={t(locale, "dataQuality.titleAccent")}
        desc={t(locale, "dataQuality.subtitle")}
      />

      <div className="px-10 pb-16 max-w-4xl">
        <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-widest text-abys-muted">
              {t(locale, "dataQuality.score.heading")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-abys-muted" htmlFor="score-label">
                {t(locale, "dataQuality.score.filterLabel")}
              </label>
              <select
                id="score-label"
                value={scoreLabel}
                onChange={(e) => {
                  setScoreLoading(true);
                  setScoreLabel(e.target.value);
                }}
                className="rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-xs text-abys-ink"
              >
                <option value="">{t(locale, "dataQuality.score.allMetrics")}</option>
                {labelOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              {score?.worst && (
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-abys-muted">
                  {formatMessage(locale, "dataQuality.score.worst", {
                    dimension: t(locale, DIMENSION_KEY[score.worst]),
                  })}
                </span>
              )}
            </div>
          </div>

          {scoreError ? (
            <p role="alert" className="text-sm text-abys-critical">{scoreError}</p>
          ) : scoreLoading || !score ? (
            <p role="status" className="text-sm text-abys-muted">{t(locale, "dataQuality.loading")}</p>
          ) : (
            <>
              <div className="mb-3 flex items-baseline gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-abys-muted">
                    {t(locale, "dataQuality.score.overall")}
                  </p>
                  <p className="font-serif text-3xl text-abys-navy">
                    {score.overall === null
                      ? t(locale, "dataQuality.score.noData")
                      : formatPercent(score.overall, locale)}
                  </p>
                </div>
                <p className="text-xs text-abys-muted">
                  {formatMessage(locale, "dataQuality.score.total", {
                    count: score.total.toLocaleString(locale),
                  })}
                </p>
              </div>

              <ul className="space-y-1 list-none p-0 m-0">
                {score.dimensions.map((d) => (
                  <li key={d.dimension} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="text-abys-ink">{t(locale, DIMENSION_KEY[d.dimension])}</span>
                    <span className="font-mono text-abys-muted">
                      {d.score === null
                        ? t(locale, "dataQuality.score.noData")
                        : formatPercent(d.score, locale)}{" "}
                      ·{" "}
                      {formatMessage(locale, "dataQuality.score.sample", {
                        count: d.sample.toLocaleString(locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>

              {score.sampled && (
                <p className="mt-3 text-xs text-abys-warning">
                  {formatMessage(locale, "dataQuality.score.sampled", {
                    count: score.total.toLocaleString(locale),
                  })}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["pending", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setLoading(true);
                setScope(s);
              }}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                scope === s
                  ? "border-abys-accent bg-abys-accent/10 text-abys-accent"
                  : "border-abys-cream-border text-abys-muted hover:bg-white/60"
              }`}
            >
              {s === "pending"
                ? t(locale, "dataQuality.filterPending")
                : t(locale, "dataQuality.filterAll")}
            </button>
          ))}
        </div>

        {notice && (
          <p role="status" className="mb-3 text-sm text-abys-healthy">{notice}</p>
        )}
        {loading ? (
          <p className="text-sm text-abys-muted" role="status">{t(locale, "dataQuality.loading")}</p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        ) : issues.length === 0 ? (
          <p className="text-sm text-abys-muted">
            {scope === "pending"
              ? t(locale, "dataQuality.emptyPending")
              : t(locale, "dataQuality.emptyAll")}
          </p>
        ) : (
          <ul className="space-y-2 list-none p-0 m-0">
            {issues.map((issue) => (
              <li
                key={issue.id}
                className="rounded-xl border border-abys-cream-border bg-white/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-abys-ink">
                      {issue.source} / {issue.entity}
                      {issue.sourceRef ? ` · ${issue.sourceRef}` : ""}
                    </p>
                    {issue.code && (
                      <p className="mt-0.5 text-[10px] font-mono text-abys-muted">{issue.code}</p>
                    )}
                    <p className="text-xs text-abys-critical mt-0.5">{issue.reason}</p>
                    <p className="text-[11px] text-abys-muted mt-1">
                      {formatDate(issue.createdAt, locale)}
                      {issue.resolvedAt
                        ? ` · ${statusLabel(locale, issue.status)}: ${formatDate(issue.resolvedAt, locale)}`
                        : ""}
                    </p>
                  </div>
                  {issue.status === "pending" && (
                    <div className="flex gap-2">
                      {issue.code === "IDENTITY_LINK_CONFLICT" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "resolved", "accept_proposed")}
                            className="rounded-full border border-abys-accent/40 px-3 py-1.5 text-xs text-abys-accent hover:bg-abys-accent/10 disabled:opacity-50"
                          >
                            {t(locale, "dataQuality.actionApplyProposed")}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "resolved", "keep_existing")}
                            className="rounded-full border border-abys-cream-border px-3 py-1.5 text-xs text-abys-muted hover:bg-white/60 disabled:opacity-50"
                          >
                            {t(locale, "dataQuality.actionKeepExisting")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "resolved")}
                            className="rounded-full border border-abys-healthy/40 px-3 py-1.5 text-xs text-abys-healthy hover:bg-abys-healthy-soft disabled:opacity-50"
                          >
                            {t(locale, "dataQuality.actionResolved")}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "discarded")}
                            className="rounded-full border border-abys-critical/40 px-3 py-1.5 text-xs text-abys-critical hover:bg-abys-critical-soft disabled:opacity-50"
                          >
                            {t(locale, "dataQuality.actionDiscard")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
