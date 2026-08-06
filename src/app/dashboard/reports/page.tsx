"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { getRole } from "@/lib/roles";
import { loadProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import { listEntities, deleteEntity } from "@/lib/entities";
import type { SavedReport, ImportedDataset, CounselorStat } from "@/lib/entities";

export default function ReportsPage() {
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  const [stored, refreshReports] = useStored(() => ({
    reports: [...listEntities<SavedReport>("saved-reports")].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    ),
  }));
  const reports = session ? [] : stored?.reports ?? [];
  const [printTarget, setPrintTarget] = useState<SavedReport | null>(null);

  useEffect(() => {
    if (!printTarget) return;
    const handleAfterPrint = () => setPrintTarget(null);
    window.addEventListener("afterprint", handleAfterPrint);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [printTarget]);

  if (session === undefined) return null;

  function remove(id: string) {
    deleteEntity<SavedReport>("saved-reports", id);
    refreshReports();
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow="REPORTS"
          title="Kayıtlı"
          accent="raporlar."
          desc={isTais ? "TAIS operasyon, müşteri, sözleşme, SLA, ekip, kalite, karar ve aksiyon raporları." : "Tüm KPI'lar ve otomatik üretilen günlük analizler burada."}
        />

        <div className="px-10 pb-16 max-w-3xl space-y-12">
           {isTais ? (
             <TaisReportSection />
           ) : (
             <>
               <KpiHistorySection />
               <CounselorSection />
             </>
           )}

           {!isTais && <div>
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-4">
              GÜNLÜK ANALİZ RAPORLARI
            </p>
            <div className="space-y-3">
              {reports.length === 0 && (
                <p className="text-sm text-abys-muted">
                  Henüz kaydedilmiş rapor yok. Integrations &gt; CSV Import&rsquo;tan
                  veri yükleyip risk değerlendirmesi yaptığınızda ya da Analysis
                  sayfasında &ldquo;Rapor olarak kaydet&rdquo; dediğinizde buraya
                  eklenir.
                </p>
              )}
              {reports.map((r) => {
                const role = getRole(r.roleId);
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-abys-cream-border bg-abys-cream px-5 py-4 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-abys-ink">{r.title}</p>
                      <p className="text-xs text-abys-muted mt-0.5">
                        {role?.label ?? "—"} ·{" "}
                        {new Date(r.createdAt).toLocaleDateString("tr-TR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                     </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setPrintTarget(r)}
                        className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 hover:bg-white/60 transition-colors"
                      >
                        PDF olarak indir
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 text-abys-critical hover:bg-white/60 transition-colors"
                      >
                        Sil
                      </button>
                        </div>
                  </div>
                );
              })}
            </div>
          </div>}
         </div>
        </div>

       {printTarget && (
        <div className="print-area p-12">
          <p className="text-xs tracking-widest text-gray-500 font-semibold mb-2">ABYS — RAPOR</p>
          <h1 className="text-2xl font-serif mb-1">{printTarget.title}</h1>
          <p className="text-sm text-gray-500 mb-6">
            {getRole(printTarget.roleId)?.label} ·{" "}
            {new Date(printTarget.createdAt).toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm">{printTarget.content}</pre>
        </div>
      )}
    </div>
  );
}

interface TaisExecutiveSummary {
  periodLabel: string;
  dataMode: string;
  brief: string;
  kpis: {
    operations: { activeTaskCount: number; overdueTaskCount: number; slaRiskTaskCount: number; openComplaintCount: number; openQualityIssueCount: number };
    management: { operationsHealthScore: number; slaComplianceRatePct: number };
  };
  topRisks: { title: string; severity: string }[];
  serviceAreas: { label: string; status: string; healthScore: number; openTaskCount: number; overdueTaskCount: number }[];
  main: { title: string; state: string; matchedRiskCount: number; evidenceCount: number } | null;
  topActions: { title: string; owner: string; dueAt: string | null; status: string; relatedRiskId: string | null }[];
}

interface TaisAnalysisReport {
  operations: {
    tasksByCategory: { category: string; categoryLabel: string; total: number; open: number; overdue: number }[];
    workloadByTeam: { teamName: string; openTaskCount: number; capacity: number; utilization: number }[];
  };
  commercial: { upcomingRenewalCount: number; openDealCount: number };
  management: { slaComplianceRatePct: number };
  upcomingRenewals: { customerName: string; categoryLabel: string; renewalDate: string; valueAzn: number }[];
  quality: { openComplaintCount: number; openQualityIssueCount: number; recurringComplaintCustomerCount: number };
}

/** TAIS oturumunda bütün rapor bölümleri aynı server hesaplarından beslenir. */
function TaisReportSection() {
  const [summary, setSummary] = useState<TaisExecutiveSummary | null>(null);
  const [analysis, setAnalysis] = useState<TaisAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/tais/executive-summary?range=30d").then(async (r) => (r.ok ? r.json() : null)),
      fetch("/api/tais/analysis?range=30d").then(async (r) => (r.ok ? r.json() : null)),
    ])
      .then(([summaryData, analysisData]) => {
        if (cancelled) return;
        if (!summaryData || !analysisData) {
          setError("TAIS rapor verileri yüklenemedi.");
          return;
        }
        setSummary(summaryData);
        setAnalysis(analysisData);
      })
      .catch(() => {
        if (!cancelled) setError("TAIS rapor verileri yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-abys-critical">{error}</p>;
  if (!summary || !analysis) return <p className="text-sm text-abys-muted">TAIS raporları yükleniyor…</p>;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-xs tracking-widest text-abys-muted font-semibold">TAIS OPERASYON RAPORLARI</p>
          <span className="text-[10px] text-abys-muted">{summary.dataMode} · {summary.periodLabel}</span>
        </div>
        <p className="rounded-xl border border-abys-accent/25 bg-abys-cream p-5 text-sm text-abys-ink leading-relaxed">{summary.brief}</p>
      </div>

      <ReportSection title="OPERASYON ÖZETİ">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ReportKpi label="Aktif görev" value={String(summary.kpis.operations.activeTaskCount)} />
          <ReportKpi label="Geciken görev" value={String(summary.kpis.operations.overdueTaskCount)} />
          <ReportKpi label="SLA uyumu" value={`%${summary.kpis.management.slaComplianceRatePct}`} />
          <ReportKpi label="Açık şikâyet" value={String(summary.kpis.operations.openComplaintCount)} />
        </div>
      </ReportSection>

      <ReportSection title="HİZMET TÜRÜ KIRILIMI">
        <ReportTable headers={["Hizmet", "Toplam", "Açık", "Geciken"]}>
          {analysis.operations.tasksByCategory.map((row) => (
            <ReportRow key={row.category} cells={[row.categoryLabel, String(row.total), String(row.open), String(row.overdue)]} />
          ))}
        </ReportTable>
      </ReportSection>

      <ReportSection title="MÜŞTERİ / SÖZLEŞME GÖRÜNÜMÜ">
        {analysis.upcomingRenewals.length === 0 ? (
          <p className="text-sm text-abys-muted">Yaklaşan yenileme kaydı yok.</p>
        ) : (
          <ReportTable headers={["Müşteri", "Hizmet", "Yenileme", "Değer"]}>
            {analysis.upcomingRenewals.map((row) => (
              <ReportRow key={`${row.customerName}-${row.renewalDate}-${row.categoryLabel}`} cells={[row.customerName, row.categoryLabel, new Date(row.renewalDate).toLocaleDateString("tr-TR"), `${row.valueAzn.toLocaleString("tr-TR")} AZN`]} />
            ))}
          </ReportTable>
        )}
      </ReportSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ReportSection title="SLA DURUMU">
          <p className="text-sm text-abys-ink">%{analysis.management.slaComplianceRatePct} uyum · {summary.kpis.operations.slaRiskTaskCount} görev SLA penceresinde.</p>
          <p className="text-xs text-abys-muted mt-1">{summary.kpis.operations.overdueTaskCount} görev gecikmiş durumda.</p>
        </ReportSection>
        <ReportSection title="ŞİKÂYET VE KALİTE">
          <p className="text-sm text-abys-ink">{analysis.quality.openComplaintCount} açık şikâyet · {analysis.quality.openQualityIssueCount} açık kalite kaydı.</p>
          <p className="text-xs text-abys-muted mt-1">{analysis.quality.recurringComplaintCustomerCount} müşteride tekrarlanan şikâyet deseni.</p>
        </ReportSection>
      </div>

      <ReportSection title="EKİP İŞ YÜKÜ">
        <ReportTable headers={["Ekip", "Açık görev", "Kapasite", "Kullanım"]}>
          {analysis.operations.workloadByTeam.map((row) => (
            <ReportRow key={row.teamName} cells={[row.teamName, String(row.openTaskCount), String(row.capacity), `%${Math.round(row.utilization * 100)}`]} />
          ))}
        </ReportTable>
      </ReportSection>

      <ReportSection title="KARAR VE AKSİYON ÖZETİ">
        <p className="text-sm text-abys-ink">{summary.main ? `${summary.main.title} · ${summary.main.matchedRiskCount} bağlı risk · ${summary.main.evidenceCount} kanıt` : "Bekleyen ana karar yok."}</p>
        <div className="mt-3 space-y-2">
          {summary.topActions.map((action) => <p key={action.title} className="text-xs text-abys-muted">{action.title} · {action.owner} · {action.status}</p>)}
        </div>
      </ReportSection>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">{title}</p>{children}</div>;
}

function ReportKpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3"><p className="text-[10px] text-abys-muted uppercase">{label}</p><p className="font-mono text-lg text-abys-navy">{value}</p></div>;
}

function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden"><div className="grid grid-cols-4 gap-3 px-4 py-2.5 text-[10px] tracking-wide text-abys-muted font-semibold border-b border-abys-ink/10">{headers.map((header) => <span key={header}>{header}</span>)}</div>{children}</div>;
}

function ReportRow({ cells }: { cells: string[] }) {
  return <div className="grid grid-cols-4 gap-3 px-4 py-2.5 text-sm border-b border-abys-ink/5 last:border-0">{cells.map((cell, index) => <span key={`${index}-${cell}`} className={index === 0 ? "text-abys-ink font-medium" : "font-mono text-abys-navy"}>{cell}</span>)}</div>;
}

function useDatasets(): ImportedDataset[] {
  const [stored] = useStored(() => {
    const profile = loadProfile();
    if (!profile) return { list: [] as ImportedDataset[] };
    return {
      list: listEntities<ImportedDataset>("imported-datasets")
        .filter((d) => d.sectorId === profile.sectorId)
        .sort((a, b) => (b.periodEnd ?? "").localeCompare(a.periodEnd ?? "")),
    };
  });
  return stored?.list ?? [];
}

function KpiHistorySection() {
  const datasets = useDatasets();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (datasets.length === 0) return null;
  // Seçim yapılmadıysa ilk dönem gösterilir — ayrıca effect gerekmez.
  const selected = datasets.find((d) => d.id === selectedId) ?? datasets[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-xs tracking-widest text-abys-muted font-semibold">TÜM KPI&rsquo;LAR</p>
        <select
          value={selected.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="text-xs rounded-full border border-abys-ink/15 bg-white/70 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-abys-accent"
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.periodLabel}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {selected.kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
            <p className="text-[10px] tracking-wide text-abys-muted uppercase truncate" title={k.label}>
              {k.label}
            </p>
            <p className="font-mono text-lg text-abys-navy truncate" title={k.value}>
              {k.value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-abys-muted mt-2">
        Kaynak: {selected.fileName} · {selected.periodStart} – {selected.periodEnd}
      </p>
    </div>
  );
}

function CounselorSection() {
  const datasets = useDatasets();
  const withCounselors = datasets.filter((d) => d.counselors && d.counselors.length > 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (withCounselors.length === 0) return null;
  const selected = withCounselors.find((d) => d.id === selectedId) ?? withCounselors[0];
  const counselors = [...(selected.counselors ?? [])].sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-xs tracking-widest text-abys-muted font-semibold">
          SATIŞ DANIŞMANLARI ({counselors.length})
        </p>
        {withCounselors.length > 1 && (
          <select
            value={selected.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-xs rounded-full border border-abys-ink/15 bg-white/70 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            {withCounselors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.periodLabel}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-[10px] tracking-wide text-abys-muted font-semibold border-b border-abys-ink/10">
          <span>DANIŞMAN</span>
          <span>ATANAN</span>
          <span>SATIŞ</span>
          <span>TUTAR</span>
        </div>
        {counselors.map((c) => (
          <CounselorRow
            key={c.name}
            counselor={c}
            expanded={expanded === c.name}
            onToggle={() => setExpanded(expanded === c.name ? null : c.name)}
          />
        ))}
      </div>
    </div>
  );
}

function CounselorRow({
  counselor,
  expanded,
  onToggle,
}: {
  counselor: CounselorStat;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-abys-ink/5 last:border-0">
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/40 transition-colors"
      >
        <span className="text-abys-ink font-medium truncate">{counselor.name}</span>
        <span className="text-abys-muted font-mono">{counselor.assigned}</span>
        <span className="text-abys-muted font-mono">{counselor.sales}</span>
        <span className="text-abys-navy font-mono">{counselor.revenue.toLocaleString("tr-TR")} ₺</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-abys-muted">Atanan Başvuru</p>
            <p className="font-mono text-abys-navy">{counselor.assigned}</p>
          </div>
          <div>
            <p className="text-abys-muted">Satış Sayısı</p>
            <p className="font-mono text-abys-navy">{counselor.sales}</p>
          </div>
          <div>
            <p className="text-abys-muted">Satış Tutarı</p>
            <p className="font-mono text-abys-navy">{counselor.revenue.toLocaleString("tr-TR")} ₺</p>
          </div>
          <div>
            <p className="text-abys-muted">Dönüşüm Oranı</p>
            <p className="font-mono text-abys-navy">%{counselor.conversionPct}</p>
          </div>
        </div>
      )}
    </div>
  );
}
