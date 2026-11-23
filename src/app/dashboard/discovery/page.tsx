"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
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

function availabilityLabel(locale: Locale, code: string): string {
  const key = `discovery.availability.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

interface Ranking {
  packId: string;
  label: string;
  score: number;
  subsector: { id: string; label: string } | null;
  evidence: { signal: string; kind: string }[];
}

interface KpiAvailability {
  kpi: { id: string; name: string; category: string; formula: string; unit: string; priority: string };
  availability: "available" | "partial" | "unavailable";
  matchedFields: string[];
  missingFields: string[];
  entity: string | null;
  partialEntities: string[];
  nonNumericFields: string[];
  scope: "entity" | "organization";
}

interface DetectedConcept {
  id: string;
  label: string;
  kind: string;
  confidence: number;
  entityCount: number;
  recordCount: number;
  matchedFields: { entity: string; field: string; source: "field" | "entity" }[];
}

interface BusinessModelHint {
  id: string;
  label: string;
  confidence: number;
  requiredConceptIds: string[];
  supportingConceptIds: string[];
  evidence: string[];
  note: string;
}

interface ConfirmedProfile {
  id: string;
  version: number;
  industryPackId: string;
  industryPackVersion: number;
  subsectorId: string | null;
  confidence: number;
  createdAt: string;
  sourceFingerprint: string;
}

interface GoldenRecordSummary {
  canonicalEntityId: string;
  entity: string;
  label: string;
  sourceCount: number;
  recordCount: number;
  conflictCount: number;
  policyApplied: boolean;
}

interface SurvivorshipPolicy {
  entity: string;
  sourceConfigId: string;
  priority: number;
  updatedBy: string;
  updatedAt: string;
}

interface ConnectorSource {
  id: string;
  name: string;
  configVersion: number;
  config: { entity: string };
}

interface DigitalTwinState {
  financials: {
    byCurrency: Array<{ currency: string; orderValue: number; invoiceValue: number }>;
    unclassifiedValueCount: number;
    policy: string;
  };
  operations: {
    inventoryQuantity: number;
    orderCount: number;
    invoiceCount: number;
    eventCount: number;
  };
  risks: Array<{ code: string; severity: string; title: string; evidence: string }>;
  freshness: { ageMinutes: number | null; stale: boolean; thresholdHours: number };
  coverage: {
    mode: "current" | "historical";
    asOf: string;
    canonicalEntities: number;
    sourceCount: number;
    multiSourceEntities: number;
  };
}

interface ObservedEntitySchema {
  entity: string;
  records: number;
  fields: { field: string; types: Record<string, number>; observations: number; nulls: number }[];
}

interface Discovery {
  primary: Ranking | null;
  rankings: Ranking[];
  confidence: number;
  requiresConfirmation: boolean;
  diversified: boolean;
  kpis: KpiAvailability[];
  concepts: DetectedConcept[];
  businessModelHints: BusinessModelHint[];
  missingInformation: string[];
  note: string;
  inputs: { entities: Record<string, number>; fieldCount: number; kpiLabelCount: number; sectorId: string | null };
  fingerprint: string;
  observedSchema: ObservedEntitySchema[];
  confirmedProfile: ConfirmedProfile | null;
  profileIsStale: boolean;
  graphSummary: {
    coverage: {
      recordsRead: number;
      nodeCount: number;
      edgeCount: number;
      unresolvedNodeCount: number;
      truncated: boolean;
      linkedRecordCount: number;
      multiSourceNodeCount: number;
    };
    resolution: {
      linkStrategy: string;
      strongLinkRecords: number;
      sourceScopedRecords: number;
    };
    entities: { entity: string; count: number }[];
    provenance: { source: string; note: string };
  };
  catalog: {
    id: string;
    label: string;
    version: number;
    subsectors: { id: string; label: string }[];
    kpis: number;
  }[];
  provenance: { engine: string; note: string };
}

const AVAILABILITY_STYLE: Record<string, string> = {
  available: "bg-abys-healthy-soft text-abys-healthy",
  partial: "bg-abys-warning-soft text-abys-warning",
  unavailable: "bg-abys-cream text-abys-muted",
};

const POLICY_ENTITIES = [
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

function formatDateTime(locale: Locale, value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale);
}

export default function DiscoveryPage() {
  const locale = useLocale();
  const [data, setData] = useState<Discovery | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [packId, setPackId] = useState("");
  const [subsectorId, setSubsectorId] = useState("");
  const [goldenRecords, setGoldenRecords] = useState<GoldenRecordSummary[]>([]);
  const [digitalTwin, setDigitalTwin] = useState<DigitalTwinState | null>(null);
  const [twinAsOf, setTwinAsOf] = useState("");
  const [sources, setSources] = useState<ConnectorSource[]>([]);
  const [policies, setPolicies] = useState<SurvivorshipPolicy[]>([]);
  const [policyEntity, setPolicyEntity] = useState("customer");
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, string>>({});
  const [policyBusy, setPolicyBusy] = useState(false);
  const entitySources = sources.filter((source) => source.config.entity === policyEntity);

  async function loadDiscovery() {
    const res = await fetch("/api/discovery", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(
        body.error ??
          formatMessage(readLocale(), "discovery.loadFailedHttp", { status: res.status })
      );
    const discovery = body as Discovery;
    setData(discovery);
    setPackId(discovery.confirmedProfile?.industryPackId ?? discovery.primary?.packId ?? "");
    setSubsectorId(
      discovery.confirmedProfile?.subsectorId ?? discovery.primary?.subsector?.id ?? ""
    );
  }

  async function loadDigitalTwin(asOf: string) {
    const query = asOf ? `?asOf=${encodeURIComponent(new Date(asOf).toISOString())}` : "";
    const res = await fetch(`/api/digital-twin${query}`, { cache: "no-store" });
    if (res.ok) setDigitalTwin((await res.json()) as DigitalTwinState);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/discovery", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Keşif analizi yüklenemedi (HTTP ${res.status}).`);
        if (!cancelled) {
          const discovery = body as Discovery;
          setData(discovery);
          setPackId(discovery.confirmedProfile?.industryPackId ?? discovery.primary?.packId ?? "");
          setSubsectorId(
            discovery.confirmedProfile?.subsectorId ?? discovery.primary?.subsector?.id ?? ""
          );
        }
      } catch (err) {
        if (!cancelled)
            setError(
              err instanceof Error ? err.message : t(readLocale(), "discovery.loadFailed")
            );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, twinRes, connectorRes] = await Promise.all([
          fetch("/api/canonical-entities?limit=5", { cache: "no-store" }),
          fetch("/api/digital-twin", { cache: "no-store" }),
          fetch("/api/connectors", { cache: "no-store" }),
        ]);
        if (res.ok) {
          const body = (await res.json()) as { records?: GoldenRecordSummary[] };
          if (!cancelled) setGoldenRecords(body.records ?? []);
        }
        if (twinRes.ok && !cancelled) setDigitalTwin((await twinRes.json()) as DigitalTwinState);
        if (connectorRes.ok) {
          const connectorBody = (await connectorRes.json()) as { configs?: ConnectorSource[] };
          if (!cancelled) setSources(connectorBody.configs ?? []);
        }
      } catch {
        // Keşif ekranı altın kayıt servisi olmadan da çalışmaya devam eder.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/survivorship-policies?entity=${encodeURIComponent(policyEntity)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { policies?: SurvivorshipPolicy[] };
        if (cancelled) return;
        const loaded = body.policies ?? [];
        setPolicies(loaded);
        setPolicyDrafts(
          Object.fromEntries(loaded.map((policy) => [policy.sourceConfigId, String(policy.priority)]))
        );
      } catch {
        // Altın kayıt kontrolü politika servisi olmadan da görünür kalır.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [policyEntity]);

  async function saveSurvivorshipPolicy() {
    if (entitySources.length === 0) {
      setError(`${policyEntity} türünde kaynak konnektör yok.`);
      return;
    }
    setPolicyBusy(true);
    setError("");
    setMessage("");
    try {
      const priorities = entitySources.map((source, index) => {
        const raw = policyDrafts[source.id] ?? String(index + 1);
        const priority = Number(raw);
        if (!Number.isInteger(priority) || priority < 1 || priority > 1000) {
          throw new Error(t(readLocale(), "discovery.priorityRange"));
        }
        return { sourceConfigId: source.id, priority };
      });
      if (new Set(priorities.map((item) => item.priority)).size !== priorities.length) {
        throw new Error(t(readLocale(), "discovery.priorityUnique"));
      }
      const res = await fetch("/api/survivorship-policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: policyEntity, priorities }),
      });
      const body = (await res.json()) as { error?: string; policies?: SurvivorshipPolicy[] };
      if (!res.ok) throw new Error(body.error ?? `Politika kaydedilemedi (HTTP ${res.status}).`);
      setPolicies(body.policies ?? []);
      setMessage(`${policyEntity} için kaynak güven sırası kaydedildi.`);
      const [goldenRes, twinRes] = await Promise.all([
        fetch("/api/canonical-entities?limit=5", { cache: "no-store" }),
        fetch("/api/digital-twin", { cache: "no-store" }),
      ]);
      if (goldenRes.ok) {
        setGoldenRecords(((await goldenRes.json()) as { records?: GoldenRecordSummary[] }).records ?? []);
      }
      if (twinRes.ok) setDigitalTwin((await twinRes.json()) as DigitalTwinState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Politika kaydedilemedi.");
    } finally {
      setPolicyBusy(false);
    }
  }

  async function confirmProfile() {
    if (!packId) {
      setError(t(readLocale(), "discovery.selectPack"));
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId,
          subsectorId: subsectorId || null,
          acknowledgeConfidence: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Onaylama başarısız (HTTP ${res.status}).`);
      setMessage(
        body.idempotent
          ? t(readLocale(), "discovery.profileCurrent")
          : `Profil v${body.profile.version} onaylandı; ${body.activation.createdCount} KPI etkinleştirildi, ` +
            `${body.activation.preservedCount} mevcut tanım korundu.`
      );
      await loadDiscovery();
    } catch (err) {
      setError(
          err instanceof Error ? err.message : t(readLocale(), "discovery.confirmFailed")
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "discovery.eyebrow")}
        title={t(locale, "discovery.title")}
        accent={t(locale, "discovery.titleAccent")}
        desc={t(locale, "discovery.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-4xl space-y-5">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-xl border border-abys-healthy/30 bg-abys-healthy-soft px-4 py-3 text-sm text-abys-healthy">
            {message}
          </p>
        )}
        {!data && !error && <p className="text-sm text-abys-muted">{t(locale, "discovery.analyzing")}</p>}

        {data && (
          <>
            <div className="rounded-xl border border-abys-accent/25 bg-white/70 p-5">
              {data.primary ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs tracking-widest text-abys-accent font-semibold">
                      {t(locale, "discovery.primaryHeading")}
                    </p>
                    <span className="text-[11px] text-abys-muted">
                      {formatMessage(locale, "discovery.confidence", { value: data.confidence })}
                    </span>
                  </div>
                  <p className="font-serif text-2xl text-abys-navy mt-1">{data.primary.label}</p>
                  <p className="text-sm text-abys-muted">
                    {data.primary.subsector
                      ? formatMessage(locale, "discovery.subsectorPrefix", {
                          label: data.primary.subsector.label,
                        })
                      : ""}
                    {formatMessage(locale, "discovery.score", { score: data.primary.score })}
                  </p>
                  {data.requiresConfirmation && (
                    <p className="mt-2 rounded-lg bg-abys-warning-soft px-3 py-2 text-xs text-abys-warning">
                      {t(locale, "discovery.requiresConfirmation")}
                    </p>
                  )}
                  {data.diversified && (
                    <p className="mt-2 text-xs text-abys-muted">
                      {t(locale, "discovery.diversified")}
                    </p>
                  )}
                  <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">
                    {t(locale, "discovery.evidenceHeading")}
                  </p>
                  <ul className="space-y-0.5 list-none p-0 m-0">
                    {data.primary.evidence.length === 0 ? (
                      <li className="text-xs text-abys-muted">
                        {t(locale, "discovery.noEvidence")}
                      </li>
                    ) : (
                      data.primary.evidence.map((e, i) => (
                        <li key={i} className="text-xs text-abys-ink">
                          • {e.signal}
                        </li>
                      ))
                    )}
                  </ul>
                </>
              ) : (
                <>
                  <p className="text-sm text-abys-ink">
                    {t(locale, "discovery.noSignal")}
                  </p>
                  <p className="text-xs text-abys-muted mt-1">
                    <Link href="/dashboard/connectors" className="text-abys-accent hover:underline">
                      {t(locale, "discovery.connectLink")}
                    </Link>{" "}
                    {t(locale, "discovery.connectHintBefore")}{" "}
                    <Link href="/dashboard/kpi" className="text-abys-accent hover:underline">
                      {t(locale, "discovery.kpiLink")}
                    </Link>{" "}
                    {t(locale, "discovery.connectHintAfter")}
                  </p>
                </>
              )}
            </div>

            <div className="rounded-xl border border-abys-accent/25 bg-white/70 p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-abys-accent font-semibold">
                    {t(locale, "discovery.contextHeading")}
                  </p>
                  <p className="text-sm text-abys-ink mt-1">
                    {data.confirmedProfile
                      ? formatMessage(locale, "discovery.confirmedProfile", {
                          version: data.confirmedProfile.version,
                          pack: data.confirmedProfile.industryPackId,
                          packVersion: data.confirmedProfile.industryPackVersion,
                        })
                      : t(locale, "discovery.noConfirmedProfile")}
                  </p>
                  {data.confirmedProfile && (
                    <p className="text-[11px] text-abys-muted mt-1">
                      {formatMessage(locale, "discovery.confirmedAt", {
                        at: new Date(data.confirmedProfile.createdAt).toLocaleString(locale),
                        confidence: data.confirmedProfile.confidence,
                        subsector: data.confirmedProfile.subsectorId
                          ? formatMessage(locale, "discovery.confirmedSubsector", {
                              id: data.confirmedProfile.subsectorId,
                            })
                          : "",
                      })}
                    </p>
                  )}
                  {data.profileIsStale && (
                    <p className="mt-2 rounded-lg bg-abys-warning-soft px-3 py-2 text-xs text-abys-warning">
                      {t(locale, "discovery.profileStale")}
                    </p>
                  )}
                </div>
                <span className="text-[10px] rounded-full bg-abys-accent-soft px-2 py-1 text-abys-accent">
                  {t(locale, "discovery.versionedBadge")}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs text-abys-muted">
                  {t(locale, "discovery.packLabel")}
                  <select
                    value={packId}
                    onChange={(event) => {
                      setPackId(event.target.value);
                      setSubsectorId("");
                    }}
                    className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/80 px-3 py-2"
                  >
                    <option value="">{t(locale, "discovery.packPlaceholder")}</option>
                    {data.catalog.map((pack) => (
                      <option key={pack.id} value={pack.id}>
                        {pack.label} · v{pack.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-abys-muted">
                  {t(locale, "discovery.subsectorLabel")}
                  <select
                    value={subsectorId}
                    onChange={(event) => setSubsectorId(event.target.value)}
                    className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/80 px-3 py-2"
                  >
                    <option value="">{t(locale, "discovery.subsectorGeneral")}</option>
                    {(data.catalog.find((pack) => pack.id === packId)?.subsectors ?? []).map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-abys-muted">
                  {t(locale, "discovery.confirmHint")}
                </p>
                <button
                  onClick={() => void confirmProfile()}
                  disabled={busy || !packId}
                  className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? t(locale, "discovery.confirming") : t(locale, "discovery.confirm")}
                </button>
              </div>
            </div>

            {data.rankings.length > 1 && (
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                  {t(locale, "discovery.alternativesHeading")}
                </p>
                <ul className="space-y-1 list-none p-0 m-0">
                  {data.rankings.map((r) => (
                    <li key={r.packId} className="flex items-center justify-between text-sm text-abys-ink">
                      <span>{r.label}</span>
                      <span className="font-mono text-abys-muted">{r.score}/100</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 overflow-x-auto">
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                {t(locale, "discovery.kpiHeading")}
              </p>
              {data.kpis.length === 0 ? (
                <p className="text-sm text-abys-muted">{t(locale, "discovery.kpiEmpty")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-abys-muted">
                      <th className="py-1 font-medium">KPI</th>
                      <th className="py-1 font-medium">{t(locale, "discovery.colStatus")}</th>
                      <th className="py-1 font-medium">{t(locale, "discovery.colFormula")}</th>
                      <th className="py-1 font-medium">{t(locale, "discovery.colMissing")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.kpis.map((k) => (
                      <tr key={k.kpi.id} className="text-abys-ink align-top">
                        <td className="py-1">
                          {k.kpi.name}
                          <span className="block text-[10px] text-abys-muted">
                            {k.kpi.category} · {k.kpi.priority}
                          </span>
                        </td>
                        <td className="py-1">
                          <span className={`text-[10px] rounded-full px-2 py-0.5 ${AVAILABILITY_STYLE[k.availability]}`}>
                            {availabilityLabel(locale, k.availability)}
                          </span>
                          {k.entity ? (
                            <span className="block text-[10px] text-abys-muted mt-0.5">
                              {formatMessage(locale, "discovery.kpiEntityScope", { entity: k.entity })}
                            </span>
                          ) : k.availability === "partial" && k.partialEntities.length > 0 ? (
                            <span className="block text-[10px] text-abys-muted mt-0.5">
                              {formatMessage(locale, "discovery.kpiSplitScope", {
                                entities: k.partialEntities.join(", "),
                              })}
                            </span>
                          ) : null}
                          {k.nonNumericFields.length > 0 ? (
                            <span className="block text-[10px] text-abys-warning mt-0.5">
                              {formatMessage(locale, "discovery.kpiNonNumeric", {
                                fields: k.nonNumericFields.join(", "),
                              })}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1 text-xs text-abys-muted max-w-[220px]">{k.kpi.formula}</td>
                        <td className="py-1 text-xs text-abys-muted">
                          {k.missingFields.length === 0 ? "—" : k.missingFields.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {data.concepts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                  <p className="text-xs tracking-widest text-abys-muted font-semibold mb-1">
                    {t(locale, "discovery.conceptsHeading")}
                  </p>
                  <p className="text-[10px] text-abys-muted mb-3">{t(locale, "discovery.conceptsHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {data.concepts.slice(0, 8).map((concept) => (
                      <span
                        key={concept.id}
                        className="rounded-full border border-abys-cream-border bg-white/60 px-2.5 py-1 text-xs text-abys-ink"
                        title={`${concept.entityCount} · ${concept.recordCount}`}
                      >
                        {concept.label}
                        <span className="ml-1.5 text-[10px] text-abys-muted">%{concept.confidence}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-abys-muted">
                    {formatMessage(locale, "discovery.conceptsCoverage", {
                      count: data.concepts.length,
                      evidence: data.concepts.reduce((sum, concept) => sum + concept.matchedFields.length, 0),
                    })}
                  </p>
                </div>

                <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                  <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                    {t(locale, "discovery.modelsHeading")}
                  </p>
                  {data.businessModelHints.length === 0 ? (
                    <p className="text-sm text-abys-muted">{t(locale, "discovery.modelsEmpty")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.businessModelHints.slice(0, 3).map((hint) => (
                        <li key={hint.id} className="text-sm text-abys-ink">
                          <div className="flex items-center justify-between gap-2">
                            <span>{hint.label}</span>
                            <span className="font-mono text-[10px] text-abys-muted">%{hint.confidence}</span>
                          </div>
                          <p className="text-[10px] text-abys-muted">{hint.evidence.join(" · ")}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[10px] text-abys-muted">{t(locale, "discovery.modelNote")}</p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                  {t(locale, "discovery.schemaHeading")}
                </p>
                {data.observedSchema.length === 0 ? (
                  <p className="text-sm text-abys-muted">{t(locale, "discovery.schemaEmpty")}</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {data.observedSchema.map((entity) => (
                      <div key={entity.entity}>
                        <p className="text-sm text-abys-ink">
                          {entity.entity} <span className="text-[11px] text-abys-muted">
                          {formatMessage(locale, "discovery.recordCount", { count: entity.records })}
                        </span>
                        </p>
                        <p className="text-[11px] text-abys-muted">
                          {entity.fields
                            .map(
                              (field) =>
                                `${field.field}:${Object.entries(field.types)
                                  .map(([type, count]) => `${type}×${count}`)
                                  .join("|")}`
                            )
                            .join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                  {t(locale, "discovery.graphHeading")}
                </p>
                <p className="font-serif text-2xl text-abys-navy">
                  {formatMessage(locale, "discovery.graphCounts", {
                    nodes: data.graphSummary.coverage.nodeCount,
                    edges: data.graphSummary.coverage.edgeCount,
                  })}
                </p>
                <p className="text-xs text-abys-muted mt-1">
                  {formatMessage(locale, "discovery.unresolved", {
                    count: data.graphSummary.coverage.unresolvedNodeCount,
                  })}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/60 px-2 py-2">
                    <p className="font-serif text-lg text-abys-navy">{data.graphSummary.coverage.multiSourceNodeCount}</p>
                    <p className="text-[10px] text-abys-muted">{t(locale, "discovery.multiSource")}</p>
                  </div>
                  <div className="rounded-lg bg-white/60 px-2 py-2">
                    <p className="font-serif text-lg text-abys-navy">{data.graphSummary.resolution.strongLinkRecords}</p>
                    <p className="text-[10px] text-abys-muted">{t(locale, "discovery.strongIdentity")}</p>
                  </div>
                  <div className="rounded-lg bg-white/60 px-2 py-2">
                    <p className="font-serif text-lg text-abys-navy">{data.graphSummary.resolution.sourceScopedRecords}</p>
                    <p className="text-[10px] text-abys-muted">{t(locale, "discovery.sourceScoped")}</p>
                  </div>
                </div>
                <p className="text-[10px] text-abys-muted mt-2">{data.graphSummary.resolution.linkStrategy}</p>
                <p className="text-[11px] text-abys-muted mt-3">
                  {data.graphSummary.entities.length === 0
                    ? t(locale, "discovery.graphEmpty")
                    : data.graphSummary.entities.map((entity) => `${entity.entity}=${entity.count}`).join(" · ")}
                </p>
                <p className="text-[10px] text-abys-muted mt-2">{data.graphSummary.provenance.note}</p>
              </div>
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                  {t(locale, "discovery.goldenHeading")}
                </p>
                {goldenRecords.length === 0 ? (
                  <p className="text-sm text-abys-muted">{t(locale, "discovery.goldenEmpty")}</p>
                ) : (
                  <div className="space-y-3">
                    {goldenRecords.map((record) => (
                      <div key={`${record.entity}:${record.canonicalEntityId}`} className="rounded-lg bg-white/60 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-abys-ink">{record.label}</p>
                            <p className="text-[10px] text-abys-muted">
                              {formatMessage(locale, "discovery.goldenMeta", {
                                entity: record.entity,
                                sources: record.sourceCount,
                                records: record.recordCount,
                              })}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                            record.conflictCount > 0
                              ? "bg-abys-warning-soft text-abys-warning"
                              : "bg-abys-healthy-soft text-abys-healthy"
                          }`}>
                            {record.conflictCount > 0
                              ? formatMessage(locale, "discovery.conflicts", {
                                  count: record.conflictCount,
                                })
                              : t(locale, "discovery.consistent")}
                          </span>
                        </div>
                        <p className="text-[10px] text-abys-muted mt-1">
                          {record.policyApplied
                            ? t(locale, "discovery.policyApplied")
                            : t(locale, "discovery.freshnessApplied")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-abys-muted mt-3">
                  {t(locale, "discovery.goldenNote")}
                </p>
              </div>
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-widest text-abys-muted font-semibold">
                      {t(locale, "discovery.policyHeading")}
                    </p>
                    <p className="text-[11px] text-abys-muted mt-1">
                      {t(locale, "discovery.policyHint")}
                    </p>
                  </div>
                  <select
                    value={policyEntity}
                    onChange={(event) => setPolicyEntity(event.target.value)}
                    className="rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-xs text-abys-ink"
                    aria-label={t(locale, "discovery.policyEntityAria")}
                  >
                    {POLICY_ENTITIES.map((entity) => (
                      <option key={entity} value={entity}>
                        {entity}
                      </option>
                    ))}
                  </select>
                </div>
                {entitySources.length === 0 ? (
                  <p className="text-sm text-abys-muted mt-3">
                    {t(locale, "discovery.policyNoSources")}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {entitySources.map((source, index) => {
                      const existingPolicy = policies.find((policy) => policy.sourceConfigId === source.id);
                      return (
                        <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/60 px-3 py-2">
                          <div>
                            <p className="text-sm text-abys-ink">{source.name}</p>
                            <p className="text-[10px] text-abys-muted">
                              {formatMessage(locale, "discovery.sourceMeta", {
                                id: source.id,
                                version: source.configVersion,
                                policy: existingPolicy
                                  ? formatMessage(locale, "discovery.sourcePolicyUpdated", {
                                      by: existingPolicy.updatedBy,
                                      at: formatDateTime(locale, existingPolicy.updatedAt),
                                    })
                                  : t(locale, "discovery.sourceNoPolicy"),
                              })}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-abys-muted">
                            {t(locale, "discovery.priorityLabel")}
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              step={1}
                              value={policyDrafts[source.id] ?? String(index + 1)}
                              onChange={(event) =>
                                setPolicyDrafts((prev) => ({ ...prev, [source.id]: event.target.value }))
                              }
                              className="w-20 rounded-lg border border-abys-cream-border bg-white/80 px-2 py-1 text-xs text-abys-ink"
                            />
                          </label>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => void saveSurvivorshipPolicy()}
                      disabled={policyBusy}
                      className="rounded-full bg-abys-navy px-4 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-40"
                    >
                      {policyBusy ? t(locale, "discovery.policySaving") : t(locale, "discovery.policySave")}
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-xs tracking-widest text-abys-muted font-semibold">
                    {t(locale, "discovery.twinHeading")}
                  </p>
                  <label className="text-[10px] text-abys-muted">
                    {t(locale, "discovery.twinAsOf")}{" "}
                    <input
                      type="datetime-local"
                      value={twinAsOf}
                      onChange={(event) => {
                        const value = event.target.value;
                        setTwinAsOf(value);
                        void loadDigitalTwin(value);
                      }}
                      className="rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-[10px]"
                    />
                  </label>
                </div>
                {!digitalTwin ? (
                  <p className="text-sm text-abys-muted">{t(locale, "discovery.twinEmpty")}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/60 px-2 py-2">
                        <p className="font-serif text-lg text-abys-navy">{digitalTwin.coverage.canonicalEntities}</p>
                        <p className="text-[10px] text-abys-muted">{t(locale, "discovery.twinCanonical")}</p>
                      </div>
                      <div className="rounded-lg bg-white/60 px-2 py-2">
                        <p className="font-serif text-lg text-abys-navy">{digitalTwin.operations.orderCount}</p>
                        <p className="text-[10px] text-abys-muted">{t(locale, "discovery.twinOrders")}</p>
                      </div>
                      <div className="rounded-lg bg-white/60 px-2 py-2">
                        <p className="font-serif text-lg text-abys-navy">{digitalTwin.risks.length}</p>
                        <p className="text-[10px] text-abys-muted">{t(locale, "discovery.twinRisks")}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      {digitalTwin.financials.byCurrency.length === 0 ? (
                        <p className="text-[11px] text-abys-muted">{t(locale, "discovery.twinNoFinancials")}</p>
                      ) : (
                        digitalTwin.financials.byCurrency.map((currency) => (
                          <p key={currency.currency} className="text-[11px] text-abys-muted">
                            {formatMessage(locale, "discovery.twinFinancialLine", {
                              currency: currency.currency,
                              orders: currency.orderValue.toLocaleString(locale),
                              invoices: currency.invoiceValue.toLocaleString(locale),
                            })}
                          </p>
                        ))
                      )}
                      {digitalTwin.financials.unclassifiedValueCount > 0 && (
                        <p className="text-[10px] text-abys-warning">
                          {formatMessage(locale, "discovery.twinUnclassified", {
                            count: digitalTwin.financials.unclassifiedValueCount,
                          })}
                        </p>
                      )}
                    </div>
                    <p className="text-[10px] text-abys-muted mt-2">
                      {digitalTwin.coverage.mode === "historical"
                        ? formatMessage(locale, "discovery.twinHistorical", {
                            at: formatDateTime(locale, digitalTwin.coverage.asOf),
                          })
                        : t(locale, "discovery.twinCurrent")}
                      {formatMessage(locale, "discovery.twinAge", {
                        age:
                          digitalTwin.freshness.ageMinutes === null
                            ? "—"
                            : formatMessage(locale, "discovery.twinMinutes", {
                                value: digitalTwin.freshness.ageMinutes,
                              }),
                      })}
                      {digitalTwin.freshness.stale
                        ? t(locale, "discovery.twinStale")
                        : t(locale, "discovery.twinFresh")}
                    </p>
                    {digitalTwin.risks.slice(0, 3).map((risk) => (
                      <p key={`${risk.code}:${risk.title}`} className={`text-[10px] mt-1 ${risk.severity === "critical" ? "text-abys-warning" : "text-abys-muted"}`}>
                        {risk.title} — {risk.evidence}
                      </p>
                    ))}
                    <p className="text-[10px] text-abys-muted mt-2">{digitalTwin.financials.policy}</p>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 text-xs text-abys-muted space-y-1">
              <p className="text-[11px] tracking-widest font-semibold">
                {t(locale, "discovery.inputsHeading")}
              </p>
              <p>
                {t(locale, "discovery.inputsEntities")}{" "}
                {Object.keys(data.inputs.entities).length === 0
                  ? t(locale, "discovery.inputsNone")
                  : Object.entries(data.inputs.entities)
                      .map(([e, n]) => `${e}=${n}`)
                      .join(", ")}
              </p>
              <p>
                {formatMessage(locale, "discovery.inputsSummary", {
                  fields: data.inputs.fieldCount,
                  labels: data.inputs.kpiLabelCount,
                  sector: data.inputs.sectorId ?? "—",
                })}
              </p>
              {data.missingInformation.length > 0 && (
                <>
                  <p className="pt-2 text-[11px] tracking-widest font-semibold">
                    {t(locale, "discovery.missingHeading")}
                  </p>
                  <ul className="space-y-0.5">
                    {data.missingInformation.map((m, i) => (
                      <li key={i}>• {m}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="pt-2">{data.note}</p>
              <p>{data.provenance.note}</p>
              <p>
                {formatMessage(locale, "discovery.catalogLine", {
                  list: data.catalog.map((c) => `${c.label} v${c.version}`).join(" · "),
                })}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
