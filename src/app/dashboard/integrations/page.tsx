"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import { PageHeader } from "@/components/PageHeader";
import { loadProfile } from "@/lib/profile";
import { getSector, getKpiFields, type Sector } from "@/lib/sectors";
import { replaceEntities, upsertEntity, newId } from "@/lib/entities";
import type { AssessedRisk, SavedReport, ImportedDataset } from "@/lib/entities";
import { parseKpis } from "@/lib/kpi";
import { SEVERITY_META } from "@/lib/signals";
import type { RiskAssessment } from "@/lib/ai/provider";
import { postJsonStreamed, postFormStreamed } from "@/lib/ndjson-client";

type Tab = "ingestion" | "csv" | "oauth" | "webhook" | "apikeys";

const TABS: { id: Tab; label: string }[] = [
  { id: "ingestion", label: "Universal Ingestion" },
  { id: "csv", label: "CSV Import" },
  { id: "oauth", label: "OAuth" },
  { id: "webhook", label: "Webhook" },
  { id: "apikeys", label: "API Anahtarları" },
];

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("oauth");
  const session = useSession();
  const [stored] = useStored(() => {
    const p = loadProfile();
    return {
      sector: p ? getSector(p.sectorId) ?? null : null,
      companyName: p?.companyName ?? "",
      roleId: p?.roleId ?? "",
    };
  });
  const isTais = session?.orgCode === "tais-ikf-demo";
  const sector = session ? getSector(session.sectorId) ?? null : stored?.sector ?? null;
  const companyName = session?.orgName ?? stored?.companyName ?? "";
  const roleId = session?.role ?? stored?.roleId ?? "";

  if (session === undefined) return null;

  return (
    <div>
      <PageHeader
        eyebrow="INTEGRATIONS"
        title="Veri"
        accent="kaynaklarınızı bağlayın."
        desc="Sektörünüze uygun veri kaynaklarını buradan içeri aktarın veya bağlayın."
      />

      <div className="px-10">
        {isTais ? (
          <div className="pb-16 max-w-3xl">
            <Bitrix24Card />
            <p className="text-sm text-abys-muted leading-relaxed">
              Bu demo Bitrix24 uyumlu sentetik verilerle çalışmaktadır. Gerçek Bitrix24 portalı,
              salt-okunur webhook ve alan eşleme bilgileri sağlandığında mevcut connector üzerinden
              veri bağlantısı yapılandırılacaktır.
            </p>
          </div>
        ) : (
        <>
        <div className="flex gap-1 border-b border-abys-ink/10 mb-8">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-abys-accent text-abys-navy"
                  : "border-transparent text-abys-muted hover:text-abys-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pb-16 max-w-3xl">
          {tab === "ingestion" && <IngestionTab sector={sector} />}
          {tab === "csv" && <CsvTab sector={sector} roleId={roleId} />}
          {tab === "oauth" && <OAuthTab sector={sector} />}
          {tab === "webhook" && <WebhookTab companyName={companyName} />}
          {tab === "apikeys" && <ApiKeysTab />}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function IngestionTab({ sector }: { sector: Sector | null }) {
  const [text, setText] = useState("");
  const [spreadsheetFile, setSpreadsheetFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; fields: { label: string; value: string }[] } | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.name);
    if (isSpreadsheet) {
      setSpreadsheetFile(file);
      setText("");
      return;
    }
    setSpreadsheetFile(null);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function submit() {
    if (!sector || (!text.trim() && !spreadsheetFile)) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = spreadsheetFile
        ? await (async () => {
            const form = new FormData();
            form.set("file", spreadsheetFile);
            form.set("sectorId", sector.id);
            return postFormStreamed<{ summary: string; fields: { label: string; value: string }[] }>(
              "/api/ingest",
              form
            );
          })()
        : await postJsonStreamed<{ summary: string; fields: { label: string; value: string }[] }>(
            "/api/ingest",
            { rawText: text, sectorId: sector.id }
          );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-abys-muted mb-4">
        Rapor, e-posta veya tutanak metnini yapıştırın ya da bir metin/CSV/XLSX
        dosyası yükleyin — AI içindeki yapılandırılmış alanları çıkarsın.
        (PDF/görsel çıkarımı sonraki adım.)
      </p>

      <input type="file" accept=".txt,.csv,.tsv,.xlsx,.xls" onChange={onFile} className="text-sm mb-1 block" />
      {spreadsheetFile && (
        <p className="text-xs text-abys-muted mb-3">
          Seçilen dosya: {spreadsheetFile.name} (tablo AI&apos;ya gönderilmeden önce ayrıştırılacak)
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSpreadsheetFile(null);
        }}
        rows={8}
        maxLength={8000}
        placeholder="Metni buraya yapıştırın..."
        className="w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5 text-sm text-abys-ink placeholder:text-abys-muted focus:outline-none focus:ring-2 focus:ring-abys-accent mb-4"
      />

      <button
        onClick={submit}
        disabled={loading || (!text.trim() && !spreadsheetFile) || !sector}
        className="rounded-full bg-abys-navy text-white text-sm font-medium px-5 py-2.5 hover:bg-abys-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Çıkarılıyor…" : "AI ile Çıkar →"}
      </button>

      {error && (
        <p className="mt-4 text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <p className="text-sm text-abys-ink mb-4">{result.summary}</p>
          {result.fields.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {result.fields.map((f, i) => (
                  <tr key={i} className="border-t border-abys-ink/10">
                    <td className="py-2 pr-4 text-abys-muted">{f.label}</td>
                    <td className="py-2 font-mono text-abys-navy">{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-abys-muted">Yapılandırılmış alan bulunamadı.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CsvTab({ sector, roleId }: { sector: Sector | null; roleId: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [rawCsv, setRawCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<RiskAssessment[] | null>(null);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [periodLabel, setPeriodLabel] = useState(
    new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
  );
  const [periodStart, setPeriodStart] = useState(todayIso);
  const [periodEnd, setPeriodEnd] = useState(todayIso);

  const kpiFields = useMemo(() => (sector ? getKpiFields(sector) : []), [sector]);

  function downloadTemplate() {
    const csv = [
      ["Dönem", ...kpiFields].join(","),
      ["2026-07", ...kpiFields.map(() => "")].join(","),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abys-${sector?.id ?? "sablon"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setAssessments(null);
    setAssessError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRawCsv(text);
      const parsed = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => line.split(","));
      setRows(parsed.slice(0, 20));
    };
    reader.readAsText(file);
  }

  async function assess() {
    if (!sector || !rawCsv.trim()) return;
    setAssessing(true);
    setAssessError(null);
    setAssessments(null);

    // KPI'ları AI'dan bağımsız olarak hemen çıkar ve kaydet — AI kotası dolu
    // olsa bile veriler ana sayfada raporlanabilsin. Dönem etiketiyle
    // kaydedilir ki aynı dönem tekrar yüklenince güncellensin, farklı
    // dönemler (Ocak, Şubat, ...) yan yana birikebilsin.
    const kpis = parseKpis(rawCsv);
    if (kpis.length > 0) {
      const dataset: ImportedDataset = {
        id: `${sector.id}:${periodLabel}`,
        createdAt: new Date().toISOString(),
        sectorId: sector.id,
        fileName: fileName ?? "veri",
        kpis,
        periodLabel,
        periodStart,
        periodEnd,
      };
      upsertEntity("imported-datasets", dataset);
    }

    try {
      const data = await postJsonStreamed<{ assessments: RiskAssessment[] }>("/api/assess-risk", {
        sectorId: sector.id,
        data: rawCsv,
      });
      setAssessments(data.assessments);

      const now = new Date();
      const nowIso = now.toISOString();
      const records: AssessedRisk[] = data.assessments.map((a: RiskAssessment) => ({
        id: newId(),
        createdAt: nowIso,
        sectorId: sector.id,
        categoryId: a.categoryId,
        categoryLabel: a.categoryLabel,
        severity: a.severity,
        explanation: a.explanation,
        recommendedAction: a.recommendedAction,
      }));
      replaceEntities("assessed-risks", records);

      const dateLabel = now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
      const critCount = records.filter((r) => r.severity === "critical").length;
      const report: SavedReport = {
        id: newId(),
        createdAt: nowIso,
        title: `Günlük Analiz — ${dateLabel} (${critCount} kritik bulgu)`,
        roleId,
        content: records
          .map((r) => `[${r.severity.toUpperCase()}] ${r.categoryLabel}\n${r.explanation}\nÖneri: ${r.recommendedAction}`)
          .join("\n\n"),
      };
      upsertEntity("saved-reports", report);
    } catch (err) {
      const base = err instanceof Error ? err.message : "Bilinmeyen hata.";
      setAssessError(
        kpis.length > 0
          ? `${base} — Yine de verinizdeki ${kpis.length} KPI kaydedildi ve ana sayfada görüntüleniyor.`
          : base
      );
    } finally {
      setAssessing(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-abys-muted mb-5">
        CRM/sisteminizden dışa aktardığınız veriyi bu şablona uyarlayıp yükleyin.
        AI, gerçek verinize dayanarak {sector?.label.toLowerCase() ?? "sektörünüz"}{" "}
        risk kategorilerini değerlendirecek.
      </p>

      <button
        onClick={downloadTemplate}
        className="rounded-full border border-abys-ink/15 text-sm font-medium px-5 py-2.5 hover:bg-white/60 transition-colors mb-6"
      >
        Şablon indir (.csv) ↓
      </button>

      <div className="grid grid-cols-3 gap-3 mb-4 max-w-lg">
        <div>
          <label className="block text-xs text-abys-muted mb-1">Dönem Etiketi</label>
          <input
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="Örn: Ocak 2026"
            className="w-full rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-abys-muted mb-1">Başlangıç</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-full rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-abys-muted mb-1">Bitiş</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
        </div>
      </div>

      <div>
        <input type="file" accept=".csv" onChange={onFile} className="text-sm block mb-4" />
      </div>

      {rows && (
        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-4 overflow-x-auto mb-4">
          <p className="text-xs text-abys-muted mb-3">{fileName} — önizleme</p>
          <table className="text-sm w-full">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i === 0 ? "font-semibold text-abys-navy" : "text-abys-ink"}>
                  {row.map((cell, j) => (
                    <td key={j} className="pr-6 py-1 whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && (
        <button
          onClick={assess}
          disabled={assessing}
          className="rounded-full bg-abys-navy text-white text-sm font-medium px-5 py-2.5 hover:bg-abys-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-4"
        >
          {assessing ? "Değerlendiriliyor…" : "AI ile Risk Değerlendirmesi Yap →"}
        </button>
      )}

      {assessError && (
        <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3 mb-4">{assessError}</p>
      )}

      {assessments && (
        <div className="space-y-3">
          {assessments.map((a) => {
            const meta = SEVERITY_META[a.severity];
            return (
              <div key={a.categoryId} className="rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1"
                    style={{ color: meta.color, background: meta.soft }}
                  >
                    {meta.label}
                  </span>
                  <p className="text-sm font-medium text-abys-navy">{a.categoryLabel}</p>
                </div>
                <p className="text-sm text-abys-ink mb-1">{a.explanation}</p>
                <p className="text-xs text-abys-muted">Öneri: {a.recommendedAction}</p>
              </div>
            );
          })}
          <p className="text-xs text-abys-muted">
            Bu değerlendirme kaydedildi —{" "}
            <Link href="/dashboard/alerts" className="text-abys-accent font-medium">
              Alerts sayfasında
            </Link>{" "}
            görüntülenebilir.
          </p>
        </div>
      )}
    </div>
  );
}

type Bitrix24Status = {
  mode: "demo" | "live";
  configured: boolean;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  importedRecordCounts: Record<string, number> | null;
  demoRecordCounts: Record<string, number> | null;
};

/**
 * Veri Kaynakları kartı: Bitrix24 konnektörünün durumunu gösterir.
 * Live bağlantı yokken "Connected"/"Live"/yeşil başarı GÖSTERİLMEZ — demo
 * modda daima "Bitrix24 uyumlu demo verisi" ifadesi kullanılır.
 */
function Bitrix24Card() {
  const session = useSession();
  const [status, setStatus] = useState<Bitrix24Status | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/integrations/bitrix24/status")
      .then(async (r) => (r.ok ? ((await r.json()) as Bitrix24Status) : null))
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session || !status) return null;

  const badge =
    status.mode === "demo"
      ? { label: "Bitrix24 uyumlu demo verisi", color: "text-abys-muted", bg: "bg-abys-ink/5" }
      : status.connected
      ? { label: "Bitrix24 bağlantısı doğrulandı", color: "text-abys-healthy", bg: "bg-abys-healthy-soft" }
      : { label: "Bitrix24 bağlantısı yapılandırılmamış", color: "text-abys-warning", bg: "bg-abys-warning-soft" };

  const counts = status.importedRecordCounts ?? status.demoRecordCounts ?? {};
  const summaryFields: { label: string; key: string }[] = [
    { label: "Müşteriler", key: "companies" },
    { label: "Fırsatlar", key: "deals" },
    { label: "Görevler", key: "tasks" },
    { label: "Aktiviteler", key: "activities" },
    { label: "Kullanıcılar", key: "users" },
    { label: "Hizmet talepleri", key: "serviceRequest" },
    { label: "Şikâyetler", key: "complaint" },
    { label: "Kalite kayıtları", key: "qualityIssue" },
  ];

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-medium text-abys-navy">Bitrix24</span>
        <span className={`text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 ${badge.color} ${badge.bg}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-xs text-abys-muted mb-3">
         Mod: {status.mode === "demo" ? "Demo" : "Yapılandırılmış"} · Son senkron:{" "}
        {status.lastSyncAt
          ? new Date(status.lastSyncAt).toLocaleString("tr-TR", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Henüz senkronize edilmedi"}
        {status.lastError && <span className="text-abys-critical"> — {status.lastError}</span>}
      </p>
      {(status.lastSyncAt || status.demoRecordCounts) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {summaryFields.map((f) => (
            <div key={f.key} className="rounded-lg bg-white/60 border border-abys-cream-border px-2.5 py-2">
              <p className="text-[10px] text-abys-muted">{f.label}</p>
              <p className="text-sm font-semibold text-abys-navy">{counts[f.key] ?? 0}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OAuthTab({ sector }: { sector: Sector | null }) {
  const connectors = sector?.dataSources ?? [];
  return (
    <div>
      <Bitrix24Card />
      <p className="text-sm text-abys-muted mb-5">
        {sector?.label ?? "Sektörünüz"} için önerilen sistem bağlantıları. OAuth
        entegrasyonları henüz aktif değil — bağlantı kurulduğunda burada
        listelenecek.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {connectors.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5"
          >
            <span className="text-sm font-medium text-abys-navy">{name}</span>
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-widest text-abys-warning bg-abys-warning-soft rounded-full px-2 py-1">
                YAKINDA
              </span>
              <button
                disabled
                className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 text-abys-muted cursor-not-allowed"
              >
                Bağlan
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WebhookTab({ companyName }: { companyName: string }) {
  void companyName;
  const [cfg, setCfg] = useState<{
    url: string;
    secret: string;
    headers: Record<string, string>;
    deliveries: { total: number; accepted: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/webhook-config")
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          setError("Webhook yapılandırması kurumsal oturum gerektirir.");
          return;
        }
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Yapılandırma alınamadı.");
          return;
        }
        setError(null);
        setCfg(j);
      })
      .catch(() => {
        if (!cancelled) setError("Yapılandırma alınamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function rotate() {
    await fetch("/api/webhook-config", { method: "POST" }).catch(() => {});
    setShowSecret(true);
    setReloadKey((k) => k + 1);
  }

  if (error) {
    return <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{error}</p>;
  }
  if (!cfg) return <p className="text-sm text-abys-muted">Yükleniyor…</p>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = origin + cfg.url;
  const ornek = [
    'const body = JSON.stringify({ source: "SAP", payload: "Rotar: 25 dk" });',
    'const ts = String(Date.now());',
    'const sig = crypto.createHmac("sha256", SECRET).update(ts + "." + body).digest("hex");',
    '',
    'await fetch("' + fullUrl + '", {',
    '  method: "POST",',
    '  headers: {',
    '    "Content-Type": "application/json",',
    '    "X-ABYS-Signature": sig,',
    '    "X-ABYS-Timestamp": ts,',
    '    "X-ABYS-Idempotency-Key": crypto.randomUUID(),',
    '  },',
    '  body,',
    '});',
  ].join("\n");

  return (
    <div>
      <p className="text-sm text-abys-muted mb-5">
        Bu uç <strong className="text-abys-ink">canlıdır</strong>: imzalı POST istekleri gerçek veri
        olarak kaydedilir, KPI&apos;lar ayıklanır ve denetim günlüğüne işlenir. Güvenlik HMAC imzası,
        ±5 dakika zaman penceresi (replay koruması), idempotency anahtarı ve hız sınırı ile sağlanır.
      </p>

      <div className="rounded-lg bg-abys-cream border border-abys-cream-border px-4 py-3 mb-5 flex items-center justify-between gap-3">
        <span className="text-sm text-abys-ink">
          Teslimat: <strong>{cfg.deliveries.accepted}</strong> kabul / {cfg.deliveries.total} deneme
        </span>
        <span className="text-xs text-abys-healthy">● uç aktif</span>
      </div>

      <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">WEBHOOK URL</label>
      <code className="block rounded-lg bg-abys-cream border border-abys-cream-border px-4 py-3 text-sm font-mono text-abys-navy mb-5 break-all">
        POST {fullUrl}
      </code>

      <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">GİZLİ ANAHTAR</label>
      <div className="flex gap-2 mb-5">
        <code className="flex-1 rounded-lg bg-abys-cream border border-abys-cream-border px-4 py-3 text-sm font-mono text-abys-navy break-all">
          {showSecret ? cfg.secret : "••••••••••••••••••••••••••••••••"}
        </code>
        <button
          onClick={() => setShowSecret((v) => !v)}
          className="text-xs rounded-lg border border-abys-ink/15 px-3 hover:bg-white/60"
        >
          {showSecret ? "gizle" : "göster"}
        </button>
        <button onClick={rotate} className="text-xs rounded-lg border border-abys-ink/15 px-3 hover:bg-white/60">
          yenile
        </button>
      </div>

      <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">ZORUNLU BAŞLIKLAR</label>
      <div className="rounded-lg bg-abys-cream border border-abys-cream-border px-4 py-3 mb-5 space-y-1">
        {Object.entries(cfg.headers).map(([k, v]) => (
          <p key={k} className="text-xs font-mono text-abys-navy">
            <span className="text-abys-accent">{k}</span>: <span className="text-abys-muted">{v}</span>
          </p>
        ))}
      </div>

      <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">ÖRNEK (Node.js)</label>
      <pre className="rounded-lg bg-abys-cream border border-abys-cream-border px-4 py-3 text-xs font-mono text-abys-navy overflow-x-auto">
        {ornek}
      </pre>
    </div>
  );
}

type ApiKeyScope = "events:write" | "read:advisors" | "read:all";

const API_KEY_SCOPES: { id: ApiKeyScope; label: string }[] = [
  { id: "events:write", label: "events:write — olay gönderimi" },
  { id: "read:advisors", label: "read:advisors — danışman verisi okuma" },
  { id: "read:all", label: "read:all — tüm veriyi okuma" },
];

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
};

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["events:write"]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ key: string; prefix: string; warning: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integration/keys")
      .then(async (r) => {
        if (cancelled) return;
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Anahtarlar alınamadı.");
          return;
        }
        setError(null);
        setKeys(j.keys ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Anahtarlar alınamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function toggleScope(s: ApiKeyScope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function createKey() {
    if (!name.trim() || scopes.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const r = await fetch("/api/integration/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const j = await r.json();
      if (!r.ok) {
        setCreateError(j.error ?? "Anahtar oluşturulamadı.");
        return;
      }
      setNewKey({ key: j.key, prefix: j.prefix, warning: j.warning });
      setName("");
      setScopes(["events:write"]);
      setReloadKey((k) => k + 1);
    } catch {
      setCreateError("Anahtar oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      const r = await fetch(`/api/integration/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) setReloadKey((k) => k + 1);
    } finally {
      setRevokingId(null);
    }
  }

  if (error) {
    return <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{error}</p>;
  }
  if (!keys) return <p className="text-sm text-abys-muted">Yükleniyor…</p>;

  return (
    <div>
      <p className="text-sm text-abys-muted mb-5">
        Portal entegrasyonlarınızın kullanacağı API anahtarlarını buradan yönetin. Anahtar yalnızca
        oluşturulduğu anda tam olarak gösterilir.
      </p>

      {newKey && (
        <div className="rounded-lg bg-abys-warning-soft border border-abys-warning px-4 py-3.5 mb-6">
          <p className="text-xs font-semibold text-abys-ink mb-2">{newKey.warning}</p>
          <code className="block rounded-lg bg-white/70 border border-abys-cream-border px-4 py-3 text-sm font-mono text-abys-navy break-all">
            {newKey.key}
          </code>
        </div>
      )}

      <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">MEVCUT ANAHTARLAR</label>
      {keys.length === 0 ? (
        <p className="text-sm text-abys-muted mb-6">Henüz API anahtarı oluşturulmadı.</p>
      ) : (
        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-4 mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-abys-muted">
                <th className="pb-2 pr-4">Ad</th>
                <th className="pb-2 pr-4">Önek</th>
                <th className="pb-2 pr-4">Kapsam</th>
                <th className="pb-2 pr-4">Son kullanım</th>
                <th className="pb-2 pr-4">Durum</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const revoked = Boolean(k.revoked_at);
                return (
                  <tr key={k.id} className="border-t border-abys-ink/10">
                    <td className="py-2 pr-4 text-abys-navy font-medium">{k.name}</td>
                    <td className="py-2 pr-4 font-mono text-abys-muted">{k.key_prefix}…</td>
                    <td className="py-2 pr-4 text-abys-ink">{k.scopes.join(", ")}</td>
                    <td className="py-2 pr-4 text-abys-muted">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleString("tr-TR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Hiç kullanılmadı"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 ${
                          revoked ? "text-abys-muted bg-abys-ink/5" : "text-abys-healthy bg-abys-healthy-soft"
                        }`}
                      >
                        {revoked ? "İPTAL EDİLDİ" : "AKTİF"}
                      </span>
                    </td>
                    <td className="py-2">
                      {!revoked && (
                        <button
                          onClick={() => revoke(k.id)}
                          disabled={revokingId === k.id}
                          className="text-xs rounded-lg border border-abys-ink/15 px-3 py-1 hover:bg-white/60 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {revokingId === k.id ? "iptal ediliyor…" : "iptal et"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">YENİ ANAHTAR</label>
      <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-4 max-w-md">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anahtar adı (örn: Portal Entegrasyonu)"
          className="w-full rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-abys-accent mb-3"
        />
        <div className="space-y-1.5 mb-3">
          {API_KEY_SCOPES.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-abys-ink">
              <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggleScope(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
        <button
          onClick={createKey}
          disabled={creating || !name.trim() || scopes.length === 0}
          className="rounded-full bg-abys-navy text-white text-sm font-medium px-5 py-2.5 hover:bg-abys-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {creating ? "Oluşturuluyor…" : "Anahtar Oluştur →"}
        </button>
        {createError && (
          <p className="mt-3 text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{createError}</p>
        )}
      </div>
    </div>
  );
}
