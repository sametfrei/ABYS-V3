"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { loadProfile, type AbysProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import { getRole } from "@/lib/roles";
import { getSector } from "@/lib/sectors";
import { SECTOR_CALCULATORS, type CalculatorDef } from "@/lib/calculators";
import { upsertEntity, newId } from "@/lib/entities";
import type { SavedReport } from "@/lib/entities";
import type { CommercialKpis, ManagementKpis } from "@/lib/demo/tais/kpi";

type Tab = "ai" | "calculator";

interface TaisAnalysisOperations {
  workloadByTeam: Array<{ teamId: string; teamName: string; openTaskCount: number; capacity: number; utilization: number }>;
  tasksByCategory: Array<{ category: string; categoryLabel: string; total: number; open: number; overdue: number }>;
  openWorkByLocation: Array<{ locationId: string; locationName: string; openTaskCount: number }>;
}

interface TaisAnalysis {
  operations: TaisAnalysisOperations;
  commercial: CommercialKpis;
  management: ManagementKpis;
}

export default function AnalysisPage() {
  const [tab, setTab] = useState<Tab>("ai");
  const [stored] = useStored(() => ({ profile: loadProfile() }));
  const localProfile = stored?.profile ?? null;

  // Kurumsal oturum var ama yerel onboarding profili yok (ör. TAIS demo
  // girişi) — AI/Hesaplayıcı sekmeleri profile bağımlı olduğundan bunlar
  // yerine hizmet türü/ekip/lokasyon kırılımları gösterilir.
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  const profile = session ? null : localProfile;
  const [taisAnalysis, setTaisAnalysis] = useState<TaisAnalysis | null>(null);
  useEffect(() => {
    if (!isTais) return;
    let cancelled = false;
    fetch("/api/tais/analysis")
      .then(async (r) => (r.ok ? await r.json() : null))
      .then((data) => {
        if (!cancelled) setTaisAnalysis(data);
      })
      .catch(() => {
        if (!cancelled) setTaisAnalysis(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isTais]);

  if (session === undefined) return null;

  if (isTais) {
    return (
      <div>
        <PageHeader
          eyebrow="ANALYSIS"
          title="Hizmet türü, ekip ve lokasyon"
          accent="kırılımları."
          desc="Operasyon, ticari ve yönetim KPI'ları — kayıtlardan hesaplanır, tüm ekranlarla tutarlıdır."
        />
        <div className="px-10 pb-16 max-w-2xl">
          {taisAnalysis === null ? (
            <p className="text-sm text-abys-muted">Yükleniyor…</p>
          ) : (
            <TaisAnalysisView data={taisAnalysis} />
          )}
        </div>
      </div>
    );
  }

  if (session && !profile) {
    return <p className="px-10 py-10 text-sm text-abys-muted">Bu kurum için TAIS analiz verisi bulunmuyor.</p>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="ANALYSIS"
        title="Senaryonuzu"
        accent="analiz edelim."
        desc="AI destekli senaryo analizi yapın ya da manuel hesaplayıcıları kullanın."
      />

      <div className="px-10">
        <div className="flex gap-1 border-b border-abys-ink/10 mb-8">
          <TabButton id="ai" active={tab} onClick={setTab} label="AI Analiz" />
          <TabButton id="calculator" active={tab} onClick={setTab} label="Hesaplayıcı" />
        </div>

        <div className="pb-16 max-w-2xl">
          {tab === "ai" && <AiAnalysisTab profile={profile} />}
          {tab === "calculator" && <CalculatorTab profile={profile} />}
        </div>
      </div>
    </div>
  );
}

function TaisAnalysisView({ data }: { data: TaisAnalysis }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">HİZMET TÜRÜNE GÖRE GÖREV</p>
        <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-[10px] tracking-wide text-abys-muted font-semibold border-b border-abys-ink/10">
            <span>HİZMET</span>
            <span>TOPLAM</span>
            <span>AÇIK</span>
            <span>GECİKEN</span>
          </div>
          {data.operations.tasksByCategory.map((row) => (
            <div key={row.category} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-sm border-b border-abys-ink/5 last:border-0">
              <span className="text-abys-ink font-medium">{row.categoryLabel}</span>
              <span className="font-mono text-abys-navy">{row.total}</span>
              <span className="font-mono text-abys-navy">{row.open}</span>
              <span className={`font-mono ${row.overdue > 0 ? "text-abys-critical" : "text-abys-navy"}`}>{row.overdue}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">EKİBE GÖRE İŞ YÜKÜ</p>
        <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-[10px] tracking-wide text-abys-muted font-semibold border-b border-abys-ink/10">
            <span>EKİP</span>
            <span>AÇIK GÖREV</span>
            <span>KAPASİTE</span>
            <span>KULLANIM</span>
          </div>
          {data.operations.workloadByTeam.map((row) => (
            <div key={row.teamId} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-sm border-b border-abys-ink/5 last:border-0">
              <span className="text-abys-ink font-medium">{row.teamName}</span>
              <span className="font-mono text-abys-navy">{row.openTaskCount}</span>
              <span className="font-mono text-abys-navy">{row.capacity}</span>
              <span className={`font-mono ${row.utilization >= 0.85 ? "text-abys-critical" : "text-abys-navy"}`}>
                %{Math.round(row.utilization * 100)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">LOKASYONA GÖRE AÇIK İŞ</p>
        <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
          {data.operations.openWorkByLocation.slice(0, 10).map((row) => (
            <div key={row.locationId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b border-abys-ink/5 last:border-0">
              <span className="text-abys-ink font-medium">{row.locationName}</span>
              <span className="font-mono text-abys-navy">{row.openTaskCount}</span>
            </div>
          ))}
          {data.operations.openWorkByLocation.length === 0 && (
            <p className="text-sm text-abys-muted px-4 py-3">Açık iş bulunmuyor.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Operasyon Sağlığı" value={`%${data.management.operationsHealthScore}`} />
        <KpiTile label="SLA Uyum Oranı" value={`%${data.management.slaComplianceRatePct}`} />
        <KpiTile label="Ekip Kapasite Skoru" value={`%${data.management.teamCapacityScore}`} />
        <KpiTile label="Müşteri Risk Skoru" value={`%${data.management.customerRiskScore}`} />
        <KpiTile label="Açık Satış Fırsatı" value={String(data.commercial.openDealCount)} />
        <KpiTile label="Yaklaşan Yenileme" value={String(data.commercial.upcomingRenewalCount)} />
      </div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
      <p className="text-[10px] tracking-wide text-abys-muted uppercase truncate">{label}</p>
      <p className="font-mono text-lg text-abys-navy">{value}</p>
    </div>
  );
}

function TabButton({
  id,
  active,
  onClick,
  label,
}: {
  id: Tab;
  active: Tab;
  onClick: (t: Tab) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active === id ? "border-abys-accent text-abys-navy" : "border-transparent text-abys-muted hover:text-abys-ink"
      }`}
    >
      {label}
    </button>
  );
}

function AiAnalysisTab({ profile }: { profile: AbysProfile | null }) {
  const [scenario, setScenario] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; problem: string; action: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const role = profile ? getRole(profile.roleId) : null;

  async function submit() {
    if (!profile || !scenario.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: profile.roleId, scenario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setLoading(false);
    }
  }

  function saveAsReport() {
    if (!result || !profile) return;
    const report: SavedReport = {
      id: newId(),
      createdAt: new Date().toISOString(),
      title: result.status,
      roleId: profile.roleId,
      content: `Durum: ${result.status}\nNeden: ${result.problem}\nAksiyon: ${result.action}`,
    };
    upsertEntity("saved-reports", report);
    setSaved(true);
  }

  if (!role) return null;

  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-1">
        {role.label.toUpperCase()}
      </p>
      <p className="text-sm text-abys-muted mb-5">{role.focus}</p>

      <textarea
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
        placeholder={role.placeholder}
        rows={6}
        maxLength={4000}
        className="w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5 text-sm text-abys-ink placeholder:text-abys-muted focus:outline-none focus:ring-2 focus:ring-abys-accent mb-4"
      />

      <button
        onClick={submit}
        disabled={loading || !scenario.trim()}
        className="rounded-full bg-abys-navy text-white text-sm font-medium px-5 py-2.5 hover:bg-abys-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Analiz ediliyor…" : "Analiz et →"}
      </button>

      {error && (
        <p className="mt-4 text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{error}</p>
      )}

      {result && (
        <div className="mt-6 space-y-3">
          <ResultRow label="Status" value={result.status} />
          <ResultRow label="Problem" value={result.problem} />
          <ResultRow label="Action" value={result.action} accent />

          <button
            onClick={saveAsReport}
            disabled={saved}
            className="text-sm rounded-full border border-abys-ink/15 px-4 py-2 hover:bg-white/60 transition-colors disabled:opacity-50"
          >
            {saved ? "Rapor olarak kaydedildi ✓" : "Rapor olarak kaydet"}
          </button>
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-abys-accent bg-abys-accent-soft" : "border-abys-cream-border bg-abys-cream"}`}>
      <p className="text-[10px] tracking-widest text-abys-muted font-semibold mb-1">{label.toUpperCase()}</p>
      <p className="text-abys-ink leading-relaxed">{value}</p>
    </div>
  );
}

function CalculatorTab({ profile }: { profile: AbysProfile | null }) {
  const sector = profile ? getSector(profile.sectorId) : null;
  if (!sector) return null;
  const defs = SECTOR_CALCULATORS[sector.id];

  return (
    <div className="space-y-8">
      <p className="text-xs text-abys-muted">
        {sector.label} için hazırlanmış hesaplayıcılar.
      </p>
      {defs.map((def) => (
        <SectorCalculator key={def.id} def={def} />
      ))}
    </div>
  );
}

function CalcCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <p className="text-sm font-semibold text-abys-navy mb-1">{title}</p>
      {desc && <p className="text-xs text-abys-muted mb-4">{desc}</p>}
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-abys-muted mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-abys-accent"
      />
    </div>
  );
}

function SectorCalculator({ def }: { def: CalculatorDef }) {
  const initial = Object.fromEntries(def.fields.map((f) => [f.key, f.defaultValue?.toString() ?? ""]));
  const [values, setValues] = useState<Record<string, string>>(initial);

  const parsed: Record<string, number> = {};
  let allFilled = true;
  for (const f of def.fields) {
    const n = parseFloat(values[f.key]);
    parsed[f.key] = n;
    if (Number.isNaN(n)) allFilled = false;
  }

  const results = allFilled ? def.compute(parsed) : null;

  return (
    <CalcCard title={def.title} desc={def.desc}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {def.fields.map((f) => (
          <NumberField
            key={f.key}
            label={f.label}
            value={values[f.key]}
            onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
          />
        ))}
      </div>
      {results && (
        <div className="space-y-1.5">
          {results.map((r) => (
            <p key={r.label} className="text-sm text-abys-ink">
              {r.label}:{" "}
              <span
                className={`font-mono font-semibold ${
                  r.tone === "bad" ? "text-abys-critical" : r.tone === "good" ? "text-abys-healthy" : "text-abys-navy"
                }`}
              >
                {r.value}
              </span>
            </p>
          ))}
        </div>
      )}
    </CalcCard>
  );
}
