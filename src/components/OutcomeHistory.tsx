"use client";

import { useState, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

export const OUTCOME_META: Record<
  "improved" | "unchanged" | "worsened",
  { labelKey: ShellKey; color: string }
> = {
  improved: { labelKey: "actions.outcomeImproved", color: "var(--abys-healthy)" },
  unchanged: { labelKey: "actions.outcomeUnchanged", color: "var(--abys-warning)" },
  worsened: { labelKey: "actions.outcomeWorsened", color: "var(--abys-critical)" },
};

export interface OutcomeHistoryEntry {
  id: string;
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

/**
 * Kararın tüm ölçüm geçmişini istek üzerine yükler. Veri yalnızca
 * `/api/outcomes?decisionId=` üzerinden, oturumun kurumu kapsamında gelir;
 * bileşen kendi başına başka bir kaynaktan sonuç uydurmaz.
 */
export function OutcomeHistory({
  decisionId,
  className = "mb-3",
}: {
  decisionId: string;
  className?: string;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [entries, setEntries] = useState<OutcomeHistoryEntry[] | null>(null);
  const [truncated, setTruncated] = useState<{ limit: number } | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (entries !== null || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/outcomes?decisionId=${encodeURIComponent(decisionId)}`);
      if (!response.ok) throw new Error("history unavailable");
      const payload = (await response.json()) as {
        outcomes?: OutcomeHistoryEntry[];
        limit?: number;
        truncated?: boolean;
      };
      setEntries(Array.isArray(payload.outcomes) ? payload.outcomes : []);
      setTruncated(
        payload.truncated === true
          ? { limit: typeof payload.limit === "number" ? payload.limit : 20 }
          : null
      );
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label={t(locale, "actions.outcomeHistory")} className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="text-[11px] rounded-full border border-abys-ink/15 px-3 py-1 hover:bg-white/60"
      >
        {open ? t(locale, "actions.hideOutcomeHistory") : t(locale, "actions.outcomeHistory")}
        {entries !== null
          ? ` · ${formatMessage(locale, "actions.outcomeHistoryCount", { count: entries.length })}`
          : ""}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-abys-cream-border bg-white/40 px-3 py-2">
          <p className="text-[11px] text-abys-muted">{t(locale, "actions.outcomeHistoryHint")}</p>
          {loading && <p className="mt-1 text-[11px] text-abys-muted">…</p>}
          {failed && (
            <p className="mt-1 text-[11px] text-abys-critical" role="alert">
              {t(locale, "actions.outcomeHistoryLoadFailed")}
            </p>
          )}
          {entries && entries.length === 0 && !failed && (
            <p className="mt-1 text-[11px] text-abys-muted">—</p>
          )}
          {entries && entries.length > 0 && (
            <ol className="mt-2 space-y-2">
              {entries.map((entry) => {
                const meta = OUTCOME_META[entry.result];
                return (
                  <li key={entry.id} className="border-l-2 pl-2" style={{ borderColor: meta.color }}>
                    <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
                      {t(locale, meta.labelKey)}
                    </span>
                    <p className="text-xs text-abys-ink whitespace-pre-wrap">{entry.note}</p>
                    {entry.lesson && (
                      <p className="text-[11px] text-abys-muted">
                        {t(locale, "actions.lessonHeading")}: {entry.lesson}
                      </p>
                    )}
                    {entry.actual_impact && (
                      <p className="text-[11px] text-abys-muted">
                        {t(locale, "actions.actualImpactRecorded")}:{" "}
                        {entry.actual_impact.value.toLocaleString(locale)} {entry.actual_impact.currency}
                        {entry.actual_impact.evidence ? ` · ${entry.actual_impact.evidence}` : ""}
                        {entry.actual_impact.measurement_start && (
                          <> · {new Date(entry.actual_impact.measurement_start).toLocaleDateString(locale)}</>
                        )}
                        {entry.actual_impact.measurement_end && (
                          <> → {new Date(entry.actual_impact.measurement_end).toLocaleDateString(locale)}</>
                        )}
                      </p>
                    )}
                    <p className="text-[11px] text-abys-muted">
                      {formatMessage(locale, "actions.latestOutcomeMeta", {
                        actor: entry.recorded_by,
                        date: new Date(entry.recorded_at).toLocaleString(locale),
                      })}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {truncated && (
            <p className="mt-2 text-[11px] text-abys-warning" role="status">
              {formatMessage(locale, "actions.outcomeHistoryTruncated", {
                limit: truncated.limit,
              })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
