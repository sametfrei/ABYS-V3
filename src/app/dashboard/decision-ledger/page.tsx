"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ExportLink } from "@/components/ExportLink";
import { OutcomeHistory } from "@/components/OutcomeHistory";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

interface LedgerOutcome {
  result: "improved" | "unchanged" | "worsened";
  note: string;
  lesson: string | null;
  recordedBy: string;
  recordedAt: string;
}

interface LedgerEntry {
  decisionId: string;
  title: string;
  severity: string;
  confidence: number;
  businessImpact: string | null;
  choice: string;
  decidedBy: string;
  decidedAt: string;
  decisionState: string;
  execution: {
    actionId: string;
    title: string;
    owner: string;
    status: string;
    dueAt: string | null;
    progressNote: string | null;
    updatedAt: string;
    eventCount: number;
  } | null;
  expectedImpact: {
    value: number;
    low: number | null;
    high: number | null;
    currency: string;
    basis: string | null;
    assumptions: string[];
  } | null;
  actualImpact: {
    value: number;
    currency: string;
    measurementStart: string | null;
    measurementEnd: string | null;
    evidence: string | null;
  } | null;
  economicVariance: { amount: number; percent: number | null; currency: string } | null;
  outcome: LedgerOutcome | null;
}

interface Summary {
  totalDecisions: number;
  withOutcome: number;
  improved: number;
  unchanged: number;
  worsened: number;
  economics: {
    expectedValueCount: number;
    actualValueCount: number;
    reconciledCount: number;
    byCurrency: Array<{
      currency: string;
      expectedTotal: number;
      actualTotal: number;
      varianceTotal: number;
      expectedCount: number;
      actualCount: number;
      reconciledCount: number;
    }>;
  };
  learning: {
    rangeAccuracy: {
      evaluableCount: number;
      hitCount: number;
      missCount: number;
      missingRangeCount: number;
      currencyMismatchCount: number;
      hitRate: number | null;
    };
    confidenceBuckets: Array<{
      key: string;
      label: string;
      total: number;
      withOutcome: number;
      improvedRate: number | null;
      rangeEvaluable: number;
      rangeHitRate: number | null;
    }>;
    choices: {
      total: number;
      accepted: number;
      rejected: number;
      modified: number;
      other: number;
      acceptanceRate: number | null;
    };
  };
  calibration: {
    status: "measured" | "partial" | "insufficient_evidence";
    totalWithOutcome: number;
    threshold: number;
    note: string;
    buckets: Array<{
      key: string;
      label: string;
      statedConfidence: number;
      withOutcome: number;
      improvedRate: number | null;
      rangeHitRate: number | null;
      status: "measured" | "insufficient_evidence";
      gap: number | null;
      direction: "overconfident" | "aligned" | "underconfident" | null;
      adjustedConfidence: number | null;
      samplesNeeded: number;
    }>;
  };
  execution: {
    totalActions: number;
    open: number;
    inProgress: number;
    done: number;
    cancelled: number;
  };
}

const RESULT_LABEL: Record<LedgerOutcome["result"], ShellKey> = {
  improved: "ledger.resultImproved",
  unchanged: "ledger.resultUnchanged",
  worsened: "ledger.resultWorsened",
};

const RESULT_STYLE: Record<LedgerOutcome["result"], string> = {
  improved: "bg-abys-healthy-soft text-abys-healthy",
  unchanged: "bg-abys-cream text-abys-muted",
  worsened: "bg-abys-critical-soft text-abys-critical",
};

const CALIBRATION_DIRECTION_LABEL: Record<string, ShellKey> = {
  overconfident: "ledger.directionOverconfident",
  aligned: "ledger.directionAligned",
  underconfident: "ledger.directionUnderconfident",
};

const CALIBRATION_DIRECTION_STYLE: Record<string, string> = {
  overconfident: "text-abys-critical",
  aligned: "text-abys-healthy",
  underconfident: "text-abys-warning",
};

const CHOICE_LABEL: Record<string, ShellKey> = {
  accepted: "ledger.choiceAccepted",
  rejected: "ledger.choiceRejected",
  modified: "ledger.choiceModified",
};

const DECISION_STATE_LABEL: Record<string, ShellKey> = {
  draft: "ledger.stateDraft",
  under_review: "ledger.stateUnderReview",
  awaiting_approval: "ledger.stateAwaitingApproval",
  approved: "ledger.stateApproved",
  rejected: "ledger.stateRejected",
  in_execution: "ledger.stateInExecution",
  completed: "ledger.stateCompleted",
  outcome_review: "ledger.stateOutcomeReview",
  closed: "ledger.stateClosed",
};

const ACTION_STATUS_LABEL: Record<string, ShellKey> = {
  open: "ledger.actionOpen",
  in_progress: "ledger.actionInProgress",
  done: "ledger.actionDone",
  cancelled: "ledger.actionCancelled",
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

function localizedLabel(
  locale: Locale,
  labels: Record<string, ShellKey>,
  value: string
): string {
  const key = labels[value];
  return key ? t(locale, key) : value;
}

function formatDate(value: string, locale: Locale): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(locale);
}

function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale);
}

function formatMoney(value: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString(locale)} ${currency}`;
  }
}

function formatPercent(value: number | null, locale: Locale): string {
  if (value === null) return t(locale, "ledger.percentBaseZero");
  return `${value >= 0 ? "+" : ""}${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}

function formatRate(value: number | null, locale: Locale): string {
  if (value === null) return t(locale, "ledger.rateNoSample");
  return `${(value * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}

/** Decision Value Ledger — kararlar ve gerçekleşen sonuçları. Salt okunur. */
export default function DecisionLedgerPage() {
  const locale = useLocale();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<
    | { kind: "unauthorized" | "forbidden" | "loadFailed" }
    | { kind: "http"; status: number }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/decision-ledger", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) {
            if (!cancelled) setError({ kind: "unauthorized" });
            return;
          }
          if (res.status === 403) {
            if (!cancelled) setError({ kind: "forbidden" });
            return;
          }
          if (!cancelled) setError({ kind: "http", status: res.status });
          return;
        }
        const data = (await res.json()) as { summary?: Summary; entries?: LedgerEntry[] };
        if (cancelled) return;
        setSummary(data.summary ?? null);
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch {
        if (!cancelled) setError({ kind: "loadFailed" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const errorMessage =
    error === null
      ? ""
      : error.kind === "http"
        ? formatMessage(locale, "ledger.loadFailedHttp", { status: error.status })
        : t(locale, `ledger.${error.kind}` as ShellKey);

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "ledger.eyebrow")}
        title={t(locale, "ledger.title")}
        accent={t(locale, "ledger.titleAccent")}
        desc={t(locale, "ledger.subtitle")}
      />

      <div className="px-10 pb-16 max-w-4xl">
        {!loading && !error && (
          <div className="mb-4 flex flex-wrap justify-end">
            {entries.length > 0 && (
              <ExportLink href="/api/decision-ledger/export" label={t(locale, "ledger.exportCsv")} />
            )}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-abys-muted" role="status">{t(locale, "ledger.loading")}</p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {errorMessage}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-abys-muted">{t(locale, "ledger.empty")}</p>
        ) : (
          <>
            {summary && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    ["ledger.totalDecisions", summary.totalDecisions],
                    ["ledger.withOutcome", summary.withOutcome],
                    ["ledger.improved", summary.improved],
                    ["ledger.worsened", summary.worsened],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3"
                    >
                      <p className="text-[11px] tracking-wide text-abys-muted uppercase">
                        {t(locale, label as ShellKey)}
                      </p>
                      <p className="font-serif text-2xl text-abys-navy">
                        {formatNumber(Number(value), locale)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                      {t(locale, "ledger.executionHeading")}
                    </p>
                    <p className="text-[11px] text-abys-muted">
                      {formatMessage(locale, "ledger.executionSummary", {
                        count: formatNumber(summary.execution.totalActions, locale),
                      })}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      ["ledger.statusOpen", summary.execution.open],
                      ["ledger.statusInProgress", summary.execution.inProgress],
                      ["ledger.statusDone", summary.execution.done],
                      ["ledger.statusCancelled", summary.execution.cancelled],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                        <p className="text-abys-muted">{t(locale, label as ShellKey)}</p>
                        <p className="mt-1 font-semibold text-abys-ink">
                          {formatNumber(Number(value), locale)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {summary.economics.byCurrency.length > 0 && (
                  <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                        {t(locale, "ledger.economicsHeading")}
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {formatMessage(locale, "ledger.economicsSummary", {
                          count: formatNumber(summary.economics.reconciledCount, locale),
                        })}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {summary.economics.byCurrency.map((item) => (
                        <div
                          key={item.currency}
                          className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2"
                        >
                          <p className="text-xs font-semibold text-abys-ink">{item.currency}</p>
                          <p className="mt-1 text-[11px] text-abys-muted">
                            {formatMessage(locale, "ledger.economicsLine", {
                              expected: formatMoney(item.expectedTotal, item.currency, locale),
                              actual: formatMoney(item.actualTotal, item.currency, locale),
                            })}
                          </p>
                          <p
                            className={`mt-0.5 text-[11px] ${
                              item.varianceTotal >= 0 ? "text-abys-healthy" : "text-abys-critical"
                            }`}
                          >
                            {formatMessage(locale, "ledger.economicsVariance", {
                              variance: formatMoney(item.varianceTotal, item.currency, locale),
                              count: formatNumber(item.reconciledCount, locale),
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                      {t(locale, "ledger.learningHeading")}
                    </p>
                    <p className="text-[11px] text-abys-muted">
                      {formatMessage(locale, "ledger.learningAcceptance", {
                        rate: formatRate(summary.learning.choices.acceptanceRate, locale),
                        count: formatNumber(summary.learning.choices.total, locale),
                      })}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">{t(locale, "ledger.rangeAccuracy")}</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {formatRate(summary.learning.rangeAccuracy.hitRate, locale)}
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {formatMessage(locale, "ledger.rangeHits", {
                          hits: formatNumber(summary.learning.rangeAccuracy.hitCount, locale),
                          misses: formatNumber(summary.learning.rangeAccuracy.missCount, locale),
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">{t(locale, "ledger.rangeCoverage")}</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {formatMessage(locale, "ledger.rangeEvaluable", {
                          count: formatNumber(summary.learning.rangeAccuracy.evaluableCount, locale),
                        })}
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {formatMessage(locale, "ledger.rangeGaps", {
                          missing: formatNumber(summary.learning.rangeAccuracy.missingRangeCount, locale),
                          mismatch: formatNumber(
                            summary.learning.rangeAccuracy.currencyMismatchCount,
                            locale
                          ),
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">{t(locale, "ledger.acceptedRejected")}</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {formatNumber(summary.learning.choices.accepted, locale)} /{" "}
                        {formatNumber(summary.learning.choices.rejected, locale)}
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {formatMessage(locale, "ledger.modifiedCount", {
                          count: formatNumber(summary.learning.choices.modified, locale),
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">{t(locale, "ledger.confidenceBuckets")}</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {formatMessage(locale, "ledger.bucketCount", {
                          count: formatNumber(summary.learning.confidenceBuckets.length, locale),
                        })}
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {t(locale, "ledger.lowSample")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-abys-muted">
                        <tr>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableConfidence")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableDecisions")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableResolved")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableImprovement")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableRangeHit")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.learning.confidenceBuckets.map((bucket) => (
                          <tr key={bucket.key} className="border-t border-abys-cream-border">
                            <td className="py-1 pr-3 text-abys-ink">{bucket.label}</td>
                            <td className="py-1 pr-3">{formatNumber(bucket.total, locale)}</td>
                            <td className="py-1 pr-3">{formatNumber(bucket.withOutcome, locale)}</td>
                            <td className="py-1 pr-3">
                              {formatRate(bucket.improvedRate, locale)}{" "}
                              <span className="text-abys-muted">
                                {formatMessage(locale, "ledger.sampleCount", {
                                  count: formatNumber(bucket.withOutcome, locale),
                                })}
                              </span>
                            </td>
                            <td className="py-1 pr-3">
                              {formatRate(bucket.rangeHitRate, locale)}{" "}
                              <span className="text-abys-muted">
                                {formatMessage(locale, "ledger.sampleCount", {
                                  count: formatNumber(bucket.rangeEvaluable, locale),
                                })}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                      {t(locale, "ledger.calibrationHeading")}
                    </p>
                    <p className="text-[11px] text-abys-muted">
                      {summary.calibration.status === "insufficient_evidence"
                        ? formatMessage(locale, "ledger.calibrationInsufficient", {
                            threshold: formatNumber(summary.calibration.threshold, locale),
                          })
                        : formatMessage(locale, "ledger.calibrationDerived", {
                            count: formatNumber(summary.calibration.totalWithOutcome, locale),
                          })}
                    </p>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-abys-muted">
                        <tr>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableConfidence")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableSample")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableObservedImprovement")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableAssessment")}</th>
                          <th className="py-1 pr-3 font-medium">{t(locale, "ledger.tableAdjustedConfidence")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.calibration.buckets.map((bucket) => (
                          <tr key={bucket.key} className="border-t border-abys-cream-border">
                            <td className="py-1 pr-3 text-abys-ink">
                              {formatMessage(locale, "ledger.confidenceValue", {
                                value: formatNumber(bucket.statedConfidence, locale),
                              })}{" "}
                              <span className="text-abys-muted">({bucket.label})</span>
                            </td>
                            <td className="py-1 pr-3">{formatNumber(bucket.withOutcome, locale)}</td>
                            <td className="py-1 pr-3">{formatRate(bucket.improvedRate, locale)}</td>
                            <td className="py-1 pr-3">
                              {bucket.status === "measured" && bucket.direction ? (
                                <span className={CALIBRATION_DIRECTION_STYLE[bucket.direction]}>
                                  {localizedLabel(locale, CALIBRATION_DIRECTION_LABEL, bucket.direction)}
                                  {bucket.gap !== null && (
                                    <span className="text-abys-muted">
                                      {" "}
                                      {formatMessage(locale, "ledger.gapPoints", {
                                        gap: (bucket.gap * 100).toLocaleString(locale, {
                                          maximumFractionDigits: 1,
                                        }),
                                      })}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-abys-muted">
                                  {formatMessage(locale, "ledger.samplesNeeded", {
                                    count: formatNumber(bucket.samplesNeeded, locale),
                                  })}
                                </span>
                              )}
                            </td>
                            <td className="py-1 pr-3 text-abys-ink">
                              {bucket.adjustedConfidence === null
                                ? "—"
                                : formatMessage(locale, "ledger.confidenceValue", {
                                    value: formatNumber(bucket.adjustedConfidence, locale),
                                  })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-[11px] text-abys-muted">{summary.calibration.note}</p>
                </div>
              </>
            )}

            <ul className="space-y-2 list-none p-0 m-0">
              {entries.map((entry) => (
                <li
                  key={entry.decisionId}
                  className="rounded-xl border border-abys-cream-border bg-white/50 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-abys-ink">{entry.title}</p>
                      <p className="text-xs text-abys-muted mt-0.5">
                        {formatMessage(locale, "ledger.entryMeta", {
                          choice: localizedLabel(locale, CHOICE_LABEL, entry.choice),
                          decidedBy: entry.decidedBy,
                          date: formatDate(entry.decidedAt, locale),
                          confidence: formatMessage(locale, "ledger.confidenceValue", {
                            value: formatNumber(entry.confidence, locale),
                          }),
                        })}
                      </p>
                    </div>
                    {entry.outcome ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RESULT_STYLE[entry.outcome.result]}`}
                      >
                        {t(locale, RESULT_LABEL[entry.outcome.result])}
                      </span>
                    ) : (
                      <span className="rounded-full bg-abys-cream px-2 py-0.5 text-[10px] text-abys-muted">
                        {t(locale, "ledger.resultPending")}
                      </span>
                    )}
                  </div>

                  {entry.execution ? (
                    <div className="mt-2 rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-xs">
                      <p className="text-abys-ink">
                        <span className="text-abys-muted">{t(locale, "ledger.executionLabel")} </span>
                        {entry.execution.title} ·{" "}
                        {formatMessage(locale, "ledger.executionMeta", {
                          status: localizedLabel(locale, ACTION_STATUS_LABEL, entry.execution.status),
                          owner: entry.execution.owner,
                          count: formatNumber(entry.execution.eventCount, locale),
                        })}
                      </p>
                      <p className="mt-0.5 text-[11px] text-abys-muted">
                        {formatMessage(locale, "ledger.decisionState", {
                          state: localizedLabel(locale, DECISION_STATE_LABEL, entry.decisionState),
                        })}
                        {entry.execution.dueAt && (
                          <> {formatMessage(locale, "ledger.dueDate", { date: formatDate(entry.execution.dueAt, locale) })}</>
                        )}
                        {entry.execution.progressNote && (
                          <> {formatMessage(locale, "ledger.note", { note: entry.execution.progressNote })}</>
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-abys-muted">
                      {formatMessage(locale, "ledger.noExecution", {
                        state: localizedLabel(locale, DECISION_STATE_LABEL, entry.decisionState),
                      })}
                    </p>
                  )}

                  {entry.businessImpact && (
                    <p className="mt-2 text-xs text-abys-ink">
                      <span className="text-abys-muted">{t(locale, "ledger.businessImpact")} </span>
                      {entry.businessImpact}
                    </p>
                  )}
                  {entry.expectedImpact && (
                    <div className="mt-2 rounded-lg border border-abys-cream-border bg-abys-cream/60 px-3 py-2 text-xs">
                      <p className="text-abys-ink">
                        <span className="text-abys-muted">{t(locale, "ledger.expectedNumeric")} </span>
                        {formatMoney(entry.expectedImpact.value, entry.expectedImpact.currency, locale)}
                        {entry.expectedImpact.low !== null && entry.expectedImpact.high !== null && (
                          <span className="text-abys-muted">
                            {" "}
                            {formatMessage(locale, "ledger.rangeText", {
                              low: formatMoney(entry.expectedImpact.low, entry.expectedImpact.currency, locale),
                              high: formatMoney(entry.expectedImpact.high, entry.expectedImpact.currency, locale),
                            })}
                          </span>
                        )}
                      </p>
                      {entry.expectedImpact.basis && (
                        <p className="mt-0.5 text-abys-muted">
                          {formatMessage(locale, "ledger.basis", { basis: entry.expectedImpact.basis })}
                        </p>
                      )}
                      {entry.expectedImpact.assumptions.length > 0 && (
                        <p className="mt-0.5 text-abys-muted">
                          {formatMessage(locale, "ledger.assumptions", {
                            list: entry.expectedImpact.assumptions.join("; "),
                          })}
                        </p>
                      )}
                      {entry.actualImpact && (
                        <p className="mt-1 text-abys-ink">
                          <span className="text-abys-muted">{t(locale, "ledger.actual")} </span>
                          {formatMoney(entry.actualImpact.value, entry.actualImpact.currency, locale)}
                          {entry.economicVariance && (
                            <span
                              className={
                                entry.economicVariance.amount >= 0
                                  ? " text-abys-healthy"
                                  : " text-abys-critical"
                              }
                            >
                              {" "}
                              {formatMessage(locale, "ledger.variance", {
                                amount: formatMoney(
                                  entry.economicVariance.amount,
                                  entry.economicVariance.currency,
                                  locale
                                ),
                                percent: formatPercent(entry.economicVariance.percent, locale),
                              })}
                            </span>
                          )}
                        </p>
                      )}
                      {entry.actualImpact && !entry.economicVariance && (
                        <p className="mt-1 text-[11px] text-abys-muted">
                          {t(locale, "ledger.varianceUnavailable")}
                        </p>
                      )}
                      {entry.actualImpact?.evidence && (
                        <p className="mt-0.5 text-abys-muted">
                          {formatMessage(locale, "ledger.evidence", { evidence: entry.actualImpact.evidence })}
                        </p>
                      )}
                    </div>
                  )}
                  {entry.outcome && (
                    <div className="mt-2 text-xs text-abys-muted">
                      <p>
                        <span className="text-abys-ink">{t(locale, "ledger.outcome")} </span>
                        {entry.outcome.note}
                      </p>
                      {entry.outcome.lesson && (
                        <p className="mt-0.5">
                          <span className="text-abys-ink">{t(locale, "ledger.lesson")} </span>
                          {entry.outcome.lesson}
                        </p>
                      )}
                    </div>
                  )}
                  {entry.outcome && (
                    <OutcomeHistory decisionId={entry.decisionId} className="mt-2" />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
