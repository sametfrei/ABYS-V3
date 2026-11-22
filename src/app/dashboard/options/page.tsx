"use client";

import { useState, useSyncExternalStore } from "react";
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

type Direction = "maximize" | "minimize";

interface Criterion {
  id: string;
  label: string;
  direction: Direction;
  weight: number;
}

interface OptionRow {
  id: string;
  label: string;
  scores: Record<string, number>;
}

interface Evaluated {
  id: string;
  label: string;
  normalized: Record<string, number>;
  weightedScore: number;
  rank: number;
  onParetoFrontier: boolean;
  dominatedBy: string[];
  bestCriterion: { label: string; value: number } | null;
  worstCriterion: { label: string; value: number } | null;
}

interface OptimizationResourceRow {
  id: string;
  label: string;
  capacity: number;
  unit: string;
}

interface OptimizationOptionRow {
  id: string;
  label: string;
  minUnits: number;
  maxUnits: number;
  valuePerUnit: number;
  resourcesPerUnit: Record<string, number>;
}

interface OptimizationResult {
  status: "optimal" | "feasible" | "infeasible";
  complete: boolean;
  allocations: { optionId: string; label: string; units: number; value: number; resources: Record<string, number> }[];
  objectiveValue: number;
  objective: { label: string; unit: string };
  resourceUsage: Record<string, number>;
  remaining: Record<string, number>;
  infeasibility: { resourceId: string; required: number; capacity: number }[];
  nodesExplored: number;
  method: string;
  note: string;
}

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export default function OptionsPage() {
  const locale = useLocale();
  const [criteria, setCriteria] = useState<Criterion[]>([
    { id: "cost", label: "Maliyet", direction: "minimize", weight: 2 },
    { id: "risk", label: "Risk", direction: "minimize", weight: 1 },
    { id: "growth", label: "Büyüme", direction: "maximize", weight: 1 },
  ]);
  const [options, setOptions] = useState<OptionRow[]>([
    { id: newId("opt"), label: "Seçenek A", scores: { cost: 100, risk: 40, growth: 60 } },
    { id: newId("opt"), label: "Seçenek B", scores: { cost: 60, risk: 70, growth: 80 } },
  ]);
  const [result, setResult] = useState<{ options: Evaluated[]; frontier: string[]; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [optResources, setOptResources] = useState<OptimizationResourceRow[]>([
    { id: "budget", label: "Bütçe", capacity: 1_000_000, unit: "TRY" },
    { id: "hours", label: "Uzman saati", capacity: 500, unit: "saat" },
  ]);
  const [optOptions, setOptOptions] = useState<OptimizationOptionRow[]>([
    {
      id: "efficiency",
      label: "Verimlilik projesi",
      minUnits: 0,
      maxUnits: 20,
      valuePerUnit: 90_000,
      resourcesPerUnit: { budget: 40_000, hours: 18 },
    },
    {
      id: "growth",
      label: "Büyüme atağı",
      minUnits: 0,
      maxUnits: 12,
      valuePerUnit: 150_000,
      resourcesPerUnit: { budget: 95_000, hours: 30 },
    },
  ]);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [optBusy, setOptBusy] = useState(false);

  function updateCriterion(id: string, patch: Partial<Criterion>) {
    setCriteria((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function updateScore(optionId: string, criterionId: string, value: number) {
    setOptions((list) =>
      list.map((o) => (o.id === optionId ? { ...o, scores: { ...o.scores, [criterionId]: value } } : o))
    );
  }

  function addCriterion() {
    const id = newId("crit");
    setCriteria((list) => [...list, { id, label: `Kriter ${list.length + 1}`, direction: "maximize", weight: 1 }]);
    setOptions((list) => list.map((o) => ({ ...o, scores: { ...o.scores, [id]: 0 } })));
  }

  function removeCriterion(id: string) {
    setCriteria((list) => list.filter((c) => c.id !== id));
  }

  function addOption() {
    const scores: Record<string, number> = {};
    for (const c of criteria) scores[c.id] = 0;
    setOptions((list) => [...list, { id: newId("opt"), label: `Seçenek ${String.fromCharCode(65 + list.length)}`, scores }]);
  }

  function removeOption(id: string) {
    setOptions((list) => list.filter((o) => o.id !== id));
  }

  function fillScores(optionId: string) {
    setOptions((list) => {
      const scores: Record<string, number> = {};
      for (const c of criteria) scores[c.id] = 0;
      return list.map((o) => (o.id === optionId ? { ...o, scores } : o));
    });
  }

  async function evaluate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/decision-options/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: criteria.map((c) => ({
            id: c.id,
            label: c.label.trim() || c.id,
            direction: c.direction,
            weight: Number(c.weight) || 0,
          })),
          options: options.map((o) => ({ id: o.id, label: o.label.trim() || o.id, scores: o.scores })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Değerlendirme başarısız (HTTP ${res.status}).`);
      setResult(body);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(readLocale(), "options.evaluateFailed")
      );
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function updateOptimizationOption(id: string, patch: Partial<OptimizationOptionRow>) {
    setOptOptions((list) => list.map((option) => (option.id === id ? { ...option, ...patch } : option)));
  }

  function addOptimizationOption() {
    const resourcesPerUnit: Record<string, number> = {};
    for (const resource of optResources) resourcesPerUnit[resource.id] = 0;
    setOptOptions((list) => [
      ...list,
      {
        id: newId("alloc"),
        label: `Tahsis ${list.length + 1}`,
        minUnits: 0,
        maxUnits: 10,
        valuePerUnit: 10_000,
        resourcesPerUnit,
      },
    ]);
  }

  async function optimize() {
    setOptBusy(true);
    setError("");
    try {
      const res = await fetch("/api/optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resources: optResources,
          options: optOptions,
          objectiveLabel: "Beklenen katkı",
          valueUnit: "TRY",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Optimizasyon başarısız (HTTP ${res.status}).`);
      setOptimization(body as OptimizationResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(readLocale(), "options.optimizeFailed")
      );
      setOptimization(null);
    } finally {
      setOptBusy(false);
    }
  }

  const labelById = new Map(options.map((o) => [o.id, o.label]));

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "options.eyebrow")}
        title={t(locale, "options.title")}
        accent={t(locale, "options.titleAccent")}
        desc={t(locale, "options.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-5xl space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">
              {t(locale, "options.criteriaHeading")}
            </p>
            <button onClick={addCriterion} className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft">
              {t(locale, "options.addCriterion")}
            </button>
          </div>
          <ul className="space-y-2 list-none p-0 m-0">
            {criteria.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <input
                  value={c.label}
                  onChange={(e) => updateCriterion(c.id, { label: e.target.value })}
                  className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-1.5 min-w-[140px]"
                  aria-label={t(locale, "options.criterionName")}
                />
                <select
                  value={c.direction}
                  onChange={(e) => updateCriterion(c.id, { direction: e.target.value as Direction })}
                  className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1.5"
                  aria-label={t(locale, "options.direction")}
                >
                  <option value="maximize">{t(locale, "options.higherIsBetter")}</option>
                  <option value="minimize">{t(locale, "options.lowerIsBetter")}</option>
                </select>
                <label className="text-xs text-abys-muted flex items-center gap-1">
                  {t(locale, "options.weight")}
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={c.weight}
                    onChange={(e) => updateCriterion(c.id, { weight: Number(e.target.value) })}
                    className="w-20 text-sm rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1.5"
                  />
                </label>
                <button
                  onClick={() => removeCriterion(c.id)}
                  disabled={criteria.length <= 1}
                  className="text-xs text-abys-muted hover:text-abys-critical disabled:opacity-30"
                >
                  {t(locale, "options.remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">
              {t(locale, "options.optionsHeading")}
            </p>
            <button onClick={addOption} className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft">
              {t(locale, "options.addOption")}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-abys-muted">
                <th className="py-1 pr-2 font-medium">{t(locale, "options.colOption")}</th>
                {criteria.map((c) => (
                  <th key={c.id} className="py-1 px-2 font-medium">
                    {c.label || c.id}
                  </th>
                ))}
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr key={o.id}>
                  <td className="py-1 pr-2">
                    <input
                      value={o.label}
                      onChange={(e) =>
                        setOptions((list) => list.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))
                      }
                      className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 w-36"
                      aria-label={t(locale, "options.optionName")}
                    />
                  </td>
                  {criteria.map((c) => (
                    <td key={c.id} className="py-1 px-2">
                      <input
                        type="number"
                        step="any"
                        value={o.scores[c.id] ?? 0}
                        onChange={(e) => updateScore(o.id, c.id, Number(e.target.value))}
                        className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 w-24"
                        aria-label={`${o.label} ${c.label}`}
                      />
                    </td>
                  ))}
                  <td className="py-1">
                    <div className="flex gap-2">
                      <button onClick={() => fillScores(o.id)} className="text-xs text-abys-muted hover:text-abys-ink">
                        {t(locale, "options.reset")}
                      </button>
                      <button
                        onClick={() => removeOption(o.id)}
                        disabled={options.length <= 2}
                        className="text-xs text-abys-muted hover:text-abys-critical disabled:opacity-30"
                      >
                        {t(locale, "options.remove")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={evaluate}
            disabled={busy || criteria.length === 0 || options.length < 2}
            className="mt-4 text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40"
          >
            {busy ? t(locale, "options.evaluating") : t(locale, "options.evaluate")}
          </button>
        </div>

        {result && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
              {t(locale, "options.resultHeading")}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-abys-muted">
                  <th className="py-1 font-medium">#</th>
                  <th className="py-1 font-medium">{t(locale, "options.colOption")}</th>
                  <th className="py-1 font-medium">{t(locale, "options.colScore")}</th>
                  <th className="py-1 font-medium">{t(locale, "options.colPareto")}</th>
                  <th className="py-1 font-medium">{t(locale, "options.colBestWorst")}</th>
                </tr>
              </thead>
              <tbody>
                {result.options.map((o) => (
                  <tr key={o.id} className={o.onParetoFrontier ? "text-abys-navy" : "text-abys-muted"}>
                    <td className="py-1 font-mono">{o.rank}</td>
                    <td className="py-1">
                      {o.label}
                      {o.dominatedBy.length > 0 && (
                        <span className="block text-[11px] text-abys-muted">
                          {formatMessage(locale, "options.dominatedBy", {
                            list: o.dominatedBy.map((id) => labelById.get(id) ?? id).join(", "),
                          })}
                        </span>
                      )}
                    </td>
                    <td className="py-1 font-mono">{o.weightedScore}</td>
                    <td className="py-1">{o.onParetoFrontier ? t(locale, "options.onFrontier") : "—"}</td>
                    <td className="py-1 text-xs">
                      {o.bestCriterion?.label ?? "—"} / {o.worstCriterion?.label ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-abys-muted mt-3">{result.note}</p>
          </div>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs tracking-widest text-abys-muted font-semibold">
                {t(locale, "options.allocationHeading")}
              </p>
              <p className="text-[11px] text-abys-muted mt-1">
                {t(locale, "options.allocationDescription")}
              </p>
            </div>
            <button
              onClick={addOptimizationOption}
              className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft"
            >
              {t(locale, "options.addAllocation")}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            {optResources.map((resource) => (
              <label key={resource.id} className="text-[11px] text-abys-muted">
                {resource.label} ({resource.unit})
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={resource.capacity}
                  onChange={(event) =>
                    setOptResources((list) =>
                      list.map((item) =>
                        item.id === resource.id ? { ...item, capacity: Number(event.target.value) } : item
                      )
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-sm text-abys-ink"
                />
              </label>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-abys-muted">
                  <th className="py-1 pr-2 font-medium">{t(locale, "options.colAllocation")}</th>
                  <th className="py-1 px-2 font-medium">{t(locale, "options.colMin")}</th>
                  <th className="py-1 px-2 font-medium">{t(locale, "options.colMax")}</th>
                  <th className="py-1 px-2 font-medium">{t(locale, "options.colUnitValue")}</th>
                  {optResources.map((resource) => (
                    <th key={resource.id} className="py-1 px-2 font-medium">
                      {formatMessage(locale, "options.perUnit", { unit: resource.unit })}
                    </th>
                  ))}
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {optOptions.map((option) => (
                  <tr key={option.id}>
                    <td className="py-1 pr-2">
                      <input
                        value={option.label}
                        onChange={(event) => updateOptimizationOption(option.id, { label: event.target.value })}
                        className="w-40 rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-sm"
                        aria-label={t(locale, "options.allocationName")}
                      />
                    </td>
                    <td className="py-1 px-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={option.minUnits}
                        onChange={(event) => updateOptimizationOption(option.id, { minUnits: Number(event.target.value) })}
                        className="w-16 rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1 px-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={option.maxUnits}
                        onChange={(event) => updateOptimizationOption(option.id, { maxUnits: Number(event.target.value) })}
                        className="w-16 rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1 px-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={option.valuePerUnit}
                        onChange={(event) => updateOptimizationOption(option.id, { valuePerUnit: Number(event.target.value) })}
                        className="w-28 rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-sm"
                      />
                    </td>
                    {optResources.map((resource) => (
                      <td key={resource.id} className="py-1 px-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={option.resourcesPerUnit[resource.id] ?? 0}
                          onChange={(event) =>
                            updateOptimizationOption(option.id, {
                              resourcesPerUnit: {
                                ...option.resourcesPerUnit,
                                [resource.id]: Number(event.target.value),
                              },
                            })
                          }
                          className="w-24 rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1 text-sm"
                        />
                      </td>
                    ))}
                    <td className="py-1">
                      <button
                        onClick={() => setOptOptions((list) => list.filter((item) => item.id !== option.id))}
                        disabled={optOptions.length <= 1}
                        className="text-xs text-abys-muted hover:text-abys-critical disabled:opacity-30"
                      >
                        {t(locale, "options.remove")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => void optimize()}
            disabled={optBusy || optOptions.length === 0}
            className="mt-4 text-sm rounded-full bg-abys-navy text-white px-5 py-2 hover:opacity-90 disabled:opacity-40"
          >
            {optBusy ? t(locale, "options.optimizing") : t(locale, "options.optimize")}
          </button>
          {optimization && (
            <div className="mt-4 rounded-xl border border-abys-accent/25 bg-white/70 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-abys-ink">
                  {optimization.status === "optimal"
                    ? t(locale, "options.statusOptimal")
                    : optimization.status === "feasible"
                      ? t(locale, "options.statusFeasible")
                      : t(locale, "options.statusInfeasible")}
                </p>
                <span className="rounded-full bg-abys-accent-soft px-2 py-0.5 text-[10px] text-abys-accent">
                  {optimization.objective.label}:{" "}
                  {optimization.objectiveValue.toLocaleString(locale)} {optimization.objective.unit}
                </span>
              </div>
              {optimization.status === "infeasible" ? (
                <div className="text-[11px] text-abys-warning">
                  {optimization.infeasibility.map((item) => (
                    <p key={item.resourceId}>
                      {formatMessage(locale, "options.infeasibleLine", {
                        resource: item.resourceId,
                        required: item.required.toLocaleString(locale),
                        capacity: item.capacity.toLocaleString(locale),
                      })}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {optimization.allocations.map((allocation) => (
                    <p key={allocation.optionId} className="text-[11px] text-abys-muted">
                      {formatMessage(locale, "options.allocationLine", {
                        label: allocation.label,
                        units: allocation.units,
                        value: allocation.value.toLocaleString(locale),
                        unit: optimization.objective.unit,
                      })}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-abys-muted">{optimization.note}</p>
              <p className="text-[10px] text-abys-muted">
                {formatMessage(locale, "options.methodLine", {
                  method: optimization.method,
                  nodes: optimization.nodesExplored.toLocaleString(locale),
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
