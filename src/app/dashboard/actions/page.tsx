"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ExecutionAttemptStatus } from "@/components/ExecutionAttemptStatus";
import { OutcomeHistory, OUTCOME_META } from "@/components/OutcomeHistory";
import { PageHeader } from "@/components/PageHeader";
import { ExportLink } from "@/components/ExportLink";
import { overdueDays } from "@/lib/action-deadline";
import { filterActions, type ActionFilter } from "@/lib/action-filters";
import { computeEconomicVariance } from "@/lib/decision-economics";
import { buildActualImpact, type ActualImpactInputError } from "@/lib/outcome-impact";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";
import { useSession } from "@/lib/use-session";

/**
 * Aksiyon Merkezi (Faz 3): kararlardan doğan hesap verebilir aksiyonlar.
 * ABYS genel görev yöneticisi DEĞİLDİR — her aksiyon bir karara/vakaya bağlı
 * kalır. Yönetici ilerlemeyi günceller, tamamlanınca gerçekleşen sonucu ve
 * kurumsal dersi kaydeder (döngü: Karar → Aksiyon → Sonuç → Ders).
 */

interface ActionRow {
  id: string;
  decision_id: string;
  case_id: string;
  title: string;
  owner: string;
  due_at: string | null;
  status: string;
  progress_note: string | null;
  related_risk_id: string | null;
  decision_state: string;
  expected_impact: {
    value: number;
    currency: string;
    basis: string | null;
  } | null;
  latest_outcome: {
    result: "improved" | "unchanged" | "worsened";
    note: string;
    lesson: string | null;
    recorded_by: string;
    recorded_at: string;
    actual_impact: {
      value: number;
      currency: string;
      measurement_start: string | null;
      measurement_end: string | null;
      evidence: string | null;
    } | null;
  } | null;
  event_count: number;
  last_event_at: string | null;
  last_event_by: string | null;
  created_at: string;
}

interface ExecutionIntent {
  id: string;
  action_id: string;
  idempotency_key: string;
  mode: "manual" | "system";
  target_system: string | null;
  summary: string;
  status: "prepared" | "approved" | "cancelled";
  prepared_by_name: string;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
}

interface LocalizedPanelError {
  key: ShellKey;
  serverMessage?: string;
}

const STATUS_META: Record<string, { labelKey: ShellKey; color: string }> = {
  open: { labelKey: "actions.statusOpen", color: "var(--abys-muted, #8a8578)" },
  in_progress: { labelKey: "actions.statusInProgress", color: "var(--abys-warning)" },
  done: { labelKey: "actions.statusDone", color: "var(--abys-healthy)" },
  cancelled: { labelKey: "actions.statusCancelled", color: "var(--abys-critical)" },
};

const ACTION_FILTERS: { key: ActionFilter; labelKey: ShellKey }[] = [
  { key: "all", labelKey: "actions.filterAll" },
  { key: "open", labelKey: "actions.statusOpen" },
  { key: "in_progress", labelKey: "actions.statusInProgress" },
  { key: "overdue", labelKey: "actions.filterOverdue" },
  { key: "done", labelKey: "actions.statusDone" },
  { key: "cancelled", labelKey: "actions.statusCancelled" },
];

const DECISION_STATE_LABEL: Record<string, ShellKey> = {
  draft: "actions.decisionDraft",
  under_review: "actions.decisionUnderReview",
  awaiting_approval: "actions.decisionAwaitingApproval",
  approved: "actions.decisionApproved",
  rejected: "actions.decisionRejected",
  in_execution: "actions.decisionInExecution",
  completed: "actions.decisionCompleted",
  outcome_review: "actions.decisionOutcomeReview",
  closed: "actions.decisionClosed",
};

const IMPACT_ERROR_KEY: Record<ActualImpactInputError, ShellKey> = {
  amount_required: "actions.actualImpactAmountRequired",
  amount_invalid: "actions.actualImpactAmountInvalid",
  currency_invalid: "actions.actualImpactCurrencyInvalid",
  measurement_start_invalid: "actions.actualImpactStartInvalid",
  measurement_end_invalid: "actions.actualImpactEndInvalid",
  measurement_range_invalid: "actions.actualImpactRangeInvalid",
  evidence_too_long: "actions.actualImpactEvidenceTooLong",
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

interface ActionSummaryCounts {
  open: number;
  in_progress: number;
  done: number;
  cancelled: number;
}

function summarizeActions(actions: ActionRow[]): ActionSummaryCounts {
  const counts: ActionSummaryCounts = { open: 0, in_progress: 0, done: 0, cancelled: 0 };
  for (const action of actions) {
    if (action.status === "open") counts.open += 1;
    else if (action.status === "in_progress") counts.in_progress += 1;
    else if (action.status === "done") counts.done += 1;
    else if (action.status === "cancelled") counts.cancelled += 1;
  }
  return counts;
}

function newIntentKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ActionsPage() {
  const session = useSession();
  const locale = useLocale();
  const [actions, setActions] = useState<ActionRow[] | null>(null);
  const [error, setError] = useState<ShellKey | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<ActionFilter>("all");
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (session === undefined) return;
    let cancelled = false;
    fetch("/api/actions")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setError("actions.unauthorized");
          setActions([]);
          return;
        }
        if (!res.ok) {
          setError("actions.loadFailed");
          setActions([]);
          return;
        }
        setError(null);
        setActions((await res.json()).actions);
      })
      .catch(() => {
        if (!cancelled) {
          setError("actions.loadFailed");
          setActions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, reloadKey]);

  const summary = actions === null ? null : summarizeActions(actions);
  const visibleActions = actions === null ? [] : filterActions(actions, filter);

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "nav.actions").toLocaleUpperCase(locale)}
        title={t(locale, "actions.title")}
        accent={t(locale, "actions.titleAccent")}
        desc={t(locale, "actions.subtitle")}
      />
      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-3xl">
        {error && (
          <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3 mb-4">
            {t(locale, error)}
          </p>
        )}
        <div className="mb-4 flex justify-end">
          <ExportLink href="/api/actions/export" label={t(locale, "actions.exportCsv")} />
        </div>
        {actions === null && (
          <p className="text-sm text-abys-muted">{t(locale, "actions.loading")}</p>
        )}
        {actions !== null && actions.length > 0 && summary && <ActionSummary counts={summary} />}
        {actions !== null && actions.length > 0 && (
          <div
            role="group"
            aria-label={t(locale, "actions.filterLabel")}
            className="mb-3 flex flex-wrap gap-2"
          >
            {ACTION_FILTERS.map((option) => {
              const active = filter === option.key;
              const count = filterActions(actions, option.key).length;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option.key)}
                  className={
                    active
                      ? "text-xs rounded-full bg-abys-navy text-white px-3 py-1.5"
                      : "text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 hover:bg-white/60"
                  }
                >
                  {t(locale, option.labelKey)} ({count})
                </button>
              );
            })}
          </div>
        )}
        {actions !== null && actions.length === 0 && !error && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-8 text-center">
            <p className="text-sm text-abys-muted">
              {t(locale, "actions.empty")}
            </p>
          </div>
        )}
        {actions !== null && actions.length > 0 && visibleActions.length === 0 && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-6 text-center">
            <p className="text-sm text-abys-muted">{t(locale, "actions.filterEmpty")}</p>
          </div>
        )}
        <div className="space-y-3">
          {visibleActions.map((a) => (
            <ActionCard key={a.id} action={a} onChanged={load} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionSummary({ counts }: { counts: ActionSummaryCounts }) {
  const locale = useLocale();
  const activeCount = counts.open + counts.in_progress;
  const items = [
    {
      key: "open",
      labelKey: "actions.statusOpen",
      hintKey: "actions.hintNotStarted",
      value: counts.open,
    },
    {
      key: "in_progress",
      labelKey: "actions.statusInProgress",
      hintKey: "actions.hintInProgress",
      value: counts.in_progress,
    },
    {
      key: "done",
      labelKey: "actions.statusDone",
      hintKey: "actions.hintDone",
      value: counts.done,
    },
    {
      key: "cancelled",
      labelKey: "actions.statusCancelled",
      hintKey: "actions.hintCancelled",
      value: counts.cancelled,
    },
  ] as const;

  return (
    <section aria-labelledby="action-summary-heading" className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 id="action-summary-heading" className="text-xs font-semibold tracking-widest text-abys-muted uppercase">
          {t(locale, "actions.summaryHeading")}
        </h2>
        <p className="text-xs text-abys-muted">
          {t(locale, "actions.openWork")}: <span className="font-semibold text-abys-navy">{activeCount}</span>
          {" "}· {t(locale, "actions.completedWork")}: <span className="font-semibold text-abys-healthy">{counts.done}</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 m-0">
        {items.map((item) => {
          const label = t(locale, item.labelKey);
          return (
            <div key={item.key} className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
              <dt className="text-[11px] tracking-wide text-abys-muted uppercase">{label}</dt>
              <dd className="font-serif text-2xl text-abys-navy m-0" aria-label={`${label}: ${item.value}`}>
                {item.value}
              </dd>
              <p className="text-[11px] text-abys-muted m-0">{t(locale, item.hintKey)}</p>
            </div>
          );
        })}
      </dl>
      <p className="sr-only">{t(locale, "actions.summarySr")}</p>
    </section>
  );
}

function ActionCard({ action, onChanged }: { action: ActionRow; onChanged: () => void }) {
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(action.progress_note ?? "");
  const [showOutcome, setShowOutcome] = useState(false);
  const [showExecution, setShowExecution] = useState(false);
  const meta = STATUS_META[action.status] ?? STATUS_META.open;
  const decisionStateLabel = (state: string) => {
    const key = DECISION_STATE_LABEL[state];
    return key ? t(locale, key) : state;
  };

  async function patch(status?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, status, progressNote: note || undefined }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; decisionState?: string }
          | null;
        const stateSuffix = payload?.decisionState
          ? ` ${t(locale, "actions.decisionState")}: ${decisionStateLabel(payload.decisionState)}.`
          : "";
        throw new Error((payload?.error ?? t(locale, "actions.updateFailed")) + stateSuffix);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "actions.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-abys-navy">{action.title}</p>
        <span
          className="text-[11px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
          style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
        >
          {t(locale, meta.labelKey)}
        </span>
      </div>
      <p className="text-xs text-abys-muted mb-3">
        {t(locale, "actions.owner")}: {action.owner} · {t(locale, "actions.due")}: {action.due_at ? new Date(action.due_at).toLocaleDateString(locale) : t(locale, "actions.notSpecified")} · {t(locale, "actions.originDecision")}: <span className="font-mono">{action.decision_id.slice(0, 8)}</span>
      </p>
      {overdueDays(action.due_at, action.status) !== null && (
        <p
          className="text-[11px] font-semibold mb-2 rounded-full inline-block px-2 py-0.5"
          style={{ color: "var(--abys-critical)", backgroundColor: "var(--abys-critical-soft)" }}
        >
          {t(locale, "actions.overdueBadge")} · {overdueDays(action.due_at, action.status)} {t(locale, "actions.days")}
        </p>
      )}
      <p className="text-xs text-abys-muted mb-3">
        {t(locale, "actions.decisionState")}: {decisionStateLabel(action.decision_state)} ·{" "}
        {action.event_count} {t(locale, "actions.executionEvents")}
        {action.last_event_at && (
          <>
            {" "}· {t(locale, "actions.lastEvent")}: {action.last_event_by} / {new Date(action.last_event_at).toLocaleString(locale)}
          </>
        )}
      </p>
      <p className="text-[11px] text-abys-muted mb-3">
        {t(locale, "actions.relatedRisk")}: <span className="font-mono break-all">{action.related_risk_id ? action.related_risk_id : t(locale, "actions.noRiskReference")}</span>
      </p>
      {action.expected_impact && (
        <div className="mb-3 rounded-lg bg-white/60 px-3 py-2 text-[11px] text-abys-muted">
          <p className="font-semibold text-abys-ink">
            {formatMessage(locale, "actions.expectedImpact", {
              value: action.expected_impact.value.toLocaleString(locale),
              currency: action.expected_impact.currency,
            })}
          </p>
          {action.expected_impact.basis && (
            <p className="mt-0.5">
              {formatMessage(locale, "actions.expectedImpactBasis", {
                basis: action.expected_impact.basis,
              })}
            </p>
          )}
        </div>
      )}
      {action.latest_outcome && <LatestOutcome outcome={action.latest_outcome} />}
      {action.latest_outcome && <OutcomeHistory decisionId={action.decision_id} />}
      {error && <p className="text-xs text-abys-critical mb-3">{error}</p>}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={t(locale, "actions.progressNote")}
        className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-abys-accent"
      />

      <div className="flex flex-wrap gap-2">
        {action.status === "open" && (
          <button onClick={() => patch("in_progress")} disabled={busy} className="text-xs rounded-full bg-abys-navy text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            {t(locale, "actions.startProgress")}
          </button>
        )}
        {action.status === "in_progress" && (
          <button onClick={() => patch("done")} disabled={busy} className="text-xs rounded-full bg-abys-healthy text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            {t(locale, "actions.markDone")}
          </button>
        )}
        {(action.status === "open" || action.status === "in_progress") && (
          <button onClick={() => patch("cancelled")} disabled={busy} className="text-xs rounded-full border border-abys-critical/30 text-abys-critical px-3 py-1.5 hover:bg-abys-critical-soft disabled:opacity-50">
            {t(locale, "actions.cancel")}
          </button>
        )}
        <button onClick={() => patch(action.status)} disabled={busy || !note.trim() || action.status === "done" || action.status === "cancelled"} className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 hover:bg-white/60 disabled:opacity-50">
          {t(locale, "actions.saveNote")}
        </button>
        {action.status === "done" && (
          <button onClick={() => setShowOutcome((v) => !v)} className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1.5 hover:bg-abys-accent-soft">
            {showOutcome
              ? t(locale, "actions.closeOutcome")
              : action.latest_outcome
                ? t(locale, "actions.addAnotherOutcome")
                : t(locale, "actions.saveOutcome")}
          </button>
        )}
        {(action.status === "open" || action.status === "in_progress") && (
          <button onClick={() => setShowExecution((v) => !v)} className="text-xs rounded-full border border-abys-navy/25 text-abys-navy px-3 py-1.5 hover:bg-white/60">
            {showExecution ? t(locale, "actions.closePreparation") : t(locale, "actions.executePrep")}
          </button>
        )}
      </div>

      {showOutcome && (
        <OutcomeForm
          decisionId={action.decision_id}
          expectedImpact={action.expected_impact}
          onDone={() => { setShowOutcome(false); onChanged(); }}
        />
      )}
      {showExecution && <ExecutionIntentPanel actionId={action.id} />}
    </div>
  );
}

function LatestOutcome({ outcome }: { outcome: ActionRow["latest_outcome"] }) {
  const locale = useLocale();
  if (!outcome) return null;
  const meta = OUTCOME_META[outcome.result];
  return (
    <section
      aria-label={t(locale, "actions.latestOutcomeHeading")}
      className="mb-3 rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-abys-muted">
          {t(locale, "actions.latestOutcomeHeading")}
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
        >
          {t(locale, meta.labelKey)}
        </span>
      </div>
      <p className="mt-1 text-xs text-abys-ink whitespace-pre-wrap">{outcome.note}</p>
      {outcome.lesson && (
        <p className="mt-1 text-[11px] text-abys-muted">
          {t(locale, "actions.lessonHeading")}: {outcome.lesson}
        </p>
      )}
      {outcome.actual_impact && (
        <p className="mt-1 text-[11px] text-abys-muted">
          {t(locale, "actions.actualImpactRecorded")}: {outcome.actual_impact.value.toLocaleString(locale)}{" "}
          {outcome.actual_impact.currency}
          {outcome.actual_impact.evidence ? ` · ${outcome.actual_impact.evidence}` : ""}
          {outcome.actual_impact.measurement_start && (
            <> · {new Date(outcome.actual_impact.measurement_start).toLocaleDateString(locale)}</>
          )}
          {outcome.actual_impact.measurement_end && (
            <> → {new Date(outcome.actual_impact.measurement_end).toLocaleDateString(locale)}</>
          )}
        </p>
      )}
      <p className="mt-1 text-[11px] text-abys-muted">
        {formatMessage(locale, "actions.latestOutcomeMeta", {
          actor: outcome.recorded_by,
          date: new Date(outcome.recorded_at).toLocaleString(locale),
        })}
      </p>
    </section>
  );
}

function ExecutionIntentPanel({ actionId }: { actionId: string }) {
  const locale = useLocale();
  const [intents, setIntents] = useState<ExecutionIntent[]>([]);
  const [summary, setSummary] = useState("");
  const [targetSystem, setTargetSystem] = useState("");
  const [mode, setMode] = useState<"manual" | "system">("manual");
  const [idempotencyKey, setIdempotencyKey] = useState(newIntentKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LocalizedPanelError | null>(null);

  async function load() {
    const res = await fetch(`/api/actions/execution-intents?actionId=${encodeURIComponent(actionId)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError({ key: "actions.prepLoadFailed" });
      return;
    }
    const payload = (await res.json()) as { intents?: ExecutionIntent[] };
    setIntents(Array.isArray(payload.intents) ? payload.intents : []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/actions/execution-intents?actionId=${encodeURIComponent(actionId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("load_failed");
        const payload = (await res.json()) as { intents?: ExecutionIntent[] };
        if (!cancelled) setIntents(Array.isArray(payload.intents) ? payload.intents : []);
      })
      .catch(() => {
        if (!cancelled) setError({ key: "actions.prepLoadFailed" });
      });
    return () => {
      cancelled = true;
    };
  }, [actionId]);

  async function prepare() {
    if (!summary.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/actions/execution-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId,
          idempotencyKey,
          mode,
          targetSystem: targetSystem.trim() || undefined,
          summary: summary.trim(),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? t(locale, "actions.prepCreateFailed"));
      }
      setSummary("");
      await load();
    } catch (err) {
      setError({
        key: "actions.prepCreateFailed",
        serverMessage: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function approve(intentId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/actions/execution-intents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? t(locale, "actions.prepApproveFailed"));
      }
      setIdempotencyKey(newIntentKey());
      await load();
    } catch (err) {
      setError({
        key: "actions.prepApproveFailed",
        serverMessage: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-abys-cream-border space-y-2">
      <p className="text-xs font-semibold text-abys-muted uppercase">
        {t(locale, "actions.executePrep")}
      </p>
      <p className="text-[11px] text-abys-muted">{t(locale, "actions.prepDescription")}</p>
      <div className="flex flex-wrap gap-2">
        {(["manual", "system"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`text-xs rounded-full px-3 py-1.5 border ${mode === value ? "bg-abys-navy text-white border-abys-navy" : "border-abys-ink/15 hover:bg-white/60"}`}
          >
            {value === "manual" ? t(locale, "actions.modeManual") : t(locale, "actions.modeSystem")}
          </button>
        ))}
      </div>
      <input
        value={targetSystem}
        onChange={(e) => setTargetSystem(e.target.value)}
        placeholder={t(locale, "actions.targetSystemPlaceholder")}
        className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder={t(locale, "actions.summaryPlaceholder")}
        className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
      />
      {error && (
        <p className="text-xs text-abys-critical">{error.serverMessage ?? t(locale, error.key)}</p>
      )}
      <button onClick={prepare} disabled={busy || !summary.trim()} className="text-xs rounded-full bg-abys-navy text-white px-4 py-1.5 hover:opacity-90 disabled:opacity-50">
        {busy ? t(locale, "actions.saving") : t(locale, "actions.savePreparation")}
      </button>
      {intents.length > 0 && (
        <ul className="space-y-1 list-none p-0 m-0 pt-2">
          {intents.map((intent) => (
            <li key={intent.id} className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-abys-ink">{intent.summary}</span>
                <span className="text-abys-muted">
                  {intent.status === "prepared"
                    ? t(locale, "actions.intentPrepared")
                    : intent.status === "approved"
                      ? t(locale, "actions.intentApproved")
                      : t(locale, "actions.intentCancelled")}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-abys-muted">
                {intent.mode === "manual" ? t(locale, "actions.modeManual") : t(locale, "actions.modeSystem")}
                {intent.target_system ? ` · ${intent.target_system}` : ""}
                {" "}· {intent.prepared_by_name}
                {intent.approved_by_name ? ` · ${t(locale, "actions.approvedBy")}: ${intent.approved_by_name}` : ""}
              </p>
              <ExecutionAttemptStatus key={`${intent.id}:${intent.status}`} intentId={intent.id} />
              {intent.status === "prepared" && (
                <button onClick={() => approve(intent.id)} disabled={busy} className="mt-1 text-[11px] rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft disabled:opacity-50">
                  {t(locale, "actions.approveHuman")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutcomeForm({
  decisionId,
  expectedImpact,
  onDone,
}: {
  decisionId: string;
  expectedImpact: ActionRow["expected_impact"];
  onDone: () => void;
}) {
  const locale = useLocale();
  const [result, setResult] = useState<"improved" | "unchanged" | "worsened">("improved");
  const [outNote, setOutNote] = useState("");
  const [lesson, setLesson] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(expectedImpact?.currency ?? "");
  const [measurementStart, setMeasurementStart] = useState("");
  const [measurementEnd, setMeasurementEnd] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!outNote.trim()) {
      setErr(t(locale, "actions.outcomeRequired"));
      return;
    }
    const actualImpact = buildActualImpact({
      amount,
      currency,
      measurementStart,
      measurementEnd,
      evidence,
    });
    if (actualImpact.error) {
      setErr(t(locale, IMPACT_ERROR_KEY[actualImpact.error]));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId,
          result,
          note: outNote,
          lesson: lesson || undefined,
          actualImpact: actualImpact.impact ?? undefined,
        }),
      });
      if (!res.ok) {
        setErr(
          ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
            t(locale, "actions.outcomeSaveFailed")
        );
        return;
      }
      onDone();
    } catch {
      setErr(t(locale, "actions.outcomeSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const preview = buildActualImpact({
    amount,
    currency,
    measurementStart: "",
    measurementEnd: "",
    evidence: "",
  });
  const previewImpact = preview.error ? null : preview.impact;
  const previewVariance =
    expectedImpact && previewImpact && previewImpact.currency === expectedImpact.currency
      ? computeEconomicVariance(
          {
            value: expectedImpact.value,
            low: null,
            high: null,
            currency: expectedImpact.currency,
            basis: expectedImpact.basis,
            assumptions: [],
          },
          previewImpact
        )
      : null;
  const previewCurrencyMismatch =
    expectedImpact && previewImpact && previewImpact.currency !== expectedImpact.currency;

  return (
    <div className="mt-4 pt-4 border-t border-abys-cream-border space-y-2">
      <p className="text-xs font-semibold text-abys-muted uppercase">
        {t(locale, "actions.outcomeHeading")}
      </p>
      {expectedImpact && (
        <div className="rounded-lg bg-white/60 px-3 py-2 text-[11px] text-abys-muted">
          <p className="font-semibold text-abys-ink">
            {formatMessage(locale, "actions.expectedImpact", {
              value: expectedImpact.value.toLocaleString(locale),
              currency: expectedImpact.currency,
            })}
          </p>
          {expectedImpact.basis && (
            <p className="mt-0.5">
              {formatMessage(locale, "actions.expectedImpactBasis", {
                basis: expectedImpact.basis,
              })}
            </p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {(["improved", "unchanged", "worsened"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setResult(r)}
            className={`text-xs rounded-full px-3 py-1.5 border ${result === r ? "bg-abys-navy text-white border-abys-navy" : "border-abys-ink/15 hover:bg-white/60"}`}
          >
            {r === "improved"
              ? t(locale, "actions.outcomeImproved")
              : r === "unchanged"
                ? t(locale, "actions.outcomeUnchanged")
                : t(locale, "actions.outcomeWorsened")}
          </button>
        ))}
      </div>
      <textarea value={outNote} onChange={(e) => setOutNote(e.target.value)} rows={2} placeholder={t(locale, "actions.outcomeNotePlaceholder")} className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent" />
      <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} rows={2} placeholder={t(locale, "actions.lessonPlaceholder")} className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent" />
      <fieldset className="rounded-lg border border-abys-cream-border bg-white/40 p-3 space-y-2">
        <legend className="px-1 text-[11px] font-semibold text-abys-muted uppercase">
          {t(locale, "actions.actualImpactHeading")}
        </legend>
        <p className="text-[11px] text-abys-muted m-0">{t(locale, "actions.actualImpactHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-abys-muted">
            {t(locale, "actions.actualImpactAmount")}
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
          </label>
          <label className="text-[11px] text-abys-muted">
            {t(locale, "actions.actualImpactCurrency")}
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="TRY"
              className="mt-1 w-full text-sm uppercase rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
          </label>
          <label className="text-[11px] text-abys-muted">
            {t(locale, "actions.actualImpactEvidence")}
            <input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              maxLength={5000}
              placeholder={t(locale, "actions.actualImpactEvidencePlaceholder")}
              className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-abys-muted">
            {t(locale, "actions.actualImpactStart")}
            <input
              type="date"
              value={measurementStart}
              onChange={(e) => setMeasurementStart(e.target.value)}
              className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
          </label>
          <label className="text-[11px] text-abys-muted">
            {t(locale, "actions.actualImpactEnd")}
            <input
              type="date"
              value={measurementEnd}
              onChange={(e) => setMeasurementEnd(e.target.value)}
              className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
          </label>
        </div>
      </fieldset>
      {previewVariance && (
        <p className="text-[11px] font-semibold text-abys-ink">
          {previewVariance.percent === null
            ? formatMessage(locale, "actions.variancePreviewNoPercent", {
                value: previewVariance.amount.toLocaleString(locale),
                currency: previewVariance.currency,
              })
            : formatMessage(locale, "actions.variancePreview", {
                value: previewVariance.amount.toLocaleString(locale),
                currency: previewVariance.currency,
                percent: previewVariance.percent.toLocaleString(locale, {
                  maximumFractionDigits: 1,
                }),
              })}
        </p>
      )}
      {previewCurrencyMismatch && (
        <p className="text-[11px] text-abys-warning">
          {formatMessage(locale, "actions.varianceCurrencyMismatch", {
            expected: expectedImpact.currency,
          })}
        </p>
      )}
      {err && <p className="text-xs text-abys-critical">{err}</p>}
      <button onClick={save} disabled={busy} className="text-xs rounded-full bg-abys-accent text-white px-4 py-1.5 hover:opacity-90 disabled:opacity-50">
        {busy ? t(locale, "actions.saving") : t(locale, "actions.saveOutcomeFull")}
      </button>
    </div>
  );
}
