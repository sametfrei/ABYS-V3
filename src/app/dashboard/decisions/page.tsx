"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { loadProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import { getSector, type Sector } from "@/lib/sectors";
import { getRole } from "@/lib/roles";
import { SEVERITY_META } from "@/lib/signals";
import { newId } from "@/lib/entities";
import {
  type DecisionCase,
  type ActionOption,
  type DecisionChoice,
  listCases,
  saveCase,
  replaceCasesForSector,
  saveDecision,
  logAudit,
  decisionMemorySummary,
  RELIABILITY_META,
} from "@/lib/decisions";
import { getConstraints, saveConstraints, constraintsToPrompt, type Constraint } from "@/lib/constraints";
import { getScenarios } from "@/lib/scenarios";
import type { AiDecisionCase } from "@/lib/ai/provider";
import { postJsonStreamed } from "@/lib/ndjson-client";

export default function DecisionsPage() {
  const [stored, refresh] = useStored(() => {
    const p = loadProfile();
    const s = p ? getSector(p.sectorId) ?? null : null;
    return { profile: p, sector: s, cases: s ? listCases(s.id) : [] };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzerOverride, setAnalyzerOverride] = useState<boolean | null>(null);

  const localProfile = stored?.profile ?? null;

  // Kurumsal oturum varsa vakalar SUNUCUDAN okunur (org izolasyonlu);
  // oturum yoksa prototip localStorage akışı sürer.
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  const profile = session ? null : localProfile;
  const sector = session ? null : stored?.sector ?? null;
  const [serverCases, setServerCases] = useState<DecisionCase[] | null>(null);
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

  const cases = session ? serverCases ?? [] : stored?.cases ?? [];
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
  }, [isTais, session]);

  if (session === undefined) return null;

  if (isTais) {
    return (
      <div>
        <PageHeader
          eyebrow="KARAR MERKEZİ"
          title="Ne oluyor, neden önemli,"
          accent="ne yapmalı."
          desc="Kurumun kayıtlı karar vakaları — kanıt zinciri, güven skoru, karşı senaryo ve alternatiflerle."
        />
        <div className="px-10 pb-16 space-y-3 max-w-4xl">
          {taisCases === null && <p className="text-sm text-abys-muted">Yükleniyor…</p>}
          {taisCases !== null && taisCases.length === 0 && (
            <p className="text-sm text-abys-muted">Henüz kayıtlı karar vakası yok.</p>
          )}
          {taisCases?.map((c) => (
            <TaisDecisionCard key={c.id} c={c} onChanged={() => setServerReloadKey((k) => k + 1)} />
          ))}
        </div>
      </div>
    );
  }

  if (!profile || !sector) return null;

  const role = getRole(profile.roleId);
  const openCases = cases.filter((c) => c.status === "open");
  const decidedCases = cases.filter((c) => c.status === "decided");

  return (
    <div>
      <PageHeader
        eyebrow="KARAR MERKEZİ"
        title="Ne oluyor, neden önemli,"
        accent="ne yapmalı."
        desc="ABYS operasyonel veriyi kanıt zinciri, güven skoru, karşı senaryo ve kısıt-farkındalıklı seçeneklerle karar vakalarına dönüştürür. Karar sizde kalır — sistem her kararı hafızasına işler."
      />

      <div className="px-10 pb-16 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAnalyzer(!showAnalyzer)}
            className="text-sm rounded-lg bg-abys-navy text-white px-4 py-2.5 hover:opacity-90 transition-opacity"
          >
            {showAnalyzer ? "Analiz panelini kapat" : "Yeni analiz çalıştır"}
          </button>
          {openCases.length > 0 && (
            <span className="text-sm text-abys-muted">
              {openCases.length} açık vaka · {decidedCases.length} karara bağlandı
            </span>
          )}
        </div>

        {showAnalyzer && (
          <Analyzer
            sector={sector}
            onDone={(fresh) => {
              setShowAnalyzer(false);
              refresh();
              setSelectedId(fresh.find((c) => c.status === "open")?.id ?? null);
            }}
          />
        )}

        {openCases.length === 0 && !showAnalyzer && (
          <p className="text-sm text-abys-muted">
            Açık karar vakası yok. Operasyonel veri girerek yeni analiz çalıştırın.
          </p>
        )}

        <div className="space-y-3">
          {openCases.map((c) => (
            <CaseCard
              key={c.id}
              c={c}
              expanded={selectedId === c.id}
              roleId={profile.roleId}
              onToggle={() => setSelectedId(selectedId === c.id ? null : c.id)}
              onDecided={() => {
                refresh();
                setServerReloadKey((k) => k + 1);
                setSelectedId(null);
              }}
              decidedBy={role?.label ?? "Kullanıcı"}
              serverMode={!!session}
            />
          ))}
        </div>

        {decidedCases.length > 0 && (
          <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3 mt-8">
              KARARA BAĞLANAN VAKALAR
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
                      {meta.label}
                    </span>
                    <p className="text-sm text-abys-ink flex-1">{c.title}</p>
                    <span className="text-xs text-abys-muted shrink-0">✓ karar verildi</span>
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

function Analyzer({ sector, onDone }: { sector: Sector; onDone: (cases: DecisionCase[]) => void }) {
  const scenarios = useMemo(() => getScenarios(sector.id), [sector.id]);
  const [data, setData] = useState("");
  const [storedConstraints] = useStored(() => ({ list: getConstraints(sector.id) }));
  const [constraintDraft, setConstraintDraft] = useState<Constraint[] | null>(null);
  const constraints = constraintDraft ?? storedConstraints?.list ?? [];
  const setConstraints = (
    next: Constraint[] | ((cs: Constraint[]) => Constraint[])
  ) =>
    setConstraintDraft((prev) => {
      const base = prev ?? storedConstraints?.list ?? [];
      return typeof next === "function" ? next(base) : next;
    });
  const [showConstraints, setShowConstraints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const trimmed = data.trim();
    if (!trimmed) {
      setError("Analiz için operasyonel veri girin ya da bir senaryo seçin.");
      return;
    }
    setBusy(true);
    setError(null);
    saveConstraints(sector.id, constraints);
    logAudit("analysis_run", "Siz", `${sector.label} için analiz başlatıldı`, `${trimmed.length} karakter veri, ${constraints.length} kısıt`);

    try {
      const json = await postJsonStreamed<{ cases?: AiDecisionCase[]; providerId?: string }>(
        "/api/decision-cases",
        {
          sectorId: sector.id,
          data: trimmed,
          constraints: constraintsToPrompt(constraints),
          decisionMemory: decisionMemorySummary(sector.id, trimmed),
        }
      );
      const aiCases = json.cases ?? [];
      const providerId = json.providerId ?? "ai";
      const converted = aiCases.map((c) => toDecisionCase(sector.id, c));

      replaceCasesForSector(sector.id, converted);
      for (const c of converted) {
        logAudit(
          "case_generated",
          `ABYS (${providerId === "ollama" ? "yerel model" : providerId})`,
          `Vaka üretildi: ${c.title}`,
          `Güven: %${c.confidence} · ${c.evidence.length} kanıt · ${c.options.length} seçenek`
        );
      }
      onDone(listCases(sector.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-6 space-y-4">
      <div>
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">OPERASYONEL VERİ</p>
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
          placeholder="Sistem export'u, vardiya raporu, operasyon notları... ABYS ham veriyi okur, uydurma sayı üretmez."
          className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-abys-accent font-mono"
        />
      </div>

      <div>
        <button
          onClick={() => setShowConstraints((v) => !v)}
          className="text-xs tracking-widest text-abys-muted font-semibold flex items-center gap-1"
        >
          CANLI KISIT MODELİ ({constraints.length}) {showConstraints ? "−" : "+"}
        </button>
        <p className="text-xs text-abys-muted mt-1">
          ABYS aksiyon önermeden önce bu kısıtlara bakar — sahada uygulanamayacak seçenek önermez.
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
                  title="Kısıtı sil"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setConstraints((cs) => [...cs, { id: newId(), label: "Yeni kısıt", value: "" }])
              }
              className="text-xs rounded-full px-3 py-1.5 border border-abys-ink/15 text-abys-ink hover:bg-white/60"
            >
              + Kısıt ekle
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
          {busy ? "ABYS analiz ediyor..." : "Analiz et"}
        </button>
        {busy && (
          <span className="text-xs text-abys-muted animate-pulse">
            Yerel model çalışıyor — veri makinenizden çıkmıyor. Bu birkaç dakika sürebilir.
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
function TaisDecisionCard({ c, onChanged }: { c: DecisionCase; onChanged: () => void }) {
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
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Karar durumu güncellenemedi.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Karar durumu güncellenemedi.");
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
            {meta.label}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-abys-ink">{c.title}</p>
            <p className="text-xs text-abys-muted mt-1">{c.businessImpact}</p>
            {recommended && (
              <p className="text-xs mt-2">
                <span className="text-abys-muted">Önerilen: </span>
                <span className="text-abys-navy font-medium">{recommendedTitle}</span>
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <ConfidenceBadge value={c.confidence} />
            <p className="text-xs text-abys-muted mt-1">{open ? "kapat −" : "incele +"}</p>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-abys-ink/10 px-5 py-5 space-y-6">
          <ConfidencePanel c={c} />
          <EvidencePanel c={c} defaultOpen={false} />
          <CounterfactualPanel c={c} />
           <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
              ALTERNATİFLER (A/B/C)
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
             <button onClick={() => updateState("approved")} disabled={busy} className="text-xs rounded-lg bg-abys-navy text-white px-3 py-1.5 disabled:opacity-50">Onayla</button>
             <button onClick={() => updateState("under_review")} disabled={busy} className="text-xs rounded-lg border border-abys-ink/15 px-3 py-1.5 disabled:opacity-50">İncelemeye al</button>
             <button onClick={() => updateState("rejected")} disabled={busy} className="text-xs rounded-lg border border-abys-ink/15 px-3 py-1.5 text-abys-critical disabled:opacity-50">Ertele / reddet</button>
           </div>
           <p className="text-xs text-abys-muted">Durum: {c.status} · karar kaydı sunucu oturumuna bağlıdır.</p>
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
  decidedBy,
  serverMode,
}: {
  c: DecisionCase;
  expanded: boolean;
  roleId: string;
  onToggle: () => void;
  onDecided: () => void;
  decidedBy: string;
  serverMode: boolean;
}) {
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
            {meta.label}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-abys-ink">{c.title}</p>
            <p className="text-xs text-abys-muted mt-1">{c.businessImpact}</p>
            {recommended && (
              <p className="text-xs mt-2">
                <span className="text-abys-muted">Önerilen: </span>
                <span className="text-abys-navy font-medium">{recommendedTitle}</span>
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <ConfidenceBadge value={c.confidence} />
            <p className="text-xs text-abys-muted mt-1">{expanded ? "kapat −" : "incele +"}</p>
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
          <ConfidencePanel c={c} />
          <EvidencePanel c={c} defaultOpen={detailByDefault} />
          <CounterfactualPanel c={c} />
          <CausalPanel c={c} serverMode={serverMode} />
          <OptionsPanel c={c} onDecided={onDecided} decidedBy={decidedBy} serverMode={serverMode} />
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const color =
    value >= 75 ? "var(--abys-healthy)" : value >= 50 ? "var(--abys-warning)" : "var(--abys-critical)";
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-abys-ink/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>
        %{value}
      </span>
    </div>
  );
}

function ConfidencePanel({ c }: { c: DecisionCase }) {
  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">GÜVEN SKORU</p>
      <div className="flex items-center gap-3 mb-1.5">
        <ConfidenceBadge value={c.confidence} />
      </div>
      <p className="text-sm text-abys-ink">{c.confidenceRationale}</p>
    </div>
  );
}

function EvidencePanel({ c, defaultOpen }: { c: DecisionCase; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs tracking-widest text-abys-muted font-semibold mb-2 flex items-center gap-1"
      >
        KANIT ZİNCİRİ ({c.evidence.length}) {open ? "−" : "+"}
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
                    {rmeta.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-abys-ink">{e.fact}</p>
                    <p className="text-xs text-abys-muted mt-0.5">Kaynak: {e.source}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {c.assumptions.length > 0 && (
            <div>
              <p className="text-xs text-abys-muted font-semibold mb-1">Varsayımlar</p>
              <ul className="text-sm text-abys-ink list-disc list-inside space-y-0.5">
                {c.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {c.historicalComparison && (
            <div>
              <p className="text-xs text-abys-muted font-semibold mb-1">Geçmişle karşılaştırma</p>
              <p className="text-sm text-abys-ink">{c.historicalComparison}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CounterfactualPanel({ c }: { c: DecisionCase }) {
  return (
    <div className="rounded-lg border border-abys-critical/25 bg-abys-critical/5 px-4 py-3.5">
      <p className="text-xs tracking-widest font-semibold mb-2" style={{ color: "var(--abys-critical)" }}>
        KARŞI SENARYO — AKSİYON ALINMAZSA
      </p>
      <p className="text-sm text-abys-ink mb-2">{c.counterfactual.narrative}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-abys-muted">
        <span>
          <span className="font-semibold">Tahmini etki:</span> {c.counterfactual.projectedImpact}
        </span>
        <span>
          <span className="font-semibold">Zaman ufku:</span> {c.counterfactual.timeHorizon}
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

interface CausalLink {
  id: string;
  fromLabel: string;
  toLabel: string;
  relationStatus: RelationStatus;
  confidence: number;
  note: string | null;
}

// Sunucu oturumu yoksa gizlenir — kök neden zinciri org izolasyonlu sunucu verisidir.
function CausalPanel({ c, serverMode }: { c: DecisionCase; serverMode: boolean }) {
  const [links, setLinks] = useState<CausalLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<RelationStatus>("observed_correlation");
  const [confidence, setConfidence] = useState(60);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(`/api/causal?caseId=${c.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Kök neden zinciri yüklenemedi.");
        return (await r.json()).links as CausalLink[];
      })
      .then((rows) => setLinks(rows))
      .catch((err) => setError(err instanceof Error ? err.message : "Kök neden zinciri yüklenemedi."));
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
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Bağlantı eklenemedi.");
      setFrom("");
      setTo("");
      setNote("");
      setStatus("observed_correlation");
      setConfidence(60);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
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
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Durum güncellenemedi.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs tracking-widest text-abys-muted font-semibold">
          KÖK NEDEN ZİNCİRİ {links ? `(${links.length})` : ""}
        </p>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-abys-muted hover:text-abys-ink">
          {showForm ? "vazgeç" : "+ bağlantı ekle"}
        </button>
      </div>

      {error && <p className="text-xs mb-2" style={{ color: "var(--abys-critical)" }}>{error}</p>}

      <div className="space-y-1.5 mb-3">
        {links && links.length === 0 && !showForm && (
          <p className="text-sm text-abys-muted">Henüz kök neden bağlantısı eklenmedi.</p>
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
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span
                  className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                  style={{ color: meta.color, background: meta.soft }}
                >
                  {meta.label}
                </span>
                <span className="text-xs text-abys-muted">%{l.confidence}</span>
                <select
                  value={l.relationStatus}
                  onChange={(e) => changeStatus(l.id, e.target.value as RelationStatus)}
                  className="text-[10px] rounded border border-abys-cream-border bg-white/70 px-1 py-0.5"
                >
                  {RELATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {RELATION_META[s].label}
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
              placeholder="Neden (A)"
              className="flex-1 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Sonuç (B)"
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
                  {RELATION_META[s].label}
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
            <span className="text-xs text-abys-muted">% güven</span>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Not (isteğe bağlı)"
            className="w-full text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
          <button
            onClick={addLink}
            disabled={busy || !from.trim() || !to.trim()}
            className="text-xs rounded-lg bg-abys-navy text-white px-3 py-1.5 disabled:opacity-40 hover:opacity-90"
          >
            Bağlantı ekle
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Kanıta tıkla: izlenebilirlik modalı ---------------- */

function TraceButton({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs rounded-full px-3 py-1.5 border border-abys-ink/15 text-abys-muted hover:text-abys-ink hover:bg-white/60 transition-colors"
      >
        🔍 Kökeni göster
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

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}

function TraceModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
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
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "İzlenebilirlik verisi yüklenemedi.");
        return (await r.json()) as TraceData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
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
          <p className="text-sm font-semibold text-abys-ink">Kanıt kökeni</p>
          <button onClick={onClose} className="text-abys-muted hover:text-abys-ink text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loading && <p className="text-sm text-abys-muted">Yükleniyor...</p>}
          {error && <p className="text-sm" style={{ color: "var(--abys-critical)" }}>{error}</p>}

          {data && (
            <>
              <TraceSection title="MODEL KOŞUSU">
                {data.producedBy ? (
                  <div className="text-sm text-abys-ink space-y-1">
                    <p>
                      <span className="text-abys-muted">Sağlayıcı: </span>
                      {data.producedBy.provider}
                      {data.producedBy.model ? ` (${data.producedBy.model})` : ""}
                    </p>
                    <p>
                      <span className="text-abys-muted">Politika: </span>
                      {data.producedBy.policy ?? "—"}
                    </p>
                    <p>
                      <span className="text-abys-muted">Süre: </span>
                      {data.producedBy.latency_ms} ms
                    </p>
                    <p>
                      <span className="text-abys-muted">Çıktı geçerli mi: </span>
                      {data.producedBy.output_valid ? "Evet" : "Hayır"}
                    </p>
                    <p className="text-xs text-abys-muted">{fmtDateTime(data.producedBy.created_at)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-abys-muted">Kayıt yok.</p>
                )}
              </TraceSection>

              <TraceSection title={`KANIT ZİNCİRİ (${data.case.evidence.length})`}>
                {data.case.evidence.length === 0 ? (
                  <p className="text-sm text-abys-muted">Kayıt yok.</p>
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
                            {rmeta.label}
                          </span>
                          <div className="min-w-0">
                            <p className="text-abys-ink">{e.fact}</p>
                            <p className="text-xs text-abys-muted mt-0.5">Kaynak: {e.source}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TraceSection>

              <TraceSection title="GÜVEN">
                <div className="text-sm text-abys-ink space-y-1.5">
                  <ConfidenceBadge value={data.case.confidence} />
                  <p>{data.case.confidenceRationale || "—"}</p>
                </div>
              </TraceSection>

              <TraceSection title="BU VAKADAN DOĞANLAR">
                {data.decisions.length === 0 && data.actions.length === 0 ? (
                  <p className="text-sm text-abys-muted">Kayıt yok.</p>
                ) : (
                  <div className="space-y-3">
                    {data.decisions.map((d) => (
                      <div key={d.id} className="text-sm bg-abys-cream/60 rounded-lg px-3 py-2">
                        <p className="text-abys-ink">
                          <span className="font-semibold">Karar: </span>
                          {d.choice} — {d.payload?.chosenAction ?? "—"}
                        </p>
                        <p className="text-xs text-abys-muted mt-0.5">
                          {d.decided_by} · {fmtDateTime(d.created_at)}
                        </p>
                        {d.payload?.reason && (
                          <p className="text-xs text-abys-ink mt-1">Gerekçe: {d.payload.reason}</p>
                        )}
                        {d.outcome && (
                          <p className="text-xs text-abys-ink mt-1">
                            Sonuç: {d.outcome.result ?? "—"}
                            {d.outcome.note ? ` — ${d.outcome.note}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                    {data.actions.map((a) => (
                      <div key={a.id} className="text-sm bg-abys-cream/60 rounded-lg px-3 py-2">
                        <p className="text-abys-ink">
                          <span className="font-semibold">Aksiyon: </span>
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

              <TraceSection title="DENETİM OLAYLARI">
                {data.audit.length === 0 ? (
                  <p className="text-sm text-abys-muted">Kayıt yok.</p>
                ) : (
                  <div className="space-y-1">
                    {data.audit.map((ev, i) => (
                      <p key={i} className="text-xs text-abys-ink">
                        <span className="text-abys-muted">{fmtDateTime(ev.created_at)}</span>{" "}
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
  decidedBy,
  serverMode,
}: {
  c: DecisionCase;
  onDecided: () => void;
  decidedBy: string;
  serverMode: boolean;
}) {
  const [choosing, setChoosing] = useState<{ mode: DecisionChoice; option?: ActionOption } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const feasible = c.options.filter((o) => o.feasible);
  const infeasible = c.options.filter((o) => !o.feasible);
  const recommended = c.options.find((o) => o.id === c.recommendedOptionId);

  async function commit() {
    if (!choosing || busy) return;
    if (choosing.mode !== "accepted" && !reason.trim()) return;

    const chosenAction =
      choosing.mode === "rejected"
        ? "Aksiyon alınmadı"
        : choosing.option?.title ?? recommended?.title ?? "";

    // Sunucu modunda karar SUNUCUYA yazılır: /api/decisions kararı kaydeder,
    // kabul/değiştir kararında hesap verebilir aksiyonu yaratır ve denetime
    // işler (org daima oturumdan). Oturum yoksa prototip localStorage akışı.
    if (serverMode) {
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
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Karar kaydedilemedi.");
      } catch {
        setBusy(false);
        return;
      }
      setBusy(false);
      onDecided();
      return;
    }

    saveDecision({
      id: newId(),
      createdAt: new Date().toISOString(),
      caseId: c.id,
      caseTitle: c.title,
      sectorId: c.sectorId,
      categoryLabel: c.categoryLabel,
      severity: c.severity,
      recommendedAction: recommended?.title ?? "",
      choice: choosing.mode,
      chosenAction,
      reason: reason.trim(),
      decidedBy,
      confidence: c.confidence,
    });
    saveCase({ ...c, status: "decided" });
    logAudit(
      "decision_made",
      decidedBy,
      `Karar: ${c.title}`,
      `${choosing.mode === "accepted" ? "Öneri kabul edildi" : choosing.mode === "rejected" ? "Öneri reddedildi" : "Değiştirilerek uygulandı"}: "${chosenAction}"${reason.trim() ? ` — Gerekçe: ${reason.trim()}` : ""}`
    );
    onDecided();
  }

  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
        UYGULANABİLİR SEÇENEKLER — KISIT KONTROLÜNDEN GEÇTİ
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
            Mevcut kısıtlar altında uygulanabilir seçenek bulunamadı — kısıt modelini gözden geçirin.
          </p>
        )}
      </div>

      {infeasible.length > 0 && (
        <details className="mb-4">
          <summary className="text-xs text-abys-muted cursor-pointer">
            Kısıtlara takılan {infeasible.length} seçenek (gerekçesiyle)
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
                ✓ Öneriyi kabul et
              </button>
            )}
            <button
              onClick={() => setChoosing({ mode: "rejected" })}
              className="text-sm rounded-lg border border-abys-ink/15 text-abys-ink px-4 py-2 hover:bg-white/60"
            >
              Reddet
            </button>
            <span className="text-xs text-abys-muted self-center">
              ya da yukarıdan farklı bir seçenek seçin
            </span>
          </div>
        )}

        {choosing && (
          <div className="space-y-3">
            <p className="text-sm text-abys-ink">
              {choosing.mode === "accepted" && (
                <>Öneri kabul edilecek: <strong>{choosing.option?.title}</strong></>
              )}
              {choosing.mode === "modified" && (
                <>Farklı seçenekle uygulanacak: <strong>{choosing.option?.title}</strong></>
              )}
              {choosing.mode === "rejected" && <>Öneri reddedilecek, aksiyon alınmayacak.</>}
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={
                choosing.mode === "accepted"
                  ? "Gerekçe (isteğe bağlı) — ABYS bundan öğrenir"
                  : "Gerekçe (zorunlu) — ABYS bir daha aynı hatayı yapmasın diye nedeninizi kaydeder"
              }
              className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
            />
            <div className="flex gap-2">
              <button
                onClick={commit}
                disabled={choosing.mode !== "accepted" && !reason.trim()}
                className="text-sm rounded-lg bg-abys-navy text-white px-4 py-2 disabled:opacity-40 hover:opacity-90"
              >
                Kararı kaydet
              </button>
              <button
                onClick={() => {
                  setChoosing(null);
                  setReason("");
                }}
                className="text-sm rounded-lg border border-abys-ink/15 text-abys-ink px-4 py-2 hover:bg-white/60"
              >
                Vazgeç
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
            UYGULANAMAZ
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-abys-ink">
            {o.title}
            {recommended && <span className="text-abys-accent text-xs ml-2">★ ABYS önerisi</span>}
          </p>
          <p className="text-xs text-abys-muted mt-0.5">{o.detail}</p>
          {!o.feasible && (
            <p className="text-xs mt-1.5" style={{ color: "var(--abys-critical)" }}>
              Kısıt: {o.feasibilityNote}
            </p>
          )}
          {open && (
            <div className="mt-2 space-y-1 text-xs text-abys-ink">
              {o.feasible && (
                <p>
                  <span className="font-semibold text-abys-muted">Uygulanabilirlik: </span>
                  {o.feasibilityNote}
                </p>
              )}
              <p>
                <span className="font-semibold text-abys-muted">Trade-off: </span>
                {o.tradeoffs}
              </p>
              <p>
                <span className="font-semibold text-abys-muted">Beklenen sonuç: </span>
                {o.expectedOutcome}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-abys-muted hover:text-abys-ink">
            {open ? "detay −" : "detay +"}
          </button>
          {selectable && onSelect && (
            <button
              onClick={onSelect}
              className="text-xs rounded-full px-3 py-1 border border-abys-ink/15 text-abys-ink hover:bg-abys-cream"
            >
              Bunu seç
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
