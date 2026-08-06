"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import { CommandCenter } from "@/components/CommandCenter";
import { TaisExecutiveScreen } from "@/components/TaisExecutiveScreen";
import { getSector } from "@/lib/sectors";
import { getRole } from "@/lib/roles";
import { getActiveSignals, SEVERITY_META } from "@/lib/signals";
import { listEntities, upsertEntity, newId } from "@/lib/entities";
import type { HandledSignal, UrgentTask, SavedReport, ImportedDataset } from "@/lib/entities";
import type { MarketPulse } from "@/lib/market-pulse";
import { pickHeroKpis } from "@/lib/kpi";
import { listCases } from "@/lib/decisions";

type WorkspaceTab = "tasks" | "market" | "reports";

export default function DashboardHome() {
  const [stored] = useStored(() => {
    const p = loadProfile();
    const sector = p ? getSector(p.sectorId) : null;
    const catalog = sector ? getActiveSignals(sector) : [];
    const handled = listEntities<HandledSignal>("handled-signals");
    const open = catalog.filter((s) => {
      const h = handled.find((x) => x.signalId === s.id);
      return !h || h.status === "open";
    });
    const datasets = p
      ? listEntities<ImportedDataset>("imported-datasets")
          .filter((d) => d.sectorId === p.sectorId)
          .sort((a, b) => (b.periodEnd ?? "").localeCompare(a.periodEnd ?? ""))
      : [];
    const openCases = p ? listCases(p.sectorId).filter((c) => c.status === "open") : [];
    return {
      profile: p,
      allSignals: catalog,
      openSignals: open,
      allDatasets: datasets,
      topCase: openCases[0] ?? null,
      openCaseCount: openCases.length,
    };
  });
  const localProfile = stored?.profile ?? null;
  const allSignals = stored?.allSignals ?? [];
  const openSignals = stored?.openSignals ?? [];
  const allDatasets = stored?.allDatasets ?? [];
  const topCase = stored?.topCase ?? null;
  const openCaseCount = stored?.openCaseCount ?? 0;

  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  // İlk yükleme her zaman brifingle başlar; effect'te senkron setState gerekmez.
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [wsTab, setWsTab] = useState<WorkspaceTab>("tasks");
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  // A validated server session is authoritative. Local prototype state is
  // only eligible when there is no corporate session.
  const profile = session ? null : localProfile;
  const [taisApplicable, setTaisApplicable] = useState<boolean | null>(null);

  const hasRealData = allSignals.some((s) => s.isReal);
  const dataset =
    allDatasets.find((d) => d.id === selectedDatasetId) ?? allDatasets[0] ?? null;
  const heroKpis = dataset ? pickHeroKpis(dataset.kpis) : [];

  async function fetchBriefing() {
    if (!profile || session === undefined || session) return;
    try {
      const realFindings = hasRealData
        ? allSignals
            .filter((s) => s.isReal)
            .map((s) => `${s.categoryLabel}: ${s.title}${s.recommendedAction ? ` (Öneri: ${s.recommendedAction})` : ""}`)
            .join("\n")
        : undefined;
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, realFindings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata.");
      setBriefing(data.briefing);
    } catch (err) {
      setBriefingError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setBriefingLoading(false);
    }
  }

  useEffect(() => {
    if (!profile || session === undefined || session) return;
    // Zamanlayıcı ile tetikleme: effect gövdesinde senkron setState zinciri kalmaz.
    const t = setTimeout(fetchBriefing, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Oturum var ama yerel profil kurulmamış (ör. TAIS demo girişi) —
  // onboarding'e yönlendirilmez (bkz. layout.tsx); yalnızca org'a özgü
  // yönetici ekranı (varsa) gösterilir.
  if (session === undefined) return null;
  if (isTais) {
    return (
      <div className="px-10 py-10">
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
          {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <TaisExecutiveScreen onStatus={setTaisApplicable} />
        {taisApplicable === false && (
          <p className="text-sm text-abys-muted">
            Bu kurum için ABYS başlangıç ayarları tamamlanmamış.{" "}
            <Link href="/onboarding" className="text-abys-accent font-medium">
              Kuruluma başla
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  if (!profile && session) return <CommandCenter />;
  if (!profile) return null;

  const role = getRole(profile.roleId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 px-10 py-10">
      <div>
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
          {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <h1 className="font-serif text-4xl text-abys-navy mb-8">
          Günaydın, <em className="italic text-abys-accent">{profile.companyName}</em>.
        </h1>

        {/* TAIS demo kurumu için varsayılan açılış görünümü (uygulanamazsa null render eder) */}
         {!isTais && <TaisExecutiveScreen onStatus={setTaisApplicable} />}

        {/* Diğer kurumlar için: oturumdayken üstte 30 saniyelik komuta merkezi (sunucu verisi) */}
         {!isTais && taisApplicable !== true && <CommandCenter />}

        {taisApplicable !== true && topCase && (
          <Link href="/dashboard/decisions" className="block mb-8">
            <div className="rounded-xl border-2 border-abys-accent/40 bg-abys-cream p-5 hover:border-abys-accent transition-colors">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs tracking-widest text-abys-muted font-semibold">
                  EN KRİTİK KARAR VAKASI
                </p>
                <span className="text-xs text-abys-accent font-medium">
                  {openCaseCount} açık vaka · Karar Merkezi →
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span
                  className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 mt-0.5 shrink-0"
                  style={{
                    color: SEVERITY_META[topCase.severity].color,
                    background: SEVERITY_META[topCase.severity].soft,
                  }}
                >
                  {SEVERITY_META[topCase.severity].label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-abys-ink">{topCase.title}</p>
                  <p className="text-xs text-abys-muted mt-1">{topCase.businessImpact}</p>
                  {(() => {
                    const rec = topCase.options.find((o) => o.id === topCase.recommendedOptionId);
                    return rec ? (
                      <p className="text-xs mt-1.5">
                        <span className="text-abys-muted">Önerilen: </span>
                        <span className="text-abys-navy font-medium">{rec.title}</span>
                        <span className="text-abys-muted"> · Güven %{topCase.confidence}</span>
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          </Link>
        )}

        {taisApplicable !== true && dataset && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <p className="text-xs tracking-widest text-abys-muted font-semibold">
                KPI&rsquo;LAR
              </p>
              <div className="flex items-center gap-3">
                {allDatasets.length > 1 && (
                  <select
                    value={selectedDatasetId ?? ""}
                    onChange={(e) => setSelectedDatasetId(e.target.value)}
                    className="text-xs rounded-full border border-abys-ink/15 bg-white/70 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-abys-accent"
                  >
                    {allDatasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.periodLabel}
                      </option>
                    ))}
                  </select>
                )}
                <Link href="/dashboard/reports" className="text-xs text-abys-accent font-medium">
                  Tüm KPI&rsquo;lar →
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {heroKpis.map((k) => (
                <div key={k.key} className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
                  <p className="text-[10px] tracking-wide text-abys-muted uppercase truncate" title={k.label}>
                    {k.label}
                  </p>
                  <p className="font-mono text-lg text-abys-navy truncate" title={k.value ?? "—"}>
                    {k.value ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {taisApplicable !== true && hasRealData && (
          <div className="mb-8">
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
              ANALİZ VE ÖNERİLER
            </p>
            <div className="space-y-3">
              {allSignals
                .filter((s) => s.isReal)
                .map((s) => {
                  const meta = SEVERITY_META[s.severity];
                  return (
                    <div key={s.id} className="rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1"
                          style={{ color: meta.color, background: meta.soft }}
                        >
                          {meta.label}
                        </span>
                        <p className="text-sm font-medium text-abys-navy">{s.categoryLabel}</p>
                      </div>
                      <p className="text-sm text-abys-ink mb-1">{s.title}</p>
                      {s.recommendedAction && (
                        <p className="text-xs text-abys-muted">Öneri: {s.recommendedAction}</p>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAIS demo kurumunda bu blok gizlenir: hızlı kutular ve günlük brifing
            localStorage tabanlı eski demo verisinden beslenir (çağrı merkezi
            terminolojisi), TAIS yönetici ekranıyla çelişir. */}
        {taisApplicable !== true && (
        <>
        <div className="grid grid-cols-2 gap-3 mb-8">
          <Link href="/dashboard/decisions">
            <QuickTile title="Karar Merkezi" desc={openCaseCount > 0 ? `${openCaseCount} açık vaka` : "Yeni analiz çalıştır"} />
          </Link>
          <QuickTile title="Günlük Briefing" desc="Özetle ve gündemi gör" onClick={fetchBriefing} />
          <Link href="/dashboard/alerts">
            <QuickTile title="Sinyaller" desc={`${openSignals.length} aktif sinyal`} />
          </Link>
          <Link href="/dashboard/analysis">
            <QuickTile title="Analiz" desc="Senaryo ve risk modelleri" />
          </Link>
          <Link href="/dashboard/reports">
            <QuickTile title="Rapor Hazırla" desc="Özet ve sunum" />
          </Link>
        </div>

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-6">
          <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
            {role?.label.toUpperCase()} İÇİN GÜNLÜK BRİFİNG
          </p>
          {briefingLoading && <p className="text-sm text-abys-muted">Hazırlanıyor…</p>}
          {briefingError && (
            <p className="text-sm text-abys-critical">{briefingError}</p>
          )}
          {briefing && !briefingLoading && (
            <p className="text-abys-ink leading-relaxed whitespace-pre-line">{briefing}</p>
          )}
        </div>
        </>
        )}
      </div>

      <div>
        {/* TAIS demosunda gizli: eski localStorage sinyalleri TAIS risk
            kayıtlarıyla çelişir (riskler yönetici ekranında gösterilir). */}
        {taisApplicable !== true && (
        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 mb-5">
          <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
            AKTİF SİNYALLER
          </p>
          {openSignals.length === 0 && (
            <p className="text-sm text-abys-muted">Şu an açık sinyal yok.</p>
          )}
          <div className="space-y-2.5">
            {openSignals.slice(0, 4).map((s) => {
              const meta = SEVERITY_META[s.severity];
              return (
                <div key={s.id} className="flex items-start gap-2.5">
                  <span
                    className="text-[9px] font-semibold tracking-wide rounded-full px-1.5 py-0.5 mt-0.5 shrink-0"
                    style={{ color: meta.color, background: meta.soft }}
                  >
                    {meta.label}
                  </span>
                  <p className="text-sm text-abys-ink leading-snug">{s.title}</p>
                </div>
              );
            })}
          </div>
          {openSignals.length > 0 && (
            <Link
              href="/dashboard/alerts"
              className="inline-block text-xs text-abys-accent font-medium mt-4"
            >
              Tüm sinyalleri gör →
            </Link>
          )}
        </div>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex gap-4 text-xs font-semibold tracking-wide mb-4 border-b border-abys-ink/10">
            <WsTabButton id="tasks" active={wsTab} onClick={setWsTab} label="Tasks" />
            <WsTabButton id="market" active={wsTab} onClick={setWsTab} label="Market Pulse" />
            <WsTabButton id="reports" active={wsTab} onClick={setWsTab} label="Reports" />
          </div>
          {wsTab === "tasks" && <TasksPanel />}
          {wsTab === "market" && <MarketPulsePanel />}
          {wsTab === "reports" && <ReportsPreviewPanel />}
        </div>
      </div>
    </div>
  );
}

function QuickTile({ title, desc, onClick }: { title: string; desc: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5 hover:border-abys-accent/50 transition-colors cursor-pointer h-full"
    >
      <p className="text-sm font-semibold text-abys-navy">{title}</p>
      <p className="text-xs text-abys-muted mt-0.5">{desc}</p>
    </div>
  );
}

function WsTabButton({
  id,
  active,
  onClick,
  label,
}: {
  id: WorkspaceTab;
  active: WorkspaceTab;
  onClick: (t: WorkspaceTab) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`pb-2.5 -mb-px border-b-2 transition-colors ${
        active === id ? "border-abys-accent text-abys-navy" : "border-transparent text-abys-muted"
      }`}
    >
      {label}
    </button>
  );
}

function TasksPanel() {
  const [stored, refreshTasks] = useStored(() => ({
    tasks: listEntities<UrgentTask>("urgent-tasks"),
  }));
  const tasks = stored?.tasks ?? [];
  const [text, setText] = useState("");

  function add() {
    if (!text.trim()) return;
    const task: UrgentTask = { id: newId(), createdAt: new Date().toISOString(), title: text.trim(), done: false };
    upsertEntity("urgent-tasks", task);
    refreshTasks();
    setText("");
  }

  function toggle(t: UrgentTask) {
    upsertEntity("urgent-tasks", { ...t, done: !t.done });
    refreshTasks();
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Yeni görev ekle..."
          className="flex-1 text-sm rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
        />
        <button onClick={add} className="text-sm rounded-lg bg-abys-navy text-white px-3 py-2">
          Ekle
        </button>
      </div>
      {tasks.length === 0 && <p className="text-sm text-abys-muted">Henüz görev yok.</p>}
      <ul className="space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
            <span className={t.done ? "line-through text-abys-muted" : "text-abys-ink"}>{t.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MarketPulsePanel() {
  const [data, setData] = useState<MarketPulse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/market-pulse")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm text-abys-critical">Piyasa verisi alınamadı.</p>;
  if (!data) return <p className="text-sm text-abys-muted">Yükleniyor…</p>;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {data.weather && (
          <div className="text-sm">
            <p className="text-[10px] tracking-wide text-abys-muted">{data.weather.city.toUpperCase()}</p>
            <p className="font-mono text-abys-navy">
              {data.weather.temperature.toFixed(0)}°C{" "}
              <span className="text-abys-muted font-sans text-xs">{data.weather.description}</span>
            </p>
          </div>
        )}
        {data.quotes.map((q) => (
          <div key={q.label} className="text-sm">
            <p className="text-[10px] tracking-wide text-abys-muted">{q.label}</p>
            <p className="font-mono text-abys-navy">
              {q.value}{" "}
              {q.changePct !== null && (
                <span className={q.changePct < 0 ? "text-abys-critical" : "text-abys-healthy"}>
                  {q.changePct >= 0 ? "+" : ""}
                  {q.changePct.toFixed(2)}%
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-abys-muted mt-3">
        Kaynak: TCMB, Open-Meteo, Yahoo Finance — 5 dakikada bir güncellenir.
      </p>
    </div>
  );
}

function ReportsPreviewPanel() {
  const reports = useMemo(() => listEntities<SavedReport>("saved-reports"), []);
  return (
    <div>
      {reports.length === 0 ? (
        <p className="text-sm text-abys-muted">Henüz kaydedilmiş rapor yok.</p>
      ) : (
        <ul className="space-y-1.5">
          {reports.slice(0, 5).map((r) => (
            <li key={r.id} className="text-sm text-abys-ink">
              {r.title}
            </li>
          ))}
        </ul>
      )}
      <Link href="/dashboard/reports" className="inline-block text-xs text-abys-accent font-medium mt-3">
        Reports sayfasına git →
      </Link>
    </div>
  );
}
