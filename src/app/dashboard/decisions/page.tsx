"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DecisionIntelligencePanel } from "@/components/DecisionIntelligencePanel";
import { useSession } from "@/lib/use-session";
import { getSector, type Sector } from "@/lib/sectors";
import { SEVERITY_META } from "@/lib/signals";
import { newId } from "@/lib/entities";
import { parseExpectedImpact } from "@/lib/expected-impact";
import {
  type DecisionCase,
  type ActionOption,
  type DecisionChoice,
  RELIABILITY_META,
} from "@/lib/decisions";
import { constraintsToPrompt, type Constraint } from "@/lib/constraints";
import { getScenarios } from "@/lib/scenarios";
import type { AiDecisionCase } from "@/lib/ai/provider";
import { postJsonStreamed } from "@/lib/ndjson-client";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

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

function reliabilityText(locale: Locale, code: string): string {
  const key = `decisions.reliability.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

function relationText(locale: Locale, code: string): string {
  const key = `decisions.relation.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

function causalMethodText(locale: Locale, code: string): string {
  const key = `decisions.causalMethod.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

function levelText(locale: Locale, code: string): string {
  const key = `decisions.level.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

function severityText(locale: Locale, code: string): string {
  const key = `decisions.severity.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

interface CalibrationSummary {
  status: "measured" | "partial" | "insufficient_evidence";
  totalWithOutcome: number;
  threshold: number;
  buckets: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    statedConfidence: number;
    withOutcome: number;
    improvedRate: number | null;
    status: "measured" | "insufficient_evidence";
    direction: "overconfident" | "aligned" | "underconfident" | null;
    adjustedConfidence: number | null;
    samplesNeeded: number;
  }>;
}

export default function DecisionsPage() {
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzerOverride, setAnalyzerOverride] = useState<boolean | null>(null);
  // Decision records are always server-owned and tenant-scoped. No localStorage fallback.
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  const sector = session ? getSector(session.sectorId) ?? getSector("other") ?? null : null;
  const sessionSector = session
    ? getSector(session.sectorId) ?? getSector("other") ?? null
    : null;
  const [showTaisAnalyzer, setShowTaisAnalyzer] = useState(false);
  const [serverCases, setServerCases] = useState<DecisionCase[] | null>(null);
  const [calibration, setCalibration] = useState<CalibrationSummary | null>(null);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/decision-cases")
      .then(async (r) => (r.ok ? ((await r.json()) as { calibration?: CalibrationSummary }) : null))
      .then((data) => {
        if (!cancelled && data?.calibration) setCalibration(data.calibration);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);
  const [serverReloadKey, setServerReloadKey] = useState(0);
  useEffect(() => {
    if (!session || !sector) return;
    let cancelled = false;
    fetch(`/api/decision-cases?sectorId=${sector.id}`)
      .then(async (r) => (r.ok ? (await r.json()).cases : []))
      .then((rows: { id: string; decisionId?: string; status: string; case: AiDecisionCase }[]) => {
        if (cancelled) return;
        setServerCases(
          rows.map((row) => ({
            ...toDecisionCase(sector.id, row.case),
            id: row.id,
            decisionId: row.decisionId,
            status: row.status as DecisionCase["status"],
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, sector, serverReloadKey]);

  const cases = session ? serverCases ?? [] : [];
  const showAnalyzer = analyzerOverride ?? cases.length === 0;
  const setShowAnalyzer = (v: boolean) => setAnalyzerOverride(v);

  // Kurumsal oturum var ama yerel onboarding profili yok (ör. TAIS demo
  // girişi) — sektöre bağlı analiz akışı yerine org'un TÜM sunucu vakaları
  // (ör. TAIS'in 6 sabit kararı) salt-okunur olarak gösterilir.
  const [taisCases, setTaisCases] = useState<DecisionCase[] | null>(null);
  useEffect(() => {
    if (!isTais) return;
    let cancelled = false;
    fetch("/api/decision-cases")
      .then(async (r) => (r.ok ? (await r.json()).cases : []))
      .then((rows: { id: string; decisionId?: string; status: string; case: AiDecisionCase }[]) => {
        if (cancelled) return;
        setTaisCases(
          rows.map((row) => ({
            ...toDecisionCase(session?.sectorId ?? "other", row.case),
            id: row.id,
            decisionId: row.decisionId,
            status: row.status as DecisionCase["status"],
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setTaisCases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isTais, session, serverReloadKey]);

  if (session === undefined || session === null) return null;

  if (isTais) {
    return (
      <div>
        <PageHeader
          eyebrow={t(locale, "decisions.eyebrow")}
          title={t(locale, "decisions.title")}
          accent={t(locale, "decisions.titleAccent")}
          desc={t(locale, "decisions.taisSubtitle")}
        />
        <div className="px-4 sm:px-6 lg:px-10 pb-16 space-y-3 max-w-4xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTaisAnalyzer((value) => !value)}
              className="text-sm rounded-lg bg-abys-navy text-white px-4 py-2.5 hover:opacity-90 transition-opacity"
            >
              {showTaisAnalyzer
                ? t(locale, "decisions.closeAnalyzer")
                : t(locale, "decisions.openAnalyzer")}
            </button>
          </div>
          {showTaisAnalyzer && sessionSector && (
            <Analyzer
              sector={sessionSector}
              onDone={() => {
                setShowTaisAnalyzer(false);
                setServerReloadKey((key) => key + 1);
              }}
            />
          )}
          {taisCases === null && (
            <p className="text-sm text-abys-muted">{t(locale, "decisions.loading")}</p>
          )}
          {taisCases !== null && taisCases.length === 0 && (
            <p className="text-sm text-abys-muted">{t(locale, "decisions.taisEmpty")}</p>
          )}
          {taisCases?.map((c) => (
            <TaisDecisionCard
              key={c.id}
              c={c}
              onChanged={() => setServerReloadKey((k) => k + 1)}
              calibration={calibration}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!sector) return null;

  const roleId = session?.role ?? "ceo";
  const openCases = cases.filter((c) => c.status === "open");
  const decidedCases = cases.filter((c) => c.status === "decided");

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "decisions.eyebrow")}
        title={t(locale, "decisions.title")}
        accent={t(locale, "decisions.titleAccent")}
        desc={t(locale, "decisions.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAnalyzer(!showAnalyzer)}
            className="text-sm rounded-lg bg-abys-navy text-white px-4 py-2.5 hover:opacity-90 transition-opacity"
          >
            {showAnalyzer ? t(locale, "decisions.closeAnalyzer") : t(locale, "decisions.openAnalyzer")}
          </button>
          {openCases.length > 0 && (
            <span className="text-sm text-abys-muted">
              {formatMessage(locale, "decisions.caseCounts", {
                open: openCases.length,
                decided: decidedCases.length,
              })}
            </span>
          )}
        </div>

        {showAnalyzer && (
          <Analyzer
            sector={sector}
            onDone={() => {
              setShowAnalyzer(false);
              setServerReloadKey((key) => key + 1);
              setSelectedId(null);
            }}
          />
        )}

        {openCases.length === 0 && !showAnalyzer && (
          <p className="text-sm text-abys-muted">
            {t(locale, "decisions.noOpenCases")}
          </p>
        )}

        <div className="space-y-3">
          {openCases.map((c) => (
            <CaseCard
              key={c.id}
              c={c}
              expanded={selectedId === c.id}
              roleId={roleId}
              onToggle={() => setSelectedId(selectedId === c.id ? null : c.id)}
              onDecided={() => {
                setServerReloadKey((k) => k + 1);
                setSelectedId(null);
              }}
              serverMode={!!session}
              calibration={calibration}
            />
          ))}
        </div>

        {decidedCases.length > 0 && (
          <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3 mt-8">
              {t(locale, "decisions.decidedHeading")}
            </p>
            <div className="space-y-2">
              {decidedCases.map((c) => {
                const meta = SEVERITY_META[c.severity];
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-abys-cream-border bg-abys-cream/50 px-5 py-3 opacity-70"
                  >
                    <span
                      className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 shrink-0"
                      style={{ color: meta.color, background: meta.soft }}
                    >
                      {severityText(locale, c.severity)}
                    </span>
                    <p className="text-sm text-abys-ink flex-1">{c.title}</p>
                    <span className="text-xs text-abys-muted shrink-0">
                      {t(locale, "decisions.decidedBadge")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Analiz paneli ---------------- */

function Analyzer({ sector, onDone }: { sector: Sector; onDone: () => void }) {
  const locale = useLocale();
  const scenarios = useMemo(() => getScenarios(sector.id), [sector.id]);
  const [data, setData] = useState("");
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [showConstraints, setShowConstraints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const trimmed = data.trim();
    if (!trimmed) {
      setError(t(readLocale(), "decisions.analyzer.noData"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const json = await postJsonStreamed<{ cases?: AiDecisionCase[]; providerId?: string }>(
        "/api/decision-cases",
        {
          sectorId: sector.id,
          data: trimmed,
          constraints: constraintsToPrompt(constraints),
        }
      );
      if (!Array.isArray(json.cases)) throw new Error(t(readLocale(), "decisions.unknownError"));
      // The API persists cases and audit events within the authenticated tenant.
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(readLocale(), "decisions.unknownError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-6 space-y-4">
      <div>
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
          {t(locale, "decisions.analyzer.dataHeading")}
        </p>
        {scenarios.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {scenarios.map((sc) => (
              <button
                key={sc.id}
                onClick={() => setData(sc.data)}
                title={sc.description}
                className="text-xs rounded-full px-3 py-1.5 border border-abys-ink/15 text-abys-ink hover:bg-white/60 transition-colors"
              >
                📋 {sc.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={data}
          onChange={(e) => setData(e.target.value)}
          rows={8}
          placeholder={t(locale, "decisions.analyzer.dataPlaceholder")}
          className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-abys-accent font-mono"
        />
      </div>

      <div>
        <button
          onClick={() => setShowConstraints((v) => !v)}
          className="text-xs tracking-widest text-abys-muted font-semibold flex items-center gap-1"
        >
          {formatMessage(locale, "decisions.analyzer.constraintsHeading", {
            count: constraints.length,
          })}{" "}
          {showConstraints ? "−" : "+"}
        </button>
        <p className="text-xs text-abys-muted mt-1">
          {t(locale, "decisions.analyzer.constraintsHint")}
        </p>
        {showConstraints && (
          <div className="mt-3 space-y-2">
            {constraints.map((c, i) => (
              <div key={c.id} className="flex gap-2">
                <input
                  value={c.label}
                  onChange={(e) =>
                    setConstraints((cs) => cs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  className="w-1/3 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
                />
                <input
                  value={c.value}
                  onChange={(e) =>
                    setConstraints((cs) => cs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                  className="flex-1 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
                />
                <button
                  onClick={() => setConstraints((cs) => cs.filter((_, j) => j !== i))}
                  className="text-xs text-abys-muted hover:text-abys-critical px-1"
                  title={t(locale, "decisions.analyzer.deleteConstraint")}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setConstraints((cs) => [
                  ...cs,
                  { id: newId(), label: t(readLocale(), "decisions.analyzer.newConstraint"), value: "" },
                ])
              }
              className="text-xs rounded-full px-3 py-1.5 border border-abys-ink/15 text-abys-ink hover:bg-white/60"
            >
              {t(locale, "decisions.analyzer.addConstraint")}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-abys-critical">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={busy}
          className="text-sm rounded-lg bg-abys-navy text-white px-5 py-2.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {busy ? t(locale, "decisions.analyzer.running") : t(locale, "decisions.analyzer.run")}
        </button>
        {busy && (
          <span className="text-xs text-abys-muted animate-pulse">
            {t(locale, "decisions.analyzer.busyHint")}
          </span>
        )}
      </div>
    </div>
  );
}

function toDecisionCase(sectorId: string, ai: AiDecisionCase): DecisionCase {
  const options: ActionOption[] = (ai.options ?? [])
    .map((o, i) => ({ ...o, id: `opt-${i}-${o.rank}` }))
    .sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.rank - b.rank);

  const recommended =
    options.find((o) => o.feasible && o.rank === ai.recommendedOptionRank) ??
    options.find((o) => o.feasible) ??
    options[0];

  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    sectorId,
    categoryId: ai.categoryId,
    categoryLabel: ai.categoryLabel,
    severity: ai.severity,
    title: ai.title,
    businessImpact: ai.businessImpact,
    confidence: Math.max(0, Math.min(100, Math.round(ai.confidence))),
    confidenceRationale: ai.confidenceRationale,
    evidence: ai.evidence ?? [],
    assumptions: ai.assumptions ?? [],
    historicalComparison: ai.historicalComparison,
    counterfactual: ai.counterfactual,
    options,
    recommendedOptionId: recommended?.id ?? "",
    status: "open",
  };
}

/* ---------------- TAIS salt-okunur karar kartı ---------------- */

/**
 * Sunucu-oturumlu (yerel onboarding profili olmayan) kurumlar için salt-okunur
 * karar kartı — TAIS'in sabit kararları zaten `decided` statüsünde geldiğinden
 * (bkz. seedTaisDecisions), OptionsPanel'in kabul/reddet akışı yerine
 * alternatifler düz liste olarak gösterilir; yeniden karar kaydı oluşturulmaz.
 */
function TaisDecisionCard({
  c,
  onChanged,
  calibration,
}: {
  c: DecisionCase;
  onChanged: () => void;
  calibration: CalibrationSummary | null;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = SEVERITY_META[c.severity];
  const recommended = c.options.find((o) => o.id === c.recommendedOptionId);
  const recommendedTitle = recommended?.title.replace(/^Önerilen:\s*/u, "");

  async function updateState(state: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: c.decisionId ?? c.id, state }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => null))?.error ??
            t(readLocale(), "decisions.stateUpdateFailed")
        );
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(readLocale(), "decisions.stateUpdateFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 mt-0.5 shrink-0"
            style={{ color: meta.color, background: meta.soft }}
          >
            {severityText(locale, c.severity)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-abys-ink">{c.title}</p>
            <p className="text-xs text-abys-muted mt-1">{c.businessImpact}</p>
            {recommended && (
              <p className="text-xs mt-2">
                <span className="text-abys-muted">{t(locale, "decisions.recommended")}{" "}</span>
                <span className="text-abys-navy font-medium">{recommendedTitle}</span>
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <ConfidenceBadge value={c.confidence} />
            <p className="text-xs text-abys-muted mt-1">
              {open ? t(locale, "decisions.collapse") : t(locale, "decisions.expand")}
            </p>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-abys-ink/10 px-5 py-5 space-y-6">
          <ConfidencePanel c={c} calibration={calibration} />
          <EvidencePanel c={c} defaultOpen={false} />
          <CounterfactualPanel c={c} />
           <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
              {t(locale, "decisions.alternativesHeading")}
            </p>
            <div className="space-y-2">
              {c.options.map((o) => (
                <OptionRow
                  key={o.id}
                  o={o}
                  recommended={o.id === c.recommendedOptionId}
                  selectable={false}
                  selected={false}
                />
              ))}
            </div>
           </div>
           {error && <p className="text-xs text-abys-critical">{error}</p>}
           <div className="flex flex-wrap gap-2">
             <button onClick={() => updateState("approved")} disabled={busy} className="text-xs rounded-lg bg-abys-navy text-white px-3 py-1.5 disabled:opacity-50">{t(locale, "decisions.state.approve")}</button>
             <button onClick={() => updateState("under_review")} disabled={busy} className="text-xs rounded-lg border border-abys-ink/15 px-3 py-1.5 disabled:opacity-50">{t(locale, "decisions.state.review")}</button>
             <button onClick={() => updateState("rejected")} disabled={busy} className="text-xs rounded-lg border border-abys-ink/15 px-3 py-1.5 text-abys-critical disabled:opacity-50">{t(locale, "decisions.state.defer")}</button>
           </div>
           <p className="text-xs text-abys-muted">
             {formatMessage(locale, "decisions.statusLine", { status: c.status })}
           </p>
         </div>
      )}
    </div>
  );
}

/* ---------------- Vaka kartı ---------------- */

function CaseCard({
  c,
  expanded,
  roleId,
  onToggle,
  onDecided,
  serverMode,
  calibration,
}: {
  c: DecisionCase;
  expanded: boolean;
  roleId: string;
  onToggle: () => void;
  onDecided: () => void;
  serverMode: boolean;
  calibration: CalibrationSummary | null;
}) {
  const locale = useLocale();
  const meta = SEVERITY_META[c.severity];
  const recommended = c.options.find((o) => o.id === c.recommendedOptionId);
  const recommendedTitle = recommended?.title.replace(/^Önerilen:\s*/u, "");
  // CEO ilk ekranda sadece özet görür; operasyon rolleri kanıtı açık görür.
  const detailByDefault = roleId === "operations" || roleId === "product";

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
      {/* 3 saniye ekranı */}
      <button onClick={onToggle} className="w-full text-left px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 mt-0.5 shrink-0"
            style={{ color: meta.color, background: meta.soft }}
          >
            {severityText(locale, c.severity)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-abys-ink">{c.title}</p>
            <p className="text-xs text-abys-muted mt-1">{c.businessImpact}</p>
            {recommended && (
              <p className="text-xs mt-2">
                <span className="text-abys-muted">{t(locale, "decisions.recommended")}{" "}</span>
                <span className="text-abys-navy font-medium">{recommendedTitle}</span>
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <ConfidenceBadge value={c.confidence} />
            <p className="text-xs text-abys-muted mt-1">
              {expanded ? t(locale, "decisions.collapse") : t(locale, "decisions.expand")}
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-abys-ink/10 px-5 py-5 space-y-6">
          {serverMode && (
            <div className="flex justify-end -mb-2">
              <TraceButton caseId={c.id} />
            </div>
          )}
          <ConfidencePanel c={c} calibration={calibration} />
          <EvidencePanel c={c} defaultOpen={detailByDefault} />
          <CounterfactualPanel c={c} />
          {serverMode && <DecisionIntelligencePanel caseId={c.id} />}
          <CausalPanel c={c} serverMode={serverMode} />
          <OptionsPanel c={c} onDecided={onDecided} />
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const locale = useLocale();
  const color =
    value >= 75 ? "var(--abys-healthy)" : value >= 50 ? "var(--abys-warning)" : "var(--abys-critical)";
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-abys-ink/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>
        {formatMessage(locale, "decisions.percent", { value })}
      </span>
    </div>
  );
}

function ConfidencePanel({
  c,
  calibration,
}: {
  c: DecisionCase;
  calibration: CalibrationSummary | null;
}) {
  const locale = useLocale();
  const bucket = calibration?.buckets.find(
    (item) => c.confidence >= item.min && c.confidence <= item.max
  );
  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
        {t(locale, "decisions.confidenceHeading")}
      </p>
      <div className="flex items-center gap-3 mb-1.5">
        <ConfidenceBadge value={c.confidence} />
      </div>
      <p className="text-sm text-abys-ink">{c.confidenceRationale}</p>
      {calibration && (
        <p className="mt-2 text-xs text-abys-muted" data-testid="calibration-hint">
          {bucket && bucket.status === "measured" && bucket.direction && bucket.improvedRate !== null ? (
            <>
              {formatMessage(locale, "decisions.calibration.measured", {
                outcomes: bucket.withOutcome,
              })}{" "}
              <span className="text-abys-ink font-medium">
                {formatMessage(locale, "decisions.calibration.rate", {
                  value: (bucket.improvedRate * 100).toLocaleString(locale, {
                    maximumFractionDigits: 1,
                  }),
                })}
              </span>{" "}
              · {t(locale, `decisions.calibration.${bucket.direction}` as ShellKey)}
              {bucket.adjustedConfidence !== null && (
                <>
                  {" "}
                  {formatMessage(locale, "decisions.calibration.adjusted", {
                    value: bucket.adjustedConfidence,
                  })}
                </>
              )}
            </>
          ) : (
            <>
              {t(locale, "decisions.calibration.insufficient")}
              {bucket
                ? formatMessage(locale, "decisions.calibration.bucketInfo", {
                    outcomes: bucket.withOutcome,
                    threshold: calibration.threshold,
                  })
                : ""}
            </>
          )}
        </p>
      )}
    </div>
  );
}

function EvidencePanel({ c, defaultOpen }: { c: DecisionCase; defaultOpen: boolean }) {
  const locale = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs tracking-widest text-abys-muted font-semibold mb-2 flex items-center gap-1"
      >
        {formatMessage(locale, "decisions.evidenceHeading", { count: c.evidence.length })}{" "}
        {open ? "−" : "+"}
      </button>
      {open && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {c.evidence.map((e, i) => {
              const rmeta = RELIABILITY_META[e.reliability] ?? RELIABILITY_META.unknown;
              return (
                <div key={i} className="flex items-start gap-2.5 text-sm bg-white/60 rounded-lg px-3 py-2">
                  <span
                    className="text-[10px] font-semibold rounded-full px-2 py-0.5 mt-0.5 shrink-0 border"
                    style={{ color: rmeta.color, borderColor: rmeta.color }}
                  >
                    {reliabilityText(locale, e.reliability ?? "unknown")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-abys-ink">{e.fact}</p>
                    <p className="text-xs text-abys-muted mt-0.5">
                      {formatMessage(locale, "decisions.evidenceSource", { source: e.source })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {c.assumptions.length > 0 && (
            <div>
              <p className="text-xs text-abys-muted font-semibold mb-1">
                {t(locale, "decisions.assumptionsHeading")}
              </p>
              <ul className="text-sm text-abys-ink list-disc list-inside space-y-0.5">
                {c.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {c.historicalComparison && (
            <div>
              <p className="text-xs text-abys-muted font-semibold mb-1">
                {t(locale, "decisions.historicalHeading")}
              </p>
              <p className="text-sm text-abys-ink">{c.historicalComparison}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CounterfactualPanel({ c }: { c: DecisionCase }) {
  const locale = useLocale();
  return (
    <div className="rounded-lg border border-abys-critical/25 bg-abys-critical/5 px-4 py-3.5">
      <p className="text-xs tracking-widest font-semibold mb-2" style={{ color: "var(--abys-critical)" }}>
        {t(locale, "decisions.counterfactualHeading")}
      </p>
      <p className="text-sm text-abys-ink mb-2">{c.counterfactual.narrative}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-abys-muted">
        <span>
          <span className="font-semibold">{t(locale, "decisions.projectedImpact")}</span>{" "}
          {c.counterfactual.projectedImpact}
        </span>
        <span>
          <span className="font-semibold">{t(locale, "decisions.timeHorizon")}</span>{" "}
          {c.counterfactual.timeHorizon}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Kök neden zinciri ---------------- */

const RELATION_STATUSES = [
  "observed_correlation",
  "inferred",
  "expert_confirmed",
  "data_confirmed",
  "disputed",
] as const;
type RelationStatus = (typeof RELATION_STATUSES)[number];

const RELATION_META: Record<RelationStatus, { label: string; color: string; soft: string }> = {
  observed_correlation: { label: "Gözlemlenen korelasyon", color: "var(--abys-muted)", soft: "rgba(107,115,134,0.12)" },
  inferred: { label: "Çıkarım", color: "var(--abys-warning)", soft: "var(--abys-warning-soft)" },
  expert_confirmed: { label: "Uzman onaylı", color: "var(--abys-info)", soft: "var(--abys-info-soft)" },
  data_confirmed: { label: "Veri ile doğrulanmış", color: "var(--abys-healthy)", soft: "var(--abys-healthy-soft)" },
  disputed: { label: "Tartışmalı", color: "var(--abys-critical)", soft: "var(--abys-critical-soft)" },
};

const CAUSAL_METHOD_LABELS: Record<string, string> = {
  randomized_controlled_trial: "Randomize kontrollü deney",
  quasi_experimental: "Yarı deneysel",
  difference_in_differences: "Farkların farkı",
  instrumental_variable: "Araç değişken",
  regression_adjustment: "Regresyon düzeltmesi",
  observational: "Gözlemsel",
  expert_judgment: "Uzman görüşü",
};

interface CausalCandidate {
  fromLabel: string;
  toLabel: string;
  associationRatePct: number;
  sampleSize: number;
  matchedEffects: number;
  averageLagDays: number;
  dataQuality: "high" | "medium" | "low";
  uncertainty: "medium" | "high";
  note: string;
}

interface CausalLink {
  id: string;
  fromLabel: string;
  toLabel: string;
  relationStatus: RelationStatus;
  confidence: number;
  note: string | null;
  method: string | null;
  sampleSize: number | null;
  dataQuality: "high" | "medium" | "low" | null;
  uncertainty: "low" | "medium" | "high" | null;
}

// Sunucu oturumu yoksa gizlenir — kök neden zinciri org izolasyonlu sunucu verisidir.
function CausalPanel({ c, serverMode }: { c: DecisionCase; serverMode: boolean }) {
  const locale = useLocale();
  const [links, setLinks] = useState<CausalLink[] | null>(null);
  const [candidates, setCandidates] = useState<CausalCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<RelationStatus>("observed_correlation");
  const [confidence, setConfidence] = useState(60);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("");
  const [sampleSize, setSampleSize] = useState("");
  const [dataQuality, setDataQuality] = useState("");
  const [uncertainty, setUncertainty] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    Promise.all([
      fetch(`/api/causal?caseId=${c.id}`),
      fetch(`/api/causal/suggestions?caseId=${c.id}`),
    ])
      .then(async ([linksResponse, suggestionsResponse]) => {
        if (!linksResponse.ok || !suggestionsResponse.ok) {
          const failed = !linksResponse.ok ? linksResponse : suggestionsResponse;
          throw new Error((await failed.json().catch(() => null))?.error ?? t(readLocale(), "decisions.causal.loadFailed"));
        }
        const [linksBody, suggestionsBody] = await Promise.all([linksResponse.json(), suggestionsResponse.json()]);
        setLinks(linksBody.links as CausalLink[]);
        setCandidates(suggestionsBody.candidates as CausalCandidate[]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t(readLocale(), "decisions.causal.loadFailed")));
  }

  useEffect(() => {
    if (!serverMode) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, c.id]);

  if (!serverMode) return null;

  async function addLink() {
    if (!from.trim() || !to.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/causal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: c.id,
          fromLabel: from.trim(),
          toLabel: to.trim(),
          relationStatus: status,
          confidence,
          note: note.trim() || undefined,
          method: method || undefined,
          sampleSize: sampleSize.trim() === "" ? undefined : Number(sampleSize),
          dataQuality: dataQuality || undefined,
          uncertainty: uncertainty || undefined,
        }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => null))?.error ?? t(readLocale(), "decisions.causal.addFailed")
        );
      setFrom("");
      setTo("");
      setNote("");
      setStatus("observed_correlation");
      setConfidence(60);
      setMethod("");
      setSampleSize("");
      setDataQuality("");
      setUncertainty("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(readLocale(), "decisions.unknownError"));
    } finally {
      setBusy(false);
    }
  }

  async function addSuggestion(candidate: CausalCandidate) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/causal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: c.id,
          fromLabel: candidate.fromLabel,
          toLabel: candidate.toLabel,
          relationStatus: "observed_correlation",
          confidence: candidate.associationRatePct,
          note: candidate.note,
          method: "observational",
          sampleSize: candidate.sampleSize,
          dataQuality: candidate.dataQuality,
          uncertainty: candidate.uncertainty,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? t(readLocale(), "decisions.causal.addFailed"));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(readLocale(), "decisions.causal.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(linkId: string, next: RelationStatus) {
    setError(null);
    try {
      const res = await fetch("/api/causal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, relationStatus: next }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => null))?.error ?? t(readLocale(), "decisions.stateUpdateFailed")
        );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(readLocale(), "decisions.unknownError"));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs tracking-widest text-abys-muted font-semibold">
          {t(locale, "decisions.causal.heading")}{" "}
          {links ? formatMessage(locale, "decisions.causal.count", { count: links.length }) : ""}
        </p>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-abys-muted hover:text-abys-ink">
          {showForm ? t(locale, "decisions.cancel") : t(locale, "decisions.causal.addLink")}
        </button>
      </div>

      {error && <p className="text-xs mb-2" style={{ color: "var(--abys-critical)" }}>{error}</p>}

      {candidates.length > 0 && (
        <div className="rounded-lg border border-abys-accent/30 bg-abys-accent-soft/30 p-3 mb-3 space-y-2">
          <div>
            <p className="text-xs font-semibold text-abys-navy">{t(locale, "decisions.causal.suggestionsHeading")}</p>
            <p className="text-[11px] text-abys-muted">{t(locale, "decisions.causal.suggestionsDisclaimer")}</p>
          </div>
          {candidates.map((candidate) => (
            <div key={`${candidate.fromLabel}:${candidate.toLabel}`} className="flex items-start gap-2 border-t border-abys-ink/10 pt-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-abys-ink">{candidate.fromLabel} <span className="text-abys-muted">→</span> {candidate.toLabel}</p>
                <p className="text-[11px] text-abys-muted">{candidate.matchedEffects}/{candidate.sampleSize} · {formatMessage(locale, "decisions.causal.associationRate", { rate: candidate.associationRatePct })} · {formatMessage(locale, "decisions.causal.lagDays", { days: candidate.averageLagDays })} · {formatMessage(locale, "decisions.causal.dataQuality", { level: levelText(locale, candidate.dataQuality) })}</p>
              </div>
              <button disabled={busy} onClick={() => void addSuggestion(candidate)} className="shrink-0 text-[11px] rounded-full border border-abys-ink/20 px-2.5 py-1 disabled:opacity-40">{t(locale, "decisions.causal.addSuggestion")}</button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5 mb-3">
        {links && links.length === 0 && !showForm && (
          <p className="text-sm text-abys-muted">{t(locale, "decisions.causal.empty")}</p>
        )}
        {links?.map((l) => {
          const meta = RELATION_META[l.relationStatus];
          return (
            <div key={l.id} className="flex items-start gap-2.5 text-sm bg-white/60 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-abys-ink">
                  {l.fromLabel} <span className="text-abys-muted">→</span> {l.toLabel}
                </p>
                {l.note && <p className="text-xs text-abys-muted mt-0.5">{l.note}</p>}
                {(l.method || l.sampleSize !== null || l.dataQuality || l.uncertainty) && (
                  <p className="text-[11px] text-abys-muted mt-0.5">
                    {l.method ? causalMethodText(locale, l.method) : t(locale, "decisions.causal.methodUnset")}
                    {l.sampleSize !== null && <> · n={l.sampleSize}</>}
                    {l.dataQuality && (
                      <> · {formatMessage(locale, "decisions.causal.dataQuality", { level: levelText(locale, l.dataQuality) })}</>
                    )}
                    {l.uncertainty && (
                      <> · {formatMessage(locale, "decisions.causal.uncertainty", { level: levelText(locale, l.uncertainty) })}</>
                    )}
                  </p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span
                  className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ color: meta.color, background: meta.soft }}
                >
                  {relationText(locale, l.relationStatus)}
                </span>
                <span className="text-xs text-abys-muted">
                  {formatMessage(locale, l.relationStatus === "observed_correlation" ? "decisions.causal.associationRate" : "decisions.percent", { rate: l.confidence, value: l.confidence })}
                </span>
                <select
                  value={l.relationStatus}
                  onChange={(e) => changeStatus(l.id, e.target.value as RelationStatus)}
                  className="text-[10px] rounded border border-abys-cream-border bg-white/70 px-1 py-0.5"
                >
                  {RELATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {relationText(locale, s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="space-y-2 rounded-lg border border-abys-cream-border bg-white/50 p-3">
          <div className="flex gap-2">
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder={t(locale, "decisions.causal.fromPlaceholder")}
              className="flex-1 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t(locale, "decisions.causal.toPlaceholder")}
              className="flex-1 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as RelationStatus)}
              className="text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2"
            >
              {RELATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {relationText(locale, s)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              value={confidence}
              onChange={(e) => setConfidence(Math.max(0, Math.min(100, Number(e.target.value))))}
              className="w-20 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2"
            />
            <span className="text-xs text-abys-muted">{t(locale, "decisions.causal.confidenceUnit")}</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              aria-label={t(locale, "decisions.causal.methodAria")}
              className="text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2"
            >
              <option value="">{t(locale, "decisions.causal.methodUnset")}</option>
              {Object.keys(CAUSAL_METHOD_LABELS).map((value) => (
                <option key={value} value={value}>
                  {causalMethodText(locale, value)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={sampleSize}
              onChange={(e) => setSampleSize(e.target.value)}
              placeholder="n"
              aria-label={t(locale, "decisions.causal.sampleAria")}
              className="w-24 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2"
            />
            <select
              value={dataQuality}
              onChange={(e) => setDataQuality(e.target.value)}
              aria-label={t(locale, "decisions.causal.dataQualityAria")}
              className="text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2"
            >
              <option value="">{t(locale, "decisions.causal.dataQuality")}</option>
              <option value="high">{t(locale, "decisions.level.high")}</option>
              <option value="medium">{t(locale, "decisions.level.medium")}</option>
              <option value="low">{t(locale, "decisions.level.low")}</option>
            </select>
            <select
              value={uncertainty}
              onChange={(e) => setUncertainty(e.target.value)}
              aria-label={t(locale, "decisions.causal.uncertaintyAria")}
              className="text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2"
            >
              <option value="">{t(locale, "decisions.causal.uncertainty")}</option>
              <option value="low">{t(locale, "decisions.level.low")}</option>
              <option value="medium">{t(locale, "decisions.level.medium")}</option>
              <option value="high">{t(locale, "decisions.level.high")}</option>
            </select>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(locale, "decisions.causal.notePlaceholder")}
            className="w-full text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
          <button
            onClick={addLink}
            disabled={busy || !from.trim() || !to.trim()}
            className="text-xs rounded-lg bg-abys-navy text-white px-3 py-1.5 disabled:opacity-40 hover:opacity-90"
          >
            {t(locale, "decisions.causal.addButton")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Kanıta tıkla: izlenebilirlik modalı ---------------- */

function TraceButton({ caseId }: { caseId: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs rounded-full px-3 py-1.5 border border-abys-ink/15 text-abys-muted hover:text-abys-ink hover:bg-white/60 transition-colors"
      >
        {t(locale, "decisions.trace.button")}
      </button>
      {open && <TraceModal caseId={caseId} onClose={() => setOpen(false)} />}
    </>
  );
}

interface TraceData {
  case: {
    id: string;
    title: string;
    severity: string;
    status: string;
    confidence: number;
    confidenceRationale: string;
    assumptions: string[];
    historicalComparison: string;
    evidence: { source: string; fact: string; reliability: string }[];
    createdAt: string;
  };
  producedBy: {
    provider: string;
    model: string | null;
    policy: string | null;
    latency_ms: number;
    output_valid: boolean;
    created_at: string;
  } | null;
  decisions: {
    id: string;
    choice: string;
    decided_by: string;
    payload: { reason?: string; chosenAction?: string };
    outcome: { result?: string; note?: string; lesson?: string } | null;
    created_at: string;
  }[];
  actions: {
    id: string;
    decision_id: string;
    title: string;
    owner: string;
    status: string;
    progress_note: string | null;
  }[];
  audit: { type: string; actor: string; summary: string; created_at: string }[];
}

function fmtDateTime(locale: Locale, iso: string): string {
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

function TraceModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const locale = useLocale();
  const [data, setData] = useState<TraceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = !data && !error;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trace?caseId=${caseId}`)
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            (await r.json().catch(() => null))?.error ?? t(readLocale(), "decisions.trace.loadFailed")
          );
        return (await r.json()) as TraceData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : t(readLocale(), "decisions.unknownError"));
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-full overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-abys-cream-border sticky top-0 bg-white">
          <p className="text-sm font-semibold text-abys-ink">{t(locale, "decisions.trace.title")}</p>
          <button onClick={onClose} className="text-abys-muted hover:text-abys-ink text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loading && <p className="text-sm text-abys-muted">{t(locale, "decisions.loading")}</p>}
          {error && <p className="text-sm" style={{ color: "var(--abys-critical)" }}>{error}</p>}

          {data && (
            <>
              <TraceSection title={t(locale, "decisions.trace.modelRun")}>
                {data.producedBy ? (
                  <div className="text-sm text-abys-ink space-y-1">
                    <p>
                      <span className="text-abys-muted">{t(locale, "decisions.trace.provider")}{" "}</span>
                      {data.producedBy.provider}
                      {data.producedBy.model ? ` (${data.producedBy.model})` : ""}
                    </p>
                    <p>
                      <span className="text-abys-muted">{t(locale, "decisions.trace.policy")}{" "}</span>
                      {data.producedBy.policy ?? "—"}
                    </p>
                    <p>
                      <span className="text-abys-muted">{t(locale, "decisions.trace.duration")}{" "}</span>
                      {data.producedBy.latency_ms} ms
                    </p>
                    <p>
                      <span className="text-abys-muted">{t(locale, "decisions.trace.outputValid")}{" "}</span>
                      {data.producedBy.output_valid
                        ? t(locale, "decisions.yes")
                        : t(locale, "decisions.no")}
                    </p>
                    <p className="text-xs text-abys-muted">
                      {fmtDateTime(locale, data.producedBy.created_at)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-abys-muted">{t(locale, "decisions.trace.noRecord")}</p>
                )}
              </TraceSection>

              <TraceSection
                title={formatMessage(locale, "decisions.evidenceHeading", {
                  count: data.case.evidence.length,
                })}
              >
                {data.case.evidence.length === 0 ? (
                  <p className="text-sm text-abys-muted">{t(locale, "decisions.trace.noRecord")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.case.evidence.map((e, i) => {
                      const rmeta = RELIABILITY_META[e.reliability as keyof typeof RELIABILITY_META] ?? RELIABILITY_META.unknown;
                      return (
                        <div key={i} className="flex items-start gap-2.5 text-sm bg-abys-cream/60 rounded-lg px-3 py-2">
                          <span
                            className="text-[10px] font-semibold rounded-full px-2 py-0.5 mt-0.5 shrink-0 border"
                            style={{ color: rmeta.color, borderColor: rmeta.color }}
                          >
                            {reliabilityText(locale, e.reliability ?? "unknown")}
                          </span>
                          <div className="min-w-0">
                            <p className="text-abys-ink">{e.fact}</p>
                            <p className="text-xs text-abys-muted mt-0.5">
                              {formatMessage(locale, "decisions.evidenceSource", { source: e.source })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TraceSection>

              <TraceSection title={t(locale, "decisions.confidenceHeading")}>
                <div className="text-sm text-abys-ink space-y-1.5">
                  <ConfidenceBadge value={data.case.confidence} />
                  <p>{data.case.confidenceRationale || "—"}</p>
                </div>
              </TraceSection>

              <TraceSection title={t(locale, "decisions.trace.derived")}>
                {data.decisions.length === 0 && data.actions.length === 0 ? (
                  <p className="text-sm text-abys-muted">{t(locale, "decisions.trace.noRecord")}</p>
                ) : (
                  <div className="space-y-3">
                    {data.decisions.map((d) => (
                      <div key={d.id} className="text-sm bg-abys-cream/60 rounded-lg px-3 py-2">
                        <p className="text-abys-ink">
                          <span className="font-semibold">{t(locale, "decisions.trace.decision")}{" "}</span>
                          {d.choice} — {d.payload?.chosenAction ?? "—"}
                        </p>
                        <p className="text-xs text-abys-muted mt-0.5">
                          {d.decided_by} · {fmtDateTime(locale, d.created_at)}
                        </p>
                        {d.payload?.reason && (
                          <p className="text-xs text-abys-ink mt-1">
                            {formatMessage(locale, "decisions.trace.reason", { reason: d.payload.reason })}
                          </p>
                        )}
                        {d.outcome && (
                          <p className="text-xs text-abys-ink mt-1">
                            {t(locale, "decisions.trace.outcome")} {d.outcome.result ?? "—"}
                            {d.outcome.note ? ` — ${d.outcome.note}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                    {data.actions.map((a) => (
                      <div key={a.id} className="text-sm bg-abys-cream/60 rounded-lg px-3 py-2">
                        <p className="text-abys-ink">
                          <span className="font-semibold">{t(locale, "decisions.trace.action")}{" "}</span>
                          {a.title}
                        </p>
                        <p className="text-xs text-abys-muted mt-0.5">
                          {a.owner} · {a.status}
                        </p>
                        {a.progress_note && <p className="text-xs text-abys-ink mt-1">{a.progress_note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </TraceSection>

              <TraceSection title={t(locale, "decisions.trace.auditEvents")}>
                {data.audit.length === 0 ? (
                  <p className="text-sm text-abys-muted">{t(locale, "decisions.trace.noRecord")}</p>
                ) : (
                  <div className="space-y-1">
                    {data.audit.map((ev, i) => (
                      <p key={i} className="text-xs text-abys-ink">
                        <span className="text-abys-muted">{fmtDateTime(locale, ev.created_at)}</span>{" "}
                        · <span className="font-medium">{ev.actor}</span> · {ev.summary}
                      </p>
                    ))}
                  </div>
                )}
              </TraceSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TraceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">{title}</p>
      {children}
    </div>
  );
}

/* ---------------- Seçenekler + karar ---------------- */

function OptionsPanel({
  c,
  onDecided,
}: {
  c: DecisionCase;
  onDecided: () => void;
}) {
  const locale = useLocale();
  const [choosing, setChoosing] = useState<{ mode: DecisionChoice; option?: ActionOption } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [impactValue, setImpactValue] = useState("");
  const [impactCurrency, setImpactCurrency] = useState("AZN");
  const [impactLow, setImpactLow] = useState("");
  const [impactHigh, setImpactHigh] = useState("");
  const [impactError, setImpactError] = useState("");

  const feasible = c.options.filter((o) => o.feasible);
  const infeasible = c.options.filter((o) => !o.feasible);
  const recommended = c.options.find((o) => o.id === c.recommendedOptionId);

  /** Opsiyonel beklenen ekonomik etki — doldurulmuşsa doğrular, yoksa null. */
  function buildExpectedImpact() {
    setImpactError("");
    const parsed = parseExpectedImpact({
      value: impactValue,
      currency: impactCurrency,
      low: impactLow,
      high: impactHigh,
    });
    if (!parsed.ok) {
      setImpactError(
        t(
          readLocale(),
          parsed.error === "value"
            ? "decisions.impact.valueInvalid"
            : parsed.error === "currency"
              ? "decisions.impact.currencyInvalid"
              : "decisions.impact.rangeInvalid"
        )
      );
      throw new Error("invalid_impact");
    }
    return parsed.impact;
  }

  async function commit() {
    if (!choosing || busy) return;
    if (choosing.mode !== "accepted" && !reason.trim()) return;

    const chosenAction =
      choosing.mode === "rejected"
        ? t(readLocale(), "decisions.options.noAction")
        : choosing.option?.title ?? recommended?.title ?? "";

    // Sunucu modunda karar SUNUCUYA yazılır: /api/decisions kararı kaydeder,
    // kabul/değiştir kararında hesap verebilir aksiyonu yaratır ve denetime
    // işler; organizasyon kapsamı daima sunucu oturumundan alınır.
    let expectedImpact: ReturnType<typeof buildExpectedImpact> = null;
    if (choosing.mode !== "rejected") {
      try {
        expectedImpact = buildExpectedImpact();
      } catch {
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: c.id,
          sectorId: c.sectorId,
          choice: choosing.mode,
          reason: reason.trim(),
          chosenAction,
          ...(expectedImpact ? { expectedImpact } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t(readLocale(), "decisions.options.saveFailed"));
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
    onDecided();
  }

  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
        {t(locale, "decisions.options.feasibleHeading")}
      </p>
      <div className="space-y-2 mb-3">
        {feasible.map((o) => (
          <OptionRow
            key={o.id}
            o={o}
            recommended={o.id === c.recommendedOptionId}
            selectable
            onSelect={() =>
              setChoosing({ mode: o.id === c.recommendedOptionId ? "accepted" : "modified", option: o })
            }
            selected={choosing?.option?.id === o.id}
          />
        ))}
        {feasible.length === 0 && (
          <p className="text-sm text-abys-muted">
            {t(locale, "decisions.options.noFeasible")}
          </p>
        )}
      </div>

      {infeasible.length > 0 && (
        <details className="mb-4">
          <summary className="text-xs text-abys-muted cursor-pointer">
            {formatMessage(locale, "decisions.options.infeasibleSummary", {
              count: infeasible.length,
            })}
          </summary>
          <div className="space-y-2 mt-2">
            {infeasible.map((o) => (
              <OptionRow key={o.id} o={o} recommended={false} selectable={false} selected={false} />
            ))}
          </div>
        </details>
      )}

      <div className="border-t border-abys-ink/10 pt-4">
        {!choosing && (
          <div className="flex flex-wrap gap-2">
            {recommended && (
              <button
                onClick={() => setChoosing({ mode: "accepted", option: recommended })}
                className="text-sm rounded-lg bg-abys-navy text-white px-4 py-2 hover:opacity-90"
              >
                {t(locale, "decisions.options.acceptRecommended")}
              </button>
            )}
            <button
              onClick={() => setChoosing({ mode: "rejected" })}
              className="text-sm rounded-lg border border-abys-ink/15 text-abys-ink px-4 py-2 hover:bg-white/60"
            >
              {t(locale, "decisions.options.reject")}
            </button>
            <span className="text-xs text-abys-muted self-center">
              {t(locale, "decisions.options.orPickAnother")}
            </span>
          </div>
        )}

        {choosing && (
          <div className="space-y-3">
            <p className="text-sm text-abys-ink">
              {choosing.mode === "accepted" && (
                <>
                  {t(locale, "decisions.options.willAccept")}{" "}
                  <strong>{choosing.option?.title}</strong>
                </>
              )}
              {choosing.mode === "modified" && (
                <>
                  {t(locale, "decisions.options.willApplyOther")}{" "}
                  <strong>{choosing.option?.title}</strong>
                </>
              )}
              {choosing.mode === "rejected" && (
                <>{t(locale, "decisions.options.willReject")}</>
              )}
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={
                choosing.mode === "accepted"
                  ? t(locale, "decisions.options.reasonOptional")
                  : t(locale, "decisions.options.reasonRequired")
              }
              className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
            {choosing.mode !== "rejected" && (
              <details className="rounded-lg border border-abys-cream-border bg-white/50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-abys-ink">
                  {t(locale, "decisions.impact.toggle")}
                </summary>
                <p className="mt-1 text-[11px] text-abys-muted">{t(locale, "decisions.impact.hint")}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    value={impactValue}
                    onChange={(e) => setImpactValue(e.target.value)}
                    placeholder={t(locale, "decisions.impact.value")}
                    className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                  />
                  <input
                    value={impactCurrency}
                    onChange={(e) => setImpactCurrency(e.target.value.toUpperCase())}
                    maxLength={3}
                    placeholder={t(locale, "decisions.impact.currency")}
                    className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                  />
                  <input
                    inputMode="decimal"
                    value={impactLow}
                    onChange={(e) => setImpactLow(e.target.value)}
                    placeholder={t(locale, "decisions.impact.low")}
                    className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                  />
                  <input
                    inputMode="decimal"
                    value={impactHigh}
                    onChange={(e) => setImpactHigh(e.target.value)}
                    placeholder={t(locale, "decisions.impact.high")}
                    className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                  />
                </div>
                {impactError ? (
                  <p role="alert" className="mt-1 text-xs text-abys-critical">
                    {impactError}
                  </p>
                ) : null}
              </details>
            )}
            <div className="flex gap-2">
              <button
                onClick={commit}
                disabled={choosing.mode !== "accepted" && !reason.trim()}
                className="text-sm rounded-lg bg-abys-navy text-white px-4 py-2 disabled:opacity-40 hover:opacity-90"
              >
                {t(locale, "decisions.options.save")}
              </button>
              <button
                onClick={() => {
                  setChoosing(null);
                  setReason("");
                }}
                className="text-sm rounded-lg border border-abys-ink/15 text-abys-ink px-4 py-2 hover:bg-white/60"
              >
                {t(locale, "decisions.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionRow({
  o,
  recommended,
  selectable,
  selected,
  onSelect,
}: {
  o: ActionOption;
  recommended: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect?: () => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-colors ${
        o.feasible
          ? recommended
            ? "border-abys-accent bg-white/70"
            : "border-abys-cream-border bg-white/50"
          : "border-abys-ink/10 bg-abys-ink/5 opacity-75"
      } ${selected ? "ring-2 ring-abys-accent" : ""}`}
    >
      <div className="flex items-start gap-3">
        {o.feasible ? (
          <span className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center bg-abys-navy text-white shrink-0 mt-0.5">
            {o.rank}
          </span>
        ) : (
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-abys-ink/20 text-abys-muted shrink-0 mt-0.5">
            {t(locale, "decisions.options.infeasibleBadge")}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-abys-ink">
            {o.title}
            {recommended && (
              <span className="text-abys-accent text-xs ml-2">
                {t(locale, "decisions.options.recommendedBadge")}
              </span>
            )}
          </p>
          <p className="text-xs text-abys-muted mt-0.5">{o.detail}</p>
          {!o.feasible && (
            <p className="text-xs mt-1.5" style={{ color: "var(--abys-critical)" }}>
              {formatMessage(locale, "decisions.options.constraint", {
                note: o.feasibilityNote,
              })}
            </p>
          )}
          {open && (
            <div className="mt-2 space-y-1 text-xs text-abys-ink">
              {o.feasible && (
                <p>
                  <span className="font-semibold text-abys-muted">
                    {t(locale, "decisions.options.feasibility")}{" "}
                  </span>
                  {o.feasibilityNote}
                </p>
              )}
              <p>
                <span className="font-semibold text-abys-muted">
                  {t(locale, "decisions.options.tradeoff")}{" "}
                </span>
                {o.tradeoffs}
              </p>
              <p>
                <span className="font-semibold text-abys-muted">
                  {t(locale, "decisions.options.expectedOutcome")}{" "}
                </span>
                {o.expectedOutcome}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-abys-muted hover:text-abys-ink">
            {open ? t(locale, "decisions.options.detailHide") : t(locale, "decisions.options.detailShow")}
          </button>
          {selectable && onSelect && (
            <button
              onClick={onSelect}
              className="text-xs rounded-full px-3 py-1 border border-abys-ink/15 text-abys-ink hover:bg-abys-cream"
            >
              {t(locale, "decisions.options.select")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
