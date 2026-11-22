"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  classifyConnectorError,
  retryAdvice,
  summarizeConnectorRuns,
} from "@/lib/connector-run-health";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

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

const STATUS_LABEL: Record<string, ShellKey> = {
  ready: "connectors.statusReady",
  "requires-credentials": "connectors.statusRequiresCredentials",
  planned: "connectors.statusPlanned",
};

const SCHEDULE_STATUS_LABEL: Record<string, ShellKey> = {
  healthy: "connectors.scheduleHealthy",
  due: "connectors.scheduleDue",
  overdue: "connectors.scheduleOverdue",
  running: "connectors.scheduleRunning",
  stale: "connectors.scheduleStale",
  failing: "connectors.scheduleFailing",
  unscheduled: "connectors.scheduleUnscheduled",
};

const RUN_STATUS_LABEL: Record<string, ShellKey> = {
  success: "connectors.runStatusSuccess",
  failed: "connectors.runStatusFailed",
  running: "connectors.runStatusRunning",
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
  { value: "customer", labelKey: "connectors.entityCustomer" },
  { value: "supplier", labelKey: "connectors.entitySupplier" },
  { value: "employee", labelKey: "connectors.entityEmployee" },
  { value: "product", labelKey: "connectors.entityProduct" },
  { value: "order", labelKey: "connectors.entityOrder" },
  { value: "invoice", labelKey: "connectors.entityInvoice" },
  { value: "payment", labelKey: "connectors.entityPayment" },
  { value: "account", labelKey: "connectors.entityAccount" },
  { value: "project", labelKey: "connectors.entityProject" },
  { value: "inventory", labelKey: "connectors.entityInventory" },
  { value: "event", labelKey: "connectors.entityEvent" },
] as const;

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

function formatScheduleInterval(minutes: number | null, locale: Locale): string {
  if (minutes === null) return t(locale, "connectors.scheduleOff");
  if (minutes < 60) return formatMessage(locale, "connectors.durationMinutes", { count: minutes });
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const parts = [
    days > 0 ? formatMessage(locale, "connectors.durationDays", { count: days }) : "",
    hours > 0 ? formatMessage(locale, "connectors.durationHours", { count: hours }) : "",
    remainingMinutes > 0
      ? formatMessage(locale, "connectors.durationMinutes", { count: remainingMinutes })
      : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function formatDateTime(value: string | null, locale: Locale): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

export default function ConnectorsPage() {
  const locale = useLocale();
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
    if (!res.ok) {
      throw new Error(
        body.error ?? formatMessage(locale, "connectors.loadFailedHttp", { status: res.status })
      );
    }
    setDefinitions(body.definitions);
    setConfigs(body.configs);
    const healthRes = await fetch("/api/connectors/scheduler/health", { cache: "no-store" });
    if (healthRes.ok) setHealth((await healthRes.json()) as SchedulerHealth);
  }

  useEffect(() => {
    const effectLocale = readLocale();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connectors", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(
            body.error ??
              formatMessage(effectLocale, "connectors.loadFailedHttp", { status: res.status })
          );
        }
        if (cancelled) return;
        setDefinitions(body.definitions);
        setConfigs(body.configs);
        const healthRes = await fetch("/api/connectors/scheduler/health", { cache: "no-store" });
        if (healthRes.ok && !cancelled) setHealth((await healthRes.json()) as SchedulerHealth);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t(effectLocale, "connectors.loadFailed")
          );
        }
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
      if (!selectedId) throw new Error(t(locale, "connectors.selectConnectorFirst"));
      let fieldMap: Record<string, string>;
      try {
        fieldMap = JSON.parse(fieldMapText) as Record<string, string>;
      } catch {
        throw new Error(t(locale, "connectors.fieldMapJsonInvalid"));
      }
      let kpiFieldMap: Record<string, string>;
      try {
        kpiFieldMap = JSON.parse(kpiFieldMapText) as Record<string, string>;
      } catch {
        throw new Error(t(locale, "connectors.kpiFieldMapJsonInvalid"));
      }
      let computedKpiMap: Record<string, string>;
      try {
        computedKpiMap = JSON.parse(computedKpiMapText) as Record<string, string>;
      } catch {
        throw new Error(t(locale, "connectors.computedKpiMapJsonInvalid"));
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
          name: name.trim() || t(locale, "connectors.defaultConnectorName"),
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
      if (!res.ok) {
        throw new Error(
          body.error ?? formatMessage(locale, "connectors.saveFailedHttp", { status: res.status })
        );
      }
      setMessage(t(locale, "connectors.connectionCreated"));
      setSelectedId(null);
      setName("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "connectors.saveFailed"));
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
      if (!res.ok) {
        throw new Error(
          body.error ?? formatMessage(locale, "connectors.syncFailedHttp", { status: res.status })
        );
      }
      setMessage(
        formatMessage(locale, "connectors.syncSummary", {
          fetched: body.fetchedCount,
          canonicalized: body.canonicalizedCount,
          kpi: body.kpiObservationCount,
          computed: body.computedKpiObservationCount ?? 0,
          events: body.processEventCount,
          skipped: body.skippedCount,
          quarantined: body.quarantinedCount ?? 0,
          warnings: body.warnings?.length ?? 0,
        })
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
      setError(err instanceof Error ? err.message : t(locale, "connectors.syncFailed"));
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
    if (!res.ok) {
      throw new Error(
        body.error ?? formatMessage(locale, "connectors.mappingLoadFailedHttp", { status: res.status })
      );
    }
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
      setError(err instanceof Error ? err.message : t(locale, "connectors.mappingLoadFailed"));
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
        throw new Error(t(locale, "connectors.mappingJsonInvalid"));
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
      if (!res.ok) {
        throw new Error(
          body.error ??
            formatMessage(locale, "connectors.mappingApproveFailedHttp", { status: res.status })
        );
      }
      setConfigs((prev) =>
        prev.map((config) =>
          config.id === id ? { ...config, configVersion: body.configVersion } : config
        )
      );
      await loadMapping(id);
      setMessage(
        formatMessage(locale, "connectors.mappingApproved", {
          version: body.configVersion,
          count: body.approvedSuggestionCount,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "connectors.mappingApproveFailed"));
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
      if (!res.ok) {
        throw new Error(
          body.error ??
            formatMessage(locale, "connectors.scheduleUpdateFailedHttp", { status: res.status })
        );
      }
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
          ? t(locale, "connectors.scheduleDisabled")
          : formatMessage(locale, "connectors.scheduleSet", {
              interval: formatScheduleInterval(body.scheduleIntervalMinutes, locale),
            })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "connectors.scheduleUpdateFailed"));
    } finally {
      setScheduleBusyId(null);
    }
  }

  async function saveScheduleDraft(config: ConnectorConfigRow) {
    const raw =
      scheduleDrafts[config.id] ?? (config.scheduleIntervalMinutes === null ? "" : String(config.scheduleIntervalMinutes));
    const scheduleIntervalMinutes = Number(raw);
    if (raw.trim() === "" || !Number.isInteger(scheduleIntervalMinutes) || scheduleIntervalMinutes < 5 || scheduleIntervalMinutes > 525_600) {
      setError(t(locale, "connectors.scheduleValidation"));
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
      if (!res.ok) {
        throw new Error(
          body.error ??
            formatMessage(locale, "connectors.schedulerRunFailedHttp", { status: res.status })
        );
      }
      setMessage(
        formatMessage(locale, "connectors.schedulerSummary", {
          due: body.dueCount,
          succeeded: body.succeeded,
          failed: body.failed,
          skipped: body.skipped,
        })
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
      setError(err instanceof Error ? err.message : t(locale, "connectors.schedulerRunFailed"));
    } finally {
      setSchedulerBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "nav.connectors").toLocaleUpperCase(locale)}
        title={t(locale, "connectors.title")}
        accent={t(locale, "connectors.titleAccent")}
        desc={t(locale, "connectors.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-5xl space-y-6">
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
          <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3 uppercase">
            {t(locale, "connectors.catalogHeading")}
          </p>
          {definitions === null ? (
            <p className="text-sm text-abys-muted">{t(locale, "connectors.loading")}</p>
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
                          {STATUS_LABEL[d.status] ? t(locale, STATUS_LABEL[d.status]) : d.status}
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
            <p className="text-xs tracking-widest text-abys-muted font-semibold uppercase">
              {t(locale, "connectors.newConnection")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(locale, "connectors.connectionName")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={t(locale, "connectors.baseUrlPlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={apiPath} onChange={(e) => setApiPath(e.target.value)} placeholder={t(locale, "connectors.apiPathPlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <select value={entity} onChange={(e) => setEntity(e.target.value)} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2">
                {ENTITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(locale, item.labelKey)}
                  </option>
                ))}
              </select>
              <select value={authType} onChange={(e) => setAuthType(e.target.value)} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2">
                <option value="none">{t(locale, "connectors.authNone")}</option>
                <option value="bearer_token">{t(locale, "connectors.authBearer")}</option>
                <option value="api_key">{t(locale, "connectors.authApiKey")}</option>
                <option value="basic">{t(locale, "connectors.authBasic")}</option>
                <option value="oauth2_client_credentials">{t(locale, "connectors.authOAuth2")}</option>
              </select>
              <input value={secretEnvVar} onChange={(e) => setSecretEnvVar(e.target.value)} placeholder={authType === "oauth2_client_credentials" ? t(locale, "connectors.secretOAuthPlaceholder") : t(locale, "connectors.secretEnvPlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              {authType === "oauth2_client_credentials" && (
                <>
                  <input value={oauth2TokenUrl} onChange={(e) => setOauth2TokenUrl(e.target.value)} placeholder="https://login.example.com/oauth2/token" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 sm:col-span-2" />
                  <input value={oauth2ClientIdEnvVar} onChange={(e) => setOauth2ClientIdEnvVar(e.target.value)} placeholder={t(locale, "connectors.oauthClientIdPlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                  <input value={oauth2Scope} onChange={(e) => setOauth2Scope(e.target.value)} placeholder={t(locale, "connectors.oauthScopePlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                </>
              )}
              <input value={idField} onChange={(e) => setIdField(e.target.value)} placeholder={t(locale, "connectors.idFieldPlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={recordsPath} onChange={(e) => setRecordsPath(e.target.value)} placeholder={t(locale, "connectors.recordsPathPlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <input value={updatedAtField} onChange={(e) => setUpdatedAtField(e.target.value)} placeholder={t(locale, "connectors.updatedAtFieldPlaceholder")} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              <select value={paginationType} onChange={(e) => setPaginationType(e.target.value)} className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2">
                <option value="page">{t(locale, "connectors.paginationPage")}</option>
                <option value="none">{t(locale, "connectors.paginationNone")}</option>
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
              {t(locale, "connectors.fieldMapLabel")}
              <textarea
                value={fieldMapText}
                onChange={(e) => setFieldMapText(e.target.value)}
                rows={4}
                className="mt-1 w-full text-sm font-mono rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block text-xs text-abys-muted">
                {t(locale, "connectors.kpiFieldMapLabel")}
                <textarea
                  value={kpiFieldMapText}
                  onChange={(e) => setKpiFieldMapText(e.target.value)}
                  rows={3}
                  className="mt-1 w-full text-sm font-mono rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-abys-muted">
                {t(locale, "connectors.computedKpiMapLabel")}
                <textarea
                  value={computedKpiMapText}
                  onChange={(e) => setComputedKpiMapText(e.target.value)}
                  rows={3}
                  placeholder={t(locale, "connectors.computedKpiPlaceholder")}
                  className="mt-1 w-full text-sm font-mono rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2"
                />
              </label>
              <div className="space-y-2">
                <input value={kpiObservedAtField} onChange={(e) => setKpiObservedAtField(e.target.value)} placeholder={t(locale, "connectors.kpiObservedAtPlaceholder")} className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                <input value={eventTypeField} onChange={(e) => setEventTypeField(e.target.value)} placeholder={t(locale, "connectors.eventTypePlaceholder")} className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                <input value={eventSubjectField} onChange={(e) => setEventSubjectField(e.target.value)} placeholder={t(locale, "connectors.eventSubjectPlaceholder")} className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
                <input value={eventTimeField} onChange={(e) => setEventTimeField(e.target.value)} placeholder={t(locale, "connectors.eventTimePlaceholder")} className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
              </div>
            </div>
            <button onClick={createConfig} disabled={busy} className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
              {busy ? t(locale, "connectors.saving") : t(locale, "connectors.saveConnection")}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold uppercase">
              {t(locale, "connectors.scheduleHealthHeading")}
            </p>
            <span className="text-[10px] text-abys-muted">
              {health
                ? formatMessage(locale, "connectors.checkedAt", {
                    date: formatDateTime(health.checkedAt, locale),
                  })
                : t(locale, "connectors.notMeasured")}
            </span>
          </div>
          {health ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.scheduledCount}</p>
                  <p className="text-[10px] text-abys-muted">{t(locale, "connectors.scheduledConnections")}</p>
                </div>
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.dueCount}</p>
                  <p className="text-[10px] text-abys-muted">{t(locale, "connectors.due")}</p>
                </div>
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.staleRunningCount}</p>
                  <p className="text-[10px] text-abys-muted">{t(locale, "connectors.staleRunning")}</p>
                </div>
                <div className="rounded-lg bg-white/60 px-2 py-2">
                  <p className="font-serif text-lg text-abys-navy">{health.summary.failingCount}</p>
                  <p className="text-[10px] text-abys-muted">{t(locale, "connectors.consecutiveFailures")}</p>
                </div>
              </div>
              <p className="text-[11px] text-abys-muted mt-2">
                {formatMessage(locale, "connectors.healthNextLast", {
                  next: formatDateTime(health.summary.nextRunAt, locale),
                  last: formatDateTime(health.summary.lastSuccessAt, locale),
                })}
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
                          {config?.name ?? connector.configId}:{" "}
                          {SCHEDULE_STATUS_LABEL[connector.status]
                            ? t(locale, SCHEDULE_STATUS_LABEL[connector.status])
                            : connector.status}
                          {connector.overdueMinutes > 0
                            ? formatMessage(locale, "connectors.healthDelay", {
                                minutes: connector.overdueMinutes,
                              })
                            : ""}
                          {connector.consecutiveFailures > 0
                            ? formatMessage(locale, "connectors.healthErrors", {
                                count: connector.consecutiveFailures,
                              })
                            : ""}
                        </span>
                      );
                    })}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-abys-muted">{t(locale, "connectors.schedulerNotRun")}</p>
          )}
        </div>

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold uppercase">
              {t(locale, "connectors.connectionsHeading")}
            </p>
            <button
              onClick={() => void runDueSchedules()}
              disabled={schedulerBusy || configs.length === 0}
              className="text-xs rounded-full border border-abys-cream-border bg-white/70 px-3 py-1 text-abys-muted hover:text-abys-ink disabled:opacity-40"
            >
              {schedulerBusy ? t(locale, "connectors.schedulerRunning") : t(locale, "connectors.runDue")}
            </button>
          </div>
          {configs.length === 0 ? (
            <p className="text-sm text-abys-muted">{t(locale, "connectors.noConnections")}</p>
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
                          {t(locale, "connectors.history")}
                        </button>
                        <button onClick={() => void openMapping(c.id)} className="text-xs rounded-full border border-abys-cream-border px-3 py-1 text-abys-muted hover:text-abys-ink">
                          {t(locale, "connectors.mappingApproval")}
                        </button>
                        <button onClick={() => void sync(c.id)} disabled={busy} className="text-xs rounded-full bg-abys-accent text-white px-3 py-1 hover:opacity-90 disabled:opacity-40">
                          {t(locale, "connectors.syncNow")}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border border-abys-cream-border bg-abys-cream/60 px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-[11px] text-abys-muted space-y-0.5">
                          <p>
                            <span className="font-semibold text-abys-ink">{t(locale, "connectors.scheduleLabel")}:</span>{" "}
                            {c.scheduleIntervalMinutes === null
                              ? t(locale, "connectors.scheduleOff")
                              : formatMessage(locale, "connectors.scheduleIntervalWithMinutes", {
                                  interval: formatScheduleInterval(c.scheduleIntervalMinutes, locale),
                                  minutes: c.scheduleIntervalMinutes,
                                })}
                          </p>
                          {c.scheduleIntervalMinutes !== null && (
                            <p>
                              {formatMessage(locale, "connectors.nextScheduled", {
                                next: formatDateTime(c.nextRunAt, locale),
                                last: formatDateTime(c.lastScheduledAt, locale),
                              })}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`connector-schedule-${c.id}`} className="sr-only">
                            {t(locale, "connectors.scheduleIntervalMinutesAria")}
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
                            placeholder={t(locale, "connectors.minutesPlaceholder")}
                            disabled={scheduleBusyId !== null}
                            className="w-28 text-xs rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1"
                          />
                          <button
                            onClick={() => void saveScheduleDraft(c)}
                            disabled={scheduleBusyId !== null}
                            className="text-xs rounded-full bg-abys-navy text-white px-3 py-1 hover:opacity-90 disabled:opacity-40"
                          >
                            {scheduleBusyId === c.id
                              ? t(locale, "connectors.saving")
                              : t(locale, "connectors.saveInterval")}
                          </button>
                          <button
                            onClick={() => void saveSchedule(c.id, null)}
                            disabled={scheduleBusyId !== null || c.scheduleIntervalMinutes === null}
                            className="text-xs rounded-full border border-abys-cream-border px-3 py-1 text-abys-muted hover:text-abys-ink disabled:opacity-40"
                          >
                            {t(locale, "connectors.close")}
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-abys-muted">
                        {t(locale, "connectors.scheduleHelp")}
                      </p>
                    </div>
                    {detail && (
                      <div className="mt-2 text-[11px] text-abys-muted space-y-1">
                        {(() => {
                          const health = summarizeConnectorRuns(detail.runs);
                          if (health.consecutiveFailures === 0) return null;
                          const kind = classifyConnectorError(health.lastErrorMessage);
                          const advice = retryAdvice(kind);
                          const adviceKey =
                            kind === "rate_limit"
                              ? "connectors.retryAdviceRateLimit"
                              : advice === "backoff"
                                ? "connectors.retryAdviceTransient"
                                : advice === "fix_config"
                                  ? "connectors.retryAdviceAuth"
                                  : "connectors.retryAdviceManual";
                          const note = health.lastErrorMessage
                            ? formatMessage(locale, "connectors.syncIssue", {
                                count: health.consecutiveFailures,
                                error: health.lastErrorMessage,
                              })
                            : formatMessage(locale, "connectors.syncIssueNoError", {
                                count: health.consecutiveFailures,
                              });
                          return (
                            <div
                              role="alert"
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-red-700"
                            >
                              <span>{note}</span>
                              <span className="basis-full text-[10px] text-red-600/90">
                                {t(locale, adviceKey)}
                              </span>
                              {advice === "backoff" && (
                                <button
                                  onClick={() => void sync(c.id)}
                                  disabled={busy}
                                  className="rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-40"
                                >
                                  {t(locale, "connectors.retry")}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                        <p>
                          {t(locale, "connectors.records")}:{" "}
                          {detail.records.length === 0
                            ? t(locale, "connectors.none")
                            : detail.records.map((r) => `${r.entity}=${r.count}`).join(", ")}
                        </p>
                        <p>
                          {formatMessage(locale, "connectors.intelligenceTransfer", {
                            kpi: detail.promotion.kpiObservations,
                            events: detail.promotion.processEvents,
                          })}
                        </p>
                        {detail.runs.length === 0 ? (
                          <p>{t(locale, "connectors.noRunHistory")}</p>
                        ) : (
                          <ul className="space-y-0.5 list-none p-0 m-0">
                            {detail.runs.slice(0, 5).map((r) => (
                              <li key={r.id}>
                                {new Date(r.startedAt).toLocaleString(locale)} ·{" "}
                                <span
                                  className={`rounded-full px-1.5 py-0.5 ${
                                    r.trigger === "scheduled"
                                      ? "bg-abys-accent/10 text-abys-accent"
                                      : "bg-abys-cream text-abys-muted"
                                  }`}
                                >
                                  {r.trigger === "scheduled"
                                    ? t(locale, "connectors.runTriggerScheduled")
                                    : t(locale, "connectors.runTriggerManual")}
                                </span>{" "}
                                ·{" "}
                                {RUN_STATUS_LABEL[r.status] ? t(locale, RUN_STATUS_LABEL[r.status]) : r.status} ·{" "}
                                {formatMessage(locale, "connectors.runHistoryLine", {
                                  written: r.writtenCount,
                                  read: r.readCount,
                                  rejected: r.rejectedCount ?? 0,
                                })}{" "}
                                {r.error ? `· ${r.error}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                        {detail.runs[0]?.sourceSchema?.length ? (
                          <details className="pt-1">
                            <summary className="cursor-pointer text-abys-accent">
                              {formatMessage(locale, "connectors.sourceSchemaSummary", {
                                count: detail.runs[0].sourceSchema.length,
                              })}
                            </summary>
                            <p className="mt-1">
                              {formatMessage(locale, "connectors.sourceFields", {
                                fields: detail.runs[0].sourceSchema
                                  .slice(0, 12)
                                  .map((f) => f.path)
                                  .join(", "),
                              })}
                              {detail.runs[0].sourceSchema.length > 12 ? "…" : ""}
                            </p>
                            {detail.runs[0].mappingSuggestions?.length ? (
                              <p>
                                {formatMessage(locale, "connectors.suggestions", {
                                  suggestions: detail.runs[0].mappingSuggestions
                                    .slice(0, 8)
                                    .map((s) => `${s.canonicalField} ← ${s.sourcePath}`)
                                    .join(", "),
                                })}
                              </p>
                            ) : (
                              <p>{t(locale, "connectors.noSafeSuggestion")}</p>
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
                              {formatMessage(locale, "connectors.mappingApprovedVersion", {
                                version: mappingByConfig[c.id].currentVersion,
                              })}
                            </p>
                            <p>
                              {mappingByConfig[c.id].latestRun
                                ? formatMessage(locale, "connectors.mappingSchemaSummary", {
                                    count: mappingByConfig[c.id].latestRun?.sourceFieldCount ?? 0,
                                    accepted: mappingByConfig[c.id].acceptedSuggestionCount,
                                    suggested: mappingByConfig[c.id].suggestedSuggestionCount,
                                  })
                                : t(locale, "connectors.noSchemaObservation")}
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
                            {t(locale, "connectors.addSuggestionsToDraft")}
                          </button>
                        </div>
                        {mappingByConfig[c.id].conflicts.length > 0 && (
                          <p className="rounded-lg bg-abys-warning-soft px-2 py-1 text-abys-warning">
                            {formatMessage(locale, "connectors.mappingConflicts", {
                              count: mappingByConfig[c.id].conflicts.length,
                            })}
                          </p>
                        )}
                        <label htmlFor={`connector-mapping-${c.id}`} className="block font-semibold text-abys-ink">
                          {t(locale, "connectors.mappingFieldLabel")}
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
                            {formatMessage(locale, "connectors.suggestions", {
                              suggestions: mappingByConfig[c.id].suggestions
                                .slice(0, 8)
                                .map(
                                  (suggestion) =>
                                    `${suggestion.canonicalField} ← ${suggestion.sourcePath} (${Math.round(suggestion.confidence * 100)}%)`
                                )
                                .join(", "),
                            })}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => void approveMapping(c.id)}
                            disabled={mappingBusyId !== null}
                            className="rounded-full bg-abys-navy px-3 py-1 text-white hover:opacity-90 disabled:opacity-40"
                          >
                            {mappingBusyId === c.id
                              ? t(locale, "connectors.approving")
                              : t(locale, "connectors.approveNewVersion")}
                          </button>
                          <span>
                            v{mappingByConfig[c.id].currentVersion} → v{mappingByConfig[c.id].currentVersion + 1}
                          </span>
                        </div>
                        {mappingByConfig[c.id].versions.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-abys-accent">
                              {formatMessage(locale, "connectors.mappingVersionHistory", {
                                count: mappingByConfig[c.id].versions.length,
                              })}
                            </summary>
                            <ul className="mt-1 space-y-0.5 list-none p-0 m-0">
                              {mappingByConfig[c.id].versions.slice(0, 5).map((version) => (
                                <li key={version.id}>
                                  v{version.version} · {formatDateTime(version.createdAt, locale)} · {version.createdBy} ·{" "}
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
            {t(locale, "connectors.footnote")}
          </p>
        </div>
      </div>
    </div>
  );
}
