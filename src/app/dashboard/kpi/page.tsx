"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
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
}

interface Point {
  id: string;
  label: string;
  value: number;
  observedAt: string;
}

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

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function KpiDataPage() {
  const locale = useLocale();
  const [labels, setLabels] = useState<LabelRow[] | null>(null);
  const [definitions, setDefinitions] = useState<string[]>([]);
  const [metric, setMetric] = useState("");
  const [value, setValue] = useState("");
  const [observedAt, setObservedAt] = useState(todayLocal());
  const [bulk, setBulk] = useState("");
  const [points, setPoints] = useState<Point[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reloadLabels() {
    const res = await fetch("/api/kpi-values", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { labels: LabelRow[] };
    setLabels(body.labels);
  }

  useEffect(() => {
    const effectLocale = readLocale();
    let cancelled = false;
    (async () => {
      try {
        const [labelsRes, defsRes] = await Promise.all([
          fetch("/api/kpi-values", { cache: "no-store" }),
          fetch("/api/kpi-definitions", { cache: "no-store" }),
        ]);
        if (!labelsRes.ok) {
          if (!cancelled) setError(t(effectLocale, "kpi.loadFailed"));
          return;
        }
        const labelsBody = (await labelsRes.json()) as { labels: LabelRow[] };
        if (!cancelled) setLabels(labelsBody.labels);
        if (defsRes.ok) {
          const defsBody = (await defsRes.json()) as { definitions: { name: string }[] };
          if (!cancelled) setDefinitions(defsBody.definitions.map((d) => d.name));
        }
      } catch {
        if (!cancelled) setError(t(effectLocale, "kpi.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadPoints(label: string) {
    if (!label) {
      setPoints(null);
      return;
    }
    const res = await fetch(`/api/kpi-values?label=${encodeURIComponent(label)}`, { cache: "no-store" });
    if (!res.ok) {
      setPoints([]);
      return;
    }
    const body = (await res.json()) as { points: Point[] };
    setPoints(body.points);
  }

  async function save(entries: { value: number; observedAt: string }[]) {
    const activeLocale = readLocale();
    const label = metric.trim();
    if (!label || entries.length === 0) {
      setError(t(activeLocale, "kpi.needMetricAndValue"));
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/kpi-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, entries }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          body.error ??
            formatMessage(activeLocale, "kpi.saveFailedHttp", { status: res.status })
        );
      setMessage(formatMessage(activeLocale, "kpi.savedPoints", { count: body.written, label }));
      setValue("");
      setBulk("");
      await reloadLabels();
      await loadPoints(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(activeLocale, "kpi.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function parseBulk(): { value: number; observedAt: string }[] {
    const entries: { value: number; observedAt: string }[] = [];
    for (const line of bulk.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [datePart, valuePart] = trimmed.split(/[;, \t]+/);
      const n = Number((valuePart ?? "").replace(",", "."));
      const at = Date.parse(datePart ?? "");
      if (!Number.isFinite(n) || !Number.isFinite(at)) continue;
      entries.push({ value: n, observedAt: new Date(at).toISOString() });
    }
    return entries;
  }

  async function removePoint(id: string) {
    const activeLocale = readLocale();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/kpi-values", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? t(activeLocale, "kpi.deleteFailed"));
      await loadPoints(metric.trim());
      await reloadLabels();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(activeLocale, "kpi.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "kpi.eyebrow")}
        title={t(locale, "kpi.title")}
        accent={t(locale, "kpi.titleAccent")}
        desc={t(locale, "kpi.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-4xl space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-xl border border-abys-healthy/40 bg-abys-healthy-soft px-4 py-3 text-sm text-abys-healthy">
            {message}
          </p>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 space-y-3">
          <p className="text-xs tracking-widest text-abys-muted font-semibold">{t(locale, "kpi.newValue")}</p>
          <div className="flex flex-wrap gap-2">
            <input
              list="kpi-names"
              value={metric}
              onChange={(e) => {
                setMetric(e.target.value);
                void loadPoints(e.target.value);
              }}
              placeholder={t(locale, "kpi.metricPlaceholder")}
              className="flex-1 min-w-[220px] text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
            />
            <datalist id="kpi-names">
              {[...new Set([...definitions, ...(labels ?? []).map((l) => l.label)])].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <input
              type="datetime-local"
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
              aria-label={t(locale, "kpi.observedAtAria")}
            />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t(locale, "kpi.valuePlaceholder")}
              inputMode="decimal"
              className="w-32 text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
            />
            <button
              onClick={() => {
                const n = Number(value.replace(",", "."));
                if (!Number.isFinite(n)) {
                  setError(t(locale, "kpi.numericValue"));
                  return;
                }
                const at = Date.parse(observedAt);
                if (!Number.isFinite(at)) {
                  setError(t(locale, "kpi.invalidDate"));
                  return;
                }
                void save([{ value: n, observedAt: new Date(at).toISOString() }]);
              }}
              disabled={busy}
              className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40"
            >
              {busy ? t(locale, "kpi.saving") : t(locale, "kpi.save")}
            </button>
          </div>

          <details className="pt-1">
            <summary className="text-xs text-abys-muted cursor-pointer">{t(locale, "kpi.bulkSummary")}</summary>
            <textarea
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              rows={5}
              placeholder={"2026-01-05,120000\n2026-01-12,134500"}
              className="mt-2 w-full text-sm font-mono rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
            />
            <button
              onClick={() => {
                const entries = parseBulk();
                if (entries.length === 0) {
                  setError(t(locale, "kpi.bulkNoValidRows"));
                  return;
                }
                void save(entries);
              }}
              disabled={busy}
              className="mt-2 text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft disabled:opacity-40"
            >
              {t(locale, "kpi.bulkSave")}
            </button>
          </details>
        </div>

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">{t(locale, "kpi.metricsHeading")}</p>
            <Link href="/dashboard/forecast" className="text-[11px] text-abys-accent hover:underline">
              {t(locale, "kpi.goForecast")}
            </Link>
          </div>
          {labels === null ? (
            <p className="text-sm text-abys-muted">{t(locale, "kpi.loading")}</p>
          ) : labels.length === 0 ? (
            <p className="text-sm text-abys-muted">{t(locale, "kpi.emptyLabels")}</p>
          ) : (
            <ul className="space-y-1 list-none p-0 m-0">
              {labels.map((l) => (
                <li key={l.label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button
                    onClick={() => {
                      setMetric(l.label);
                      void loadPoints(l.label);
                    }}
                    className={`text-left ${metric === l.label ? "text-abys-navy font-medium" : "text-abys-ink hover:text-abys-navy"}`}
                  >
                    {l.label}
                  </button>
                  <span className="text-xs text-abys-muted">
                    {formatMessage(locale, "kpi.pointCounts", {
                      numeric: l.numericPoints.toLocaleString(locale),
                      total: l.totalPoints.toLocaleString(locale),
                    })}{" "}
                    ·{" "}
                    <Link href={`/dashboard/forecast`} className="text-abys-accent hover:underline">
                      {t(locale, "kpi.forecast")}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {metric.trim() && points && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
              {formatMessage(locale, "kpi.latestPoints", { label: metric.trim() })}
            </p>
            {points.length === 0 ? (
              <p className="text-sm text-abys-muted">{t(locale, "kpi.emptyPoints")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-abys-muted">
                    <th className="py-1 font-medium">{t(locale, "kpi.colTime")}</th>
                    <th className="py-1 font-medium">{t(locale, "kpi.colValue")}</th>
                    <th className="py-1 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {points.slice(-25).reverse().map((p) => (
                    <tr key={p.id} className="text-abys-ink">
                      <td className="py-1">{new Date(p.observedAt).toLocaleString(locale)}</td>
                      <td className="py-1 font-mono">{p.value.toLocaleString(locale)}</td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() => removePoint(p.id)}
                          disabled={busy}
                          className="text-xs text-abys-muted hover:text-abys-critical disabled:opacity-30"
                        >
                          {t(locale, "kpi.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
