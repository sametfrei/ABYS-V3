"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

interface Definition {
  id: string;
  label: string;
  category: string;
  status: "ready" | "requires-credentials" | "planned";
  authType: string;
  entities: string[];
  note: string;
}

interface ConnectorConfigRow {
  id: string;
  connectorId: string;
  name: string;
  configVersion: number;
  enabled: boolean;
  scheduleIntervalMinutes: number | null;
  nextRunAt: string | null;
  lastScheduledAt: string | null;
  createdAt: string;
  config: {
    baseUrl: string;
    path: string;
    entity: string;
    authType: string;
  };
}

interface SyncRun {
  id: string;
  status: string;
  trigger: "manual" | "scheduled";
  startedAt: string;
  finishedAt: string | null;
  pages: number;
  readCount: number;
  writtenCount: number;
  skippedCount: number;
  rejectedCount: number;
  checkpoint: string | null;
  error: string | null;
  warnings: string[];
  sourceSchema: { path: string; types: Record<string, number>; observations: number }[];
  mappingSuggestions: {
    canonicalField: string;
    sourcePath: string;
    confidence: number;
    reason: string;
  }[];
}

interface PromotionCounts {
  kpiObservations: number;
  processEvents: number;
}

interface SchedulerRunSummary {
  dueCount: number;
  succeeded: number;
  failed: number;
  skipped: number;
  outcomes: { configId: string }[];
}

interface SchedulerHealth {
  checkedAt: string;
  summary: {
    scheduledCount: number;
    dueCount: number;
    overdueCount: number;
    staleRunningCount: number;
    failingCount: number;
    nextRunAt: string | null;
    lastSuccessAt: string | null;
  };
  connectors: Array<{
    configId: string;
    status: string;
    overdueMinutes: number;
    consecutiveFailures: number;
  }>;
}

interface MappingReview {
  configId: string;
  name: string;
  entity: string;
  currentVersion: number;
  currentFieldMap: Record<string, string>;
  currentKpiFieldMap: Record<string, string>;
  latestRun: { id: string; status: string; finishedAt: string | null; sourceFieldCount: number } | null;
  observedFields: string[];
  suggestions: { canonicalField: string; sourcePath: string; confidence: number; reason: string }[];
  acceptedSuggestionCount: number;
  suggestedSuggestionCount: number;
  conflicts: { canonicalField: string; candidates: { sourcePath: string; confidence: number }[] }[];
  proposedFieldMap: Record<string, string>;
  unmappedObservedFields: string[];
  versions: {
    id: string;
    version: number;
    changeSummary: string;
    sourceRunId: string | null;
    approvedSuggestionCount: number;
    createdBy: string;
    createdAt: string;
  }[];
}

const STATUS_LABEL: Record<string, string> = {
  ready: "Hazır",
  "requires-credentials": "Kimlik bilgisi gerekir",
  planned: "Planlı",
};

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-abys-healthy-soft text-abys-healthy",
  "requires-credentials": "bg-abys-warning-soft text-abys-warning",
  planned: "bg-abys-cream text-abys-muted",
};

const SCHEDULE_HEALTH_STYLE: Record<string, string> = {
  healthy: "bg-abys-healthy-soft text-abys-healthy",
  due: "bg-abys-warning-soft text-abys-warning",
  overdue: "bg-abys-warning-soft text-abys-warning",
  running: "bg-abys-accent/10 text-abys-accent",
  stale: "bg-abys-warning-soft text-abys-warning",
  failing: "bg-abys-warning-soft text-abys-warning",
  unscheduled: "bg-abys-cream text-abys-muted",
};

const ENTITIES = [
  "customer",
  "supplier",
  "employee",
  "product",
  "order",
  "invoice",
  "payment",
  "account",
  "project",
  "inventory",
  "event",
];

function formatScheduleInterval(minutes: number | null): string {
  if (minutes === null) return "Kapalı";
  if (minutes < 60) return `${minutes} dk`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const parts = [
    days > 0 ? `${days} gün` : "",
    hours > 0 ? `${hours} sa` : "",
    remainingMinutes > 0 ? `${remainingMinutes} dk` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR");
}

export default function ConnectorsPage() {
  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [configs, setConfigs] = useState<ConnectorConfigRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiPath, setApiPath] = useState("");
  const [authType, setAuthType] = useState("none");
  const [secretEnvVar, setSecretEnvVar] = useState("");
  const [oauth2TokenUrl, setOauth2TokenUrl] = useState("");
  const [oauth2ClientIdEnvVar, setOauth2ClientIdEnvVar] = useState("");
  const [oauth2Scope, setOauth2Scope] = useState("");
  const [entity, setEntity] = useState("customer");
  const [idField, setIdField] = useState("id");
  const [recordsPath, setRecordsPath] = useState("data");
  const [updatedAtField, setUpdatedAtField] = useState("updated_at");
  const [paginationType, setPaginationType] = useState("page");
  const [pageParam, setPageParam] = useState("page");
  const [limitParam, setLimitParam] = useState("limit");
  const [pageSize, setPageSize] = useState("100");
  const [fieldMapText, setFieldMapText] = useState('{ "name": "name", "email": "email" }');
  const [kpiFieldMapText, setKpiFieldMapText] = useState("{}");
  const [computedKpiMapText, setComputedKpiMapText] = useState("{}");
  const [kpiObservedAtField, setKpiObservedAtField] = useState("");
  const [eventTypeField, setEventTypeField] = useState("");
  const [eventSubjectField, setEventSubjectField] = useState("");
  const [eventTimeField, setEventTimeField] = useState("");
  const [busy, setBusy] = useState(false);
  const [schedulerBusy, setSchedulerBusy] = useState(false);
  const [health, setHealth] = useState<SchedulerHealth | null>(null);
  const [scheduleBusyId, setScheduleBusyId] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [mappingByConfig, setMappingByConfig] = useState<Record<string, MappingReview>>({});
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>({});
  const [mappingBusyId, setMappingBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [runsByConfig, setRunsByConfig] = useState<Record<string, { runs: SyncRun[]; records: { entity: string; count: number }[]; promotion: PromotionCounts }>>({});

  async function reload() {
    const res = await fetch("/api/connectors", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `Yüklenemedi (HTTP ${res.status}).`);
    setDefinitions(body.definitions);
    setConfigs(body.configs);
    const healthRes = await fetch("/api/connectors/scheduler/health", { cache: "no-store" });
    if (healthRes.ok) setHealth((await healthRes.json()) as SchedulerHealth);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connectors", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Yüklenemedi (HTTP ${res.status}).`);
        if (cancelled) return;
        setDefinitions(body.definitions);
        setConfigs(body.configs);
        const healthRes = await fetch("/api/connectors/scheduler/health", { cache: "no-store" });
        if (healthRes.ok && !cancelled) setHealth((await healthRes.json()) as SchedulerHealth);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Yüklenemedi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createConfig() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!selectedId) throw new Error("Önce bir konnektör türü seçin.");
      let fieldMap: Record<string, string>;
      try {
        fieldMap = JSON.parse(fieldMapText) as Record<string, string>;
      } catch {
        throw new Error("Alan eşlemesi geçerli JSON olmalı.");
      }
      let kpiFieldMap: Record<string, string>;
      try {
        kpiFieldMap = JSON.parse(kpiFieldMapText) as Record<string, string>;
      } catch {
        throw new Error("KPI eşlemesi geçerli JSON olmalı.");
      }
      let computedKpiMap: Record<string, string>;
      try {
        computedKpiMap = JSON.parse(computedKpiMapText) as Record<string, string>;
      } catch {
        throw new Error("Hesaplanan KPI eşlemesi geçerli JSON olmalı.");
      }
      const pagination =
        paginationType === "page"
          ? {
              type: "page",
              pageParam,
              limitParam: limitParam || undefined,
              pageSize: Number(pageSize) || 100,
            }
          : { type: "none" };
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: selectedId,
          name: name.trim() || "Konnektör",
          config: {
            kind: "rest",
            baseUrl,
            path: apiPath,
            authType,
            secretEnvVar: secretEnvVar || undefined,
            oauth2TokenUrl: authType === "oauth2_client_credentials" ? oauth2TokenUrl || undefined : undefined,
            oauth2ClientIdEnvVar:
              authType === "oauth2_client_credentials" ? oauth2ClientIdEnvVar || undefined : undefined,
            oauth2Scope: authType === "oauth2_client_credentials" ? oauth2Scope || undefined : undefined,
            entity,
            idField,
            recordsPath: recordsPath || undefined,
            updatedAtField: updatedAtField || undefined,
            fieldMap,
            kpiFieldMap: Object.keys(kpiFieldMap).length > 0 ? kpiFieldMap : undefined,
            computedKpiMap: Object.keys(computedKpiMap).length > 0 ? computedKpiMap : undefined,
            kpiObservedAtField: kpiObservedAtField || undefined,
            eventTypeField: eventTypeField || undefined,
            eventSubjectField: eventSubjectField || undefined,
            eventTimeField: eventTimeField || undefined,
            pagination,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Kaydetme başarısız (HTTP ${res.status}).`);
      setMessage("Konnektör tanımlandı.");
      setSelectedId(null);
      setName("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydetme başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function sync(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/connectors/${id}/sync`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Senkron başarısız (HTTP ${res.status}).`);
      setMessage(
        `Senkron tamam: ${body.fetchedCount} okundu, ${body.canonicalizedCount} kanonikleştirildi, ` +
        `${body.kpiObservationCount} KPI gözlemi (${body.computedKpiObservationCount ?? 0} hesaplanan), ` +
        `${body.processEventCount} süreç olayı, ${body.skippedCount} atlandı, ${
          body.quarantinedCount ?? 0
        } karantinaya alındı, ${body.warnings?.length ?? 0} uyarı.`
      );
      const runsRes = await fetch(`/api/connectors/${id}/runs`, { cache: "no-store" });
      if (runsRes.ok) {
        const runsBody = (await runsRes.json()) as {
          runs: SyncRun[];
          records: { entity: string; count: number }[];
          promotion: PromotionCounts;
        };
        setRunsByConfig((prev) => ({ ...prev, [id]: runsBody }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senkron başarısız.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRuns(id: string) {
    const res = await fetch(`/api/connectors/${id}/runs`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as {
      runs: SyncRun[];
      records: { entity: string; count: number }[];
      promotion: PromotionCounts;
    };
    setRunsByConfig((prev) => ({ ...prev, [id]: body }));
  }

  async function loadMapping(id: string) {
    const res = await fetch(`/api/connectors/${id}/mapping`, { cache: "no-store" });
    const body = (await res.json()) as MappingReview & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Eşleme yüklenemedi (HTTP ${res.status}).`);
    setMappingByConfig((prev) => ({ ...prev, [id]: body }));
    setMappingDrafts((prev) => ({
      ...prev,
      [id]: JSON.stringify(body.currentFieldMap, null, 2),
    }));
  }

  async function openMapping(id: string) {
    setError("");
    setMessage("");
    try {
      await loadMapping(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eşleme yüklenemedi.");
    }
  }

  async function approveMapping(id: string) {
    const review = mappingByConfig[id];
    if (!review) return;
    setMappingBusyId(id);
    setError("");
    setMessage("");
    try {
      let fieldMap: Record<string, string>;
      try {
        fieldMap = JSON.parse(mappingDrafts[id] ?? "{}") as Record<string, string>;
      } catch {
        throw new Error("Eşleme geçerli JSON olmalı.");
      }
      const res = await fetch(`/api/connectors/${id}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: review.currentVersion,
          fieldMap,
          sourceRunId: review.latestRun?.id,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        configVersion: number;
        approvedSuggestionCount: number;
      };
      if (!res.ok) throw new Error(body.error ?? `Eşleme onaylanamadı (HTTP ${res.status}).`);
      setConfigs((prev) =>
        prev.map((config) =>
          config.id === id ? { ...config, configVersion: body.configVersion } : config
        )
      );
      await loadMapping(id);
      setMessage(
        `Eşleme v${body.configVersion} olarak onaylandı; ${body.approvedSuggestionCount} şema önerisi izlendi.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eşleme onaylanamadı.");
    } finally {
      setMappingBusyId(null);
    }
  }

  async function saveSchedule(id: string, scheduleIntervalMinutes: number | null) {
    setScheduleBusyId(id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/connectors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleIntervalMinutes }),
      });
      const body = (await res.json()) as {
        error?: string;
        scheduleIntervalMinutes: number | null;
        nextRunAt: string | null;
        lastScheduledAt: string | null;
      };
      if (!res.ok) throw new Error(body.error ?? `Zamanlama güncellenemedi (HTTP ${res.status}).`);
      setConfigs((prev) =>
        prev.map((config) =>
          config.id === id
            ? {
                ...config,
                scheduleIntervalMinutes: body.scheduleIntervalMinutes,
                nextRunAt: body.nextRunAt,
                lastScheduledAt: body.lastScheduledAt,
              }
            : config
        )
      );
      setScheduleDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setMessage(
        body.scheduleIntervalMinutes === null
          ? "Konnektör zamanlaması kapatıldı."
          : `Konnektör zamanlaması ${formatScheduleInterval(body.scheduleIntervalMinutes)} olarak ayarlandı.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zamanlama güncellenemedi.");
    } finally {
      setScheduleBusyId(null);
    }
  }

  async function saveScheduleDraft(config: ConnectorConfigRow) {
    const raw =
      scheduleDrafts[config.id] ?? (config.scheduleIntervalMinutes === null ? "" : String(config.scheduleIntervalMinutes));
    const scheduleIntervalMinutes = Number(raw);
    if (raw.trim() === "" || !Number.isInteger(scheduleIntervalMinutes) || scheduleIntervalMinutes < 5 || scheduleIntervalMinutes > 525_600) {
      setError("Zamanlama aralığı 5 ile 525600 dakika arasında bir tam sayı olmalı.");
      setMessage("");
      return;
    }
    await saveSchedule(config.id, scheduleIntervalMinutes);
  }

  async function runDueSchedules() {
    setSchedulerBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/connectors/scheduler/run?limit=5", { method: "POST" });
      const body = (await res.json()) as SchedulerRunSummary & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Zamanlayıcı çalıştırılamadı (HTTP ${res.status}).`);
      setMessage(
        `Zamanlayıcı: ${body.dueCount} vadesi gelen çalıştırma, ${body.succeeded} başarılı, ` +
        `${body.failed} başarısız, ${body.skipped} atlandı.`
      );
      await reload();
      const loadedIds = Object.keys(runsByConfig);
      await Promise.all(
        loadedIds.map(async (id) => {
          const runsRes = await fetch(`/api/connectors/${id}/runs`, { cache: "no-store" });
          if (!runsRes.ok) return;
          const runsBody = (await runsRes.json()) as {
            runs: SyncRun[];
            records: { entity: string; count: number }[];
            promotion: PromotionCounts;
          };
          setRunsByConfig((prev) => ({ ...prev, [id]: runsBody }));
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zamanlayıcı çalıştırılamadı.");
    } finally {
      setSchedulerBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="ENTEGRASYONLAR"
        title="Sistemleriniz"
        accent="ABYS'ye bağlanır"
        desc="Genel REST/OData adaptörüyle ERP/CRM uçlarını bağlayın: alan eşlemesi, sayfalama, artımlı checkpoint ve otomatik yeniden deneme. Kimlik bilgileri yalnızca sunucu ortam değişkenlerinden okunur."
      />

      <div className="px-10 pb-16 max-w-5xl space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-xl border border-abys-healthy/40 bg-abys-healthy-soft px-4 py-3 text-sm text-abys-healthy">
            {message}
          </p>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">KONNEKTÖR KATALOĞU</p>
          {definitions === null ? (
            <p className="text-sm text-abys-muted">Yükleniyor…</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0 m-0">
              {definitions.map((d) => {
                const disabled = d.status === "planned";
                return (
                  <li key={d.id}>
                    <button
                      disabled={disabled}
                      onClick={() => setSelectedId(d.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        selectedId === d.id
                          ? "border-abys-navy bg-white"
                          : "border-abys-cream-border bg-white/60 hover:bg-white"
                      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm text-abys-ink">{d.label}</span>
                        <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_STYLE[d.status]}`}>
                          {STATUS_LABEL[d.status]}
                        </span>
                      </span>
                      <span className="block text-[11px] text-abys-muted mt-0.5">{d.note}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selectedId && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 space-y-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">YENİ BAĞLANTI</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bağlantı adı" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.sirket.com" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={apiPath} onChange={(e) => setApiPath(e.target.value)} placeholder="/v1/customers" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <select value={entity} onChange={(e) => setEntity(e.target.value)} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2">
                {ENTITIES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <select value={authType} onChange={(e) => setAuthType(e.target.value)} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2">
                <option value="none">Kimlik yok</option>
                <option value="bearer_token">Bearer token</option>
                <option value="api_key">API key</option>
                <option value="basic">Basic</option>
                <option value="oauth2_client_credentials">OAuth2 client credentials</option>
              </select>
              <input value={secretEnvVar} onChange={(e) => setSecretEnvVar(e.target.value)} placeholder={authType === "oauth2_client_credentials" ? "İstemci sırrı ortam değişkeni" : "Ortam değişkeni (ör. CRM_TOKEN)"} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              {authType === "oauth2_client_credentials" && (
                <>
                  <input value={oauth2TokenUrl} onChange={(e) => setOauth2TokenUrl(e.target.value)} placeholder="https://login.example.com/oauth2/token" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 sm:col-span-2" />
                  <input value={oauth2ClientIdEnvVar} onChange={(e) => setOauth2ClientIdEnvVar(e.target.value)} placeholder="İstemci kimliği ortam değişkeni" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                  <input value={oauth2Scope} onChange={(e) => setOauth2Scope(e.target.value)} placeholder="Scope (isteğe bağlı)" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                </>
              )}
              <input value={idField} onChange={(e) => setIdField(e.target.value)} placeholder="Kimlik alanı (id)" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={recordsPath} onChange={(e) => setRecordsPath(e.target.value)} placeholder="Kayıt yolu (data)" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={updatedAtField} onChange={(e) => setUpdatedAtField(e.target.value)} placeholder="Güncelleme zamanı alanı" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <select value={paginationType} onChange={(e) => setPaginationType(e.target.value)} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2">
                <option value="page">Sayfa numaralı</option>
                <option value="none">Tek sayfa</option>
              </select>
              {paginationType === "page" && (
                <>
                  <input value={pageParam} onChange={(e) => setPageParam(e.target.value)} placeholder="page" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                  <input value={limitParam} onChange={(e) => setLimitParam(e.target.value)} placeholder="limit" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                  <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} placeholder="100" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                </>
              )}
            </div>
            <label className="block text-xs text-abys-muted">
              Alan eşlemesi (kanonik alan → kaynak yol, JSON)
              <textarea
                value={fieldMapText}
                onChange={(e) => setFieldMapText(e.target.value)}
                rows={4}
                className="mt-1 w-full text-sm font-mono rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block text-xs text-abys-muted">
                KPI eşlemesi (kanonik sayısal alan → KPI etiketi, JSON)
                <textarea
                  value={kpiFieldMapText}
                  onChange={(e) => setKpiFieldMapText(e.target.value)}
                  rows={3}
                  className="mt-1 w-full text-sm font-mono rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-abys-muted">
                Hesaplanan KPI (kpiId veya packId:kpiId → etiket, JSON)
                <textarea
                  value={computedKpiMapText}
                  onChange={(e) => setComputedKpiMapText(e.target.value)}
                  rows={3}
                  placeholder='{ "manufacturing:first_pass_yield": "İlk Geçiş Verimi" }'
                  className="mt-1 w-full text-sm font-mono rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                />
              </label>
              <div className="space-y-2">
                <input value={kpiObservedAtField} onChange={(e) => setKpiObservedAtField(e.target.value)} placeholder="KPI gözlem zamanı alanı" className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                <input value={eventTypeField} onChange={(e) => setEventTypeField(e.target.value)} placeholder="Olay türü alanı" className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                <input value={eventSubjectField} onChange={(e) => setEventSubjectField(e.target.value)} placeholder="Olay öznesi alanı" className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                <input value={eventTimeField} onChange={(e) => setEventTimeField(e.target.value)} placeholder="Olay zamanı alanı" className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              </div>
            </div>
            <button onClick={createConfig} disabled={busy} className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
              {busy ? "Kaydediliyor…" : "Bağlantıyı kaydet"}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">ZAMANLAYICI SAĞLIĞI</p>
            <span className="text-[10px] text-abys-muted">
              {health ? `Kontrol: ${formatDateTime(health.checkedAt)}` : "Henüz ölçülmedi"}
            </span>
          </div>
          {health ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.scheduledCount}</p>
                  <p className="text-[10px] text-abys-muted">Planlı bağlantı</p>
                </div>
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.dueCount}</p>
                  <p className="text-[10px] text-abys-muted">Vadesi gelen</p>
                </div>
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.staleRunningCount}</p>
                  <p className="text-[10px] text-abys-muted">Takılı çalıştırma</p>
                </div>
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.failingCount}</p>
                  <p className="text-[10px] text-abys-muted">Ardışık hata</p>
                </div>
              </div>
              <p className="text-[11px] text-abys-muted mt-2">
                Sonraki çalışma: {formatDateTime(health.summary.nextRunAt)} · Son başarı:{" "}
                {formatDateTime(health.summary.lastSuccessAt)}
              </p>
              {health.connectors.some((connector) => connector.status !== "healthy" && connector.status !== "unscheduled") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {health.connectors
                    .filter((connector) => connector.status !== "healthy" && connector.status !== "unscheduled")
                    .map((connector) => {
                      const config = configs.find((item) => item.id === connector.configId);
                      return (
                        <span
                          key={connector.configId}
                          className={`rounded-full px-2 py-1 text-[10px] ${SCHEDULE_HEALTH_STYLE[connector.status] ?? SCHEDULE_HEALTH_STYLE.unscheduled}`}
                        >
                          {config?.name ?? connector.configId}: {connector.status}
                          {connector.overdueMinutes > 0 ? ` · ${connector.overdueMinutes} dk gecikme` : ""}
                          {connector.consecutiveFailures > 0 ? ` · ${connector.consecutiveFailures} hata` : ""}
                        </span>
                      );
                    })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-abys-muted">Zamanlayıcı henüz çalıştırılmadı; kayıtlı çalıştırma yok.</p>
          )}
        </div>

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">KAYITLI BAĞLANTILAR</p>
            <button
              onClick={() => void runDueSchedules()}
              disabled={schedulerBusy || configs.length === 0}
              className="text-xs rounded-full border border-abys-cream-border bg-white/70 px-3 py-1 text-abys-muted hover:text-abys-ink disabled:opacity-40"
            >
              {schedulerBusy ? "Zamanlayıcı çalışıyor…" : "Vadesi gelenleri çalıştır"}
            </button>
          </div>
          {configs.length === 0 ? (
            <p className="text-sm text-abys-muted">Henüz bağlantı yok. Katalogdan bir sistem seçip tanımlayın.</p>
          ) : (
            <ul className="space-y-3 list-none p-0 m-0">
              {configs.map((c) => {
                const detail = runsByConfig[c.id];
                return (
                  <li key={c.id} className="rounded-lg border border-abys-cream-border bg-white/60 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-abys-ink">{c.name}</p>
                        <p className="text-[11px] text-abys-muted">
                          {c.connectorId} · v{c.configVersion} · {c.config.entity} · {c.config.baseUrl}
                          {c.config.path}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => void loadRuns(c.id)} className="text-xs rounded-full border border-abys-cream-border px-3 py-1 text-abys-muted hover:text-abys-ink">
                          Geçmiş
                        </button>
                        <button onClick={() => void openMapping(c.id)} className="text-xs rounded-full border border-abys-cream-border px-3 py-1 text-abys-muted hover:text-abys-ink">
                          Eşleme onayı
                        </button>
                        <button onClick={() => void sync(c.id)} disabled={busy} className="text-xs rounded-full bg-abys-accent text-white px-3 py-1 hover:opacity-90 disabled:opacity-40">
                          Senkronize et
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border border-abys-cream-border bg-abys-cream/60 px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-[11px] text-abys-muted space-y-0.5">
                          <p>
                            <span className="font-semibold text-abys-ink">Zamanlama:</span>{" "}
                            {c.scheduleIntervalMinutes === null
                              ? "Kapalı"
                              : `${formatScheduleInterval(c.scheduleIntervalMinutes)} (${c.scheduleIntervalMinutes} dk aralık)`}
                          </p>
                          {c.scheduleIntervalMinutes !== null && (
                            <p>
                              Sonraki çalıştırma: {formatDateTime(c.nextRunAt)} · Son zamanlanmış:{" "}
                              {formatDateTime(c.lastScheduledAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`connector-schedule-${c.id}`} className="sr-only">
                            Zamanlama aralığı (dakika)
                          </label>
                          <input
                            id={`connector-schedule-${c.id}`}
                            type="number"
                            min={5}
                            max={525_600}
                            step={1}
                            value={
                              scheduleDrafts[c.id] ??
                              (c.scheduleIntervalMinutes === null ? "" : String(c.scheduleIntervalMinutes))
                            }
                            onChange={(event) =>
                              setScheduleDrafts((prev) => ({ ...prev, [c.id]: event.target.value }))
                            }
                            placeholder="Dakika"
                            disabled={scheduleBusyId !== null}
                            className="w-28 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1"
                          />
                          <button
                            onClick={() => void saveScheduleDraft(c)}
                            disabled={scheduleBusyId !== null}
                            className="text-xs rounded-full bg-abys-navy text-white px-3 py-1 hover:opacity-90 disabled:opacity-40"
                          >
                            {scheduleBusyId === c.id ? "Kaydediliyor…" : "Aralığı kaydet"}
                          </button>
                          <button
                            onClick={() => void saveSchedule(c.id, null)}
                            disabled={scheduleBusyId !== null || c.scheduleIntervalMinutes === null}
                            className="text-xs rounded-full border border-abys-cream-border px-3 py-1 text-abys-muted hover:text-abys-ink disabled:opacity-40"
                          >
                            Kapat
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-abys-muted">
                        5–525600 dakika arasında bir aralık girin. Zamanlama kapatıldığında yalnızca manuel senkron çalışır.
                      </p>
                    </div>
                    {detail && (
                      <div className="mt-2 text-[11px] text-abys-muted space-y-1">
                        <p>
                          Kayıtlar:{" "}
                          {detail.records.length === 0
                            ? "yok"
                            : detail.records.map((r) => `${r.entity}=${r.count}`).join(", ")}
                        </p>
                        <p>
                          Zekâya aktarım: {detail.promotion.kpiObservations} KPI gözlemi ·{" "}
                          {detail.promotion.processEvents} süreç olayı
                        </p>
                        {detail.runs.length === 0 ? (
                          <p>Çalıştırma geçmişi yok.</p>
                        ) : (
                          <ul className="space-y-0.5 list-none p-0 m-0">
                            {detail.runs.slice(0, 5).map((r) => (
                              <li key={r.id}>
                                {new Date(r.startedAt).toLocaleString("tr-TR")} ·{" "}
                                <span
                                  className={`rounded-full px-1.5 py-0.5 ${
                                    r.trigger === "scheduled"
                                      ? "bg-abys-accent/10 text-abys-accent"
                                      : "bg-abys-cream text-abys-muted"
                                  }`}
                                >
                                  {r.trigger === "scheduled" ? "Zamanlanmış" : "Manuel"}
                                </span>{" "}
                                · {r.status} · {r.writtenCount} yazıldı /{" "}
                                {r.readCount} okundu · {r.rejectedCount ?? 0} karantina {r.error ? `· ${r.error}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                        {detail.runs[0]?.sourceSchema?.length ? (
                          <details className="pt-1">
                            <summary className="cursor-pointer text-abys-accent">
                              Kaynak şema ve eşleme önerileri ({detail.runs[0].sourceSchema.length} alan)
                            </summary>
                            <p className="mt-1">
                              Kaynak alanları: {detail.runs[0].sourceSchema.slice(0, 12).map((f) => f.path).join(", ")}
                              {detail.runs[0].sourceSchema.length > 12 ? "…" : ""}
                            </p>
                            {detail.runs[0].mappingSuggestions?.length ? (
                              <p>
                                Öneriler: {detail.runs[0].mappingSuggestions.slice(0, 8).map((s) => `${s.canonicalField} ← ${s.sourcePath}`).join(", ")}
                              </p>
                            ) : (
                              <p>Kanonik alanlar için güvenli bir eşleme önerisi bulunamadı.</p>
                            )}
                          </details>
                        ) : null}
                      </div>
                    )}
                    {mappingByConfig[c.id] && (
                      <div className="mt-3 rounded-lg border border-abys-accent/30 bg-abys-cream/60 px-3 py-3 text-[11px] text-abys-muted space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-abys-ink">
                              Onaylı eşleme v{mappingByConfig[c.id].currentVersion}
                            </p>
                            <p>
                              {mappingByConfig[c.id].latestRun
                                ? `Son şema: ${mappingByConfig[c.id].latestRun?.sourceFieldCount ?? 0} alan · ${mappingByConfig[c.id].acceptedSuggestionCount}/${mappingByConfig[c.id].suggestedSuggestionCount} öneri kabul edildi`
                                : "Henüz şema gözlemi yok; ilk senkrondan sonra öneriler oluşur."}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const review = mappingByConfig[c.id];
                              setMappingDrafts((prev) => ({
                                ...prev,
                                [c.id]: JSON.stringify(review.proposedFieldMap, null, 2),
                              }));
                            }}
                            className="rounded-full border border-abys-cream-border px-3 py-1 text-abys-muted hover:text-abys-ink"
                          >
                            Önerileri taslağa ekle
                          </button>
                        </div>
                        {mappingByConfig[c.id].conflicts.length > 0 && (
                          <p className="rounded-lg bg-abys-warning-soft px-2 py-1 text-abys-warning">
                            {mappingByConfig[c.id].conflicts.length} kanonik alan için çelişkili kaynak önerisi var; taslakta otomatik birleştirilmedi.
                          </p>
                        )}
                        <label htmlFor={`connector-mapping-${c.id}`} className="block font-semibold text-abys-ink">
                          Kanonik alan → kaynak JSON yolu
                        </label>
                        <textarea
                          id={`connector-mapping-${c.id}`}
                          value={mappingDrafts[c.id] ?? JSON.stringify(mappingByConfig[c.id].currentFieldMap, null, 2)}
                          onChange={(event) =>
                            setMappingDrafts((prev) => ({ ...prev, [c.id]: event.target.value }))
                          }
                          rows={7}
                          spellCheck={false}
                          className="w-full rounded-lg border border-abys-cream-border bg-white/80 px-3 py-2 font-mono text-[11px] text-abys-ink"
                        />
                        {mappingByConfig[c.id].suggestions.length > 0 && (
                          <p className="text-[10px]">
                            Öneriler: {mappingByConfig[c.id].suggestions.slice(0, 8).map((suggestion) => `${suggestion.canonicalField} ← ${suggestion.sourcePath} (${Math.round(suggestion.confidence * 100)}%)`).join(", ")}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => void approveMapping(c.id)}
                            disabled={mappingBusyId !== null}
                            className="rounded-full bg-abys-navy px-3 py-1 text-white hover:opacity-90 disabled:opacity-40"
                          >
                            {mappingBusyId === c.id ? "Onaylanıyor…" : "Yeni sürümü onayla"}
                          </button>
                          <span>
                            v{mappingByConfig[c.id].currentVersion} → v{mappingByConfig[c.id].currentVersion + 1}
                          </span>
                        </div>
                        {mappingByConfig[c.id].versions.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-abys-accent">
                              Eşleme sürüm geçmişi ({mappingByConfig[c.id].versions.length})
                            </summary>
                            <ul className="mt-1 space-y-0.5 list-none p-0 m-0">
                              {mappingByConfig[c.id].versions.slice(0, 5).map((version) => (
                                <li key={version.id}>
                                  v{version.version} · {formatDateTime(version.createdAt)} · {version.createdBy} ·{" "}
                                  {version.changeSummary}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] text-abys-muted mt-3">
            Not: Katalogda “Kimlik bilgisi gerekir” işaretli sistemler aynı REST adaptörünü kullanır; canlı bağlantı
            müşteri uç noktası ve anahtarı sağlanana kadar doğrulanmış sayılmaz.
          </p>
        </div>
      </div>
    </div>
  );
}
