"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import { loadProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
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
interface MeasuredBinding {
  value: number;
  kpiLabel: string;
  observedAt: string;
  numericPoints: number;
  sourceLabels: string[];
}
interface Template {
  id: string;
  label: string;
  description: string;
  variables: Variable[];
  formulaText: string;
  limitations: string[];
  bindings?: Record<string, MeasuredBinding | null>;
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
  inputOrigins?: Record<string, { kind: string; kpiLabel?: string; clamped?: boolean }>;
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
  const locale = useLocale();
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
  const [useMeasured, setUseMeasured] = useState(false);
  const [twinComparison, setTwinComparison] = useState<TwinComparison | null>(null);
  const [twinBusy, setTwinBusy] = useState(false);

  useEffect(() => {
    if (!sectorId) return;
    const effectLocale = readLocale();
    let cancelled = false;
    fetch(`/api/scenarios?sectorId=${sectorId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          setError(t(effectLocale, "scenarios.unauthorized"));
          setTemplates([]);
          return;
        }
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? t(effectLocale, "scenarios.templatesFailed"));
          setTemplates([]);
          return;
        }
        setError(null);
        setTemplates(j.templates);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t(effectLocale, "scenarios.templatesFailed"));
          setTemplates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sectorId]);

  if (session === undefined) return null;

  function applyMeasured(t: Template, enabled: boolean) {
    setUseMeasured(enabled);
    setInputs(
      Object.fromEntries(
        t.variables.map((variable) => {
          const binding = enabled ? t.bindings?.[variable.id] : null;
          const value = binding
            ? Math.max(variable.min, Math.min(variable.max, binding.value))
            : variable.value;
          return [variable.id, value];
        })
      )
    );
    setResult(null);
  }

  function pick(t: Template) {
    setSelected(t);
    setUseMeasured(false);
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
        body: JSON.stringify({
          sectorId,
          templateId: selected.id,
          inputs,
          save,
          name,
          simulate: true,
          useMeasuredValues: useMeasured,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? t(locale, "scenarios.runFailed"));
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
      setError(t(locale, "scenarios.twinNeedCurrency"));
      return;
    }
    setTwinBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/digital-twin/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: name || selected?.label || t(locale, "scenarios.defaultName"),
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
                title: formatMessage(locale, "scenarios.twinRiskTitle", {
                  name: name || selected?.label || t(locale, "scenarios.defaultName"),
                }),
                evidence: formatMessage(locale, "scenarios.twinRiskEvidence", {
                  value: total.value.toLocaleString(locale),
                  unit: total.unit,
                }),
              },
            ],
          },
        }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          body.error ?? formatMessage(locale, "scenarios.twinFailedHttp", { status: res.status })
        );
      setTwinComparison(body as TwinComparison);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "scenarios.twinFailed"));
      setTwinComparison(null);
    } finally {
      setTwinBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "scenarios.eyebrow")}
        title={t(locale, "scenarios.title")}
        accent={t(locale, "scenarios.titleAccent")}
        desc={t(locale, "scenarios.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-3xl space-y-6">
        {error && <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{error}</p>}
        {templates === null && (
          <p className="text-sm text-abys-muted">{t(locale, "scenarios.loading")}</p>
        )}

        {templates && templates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => pick(tpl)}
                className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                  selected?.id === tpl.id
                    ? "bg-abys-navy text-white border-abys-navy"
                    : "border-abys-ink/15 text-abys-ink hover:bg-white/60"
                }`}
              >
                {tpl.label}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 space-y-4">
            <p className="text-sm text-abys-muted">{selected.description}</p>

            {selected.variables.some((v) => selected.bindings?.[v.id]) && (
              <label className="flex items-center gap-2 text-xs text-abys-muted">
                <input
                  type="checkbox"
                  checked={useMeasured}
                  onChange={(event) => applyMeasured(selected, event.target.checked)}
                />
                {t(locale, "scenarios.useMeasured")}
              </label>
            )}

            {selected.variables.map((v) => {
              const binding = selected.bindings?.[v.id];
              return (
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
                  {binding && (
                    <p className="text-[10px] text-abys-muted mt-0.5">
                      {formatMessage(locale, "scenarios.measuredBinding", {
                        label: binding.kpiLabel,
                        value: binding.value,
                      })}
                    </p>
                  )}
                </div>
              );
            })}

            <div className="flex flex-wrap gap-2 items-center pt-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t(locale, "scenarios.namePlaceholder")}
                className="flex-1 min-w-[180px] text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
              />
              <button onClick={() => run(false)} disabled={busy} className="text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
                {busy ? t(locale, "scenarios.calculating") : t(locale, "scenarios.compare")}
              </button>
              <button onClick={() => run(true)} disabled={busy} className="text-sm rounded-full border border-abys-accent/40 text-abys-accent px-4 py-2 hover:bg-abys-accent-soft disabled:opacity-40">
                {t(locale, "scenarios.calculateAndSave")}
              </button>
            </div>

            <p className="text-[11px] text-abys-muted pt-1">
              {formatMessage(locale, "scenarios.formula", { formula: selected.formulaText })}
            </p>
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
                      {total.value.toLocaleString(locale)} {total.unit}
                    </p>
                    <ul className="space-y-0.5">
                      {r.results.slice(0, -1).map((x) => (
                        <li key={x.label} className="text-[11px] text-abys-muted flex justify-between gap-2">
                          <span>{x.label}</span>
                          <span className="font-mono">{x.value.toLocaleString(locale)}</span>
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
                  <p className="text-xs tracking-widest text-abys-muted font-semibold">
                    {t(locale, "scenarios.twinHeading")}
                  </p>
                  <p className="text-[11px] text-abys-muted mt-1">
                    {t(locale, "scenarios.twinDescription")}
                  </p>
                </div>
                <button
                  onClick={() => void compareTwin()}
                  disabled={twinBusy}
                  className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft disabled:opacity-40"
                >
                  {twinBusy ? t(locale, "scenarios.twinBusy") : t(locale, "scenarios.twinCompare")}
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
                          <p className="text-[10px] text-abys-muted">
                            {formatMessage(locale, "scenarios.twinBalance", { currency })}
                          </p>
                          <p className="font-mono text-sm text-abys-navy">
                            {before.toLocaleString(locale)} → {after.toLocaleString(locale)}
                          </p>
                          <p className={`text-[10px] ${after < before ? "text-abys-warning" : "text-abys-healthy"}`}>
                            {formatMessage(locale, "scenarios.twinDelta", {
                              value: (after - before).toLocaleString(locale),
                              currency,
                            })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-abys-muted">
                    {formatMessage(locale, "scenarios.twinSummary", {
                      deltas: twinComparison.deltas.length,
                      risks: twinComparison.summary.addedRisks,
                      currencies:
                        twinComparison.summary.newCurrencies.length > 0
                          ? formatMessage(locale, "scenarios.twinCurrencyNew", {
                              list: twinComparison.summary.newCurrencies.join(", "),
                            })
                          : t(locale, "scenarios.twinCurrencyExisting"),
                    })}
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
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                {t(locale, "scenarios.sensitivityHeading")}
              </p>
              <ul className="space-y-1 mb-4">
                {result.sensitivity.map((s) => (
                  <li key={s.variable} className="text-sm text-abys-ink">
                    <span className="text-abys-navy font-medium">{s.variable}</span> — {s.effect}
                  </li>
                ))}
              </ul>

              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                {t(locale, "scenarios.provenanceHeading")}
              </p>
              <p className="text-xs text-abys-muted mb-1">
                {formatMessage(locale, "scenarios.formula", {
                  formula: result.provenance.formulaText,
                })}
              </p>
              <p className="text-xs text-abys-muted mb-1">
                {formatMessage(locale, "scenarios.engine", { engine: result.provenance.engine })}
              </p>
              <p className="text-xs text-abys-muted mb-2">
                {formatMessage(locale, "scenarios.calculatedAt", {
                  at: new Date(result.provenance.calculatedAt).toLocaleString(locale),
                })}
              </p>
              {result.inputOrigins && (
                <p className="text-xs text-abys-muted mb-2">
                  {formatMessage(locale, "scenarios.inputOrigins", {
                    measured: Object.values(result.inputOrigins).filter(
                      (origin) => origin.kind === "measured_kpi"
                    ).length,
                    defaults: Object.values(result.inputOrigins).filter(
                      (origin) => origin.kind !== "measured_kpi"
                    ).length,
                  })}
                </p>
              )}
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-1">
                {t(locale, "scenarios.limitsHeading")}
              </p>
              <ul className="space-y-0.5">
                {result.provenance.limitations.map((l, i) => (
                  <li key={i} className="text-xs text-abys-muted">• {l}</li>
                ))}
              </ul>
              {result.scenarioId && (
                <p className="text-xs text-abys-healthy mt-3">
                  {t(locale, "scenarios.saved")}
                </p>
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
  const locale = useLocale();
  const peak = Math.max(...sim.histogram.map((x) => x.count), 1);
  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
        {t(locale, "scenarios.sim.heading")}
      </p>
      <div className="grid grid-cols-3 gap-3 mb-3">
        {[
          ["scenarios.sim.p10", sim.distribution.p10],
          ["scenarios.sim.p50", sim.distribution.p50],
          ["scenarios.sim.p90", sim.distribution.p90],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-white/70 px-3 py-2">
            <p className="text-[11px] text-abys-muted">
              {t(locale, label as ShellKey)}
            </p>
            <p className="font-mono text-lg text-abys-navy">
              {Number(value).toLocaleString(locale)} {sim.metric.unit}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-abys-ink">
        {formatMessage(locale, "scenarios.sim.summary", {
          label: sim.metric.label,
          base: sim.baseValue.toLocaleString(locale),
          unit: sim.metric.unit,
          mean: sim.distribution.mean.toLocaleString(locale),
          stdDev: sim.distribution.stdDev.toLocaleString(locale),
        })}
      </p>
      <p className="text-sm text-abys-muted mt-1">
        {formatMessage(locale, "scenarios.sim.probability", {
          above: Math.round(sim.probabilityAboveBase * 100),
          above20: Math.round(sim.probabilityAboveBase20 * 100),
          samples: sim.samples.toLocaleString(locale),
          seed: sim.seed,
        })}
      </p>
      <div className="flex items-end gap-1 h-16 mt-3" aria-hidden="true">
        {sim.histogram.map((b, i) => (
          <div
            key={i}
            className="flex-1 bg-abys-accent/30 rounded-t"
            style={{ height: `${Math.max(2, Math.round((b.count / peak) * 64))}px` }}
            title={`${Math.round(b.from).toLocaleString(locale)} – ${Math.round(b.to).toLocaleString(locale)}: ${b.count}`}
          />
        ))}
      </div>
      <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">
        {t(locale, "scenarios.sim.assumptionsHeading")}
      </p>
      <ul className="space-y-0.5">
        {sim.assumptions.map((a) => (
          <li key={a.id} className="text-xs text-abys-muted">
            {formatMessage(locale, "scenarios.sim.assumptionLine", {
              label: a.label,
              low: a.low.toLocaleString(locale),
              mode: a.mode.toLocaleString(locale),
              high: a.high.toLocaleString(locale),
              unit: a.unit,
            })}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-abys-muted mt-2">
        {formatMessage(locale, "scenarios.sim.engineNote", {
          engine: sim.engine,
          note: sim.note,
        })}
      </p>
    </div>
  );
}
