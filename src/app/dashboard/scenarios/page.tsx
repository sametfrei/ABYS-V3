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
interface RunResult {
  runs: { name: string; inputs: Record<string, number>; results: { label: string; value: number; unit: string }[] }[];
  sensitivity: { variable: string; effect: string }[];
  provenance: { formulaText: string; limitations: string[]; engine: string; calculatedAt: string; note: string };
  scenarioId: string | null;
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
    setName(t.label);
  }

  async function run(save: boolean) {
    if (!selected || !sectorId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId, templateId: selected.id, inputs, save, name }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Senaryo çalıştırılamadı.");
        return;
      }
      setError(null);
      setResult(j);
    } finally {
      setBusy(false);
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
