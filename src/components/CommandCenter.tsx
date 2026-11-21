"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ForecastPreview } from "@/components/ForecastPreview";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

/**
 * Yönetim Komuta Merkezi paneli (Faz 4). Oturumdayken dashboard'ın en üstünde
 * durur ve yöneticinin ~30 saniyede kurumu kavramasını sağlar: dikkat bekleyen
 * kararlar, risk/sinyal yoğunluğu, açık aksiyonlar, son ölçülen sonuçlar.
 * Veri /api/command-center'dan gelir (org-izolasyonlu). Her blok ilgili
 * sayfaya bağlıdır — kanıta/kayda tıkla-git.
 */

interface Brief {
  caseId: string;
  currentCondition: string;
  businessImpact: string;
  nextDevelopment: string;
  recommendedAction: string;
  confidence: number;
  confidenceRationale: string;
  topEvidence: { fact: string; reliability: string }[];
}

interface CalibrationBucket {
  key: string;
  label: string;
  min: number;
  max: number;
  withOutcome: number;
  improvedRate: number | null;
  status: "measured" | "insufficient_evidence";
  direction: "overconfident" | "aligned" | "underconfident" | null;
  adjustedConfidence: number | null;
  samplesNeeded: number;
}

interface CalibrationSummary {
  status: "measured" | "partial" | "insufficient_evidence";
  threshold: number;
  buckets: CalibrationBucket[];
}

interface CommandData {
  brief: Brief | null;
  calibration?: CalibrationSummary | null;
  decisions: { id: string; title: string; severity: string; confidence: number }[];
  signals: { bySeverity: Record<string, number>; top: { id: string; title: string; severity: string }[] };
  actions: {
    byStatus: Record<string, number>;
    open: { id: string; title: string; owner: string; status: string; overdue?: boolean; overdueDays?: number | null }[];
    overdueCount?: number;
  };
  outcomes: { result: string; note: string; lesson: string | null }[];
  lastActivityAt: string | null;
}

const SEV_COLOR: Record<string, string> = {
  critical: "var(--abys-critical)",
  warning: "var(--abys-warning)",
  info: "var(--abys-accent)",
  healthy: "var(--abys-healthy)",
};

const SEV_LABEL: Record<string, ShellKey> = {
  critical: "commandCenter.severityCritical",
  warning: "commandCenter.severityWarning",
  info: "commandCenter.severityInfo",
};

const SEV_PRIORITY: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const OUTCOME_LABEL: Record<string, ShellKey> = {
  improved: "commandCenter.outcomeImproved",
  unchanged: "commandCenter.outcomeUnchanged",
  worsened: "commandCenter.outcomeWorsened",
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

function severityLabel(locale: Locale, severity: string): string {
  const key = SEV_LABEL[severity];
  return key ? t(locale, key) : severity;
}

function outcomeLabel(locale: Locale, result: string): string {
  const key = OUTCOME_LABEL[result];
  return key ? t(locale, key) : result;
}

interface FocusAction {
  kicker: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

interface Development {
  key: string;
  source: string;
  title: string;
  meta: string;
  href: string;
  color: string;
}

function buildFocus(data: CommandData, locale: Locale): FocusAction | null {
  if (data.brief?.recommendedAction) {
    return {
      kicker: t(locale, "commandCenter.focusKickerRecommended"),
      title: data.brief.recommendedAction,
      detail: formatMessage(locale, "commandCenter.briefDetail", { condition: data.brief.currentCondition }),
      href: "/dashboard/decisions",
      cta: t(locale, "commandCenter.ctaReviewDecision"),
    };
  }

  const decision = data.decisions[0];
  if (decision) {
    return {
      kicker: t(locale, "commandCenter.focusKickerNext"),
      title: formatMessage(locale, "commandCenter.focusDecisionTitle", { title: decision.title }),
      detail: formatMessage(locale, "commandCenter.focusDecisionDetail", {
        severity: severityLabel(locale, decision.severity),
        confidence: decision.confidence,
      }),
      href: "/dashboard/decisions",
      cta: t(locale, "commandCenter.ctaDecisionCenter"),
    };
  }

  const signal = data.signals.top[0];
  if (signal) {
    return {
      kicker: t(locale, "commandCenter.focusKickerNext"),
      title: formatMessage(locale, "commandCenter.focusSignalTitle", { title: signal.title }),
      detail: formatMessage(locale, "commandCenter.focusSignalDetail", {
        severity: severityLabel(locale, signal.severity),
      }),
      href: "/dashboard/alerts",
      cta: t(locale, "commandCenter.ctaReviewSignals"),
    };
  }

  const action = data.actions.open[0];
  if (action) {
    return {
      kicker: t(locale, "commandCenter.focusKickerNext"),
      title: formatMessage(locale, "commandCenter.focusActionTitle", { title: action.title }),
      detail: formatMessage(locale, "commandCenter.focusActionDetail", { owner: action.owner }),
      href: "/dashboard/actions",
      cta: t(locale, "commandCenter.ctaReviewActions"),
    };
  }

  const outcome = data.outcomes[0];
  if (outcome) {
    return {
      kicker: t(locale, "commandCenter.focusKickerNext"),
      title: t(locale, "commandCenter.focusOutcomeTitle"),
      detail: formatMessage(locale, "commandCenter.focusOutcomeDetail", {
        outcome: outcomeLabel(locale, outcome.result),
      }),
      href: "/dashboard/memory",
      cta: t(locale, "commandCenter.ctaReviewOutcome"),
    };
  }

  return null;
}

function buildDevelopments(data: CommandData, locale: Locale): Development[] {
  const decisions = data.decisions.filter((decision) => decision.id !== data.brief?.caseId);
  const candidates: { priority: number; development: Development }[] = [
    ...decisions.map((decision, index) => ({
      priority: (SEV_PRIORITY[decision.severity] ?? 3) + index / 100,
      development: {
        key: `decision:${decision.id}`,
        source: t(locale, "commandCenter.sourceDecision"),
        title: decision.title,
        meta: formatMessage(locale, "commandCenter.metaConfidence", {
          severity: severityLabel(locale, decision.severity),
          confidence: decision.confidence,
        }),
        href: "/dashboard/decisions",
        color: SEV_COLOR[decision.severity] ?? SEV_COLOR.info,
      },
    })),
    ...data.signals.top.map((signal, index) => ({
      priority: (SEV_PRIORITY[signal.severity] ?? 3) + 0.5 + index / 100,
      development: {
        key: `signal:${signal.id}`,
        source: t(locale, "commandCenter.sourceSignal"),
        title: signal.title,
        meta: formatMessage(locale, "commandCenter.metaSeverity", {
          severity: severityLabel(locale, signal.severity),
        }),
        href: "/dashboard/alerts",
        color: SEV_COLOR[signal.severity] ?? SEV_COLOR.info,
      },
    })),
    ...data.actions.open.map((action, index) => ({
      priority: 4 + index / 100,
      development: {
        key: `action:${action.id}`,
        source: t(locale, "commandCenter.sourceAction"),
        title: action.title,
        meta: formatMessage(locale, "commandCenter.metaStatusOwner", {
          status: t(locale, action.status === "in_progress" ? "commandCenter.statusInProgress" : "commandCenter.statusOpen"),
          owner: action.owner,
        }),
        href: "/dashboard/actions",
        color: action.status === "in_progress" ? SEV_COLOR.warning : SEV_COLOR.info,
      },
    })),
    ...data.outcomes.map((outcome, index) => ({
      priority: 5 + index / 100,
      development: {
        key: `outcome:${index}`,
        source: t(locale, "commandCenter.sourceOutcome"),
        title: outcome.lesson || outcome.note,
        meta: outcomeLabel(locale, outcome.result),
        href: "/dashboard/memory",
        color:
          outcome.result === "improved"
            ? SEV_COLOR.healthy
            : outcome.result === "worsened"
              ? SEV_COLOR.critical
              : SEV_COLOR.info,
      },
    })),
  ];

  return candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((candidate) => candidate.development);
}

export function CommandCenter() {
  const locale = useLocale();
  const [data, setData] = useState<CommandData | null | "none">(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/command-center")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d ?? "none");
      })
      .catch(() => {
        if (!cancelled) setData("none");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Oturum yoksa (401) panel gösterilmez — prototip dashboard'ı bozulmaz.
  if (data === "none" || data === null) return null;

  const critCount = data.signals.bySeverity.critical ?? 0;
  const warnCount = data.signals.bySeverity.warning ?? 0;
  const openActions = (data.actions.byStatus.open ?? 0) + (data.actions.byStatus.in_progress ?? 0);
  const improved = data.outcomes.filter((o) => o.result === "improved").length;
  const focus = buildFocus(data, locale);
  const developments = buildDevelopments(data, locale);

  return (
    <section aria-labelledby="command-center-heading" className="mb-10 rounded-2xl border border-abys-cream-border bg-abys-cream/60 p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 id="command-center-heading" className="text-xs tracking-widest text-abys-muted font-semibold">{t(locale, "commandCenter.heading")}</h2>
        <span className="text-[11px] text-abys-muted">
          {data.lastActivityAt
            ? formatMessage(locale, "commandCenter.lastActivity", {
                time: new Date(data.lastActivityAt).toLocaleString(locale, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })
            : t(locale, "commandCenter.noActivity")}
        </span>
      </div>

      {(focus || developments.length > 0) && <FocusPanel locale={locale} focus={focus} developments={developments} />}

      {/* Yapılandırılmış yönetici brifingi — en kritik açık vaka (izlenebilir) */}
      {data.brief && <ExecutiveBrief locale={locale} brief={data.brief} calibration={data.calibration} />}

      {/* Özet şerit — 30 saniyelik kavrama */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label={t(locale, "commandCenter.statDecisions")} value={data.decisions.length} href="/dashboard/decisions" tone={data.decisions.length > 0 ? "warning" : "healthy"} />
        <Stat label={t(locale, "commandCenter.statSignals")} value={`${critCount} / ${warnCount}`} href="/dashboard/alerts" tone={critCount > 0 ? "critical" : warnCount > 0 ? "warning" : "healthy"} />
        <Stat label={t(locale, "commandCenter.statActions")} value={openActions} href="/dashboard/actions" tone={openActions > 0 ? "warning" : "healthy"} />
        <Stat label={t(locale, "commandCenter.statImproved")} value={improved} href="/dashboard/memory" tone="healthy" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dikkat bekleyen kararlar */}
        <Block title={t(locale, "commandCenter.blockDecisions")} href="/dashboard/decisions" empty={data.decisions.length === 0} emptyText={t(locale, "commandCenter.emptyDecisions")} viewAll={t(locale, "commandCenter.viewAll")}>
          {data.decisions.map((d) => (
            <li key={d.id} className="flex items-start gap-2 text-sm">
              <Dot color={SEV_COLOR[d.severity] ?? SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{d.title}</span>
              <span className="text-xs text-abys-muted shrink-0">%{d.confidence}</span>
            </li>
          ))}
        </Block>

        {/* En önemli sinyaller */}
        <Block title={t(locale, "commandCenter.blockSignals")} href="/dashboard/alerts" empty={data.signals.top.length === 0} emptyText={t(locale, "commandCenter.emptySignals")} viewAll={t(locale, "commandCenter.viewAll")}>
          {data.signals.top.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <Dot color={SEV_COLOR[s.severity] ?? SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{s.title}</span>
            </li>
          ))}
        </Block>

        {/* Açık aksiyonlar */}
        <Block
          title={
            data.actions.overdueCount
              ? formatMessage(locale, "commandCenter.blockActionsOverdue", { count: data.actions.overdueCount })
              : t(locale, "commandCenter.blockActions")
          }
          href="/dashboard/actions"
          empty={data.actions.open.length === 0}
          emptyText={t(locale, "commandCenter.emptyActions")}
          viewAll={t(locale, "commandCenter.viewAll")}
        >
          {data.actions.open.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <Dot color={a.status === "in_progress" ? SEV_COLOR.warning : SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{a.title}</span>
              <span className="text-xs text-abys-muted shrink-0">{a.owner}</span>
            </li>
          ))}
        </Block>

        {/* Son ölçülen sonuçlar */}
        <Block title={t(locale, "commandCenter.blockOutcomes")} href="/dashboard/memory" empty={data.outcomes.length === 0} emptyText={t(locale, "commandCenter.emptyOutcomes")} viewAll={t(locale, "commandCenter.viewAll")}>
          {data.outcomes.map((o, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Dot color={o.result === "improved" ? SEV_COLOR.healthy : o.result === "worsened" ? SEV_COLOR.critical : SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{o.lesson || o.note}</span>
            </li>
          ))}
        </Block>
      </div>

      {/* Öngörü önizlemesi — yalnızca org'un gerçek KPI serisi varsa görünür */}
      <ForecastPreview />
    </section>
  );
}

function FocusPanel({ locale, focus, developments }: { locale: Locale; focus: FocusAction | null; developments: Development[] }) {
  return (
    <section aria-labelledby="command-focus-heading" className="mb-6 rounded-xl border border-abys-accent/25 bg-white/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 id="command-focus-heading" className="text-[11px] tracking-widest text-abys-accent font-semibold">
          {t(locale, "commandCenter.focusHeading")}
        </h3>
        <span className="text-[11px] text-abys-muted">{t(locale, "commandCenter.focusSubheading")}</span>
      </div>
      <div className={`grid grid-cols-1 gap-5 ${focus && developments.length > 0 ? "lg:grid-cols-[1fr_1.15fr]" : ""}`}>
        {focus && (
          <div className="rounded-lg bg-abys-accent-soft/60 p-4">
            <p className="text-[10px] tracking-widest text-abys-accent font-semibold">{focus.kicker}</p>
            <p className="mt-1 font-serif text-lg leading-snug text-abys-navy">{focus.title}</p>
            {focus.detail && <p className="mt-1.5 text-xs text-abys-muted">{focus.detail}</p>}
            <Link href={focus.href} className="inline-block mt-3 text-xs font-medium text-abys-accent hover:underline">
              {focus.cta} →
            </Link>
          </div>
        )}
        {developments.length > 0 && (
          <div>
            <p className="text-[10px] tracking-widest text-abys-muted font-semibold mb-2">{t(locale, "commandCenter.developmentsHeading")}</p>
            <ol className="space-y-1 list-none p-0 m-0">
              {developments.map((development, index) => (
                <li key={development.key}>
                  <Link
                    href={development.href}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 -mx-2 text-sm hover:bg-white/70 transition-colors"
                  >
                    <span aria-hidden="true" className="w-3 pt-0.5 text-[10px] font-mono text-abys-muted shrink-0">
                      {index + 1}
                    </span>
                    <Dot color={development.color} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-abys-ink leading-snug">{development.title}</span>
                      <span className="block text-[10px] text-abys-muted mt-0.5">
                        {development.source} · {development.meta}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

const RELIABILITY_LABEL: Record<string, ShellKey> = {
  verified: "commandCenter.reliabilityVerified",
  estimated: "commandCenter.reliabilityEstimated",
  unknown: "commandCenter.reliabilityUnknown",
};

const CALIBRATION_NOTE: Record<string, ShellKey> = {
  overconfident: "commandCenter.calibrationNoteOverconfident",
  aligned: "commandCenter.calibrationNoteAligned",
  underconfident: "commandCenter.calibrationNoteUnderconfident",
};

function calibrationText(
  confidence: number,
  calibration: CalibrationSummary | null | undefined,
  locale: Locale
): string | null {
  if (!calibration) return null;
  const bucket = calibration.buckets.find((item) => confidence >= item.min && confidence <= item.max);
  if (!bucket) return null;
  if (bucket.status === "measured" && bucket.direction && bucket.improvedRate !== null) {
    const noteKey = CALIBRATION_NOTE[bucket.direction];
    return formatMessage(locale, "commandCenter.calibrationMeasured", {
      count: bucket.withOutcome,
      rate: (bucket.improvedRate * 100).toLocaleString(locale, { maximumFractionDigits: 1 }),
      note: noteKey ? t(locale, noteKey) : "",
    });
  }
  return formatMessage(locale, "commandCenter.calibrationInsufficient", {
    count: bucket.withOutcome,
    threshold: calibration.threshold,
  });
}

function ExecutiveBrief({
  locale,
  brief,
  calibration,
}: {
  locale: Locale;
  brief: Brief;
  calibration?: CalibrationSummary | null;
}) {
  const calibrationNote = calibrationText(brief.confidence, calibration, locale);
  return (
    <div className="mb-6 rounded-xl border border-abys-accent/25 bg-white/70 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] tracking-widest text-abys-accent font-semibold">{t(locale, "commandCenter.briefHeading")}</p>
        <span className="text-xs text-abys-muted">{formatMessage(locale, "commandCenter.briefConfidence", { confidence: brief.confidence })}</span>
      </div>
      <div className="space-y-2.5 text-sm">
        <BriefLine label={t(locale, "commandCenter.briefCurrent")} value={brief.currentCondition} />
        {brief.businessImpact && <BriefLine label={t(locale, "commandCenter.briefImpact")} value={brief.businessImpact} />}
        {brief.nextDevelopment && <BriefLine label={t(locale, "commandCenter.briefNext")} value={brief.nextDevelopment} />}
        {brief.recommendedAction && <BriefLine label={t(locale, "commandCenter.briefRecommended")} value={brief.recommendedAction} accent />}
        {brief.confidenceRationale && <BriefLine label={t(locale, "commandCenter.briefRationale")} value={brief.confidenceRationale} muted />}
        {calibrationNote && <BriefLine label={t(locale, "commandCenter.briefCalibration")} value={calibrationNote} muted />}
      </div>
      {brief.topEvidence.length > 0 && (
        <div className="mt-3 pt-3 border-t border-abys-cream-border">
          <p className="text-[11px] text-abys-muted font-semibold mb-1.5">{t(locale, "commandCenter.evidenceHeading")}</p>
          <ul className="space-y-1">
            {brief.topEvidence.map((e, i) => (
              <li key={i} className="text-xs text-abys-ink flex items-start gap-2">
                <span className="text-abys-muted shrink-0">[{RELIABILITY_LABEL[e.reliability] ? t(locale, RELIABILITY_LABEL[e.reliability]) : e.reliability}]</span>
                <span>{e.fact}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/dashboard/decisions" className="inline-block mt-3 text-xs text-abys-accent hover:underline">
        {t(locale, "commandCenter.ctaReviewDecision")} →
      </Link>
    </div>
  );
}

function BriefLine({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-abys-muted w-28 shrink-0 pt-0.5">{label}</span>
      <span className={`flex-1 ${accent ? "text-abys-navy font-medium" : muted ? "text-abys-muted text-xs pt-0.5" : "text-abys-ink"}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: string | number; href: string; tone: string }) {
  const color = SEV_COLOR[tone] ?? SEV_COLOR.info;
  return (
    <Link href={href} className="rounded-xl border border-abys-cream-border bg-white/60 px-4 py-3 hover:bg-white transition-colors">
      <p className="font-mono text-2xl" style={{ color }}>{value}</p>
      <p className="text-[11px] text-abys-muted leading-tight mt-1">{label}</p>
    </Link>
  );
}

function Block({ title, href, empty, emptyText, viewAll, children }: { title: string; href: string; empty: boolean; emptyText: string; viewAll: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-abys-navy">{title}</p>
        <Link href={href} className="text-[11px] text-abys-accent hover:underline">{viewAll}</Link>
      </div>
      {empty ? (
        <p className="text-sm text-abys-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />;
}
