"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { loadProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";

/**
 * Senaryo Laboratuvarı (Faz 6). Değişkenleri değiştir, taban/iyimser/kötümser
 * karşılaştır. Tüm sayılar sunucuda DETERMİNİSTİK hesaplanır; her sonuçla
 * formül, sınırlar ve duyarlılık birlikte gösterilir (gizli varsayım yok).
 */

interface Variable {
  id: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
}
interface Template {
  id: string;
  label: string;
  description: string;
  variables: Variable[];
  formulaText: string;
  limitations: string[];
}
interface Simulation {
  samples: number;
  seed: number;
  engine: string;
  metric: { label: string; unit: string };
  distribution: { p10: number; p50: number; p90: number; mean: number; stdDev: number; min: number; max: number };
  baseValue: number;
  probabilityAboveBase: number;
  probabilityAboveBase20: number;
  assumptions: { id: string; label: string; unit: string; low: number; mode: number; high: number }[];
  histogram: { from: number; to: number; count: number }[];
  note: string;
}
interface RunResult {
  runs: { name: string; inputs: Record<string, number>; results: { label: string; value: number; unit: string }[] }[];
  sensitivity: { variable: string; effect: string }[];
  simulation: Simulation | null;
  provenance: { formulaText: string; limitations: string[]; engine: string; calculatedAt: string; note: string };
  scenarioId: string | null;
}

interface TwinComparison {
  label: string;
  baseline: {
    financials: { byCurrency: { currency: string; accountBalance: number }[] };
    operations: { orderCount: number; inventoryQuantity: number };
  };
  projected: {
    financials: { byCurrency: { currency: string; accountBalance: number }[] };
    operations: { orderCount: number; inventoryQuantity: number };
  };
  deltas: {
    category: string;
    key: string;
    currency: string | null;
    unit: string;
    baseline: number;
    projected: number;
    delta: number;
  }[];
  summary: { currencies: string[]; newCurrencies: string[]; addedRisks: number };
  assumptions: string[];
  provenance: { method: string; note: string };
}

function currencyFromUnit(unit: string): string | null {
  const normalized = unit.trim().toUpperCase();
  if (normalized === "TL" || normalized === "TRY" || normalized === "₺") return "TRY";
  if (normalized === "EUR" || normalized === "€") return "EUR";
  if (normalized === "USD" || normalized === "$") return "USD";
  if (normalized === "GBP" || normalized === "£") return "GBP";
  return null;
}

export default function ScenariosPage() {
  const session = useSession();
  const [stored] = useStored(() => ({ profile: loadProfile() }));
  const sectorId = session?.sectorId ?? (session ? null : stored?.profile?.sectorId ?? null);

  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [twinComparison, setTwinComparison] = useState<TwinComparison | null>(null);
  const [twinBusy, setTwinBusy] = useState(false);

  useEffect(() => {
    if (!sectorId) return;
    let cancelled = false;
    fetch(`/api/scenarios?sectorId=${sectorId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          setError("Senaryo Laboratuvarı kurumsal oturum gerektirir.");
          setTemplates([]);
          return;
        }
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Şablonlar yüklenemedi.");
          setTemplates([]);
          return;
        }
        setError(null);
        setTemplates(j.templates);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Şablonlar yüklenemedi.");
          setTemplates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sectorId]);

  if (session === undefined) return null;

  function pick(t: Template) {
    setSelected(t);
    setInputs(Object.fromEntries(t.variables.map((v) => [v.id, v.value])));
    setResult(null);
    setTwinComparison(null);
    setName(t.label);
  }

  async function run(save: boolean) {
    if (!selected || !sectorId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId, templateId: selected.id, inputs, save, name, simulate: true }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Senaryo çalıştırılamadı.");
        return;
      }
      setError(null);
      setResult(j);
      setTwinComparison(null);
    } finally {
      setBusy(false);
    }
  }

  async function compareTwin() {
    if (!result) return;
    const total = result.runs[0]?.results.at(-1);
    const currency = total ? currencyFromUnit(total.unit) : null;
    if (!total || !currency) {
      setError("Dijital ikiz karşılaştırması için senaryo toplamı TRY, EUR, USD veya GBP cinsinden olmalı.");
      return;
    }
    setTwinBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/digital-twin/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: name || selected?.label || "Senaryo",
          adjustments: {
            currencyAdjustments: [
              {
                currency,
                accountBalance: -Math.abs(total.value),
              },
            ],
            risks: [
              {
                code: "SCENARIO_IMPACT",
                severity: "warning",
                title: `${name || selected?.label || "Senaryo"} etkisi`,
                evidence: `Senaryo toplamı ${total.value.toLocaleString("tr-TR")} ${total.unit}; nakit etkisi senaryo varsayımı olarak uygulandı.`,
              },
            ],
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Karşılaştırma başarısız (HTTP ${res.status}).`);
      setTwinComparison(body as TwinComparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dijital ikiz karşılaştırması başarısız.");
      setTwinComparison(null);
    } finally {
      setTwinBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="SENARYO LABORATUVARI"
        title="Ya şöyle"
        accent="olsaydı?"
        desc="Değişkenleri değiştirin, taban/iyimser/kötümser karşılaştırın. Tüm sayılar deterministik formüllerle hesaplanır — model sayı üretmez; formül, sınırlar ve duyarlılık her sonuçla birlikte gösterilir."
      />

      <div className="px-10 pb-16 max-w-3xl space-y-6">
        {error && <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{error}</p>}
        {templates === null && <p className="text-sm text-abys-muted">Yükleniyor…</p>}

        {templates && templates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => pick(t)}
                className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                  selected?.id === t.id
                    ? "bg-abys-navy text-white border-abys-navy"
                    : "border-abys-ink/15 text-abys-ink hover:bg-white/60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 space-y-4">
            <p className="text-sm text-abys-muted">{selected.description}</p>

            {selected.variables.map((v) => (
              <div key={v.id}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-abys-ink">{v.label}</label>
                  <span className="font-mono text-sm text-abys-navy">
                    {inputs[v.id] ?? v.value} {v.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={v.min}
                  max={v.max}
                  step={v.step}
                  value={inputs[v.id] ?? v.value}
                  onChange={(e) => setInputs((s) => ({ ...s, [v.id]: Number(e.target.value) }))}
                  className="w-full accent-abys-accent"
                />
              </div>
            ))}

            <div className="flex flex-wrap gap-2 items-center pt-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Senaryo adı"
                className="flex-1 min-w-[180px] text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
              />
              <button onClick={() => run(false)} disabled={busy} className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
                {busy ? "Hesaplanıyor…" : "Karşılaştır"}
              </button>
              <button onClick={() => run(true)} disabled={busy} className="text-sm rounded-full border border-abys-accent/40 text-abys-accent px-4 py-2 hover:bg-abys-accent-soft disabled:opacity-40">
                Hesapla ve kaydet
              </button>
            </div>

            <p className="text-[11px] text-abys-muted pt-1">Formül: {selected.formulaText}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {result.runs.map((r) => {
                const total = r.results[r.results.length - 1];
                const isBase = r.name === "Taban";
                return (
                  <div
                    key={r.name}
                    className={`rounded-xl border p-4 ${isBase ? "border-abys-accent/40 bg-white/70" : "border-abys-cream-border bg-abys-cream/60"}`}
                  >
                    <p className="text-xs text-abys-muted mb-1">{r.name}</p>
                    <p className="font-mono text-xl text-abys-navy mb-2">
                      {total.value.toLocaleString("tr-TR")} {total.unit}
                    </p>
                    <ul className="space-y-0.5">
                      {r.results.slice(0, -1).map((x) => (
                        <li key={x.label} className="text-[11px] text-abys-muted flex justify-between gap-2">
                          <span>{x.label}</span>
                          <span className="font-mono">{x.value.toLocaleString("tr-TR")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {result.simulation && <SimulationPanel sim={result.simulation} />}

            <div className="rounded-xl border border-abys-accent/25 bg-white/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs tracking-widest text-abys-muted font-semibold">SENARYO → DİJİTAL İKİZ</p>
                  <p className="text-[11px] text-abys-muted mt-1">
                    Senaryo toplamı, açık bir nakit etkisi varsayımı olarak mevcut kurumsal durumla karşılaştırılır. Para birimleri toplanmaz.
                  </p>
                </div>
                <button
                  onClick={() => void compareTwin()}
                  disabled={twinBusy}
                  className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft disabled:opacity-40"
                >
                  {twinBusy ? "Karşılaştırılıyor…" : "Dijital ikizle karşılaştır"}
                </button>
              </div>
              {twinComparison && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {twinComparison.summary.currencies.map((currency) => {
                      const before = twinComparison.baseline.financials.byCurrency.find((item) => item.currency === currency)?.accountBalance ?? 0;
                      const after = twinComparison.projected.financials.byCurrency.find((item) => item.currency === currency)?.accountBalance ?? 0;
                      return (
                        <div key={currency} className="rounded-lg bg-abys-cream/70 px-3 py-2">
                          <p className="text-[10px] text-abys-muted">{currency} nakit dengesi</p>
                          <p className="font-mono text-sm text-abys-navy">
                            {before.toLocaleString("tr-TR")} → {after.toLocaleString("tr-TR")}
                          </p>
                          <p className={`text-[10px] ${after < before ? "text-abys-warning" : "text-abys-healthy"}`}>
                            Fark: {(after - before).toLocaleString("tr-TR")} {currency}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-abys-muted">
                    {twinComparison.deltas.length} açık delta · {twinComparison.summary.addedRisks} senaryo riski ·{" "}
                    {twinComparison.summary.newCurrencies.length > 0
                      ? `Yeni para birimi: ${twinComparison.summary.newCurrencies.join(", ")}`
                      : "Mevcut para birimleri"}
                  </p>
                  <ul className="space-y-0.5">
                    {twinComparison.assumptions.map((assumption) => (
                      <li key={assumption} className="text-[10px] text-abys-muted">• {assumption}</li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-abys-muted">{twinComparison.provenance.note}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">DUYARLILIK</p>
              <ul className="space-y-1 mb-4">
                {result.sensitivity.map((s) => (
                  <li key={s.variable} className="text-sm text-abys-ink">
                    <span className="text-abys-navy font-medium">{s.variable}</span> — {s.effect}
                  </li>
                ))}
              </ul>

              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">HESAP KAYNAĞI</p>
              <p className="text-xs text-abys-muted mb-1">Formül: {result.provenance.formulaText}</p>
              <p className="text-xs text-abys-muted mb-1">Motor: {result.provenance.engine}</p>
              <p className="text-xs text-abys-muted mb-2">
                Hesaplandı: {new Date(result.provenance.calculatedAt).toLocaleString("tr-TR")}
              </p>
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-1">SINIRLAR</p>
              <ul className="space-y-0.5">
                {result.provenance.limitations.map((l, i) => (
                  <li key={i} className="text-xs text-abys-muted">• {l}</li>
                ))}
              </ul>
              {result.scenarioId && (
                <p className="text-xs text-abys-healthy mt-3">Senaryo kaydedildi (kurumsal hafızada).</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Monte Carlo dağılımı — aralık, olasılıklar, histogram ve varsayımlar. */
function SimulationPanel({ sim }: { sim: Simulation }) {
  const peak = Math.max(...sim.histogram.map((x) => x.count), 1);
  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
        BELİRSİZLİK ARALIĞI — MONTE CARLO
      </p>
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[
          ["P10 (iyi)", sim.distribution.p10],
          ["P50 (beklenen)", sim.distribution.p50],
          ["P90 (kötü)", sim.distribution.p90],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-white/70 px-3 py-2">
            <p className="text-[11px] text-abys-muted">{label}</p>
            <p className="font-mono text-lg text-abys-navy">
              {Number(value).toLocaleString("tr-TR")} {sim.metric.unit}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-abys-ink">
        {sim.metric.label}: taban {sim.baseValue.toLocaleString("tr-TR")} {sim.metric.unit} · ortalama{" "}
        {sim.distribution.mean.toLocaleString("tr-TR")} · std. sapma{" "}
        {sim.distribution.stdDev.toLocaleString("tr-TR")}
      </p>
      <p className="text-sm text-abys-muted mt-1">
        Tabanı aşma olasılığı %{Math.round(sim.probabilityAboveBase * 100)} · tabanın %20 üzerini aşma
        olasılığı %{Math.round(sim.probabilityAboveBase20 * 100)} · {sim.samples.toLocaleString("tr-TR")} örnek,
        tohum {sim.seed}
      </p>
      <div className="flex items-end gap-1 h-16 mt-3" aria-hidden="true">
        {sim.histogram.map((b, i) => (
          <div
            key={i}
            className="flex-1 bg-abys-accent/30 rounded-t"
            style={{ height: `${Math.max(2, Math.round((b.count / peak) * 64))}px` }}
            title={`${Math.round(b.from).toLocaleString("tr-TR")} – ${Math.round(b.to).toLocaleString("tr-TR")}: ${b.count}`}
          />
        ))}
      </div>
      <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">VARSAYIMLAR</p>
      <ul className="space-y-0.5">
        {sim.assumptions.map((a) => (
          <li key={a.id} className="text-xs text-abys-muted">
            {a.label}: alt {a.low.toLocaleString("tr-TR")} · mod {a.mode.toLocaleString("tr-TR")} · üst{" "}
            {a.high.toLocaleString("tr-TR")} {a.unit}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-abys-muted mt-2">
        Motor: {sim.engine}. {sim.note}
      </p>
    </div>
  );
}
