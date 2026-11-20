"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

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

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Kullanılabilir",
  partial: "Kısmi",
  unavailable: "Veri yok",
};

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

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR");
}

export default function DiscoveryPage() {
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
    if (!res.ok) throw new Error(body.error ?? `Keşif analizi yüklenemedi (HTTP ${res.status}).`);
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Keşif analizi yüklenemedi.");
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
          throw new Error("Kaynak öncelikleri 1–1000 arasında tam sayı olmalı.");
        }
        return { sourceConfigId: source.id, priority };
      });
      if (new Set(priorities.map((item) => item.priority)).size !== priorities.length) {
        throw new Error("Kaynak öncelikleri birbirinden farklı olmalı.");
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
      setError("Onaylamak için bir sektör paketi seçin.");
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
          ? "Bu veri kümesi için onaylı profil zaten güncel."
          : `Profil v${body.profile.version} onaylandı; ${body.activation.createdCount} KPI etkinleştirildi, ` +
            `${body.activation.preservedCount} mevcut tanım korundu.`
      );
      await loadDiscovery();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onaylama başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="İŞ KESFİ"
        title="ABYS şirketinizi"
        accent="tanıyor"
        desc="Bağlı sistemlerin yapısından sektör, alt sektör ve iş modeli çıkarımı; kanıtlarla ve güven düzeyiyle. KPI önerileri yalnızca gerekli alanlar mevcutsa kullanılabilir sayılır."
      />

      <div className="px-10 pb-16 max-w-4xl space-y-5">
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
        {!data && !error && <p className="text-sm text-abys-muted">Analiz ediliyor…</p>}

        {data && (
          <>
            <div className="rounded-xl border border-abys-accent/25 bg-white/70 p-5">
              {data.primary ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs tracking-widest text-abys-accent font-semibold">BİRİNCİL SINIFLANDIRMA</p>
                    <span className="text-[11px] text-abys-muted">Güven %{data.confidence}</span>
                  </div>
                  <p className="font-serif text-2xl text-abys-navy mt-1">{data.primary.label}</p>
                  <p className="text-sm text-abys-muted">
                    {data.primary.subsector ? `Alt sektör: ${data.primary.subsector.label} · ` : ""}
                    Skor {data.primary.score}/100
                  </p>
                  {data.requiresConfirmation && (
                    <p className="mt-2 rounded-lg bg-abys-warning-soft px-3 py-2 text-xs text-abys-warning">
                      Güven düşük veya sınıflandırmalar birbirine yakın. Yönetici onayı gerekir; ABYS bu sınıflandırmayı
                      kritik bir varsayım olarak otomatik uygulamaz.
                    </p>
                  )}
                  {data.diversified && (
                    <p className="mt-2 text-xs text-abys-muted">
                      Birden fazla iş kolu sinyali var; holding/çok iş kollu yapı olarak değerlendirilmeli.
                    </p>
                  )}
                  <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">KANITLAR</p>
                  <ul className="space-y-0.5 list-none p-0 m-0">
                    {data.primary.evidence.length === 0 ? (
                      <li className="text-xs text-abys-muted">Yapısal sinyal bulunamadı.</li>
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
                  <p className="text-sm text-abys-ink">Henüz sınıflandırma için yeterli yapısal sinyal yok.</p>
                  <p className="text-xs text-abys-muted mt-1">
                    <Link href="/dashboard/connectors" className="text-abys-accent hover:underline">
                      Sistem Bağlantıları
                    </Link>{" "}
                    üzerinden ERP/CRM bağlayın veya{" "}
                    <Link href="/dashboard/kpi" className="text-abys-accent hover:underline">
                      KPI Verisi
                    </Link>{" "}
                    ekleyin.
                  </p>
                </>
              )}
            </div>

            <div className="rounded-xl border border-abys-accent/25 bg-white/70 p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-abys-accent font-semibold">İŞ BAĞLAMI</p>
                  <p className="text-sm text-abys-ink mt-1">
                    {data.confirmedProfile
                      ? `Onaylı profil v${data.confirmedProfile.version}: ${data.confirmedProfile.industryPackId} v${data.confirmedProfile.industryPackVersion}`
                      : "Henüz onaylanmış iş profili yok. Aşağıdaki seçim yalnızca öneridir."}
                  </p>
                  {data.confirmedProfile && (
                    <p className="text-[11px] text-abys-muted mt-1">
                      Onay: {new Date(data.confirmedProfile.createdAt).toLocaleString("tr-TR")} · Güven %
                      {data.confirmedProfile.confidence}
                      {data.confirmedProfile.subsectorId ? ` · Alt sektör ${data.confirmedProfile.subsectorId}` : ""}
                    </p>
                  )}
                  {data.profileIsStale && (
                    <p className="mt-2 rounded-lg bg-abys-warning-soft px-3 py-2 text-xs text-abys-warning">
                      Kaynak veri, onaylı profilden sonra değişti. Yeni sınıflandırmayı gözden geçirip profili yeniden
                      onaylayın; eski profil sessizce güncellenmez.
                    </p>
                  )}
                </div>
                <span className="text-[10px] rounded-full bg-abys-accent-soft px-2 py-1 text-abys-accent">
                  sürümlü · denetlenebilir
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs text-abys-muted">
                  Sektör paketi
                  <select
                    value={packId}
                    onChange={(event) => {
                      setPackId(event.target.value);
                      setSubsectorId("");
                    }}
                    className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/80 px-3 py-2"
                  >
                    <option value="">Seçin</option>
                    {data.catalog.map((pack) => (
                      <option key={pack.id} value={pack.id}>
                        {pack.label} · v{pack.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-abys-muted">
                  Alt sektör (isteğe bağlı)
                  <select
                    value={subsectorId}
                    onChange={(event) => setSubsectorId(event.target.value)}
                    className="mt-1 w-full text-sm rounded-lg border border-abys-cream-border bg-white/80 px-3 py-2"
                  >
                    <option value="">Genel</option>
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
                  Onay, seçili paketin KPI tanımlarını kayıt defterine ekler. Elle yazılmış aynı adlı tanımlar korunur.
                </p>
                <button
                  onClick={() => void confirmProfile()}
                  disabled={busy || !packId}
                  className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "Onaylanıyor…" : "Profili onayla ve KPI’ları etkinleştir"}
                </button>
              </div>
            </div>

            {data.rankings.length > 1 && (
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">ALTERNATİF SINIFLANDIRMALAR</p>
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
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">ÖNERİLEN KPI ÇERÇEVESİ</p>
              {data.kpis.length === 0 ? (
                <p className="text-sm text-abys-muted">Sınıflandırma oluşmadığı için KPI önerisi yok.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-abys-muted">
                      <th className="py-1 font-medium">KPI</th>
                      <th className="py-1 font-medium">Durum</th>
                      <th className="py-1 font-medium">Formül</th>
                      <th className="py-1 font-medium">Eksik alanlar</th>
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
                            {AVAILABILITY_LABEL[k.availability]}
                          </span>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">GÖZLENEN KANONİK ŞEMA</p>
                {data.observedSchema.length === 0 ? (
                  <p className="text-sm text-abys-muted">Bağlı kaynaklardan eşlenmiş alan yok.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {data.observedSchema.map((entity) => (
                      <div key={entity.entity}>
                        <p className="text-sm text-abys-ink">
                          {entity.entity} <span className="text-[11px] text-abys-muted">({entity.records} kayıt)</span>
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
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">SEMANTİK GRAFİK TEMELİ</p>
                <p className="font-serif text-2xl text-abys-navy">
                  {data.graphSummary.coverage.nodeCount} düğüm · {data.graphSummary.coverage.edgeCount} ilişki
                </p>
                <p className="text-xs text-abys-muted mt-1">
                  {data.graphSummary.coverage.unresolvedNodeCount} referans hedefi kaynakta çözülemedi.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/60 px-2 py-2">
                    <p className="font-serif text-lg text-abys-navy">{data.graphSummary.coverage.multiSourceNodeCount}</p>
                    <p className="text-[10px] text-abys-muted">Çok kaynaklı varlık</p>
                  </div>
                  <div className="rounded-lg bg-white/60 px-2 py-2">
                    <p className="font-serif text-lg text-abys-navy">{data.graphSummary.resolution.strongLinkRecords}</p>
                    <p className="text-[10px] text-abys-muted">Güçlü kimlik</p>
                  </div>
                  <div className="rounded-lg bg-white/60 px-2 py-2">
                    <p className="font-serif text-lg text-abys-navy">{data.graphSummary.resolution.sourceScopedRecords}</p>
                    <p className="text-[10px] text-abys-muted">Kaynağa özgü</p>
                  </div>
                </div>
                <p className="text-[10px] text-abys-muted mt-2">{data.graphSummary.resolution.linkStrategy}</p>
                <p className="text-[11px] text-abys-muted mt-3">
                  {data.graphSummary.entities.length === 0
                    ? "Grafik için kanonik kayıt yok."
                    : data.graphSummary.entities.map((entity) => `${entity.entity}=${entity.count}`).join(" · ")}
                </p>
                <p className="text-[10px] text-abys-muted mt-2">{data.graphSummary.provenance.note}</p>
              </div>
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">ALTIN KAYIT KONTROLÜ</p>
                {goldenRecords.length === 0 ? (
                  <p className="text-sm text-abys-muted">Çok kaynaklı kanonik varlık henüz yok.</p>
                ) : (
                  <div className="space-y-3">
                    {goldenRecords.map((record) => (
                      <div key={`${record.entity}:${record.canonicalEntityId}`} className="rounded-lg bg-white/60 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-abys-ink">{record.label}</p>
                            <p className="text-[10px] text-abys-muted">
                              {record.entity} · {record.sourceCount} kaynak · {record.recordCount} kayıt
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                            record.conflictCount > 0
                              ? "bg-abys-warning-soft text-abys-warning"
                              : "bg-abys-healthy-soft text-abys-healthy"
                          }`}>
                            {record.conflictCount > 0 ? `${record.conflictCount} çelişki` : "Tutarlı"}
                          </span>
                        </div>
                        <p className="text-[10px] text-abys-muted mt-1">
                          {record.policyApplied ? "Onaylı kaynak güven sırası uygulanıyor." : "Kaynak güncelliği kullanılıyor."}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-abys-muted mt-3">
                  Kaynak kayıtları değiştirilmez; alan seçimi ve kaynağı izlenebilir biçimde raporlanır.
                </p>
              </div>
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-widest text-abys-muted font-semibold">ALTIN KAYIT GÜVEN SIRASI</p>
                    <p className="text-[11px] text-abys-muted mt-1">
                      Alan çakıştığında düşük sayılı kaynak önce gelir. Kaynak kayıtları değiştirilmez.
                    </p>
                  </div>
                  <select
                    value={policyEntity}
                    onChange={(event) => setPolicyEntity(event.target.value)}
                    className="rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-xs text-abys-ink"
                    aria-label="Altın kayıt varlık türü"
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
                    Bu varlık türü için kaynak konnektör yok. Önce Sistem Bağlantıları ekranından bir kaynak tanımlayın.
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
                              {source.id} · konfig v{source.configVersion}
                              {existingPolicy
                                ? ` · son güncelleme ${existingPolicy.updatedBy} / ${formatDateTime(existingPolicy.updatedAt)}`
                                : " · henüz onaylı sıra yok"}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-abys-muted">
                            Öncelik
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
                      {policyBusy ? "Kaydediliyor…" : "Güven sırasını onayla"}
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-xs tracking-widest text-abys-muted font-semibold">DİJİTAL İKİZ · DURUM</p>
                  <label className="text-[10px] text-abys-muted">
                    Geçmiş an{" "}
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
                  <p className="text-sm text-abys-muted">Kurumsal durum projeksiyonu henüz oluşmadı.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/60 px-2 py-2">
                        <p className="font-serif text-lg text-abys-navy">{digitalTwin.coverage.canonicalEntities}</p>
                        <p className="text-[10px] text-abys-muted">Kanonik varlık</p>
                      </div>
                      <div className="rounded-lg bg-white/60 px-2 py-2">
                        <p className="font-serif text-lg text-abys-navy">{digitalTwin.operations.orderCount}</p>
                        <p className="text-[10px] text-abys-muted">Sipariş</p>
                      </div>
                      <div className="rounded-lg bg-white/60 px-2 py-2">
                        <p className="font-serif text-lg text-abys-navy">{digitalTwin.risks.length}</p>
                        <p className="text-[10px] text-abys-muted">Açık risk sinyali</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      {digitalTwin.financials.byCurrency.length === 0 ? (
                        <p className="text-[11px] text-abys-muted">Sınıflandırılmış finansal tutar yok.</p>
                      ) : (
                        digitalTwin.financials.byCurrency.map((currency) => (
                          <p key={currency.currency} className="text-[11px] text-abys-muted">
                            {currency.currency}: sipariş {currency.orderValue.toLocaleString("tr-TR")} · fatura{" "}
                            {currency.invoiceValue.toLocaleString("tr-TR")}
                          </p>
                        ))
                      )}
                      {digitalTwin.financials.unclassifiedValueCount > 0 && (
                        <p className="text-[10px] text-abys-warning">
                          {digitalTwin.financials.unclassifiedValueCount} tutar para birimi olmadığı için toplama katılmadı.
                        </p>
                      )}
                    </div>
                    <p className="text-[10px] text-abys-muted mt-2">
                      {digitalTwin.coverage.mode === "historical"
                        ? `Geçmiş görünüm: ${formatDateTime(digitalTwin.coverage.asOf)} · `
                        : "Güncel görünüm · "}
                      Veri yaşı: {digitalTwin.freshness.ageMinutes === null ? "—" : `${digitalTwin.freshness.ageMinutes} dk`}
                      {digitalTwin.freshness.stale ? " · eşik aşıldı" : " · taze"}
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
              <p className="text-[11px] tracking-widest font-semibold">GİRDİLER</p>
              <p>
                Varlık kayıtları:{" "}
                {Object.keys(data.inputs.entities).length === 0
                  ? "yok"
                  : Object.entries(data.inputs.entities)
                      .map(([e, n]) => `${e}=${n}`)
                      .join(", ")}
              </p>
              <p>
                Eşlenmiş alan: {data.inputs.fieldCount} · KPI etiketi: {data.inputs.kpiLabelCount} · Kayıtlı sektör:{" "}
                {data.inputs.sectorId ?? "—"}
              </p>
              {data.missingInformation.length > 0 && (
                <>
                  <p className="pt-2 text-[11px] tracking-widest font-semibold">EKSİK BİLGİ</p>
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
                Katalog: {data.catalog.map((c) => `${c.label} v${c.version}`).join(" · ")}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
