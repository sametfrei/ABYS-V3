"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SEVERITY_META } from "@/lib/signals";

/**
 * TAIS "30 saniyelik yönetici ekranı" — Yönetim Merkezi'nin TAIS demo
 * kurumu için varsayılan açılış görünümü (bkz. docs/TAIS_DEMO_SCOPE.md).
 * Veri /api/tais/executive-summary'den gelir (org-izolasyonlu, filtreli).
 * Org TAIS demo verisi taşımıyorsa uç 404 döner ve bu bileşen null render
 * eder — genel ABYS dashboard'ı (CommandCenter) bozulmadan kalır.
 */

type Range = "today" | "7d" | "30d";

interface TaisRiskView {
  id: string;
  ruleId: string;
  title: string;
  severity: "critical" | "warning" | "info";
  customerName: string | null;
  locationName: string | null;
  category: string | null;
  rootCause: string;
  recommendedAction: string;
  expectedImpact: string;
  dataAsOf: string;
  confidence: number;
  affectedCount: number;
  evidence: { type: string; id: string }[];
  score: number;
}

interface TaisServiceAreaView {
  category: string;
  label: string;
  status: "normal" | "attention" | "critical";
  healthScore: number;
  openTaskCount: number;
  overdueTaskCount: number;
  topRiskTitle: string | null;
}

interface TaisOptionView {
  title: string;
  detail: string;
  feasible: boolean;
  feasibilityNote: string;
  tradeoffs: string;
  expectedOutcome: string;
  rank: number;
}

interface TaisMainDecisionView {
  caseId: string;
  decisionId: string;
  state: string;
  title: string;
  businessImpact: string;
  confidence: number;
  confidenceRationale: string;
  severity: "critical" | "warning" | "info" | "healthy";
  options: TaisOptionView[];
  recommendedOptionRank: number;
  counterfactual: { narrative: string; projectedImpact: string; timeHorizon: string };
  evidenceCount: number;
  matchedRiskCount: number;
}

interface TaisActionView {
  id: string;
  decisionId: string;
  caseId: string;
  title: string;
  owner: string;
  dueAt: string | null;
  status: string;
  relatedRiskId: string | null;
}

interface TaisExecSummary {
  dataMode: string;
  referenceNow: string;
  lastUpdatedAt: string | null;
  periodLabel: string;
  healthLevel: "normal" | "attention" | "critical";
  filters: { range: Range; category: string | null; customerId: string | null; locationId: string | null };
  kpis: {
    operations: {
      activeTaskCount: number;
      overdueTaskCount: number;
      openComplaintCount: number;
      openQualityIssueCount: number;
    };
    commercial: { upcomingRenewalCount: number; openDealCount: number };
    management: {
      operationsHealthScore: number;
      customerRiskScore: number;
      slaComplianceRatePct: number;
      teamCapacityScore: number;
      dataFreshnessScorePct: number;
      estimatedPreventableLossAzn: number;
    };
  };
  topRisks: TaisRiskView[];
  totalRiskCount: number;
  criticalRiskCount: number;
  serviceAreas: TaisServiceAreaView[];
  main: TaisMainDecisionView | null;
  topActions: TaisActionView[];
  brief: string;
  dimensions: {
    customers: { id: string; name: string }[];
    locations: { id: string; name: string; category: string; customerId: string }[];
  };
}

const RANGE_OPTIONS: { id: Range; label: string }[] = [
  { id: "today", label: "Bugün" },
  { id: "7d", label: "Son 7 gün" },
  { id: "30d", label: "Son 30 gün" },
];

const CATEGORY_OPTIONS: { id: string; label: string }[] = [
  { id: "cleaning", label: "Cleaning" },
  { id: "catering", label: "Catering" },
  { id: "pest_control", label: "Pest Control" },
  { id: "horeca", label: "HORECA Solutions" },
  { id: "property_mgmt", label: "Property Management" },
  { id: "office_mgmt", label: "Office Management" },
];

const STATUS_META: Record<string, { label: string; color: string; soft: string }> = {
  normal: { label: "NORMAL", color: "var(--abys-healthy)", soft: "var(--abys-healthy-soft)" },
  attention: { label: "DİKKAT", color: "var(--abys-warning)", soft: "var(--abys-warning-soft)" },
  critical: { label: "KRİTİK", color: "var(--abys-critical)", soft: "var(--abys-critical-soft)" },
};

export function TaisExecutiveScreen({ onStatus }: { onStatus?: (applicable: boolean) => void }) {
  const [range, setRange] = useState<Range>("today");
  const [category, setCategory] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [data, setData] = useState<TaisExecSummary | null | "none">(null);
  const [actionPending, setActionPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ range });
    if (category) params.set("serviceType", category);
    if (customerId) params.set("customer", customerId);
    if (locationId) params.set("location", locationId);
    fetch(`/api/tais/executive-summary?${params.toString()}`)
      .then(async (r) => (r.ok ? ((await r.json()) as TaisExecSummary) : null))
      .then((d) => {
        if (cancelled) return;
        setData(d ?? "none");
        onStatus?.(Boolean(d));
      })
      .catch(() => {
        if (cancelled) return;
        setData("none");
        onStatus?.(false);
      });
    return () => {
      cancelled = true;
    };
    // onStatus üst bileşende her render'da yeni bir referans olabilir; onu
    // bağımlılığa eklemek gereksiz yeniden getirmeye yol açar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, category, customerId, locationId, reloadKey]);

  const locationOptions = useMemo(() => {
    if (data === null || data === "none") return [];
    return data.dimensions.locations.filter(
      (l) => (!category || l.category === category) && (!customerId || l.customerId === customerId)
    );
  }, [data, category, customerId]);

  if (data === "none") return null;
  if (data === null) return <div className="mb-10 h-40 rounded-2xl border border-abys-cream-border bg-abys-cream/40 animate-pulse" />;

  async function patchDecisionState(state: string) {
    if (data === null || data === "none" || !data.main) return;
    setActionPending(true);
    try {
      await fetch("/api/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: data.main.decisionId, state }),
      });
      setReloadKey((k) => k + 1);
    } finally {
      setActionPending(false);
    }
  }

  const { kpis } = data;
  const statusMeta = STATUS_META[data.healthLevel];

  return (
    <section className="mb-10 rounded-2xl border border-abys-cream-border bg-abys-cream/60 p-6">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <div>
          <p className="text-xs tracking-widest text-abys-muted font-semibold">
            TAIS IKF MMC — YÖNETİCİ OPERASYON ÖZETİ
          </p>
          <p className="text-[11px] text-abys-muted mt-0.5">
            Veri modu: <span className="font-medium text-abys-ink">{data.dataMode}</span>
            {data.lastUpdatedAt && (
              <>
                {" "}
                · Son güncelleme:{" "}
                {new Date(data.lastUpdatedAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </>
            )}
            {" "}· İncelenen dönem: {data.periodLabel}
          </p>
        </div>
        <span
          className="text-[10px] font-semibold tracking-wide rounded-full px-2.5 py-1 shrink-0"
          style={{ color: statusMeta.color, background: statusMeta.soft }}
        >
          Genel durum: {statusMeta.label}
        </span>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2 mt-4 mb-5">
        <div className="flex rounded-lg border border-abys-cream-border bg-white/60 p-0.5">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                range === r.id ? "bg-abys-navy text-white" : "text-abys-muted hover:text-abys-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setLocationId("");
          }}
          className="text-xs rounded-lg border border-abys-cream-border bg-white/60 px-2.5 py-1.5"
        >
          <option value="">Tüm hizmet türleri</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setLocationId("");
          }}
          className="text-xs rounded-lg border border-abys-cream-border bg-white/60 px-2.5 py-1.5 max-w-[200px]"
        >
          <option value="">Tüm müşteriler</option>
          {data.dimensions.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="text-xs rounded-lg border border-abys-cream-border bg-white/60 px-2.5 py-1.5 max-w-[200px]"
        >
          <option value="">Tüm lokasyonlar</option>
          {locationOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* F: Yönetici brifingi */}
      <div className="mb-6 rounded-xl border border-abys-accent/25 bg-white/70 p-4">
        <p className="text-[11px] tracking-widest text-abys-accent font-semibold mb-2">YÖNETİCİ BRİFİNGİ</p>
        <p className="text-sm text-abys-ink leading-relaxed">{data.brief}</p>
      </div>

      {/* A: Ana + destek göstergeler (toplam 8 KPI kartı) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Kpi label="Operasyon sağlık skoru" value={`%${kpis.management.operationsHealthScore}`} />
        <Kpi label="SLA uyum oranı" value={`%${kpis.management.slaComplianceRatePct}`} />
         <Kpi label="Kritik risk sayısı" value={data.criticalRiskCount} />
        <Kpi label="Bugün karar gerektiren konu" value={data.main ? 1 : 0} />
        <Kpi label="Aktif görev" value={kpis.operations.activeTaskCount} />
        <Kpi label="Geciken görev" value={kpis.operations.overdueTaskCount} />
        <Kpi label="Açık şikâyet" value={kpis.operations.openComplaintCount} />
        <Kpi label="Yaklaşan yenileme" value={kpis.commercial.upcomingRenewalCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* B: 6 hizmet alanının kompakt durumu */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-abys-navy">Hizmet alanları</p>
              <Link href="/dashboard/analysis" className="text-[11px] text-abys-accent hover:underline">
                tümü →
              </Link>
            </div>
            <ul className="space-y-1.5">
              {data.serviceAreas.map((a) => {
                const meta = STATUS_META[a.status];
                return (
                  <li
                    key={a.category}
                    className="flex items-center gap-2.5 text-sm rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2"
                  >
                    <span
                      className="text-[9px] font-semibold tracking-wide rounded-full px-1.5 py-0.5 shrink-0"
                      style={{ color: meta.color, background: meta.soft }}
                    >
                      {meta.label}
                    </span>
                    <span className="flex-1 text-abys-ink truncate">{a.label}</span>
                    <span className="text-xs text-abys-muted shrink-0">
                       sağlık %{a.healthScore} · {a.openTaskCount} açık · {a.overdueTaskCount} geciken
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* C: bugünün en kritik 3 riski */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-abys-navy">Bugünün en kritik riskleri</p>
              <Link href="/dashboard/alerts" className="text-[11px] text-abys-accent hover:underline">
                tümü →
              </Link>
            </div>
            {data.topRisks.length === 0 ? (
              <p className="text-sm text-abys-muted">Bu kapsamda risk kaydı yok.</p>
            ) : (
              <div className="space-y-2.5">
                {data.topRisks.map((r) => (
                  <RiskCard key={r.id} risk={r} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* D: tek ana yönetici kararı */}
          <div>
            <p className="text-xs font-semibold text-abys-navy mb-2">Bugün Yönetimin Vermesi Gereken Karar</p>
            {data.main ? (
              <MainDecisionCard
                decision={data.main}
                pending={actionPending}
                onApprove={() => patchDecisionState("in_execution")}
                onPostpone={() => patchDecisionState("under_review")}
              />
            ) : (
              <p className="text-sm text-abys-muted rounded-xl border border-abys-cream-border bg-white/60 px-3 py-2.5">
                Bu filtre kapsamında öncelikli bir yönetici kararı yok.
              </p>
            )}
          </div>

          {/* E: en fazla 3 önerilen aksiyon */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-abys-navy">Önerilen aksiyonlar</p>
              <Link href="/dashboard/actions" className="text-[11px] text-abys-accent hover:underline">
                tümü →
              </Link>
            </div>
            {data.topActions.length === 0 ? (
              <p className="text-sm text-abys-muted">Bu kapsamda açık önerilen aksiyon yok.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.topActions.map((a) => (
                  <li key={a.id} className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-sm">
                    <p className="text-abys-ink">{a.title}</p>
                    <p className="text-xs text-abys-muted mt-0.5">
                      {a.owner}
                      {a.dueAt && ` · son tarih ${new Date(a.dueAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`}
                      {` · ${a.status === "in_progress" ? "yürütülüyor" : "açık"}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-abys-cream-border bg-white/60 px-4 py-3">
      <p className="text-[10px] tracking-wide text-abys-muted uppercase truncate" title={label}>
        {label}
      </p>
      <p className="font-mono text-lg text-abys-navy">{value}</p>
    </div>
  );
}

function RiskCard({ risk }: { risk: TaisRiskView }) {
  const meta = SEVERITY_META[risk.severity];
  return (
    <div className="rounded-xl border border-abys-cream-border bg-white/60 p-3.5">
      <div className="flex items-start gap-2.5 mb-1.5">
        <span
          className="text-[9px] font-semibold tracking-wide rounded-full px-1.5 py-0.5 mt-0.5 shrink-0"
          style={{ color: meta.color, background: meta.soft }}
        >
          {meta.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-abys-ink font-medium">{risk.title}</p>
          <p className="text-xs text-abys-muted mt-0.5">
            {risk.customerName ?? "—"} {risk.locationName ? `· ${risk.locationName}` : ""} · güven %{risk.confidence} ·{" "}
            {risk.evidence.length} kanıt kaydı
          </p>
        </div>
      </div>
       <p className="text-xs text-abys-muted mb-1">Önerilen: {risk.recommendedAction}</p>
      <details className="text-xs">
        <summary className="cursor-pointer text-abys-accent">Neden?</summary>
        <div className="mt-1.5 space-y-1 text-abys-ink">
           <p>Kural: {risk.ruleId}</p>
           <p>Hizmet türü: {risk.category ?? "—"}</p>
           <p>Kök neden: {risk.rootCause}</p>
           <p>Beklenen etki: {risk.expectedImpact}</p>
           <p>Kanıt: {risk.evidence.length > 0 ? risk.evidence.map((e) => `${e.type}:${e.id}`).join(", ") : "Kayıt yok"}</p>
          <p>Veri anlık görüntüsü: {new Date(risk.dataAsOf).toLocaleString("tr-TR")}</p>
          <p>Etkilenen kayıt sayısı: {risk.affectedCount}</p>
        </div>
      </details>
    </div>
  );
}

function MainDecisionCard({
  decision,
  pending,
  onApprove,
  onPostpone,
}: {
  decision: TaisMainDecisionView;
  pending: boolean;
  onApprove: () => void;
  onPostpone: () => void;
}) {
  const recommended = decision.options.find((o) => o.rank === decision.recommendedOptionRank);
  return (
    <div className="rounded-xl border border-abys-accent/30 bg-white/70 p-4">
      <p className="text-sm font-medium text-abys-navy mb-1.5">{decision.title}</p>
      <p className="text-xs text-abys-muted mb-2">{decision.businessImpact}</p>
      {recommended && (
        <p className="text-xs mb-2">
          <span className="text-abys-ink font-medium">{recommended.title}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {decision.options.map((o) => (
          <span
            key={o.rank}
            className={`text-[11px] rounded-full px-2 py-0.5 ${
              o.rank === decision.recommendedOptionRank
                ? "bg-abys-accent/15 text-abys-accent"
                : "bg-abys-cream text-abys-muted"
            }`}
          >
            {String.fromCharCode(64 + o.rank)}) {o.feasible ? "uygulanabilir" : "uygulanamaz"}
          </span>
        ))}
      </div>
      <p className="text-xs text-abys-muted mb-3">
        Güven %{decision.confidence} · durum: {decision.state} · {decision.matchedRiskCount} bağlı risk
      </p>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={onApprove}
          disabled={pending}
          className="text-xs rounded-lg bg-abys-navy text-white px-3 py-1.5 disabled:opacity-50"
        >
          Onayla
        </button>
        <Link
          href="/dashboard/decisions"
          className="text-xs rounded-lg border border-abys-cream-border px-3 py-1.5 text-abys-ink hover:bg-abys-cream"
        >
          İncele
        </Link>
        <button
          onClick={onPostpone}
          disabled={pending}
          className="text-xs rounded-lg border border-abys-cream-border px-3 py-1.5 text-abys-muted hover:bg-abys-cream disabled:opacity-50"
        >
          Ertele
        </button>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-abys-accent">Neden?</summary>
        <div className="mt-1.5 space-y-1 text-abys-ink">
          <p>Güven gerekçesi: {decision.confidenceRationale}</p>
          <p>Kanıt kaydı sayısı: {decision.evidenceCount}</p>
          <p>Aksiyon alınmazsa: {decision.counterfactual.narrative}</p>
          <p>Beklenen etki: {decision.counterfactual.projectedImpact}</p>
        </div>
      </details>
    </div>
  );
}
