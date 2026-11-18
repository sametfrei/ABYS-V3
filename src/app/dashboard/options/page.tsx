"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";

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

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export default function OptionsPage() {
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
      setError(err instanceof Error ? err.message : "Değerlendirme başarısız.");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const labelById = new Map(options.map((o) => [o.id, o.label]));

  return (
    <div>
      <PageHeader
        eyebrow="KARAR SEÇENEKLERİ"
        title="Hangi seçenek,"
        accent="hangi ödünleşimle?"
        desc="Seçenekleri birden fazla kriterde puanlayın. Sonuç: ağırlıklı sıralama ve ağırlıktan bağımsız Pareto sınırı. Hiçbir seçenek tek doğru cevap olarak dayatılmaz."
      />

      <div className="px-10 pb-16 max-w-5xl space-y-6">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">KRİTERLER</p>
            <button onClick={addCriterion} className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft">
              + Kriter
            </button>
          </div>
          <ul className="space-y-2 list-none p-0 m-0">
            {criteria.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <input
                  value={c.label}
                  onChange={(e) => updateCriterion(c.id, { label: e.target.value })}
                  className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-1.5 min-w-[140px]"
                  aria-label="Kriter adı"
                />
                <select
                  value={c.direction}
                  onChange={(e) => updateCriterion(c.id, { direction: e.target.value as Direction })}
                  className="text-sm rounded-lg border border-abys-cream-border bg-white/70 px-2 py-1.5"
                  aria-label="Yön"
                >
                  <option value="maximize">Yüksek iyi</option>
                  <option value="minimize">Düşük iyi</option>
                </select>
                <label className="text-xs text-abys-muted flex items-center gap-1">
                  Ağırlık
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
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs tracking-widest text-abys-muted font-semibold">SEÇENEKLER</p>
            <button onClick={addOption} className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft">
              + Seçenek
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-abys-muted">
                <th className="py-1 pr-2 font-medium">Seçenek</th>
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
                      aria-label="Seçenek adı"
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
                        Sıfırla
                      </button>
                      <button
                        onClick={() => removeOption(o.id)}
                        disabled={options.length <= 2}
                        className="text-xs text-abys-muted hover:text-abys-critical disabled:opacity-30"
                      >
                        Kaldır
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
            {busy ? "Değerlendiriliyor…" : "Değerlendir"}
          </button>
        </div>

        {result && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
            <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">SONUÇ — AĞIRLIKLI SIRALAMA</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-abys-muted">
                  <th className="py-1 font-medium">#</th>
                  <th className="py-1 font-medium">Seçenek</th>
                  <th className="py-1 font-medium">Skor</th>
                  <th className="py-1 font-medium">Pareto</th>
                  <th className="py-1 font-medium">En güçlü / zayıf</th>
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
                          Baskın: {o.dominatedBy.map((id) => labelById.get(id) ?? id).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="py-1 font-mono">{o.weightedScore}</td>
                    <td className="py-1">{o.onParetoFrontier ? "Sınırda" : "—"}</td>
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
      </div>
    </div>
  );
}
