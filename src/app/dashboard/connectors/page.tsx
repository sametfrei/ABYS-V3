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
  enabled: boolean;
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
  startedAt: string;
  finishedAt: string | null;
  pages: number;
  readCount: number;
  writtenCount: number;
  skippedCount: number;
  checkpoint: string | null;
  error: string | null;
  warnings: string[];
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

export default function ConnectorsPage() {
  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [configs, setConfigs] = useState<ConnectorConfigRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiPath, setApiPath] = useState("");
  const [authType, setAuthType] = useState("none");
  const [secretEnvVar, setSecretEnvVar] = useState("");
  const [entity, setEntity] = useState("customer");
  const [idField, setIdField] = useState("id");
  const [recordsPath, setRecordsPath] = useState("data");
  const [updatedAtField, setUpdatedAtField] = useState("updated_at");
  const [paginationType, setPaginationType] = useState("page");
  const [pageParam, setPageParam] = useState("page");
  const [limitParam, setLimitParam] = useState("limit");
  const [pageSize, setPageSize] = useState("100");
  const [fieldMapText, setFieldMapText] = useState('{ "name": "name", "email": "email" }');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [runsByConfig, setRunsByConfig] = useState<Record<string, { runs: SyncRun[]; records: { entity: string; count: number }[] }>>({});

  async function reload() {
    const res = await fetch("/api/connectors", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `Yüklenemedi (HTTP ${res.status}).`);
    setDefinitions(body.definitions);
    setConfigs(body.configs);
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
            entity,
            idField,
            recordsPath: recordsPath || undefined,
            updatedAtField: updatedAtField || undefined,
            fieldMap,
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
        `Senkron tamam: ${body.writtenCount} kayıt yazıldı, ${body.skippedCount} atlandı, ${
          body.warnings?.length ?? 0
        } uyarı.`
      );
      const runsRes = await fetch(`/api/connectors/${id}/runs`, { cache: "no-store" });
      if (runsRes.ok) {
        const runsBody = (await runsRes.json()) as {
          runs: SyncRun[];
          records: { entity: string; count: number }[];
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
    const body = (await res.json()) as { runs: SyncRun[]; records: { entity: string; count: number }[] };
    setRunsByConfig((prev) => ({ ...prev, [id]: body }));
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
              </select>
              <input value={secretEnvVar} onChange={(e) => setSecretEnvVar(e.target.value)} placeholder="Ortam değişkeni (ör. CRM_TOKEN)" className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2" />
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
            <button onClick={createConfig} disabled={busy} className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
              {busy ? "Kaydediliyor…" : "Bağlantıyı kaydet"}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <p className="text-xs tracking-widest text-abys-muted font-semibold mb-3">KAYITLI BAĞLANTILAR</p>
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
                          {c.connectorId} · {c.config.entity} · {c.config.baseUrl}
                          {c.config.path}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => void loadRuns(c.id)} className="text-xs rounded-full border border-abys-cream-border px-3 py-1 text-abys-muted hover:text-abys-ink">
                          Geçmiş
                        </button>
                        <button onClick={() => void sync(c.id)} disabled={busy} className="text-xs rounded-full bg-abys-accent text-white px-3 py-1 hover:opacity-90 disabled:opacity-40">
                          Senkronize et
                        </button>
                      </div>
                    </div>
                    {detail && (
                      <div className="mt-2 text-[11px] text-abys-muted space-y-1">
                        <p>
                          Kayıtlar:{" "}
                          {detail.records.length === 0
                            ? "yok"
                            : detail.records.map((r) => `${r.entity}=${r.count}`).join(", ")}
                        </p>
                        {detail.runs.length === 0 ? (
                          <p>Çalıştırma geçmişi yok.</p>
                        ) : (
                          <ul className="space-y-0.5 list-none p-0 m-0">
                            {detail.runs.slice(0, 5).map((r) => (
                              <li key={r.id}>
                                {new Date(r.startedAt).toLocaleString("tr-TR")} · {r.status} · {r.writtenCount} yazıldı /{" "}
                                {r.readCount} okundu {r.error ? `· ${r.error}` : ""}
                              </li>
                            ))}
                          </ul>
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
