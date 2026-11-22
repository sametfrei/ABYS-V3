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

interface Transition {
  from: string;
  to: string;
  count: number;
  medianSeconds: number;
  p90Seconds: number;
}

interface MiningData {
  subjects: number;
  events: number;
  transitions: Transition[];
  bottlenecks: Transition[];
  medianCaseSeconds: number | null;
  startEvents: { type: string; count: number }[];
  evidence: "low" | "medium" | "high";
  note: string;
  window: { days: number; since: string };
  coverage: { read: number; used: number; withoutSubject: number };
  provenance: { engine: string; source: string; note: string };
}

const EVIDENCE_LABEL: Record<string, ShellKey> = {
  high: "process.evidence.high",
  medium: "process.evidence.medium",
  low: "process.evidence.low",
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

function codeLabel(locale: Locale, prefix: string, code: string): string {
  const key = `${prefix}.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

function dur(seconds: number, locale: Locale): string {
  if (seconds >= 3600) {
    return formatMessage(locale, "process.duration.hours", { value: (seconds / 3600).toFixed(1) });
  }
  if (seconds >= 60) {
    return formatMessage(locale, "process.duration.minutes", { value: (seconds / 60).toFixed(1) });
  }
  return formatMessage(locale, "process.duration.seconds", { value: Math.round(seconds) });
}

export default function ProcessPage() {
  const locale = useLocale();
  const [data, setData] = useState<MiningData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const effectLocale = readLocale();
    let cancelled = false;
    fetch("/api/process-mining?days=90", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          throw new Error(
            body.error ??
              formatMessage(effectLocale, "process.errorHttp", { status: res.status })
          );
        }
        if (!cancelled) setData(body as MiningData);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t(effectLocale, "process.errorLoadFailed")
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "process.eyebrow")}
        title={t(locale, "process.title")}
        accent={t(locale, "process.titleAccent")}
        desc={t(locale, "process.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-4xl space-y-5">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-sm text-abys-muted">{t(locale, "process.loading")}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                [t(locale, "process.cardSubjects"), data.subjects.toLocaleString(locale)],
                [t(locale, "process.cardEvents"), data.events.toLocaleString(locale)],
                [t(locale, "process.cardTransitionTypes"), data.transitions.length.toLocaleString(locale)],
                [
                  t(locale, "process.cardMedianCase"),
                  data.medianCaseSeconds === null ? "—" : dur(data.medianCaseSeconds, locale),
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
                  <p className="text-[11px] tracking-wide text-abys-muted uppercase">{label}</p>
                  <p className="font-serif text-2xl text-abys-navy">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs tracking-widest text-abys-muted font-semibold">
                  {t(locale, "process.bottlenecksHeading")}
                </p>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-abys-muted">
                  {t(locale, EVIDENCE_LABEL[data.evidence] ?? "process.evidence.low")}
                </span>
              </div>
              {data.bottlenecks.length === 0 ? (
                <p className="text-sm text-abys-muted">{t(locale, "process.bottlenecksEmpty")}</p>
              ) : (
                <ul className="space-y-1">
                  {data.bottlenecks.map((b) => (
                    <li key={`${b.from}->${b.to}`} className="text-sm text-abys-ink flex flex-wrap justify-between gap-2">
                      <span>
                        {codeLabel(locale, "process.event", b.from)} →{" "}
                        {codeLabel(locale, "process.event", b.to)}
                      </span>
                      <span className="font-mono text-abys-muted">
                        {formatMessage(locale, "process.bottleneckRow", {
                          median: dur(b.medianSeconds, locale),
                          p90: dur(b.p90Seconds, locale),
                          count: b.count.toLocaleString(locale),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 overflow-x-auto">
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                {t(locale, "process.transitionsHeading")}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-abys-muted">
                    <th className="py-1 font-medium">{t(locale, "process.colTransition")}</th>
                    <th className="py-1 font-medium">{t(locale, "process.colCount")}</th>
                    <th className="py-1 font-medium">{t(locale, "process.colMedian")}</th>
                    <th className="py-1 font-medium">{t(locale, "process.colP90")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transitions.map((t) => (
                    <tr key={`${t.from}->${t.to}`} className="text-abys-ink">
                      <td className="py-1">
                        {codeLabel(locale, "process.event", t.from)} →{" "}
                        {codeLabel(locale, "process.event", t.to)}
                      </td>
                      <td className="py-1 font-mono">{t.count.toLocaleString(locale)}</td>
                      <td className="py-1 font-mono">{dur(t.medianSeconds, locale)}</td>
                      <td className="py-1 font-mono">{dur(t.p90Seconds, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 text-xs text-abys-muted space-y-1">
              <p className="text-[11px] tracking-widest font-semibold">
                {t(locale, "process.coverageHeading")}
              </p>
              <p>
                {formatMessage(locale, "process.window", {
                  days: data.window.days,
                  read: data.coverage.read.toLocaleString(locale),
                  used: data.coverage.used.toLocaleString(locale),
                  withoutSubject: data.coverage.withoutSubject.toLocaleString(locale),
                })}
              </p>
              <p>
                {formatMessage(locale, "process.provenance", {
                  engine: data.provenance.engine,
                  source: data.provenance.source,
                })}
              </p>
              <p>{data.note}</p>
              <p>{data.provenance.note}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
