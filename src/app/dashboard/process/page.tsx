"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

interface Transition {
  from: string;
  to: string;
  count: number;
  medianSeconds: number;
  p90Seconds: number;
}

interface MiningData {
  subjects: number;
  events: number;
  transitions: Transition[];
  bottlenecks: Transition[];
  medianCaseSeconds: number | null;
  startEvents: { type: string; count: number }[];
  evidence: "low" | "medium" | "high";
  note: string;
  window: { days: number; since: string };
  coverage: { read: number; used: number; withoutSubject: number };
  provenance: { engine: string; source: string; note: string };
}

const EVIDENCE_LABEL: Record<string, string> = {
  high: "Yüksek kanıt",
  medium: "Orta kanıt",
  low: "Düşük kanıt",
};

function dur(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} sa`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} dk`;
  return `${Math.round(seconds)} sn`;
}

export default function ProcessPage() {
  const [data, setData] = useState<MiningData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/process-mining?days=90", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Süreç verisi yüklenemedi (HTTP ${res.status}).`);
        if (!cancelled) setData(body as MiningData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Yükleme başarısız.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="SÜREÇ ZEKÂSI"
        title="Süreç gerçekte"
        accent="nasıl işliyor?"
        desc="Entegrasyon olay günlüğünden gözlenen akış: geçiş hacimleri, medyan/P90 süreler ve darboğazlar. Hedef model karşılaştırması yapılmadığı için sapma iddiası içermez."
      />

      <div className="px-10 pb-16 max-w-4xl space-y-5">
        {error && (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-sm text-abys-muted">Yükleniyor…</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Özne", data.subjects.toLocaleString("tr-TR")],
                ["Olay", data.events.toLocaleString("tr-TR")],
                ["Geçiş türü", data.transitions.length.toLocaleString("tr-TR")],
                ["Medyan vaka", data.medianCaseSeconds === null ? "—" : dur(data.medianCaseSeconds)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
                  <p className="text-[11px] tracking-wide text-abys-muted uppercase">{label}</p>
                  <p className="font-serif text-2xl text-abys-navy">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs tracking-widest text-abys-muted font-semibold">DARBOĞAZLAR (P90)</p>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-abys-muted">
                  {EVIDENCE_LABEL[data.evidence]}
                </span>
              </div>
              {data.bottlenecks.length === 0 ? (
                <p className="text-sm text-abys-muted">Darboğaz için yeterli geçiş verisi yok.</p>
              ) : (
                <ul className="space-y-1">
                  {data.bottlenecks.map((b) => (
                    <li key={`${b.from}->${b.to}`} className="text-sm text-abys-ink flex flex-wrap justify-between gap-2">
                      <span>
                        {b.from} → {b.to}
                      </span>
                      <span className="font-mono text-abys-muted">
                        medyan {dur(b.medianSeconds)} · P90 {dur(b.p90Seconds)} · {b.count} kez
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 overflow-x-auto">
              <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">GEÇİŞLER</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-abys-muted">
                    <th className="py-1 font-medium">Geçiş</th>
                    <th className="py-1 font-medium">Adet</th>
                    <th className="py-1 font-medium">Medyan</th>
                    <th className="py-1 font-medium">P90</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transitions.map((t) => (
                    <tr key={`${t.from}->${t.to}`} className="text-abys-ink">
                      <td className="py-1">
                        {t.from} → {t.to}
                      </td>
                      <td className="py-1 font-mono">{t.count}</td>
                      <td className="py-1 font-mono">{dur(t.medianSeconds)}</td>
                      <td className="py-1 font-mono">{dur(t.p90Seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5 text-xs text-abys-muted space-y-1">
              <p className="text-[11px] tracking-widest font-semibold">KAPSAM VE KAYNAK</p>
              <p>
                Pencere: son {data.window.days} gün · okunan {data.coverage.read} olay · kullanılan{" "}
                {data.coverage.used} · öznesiz (dışlanan) {data.coverage.withoutSubject}
              </p>
              <p>Motor: {data.provenance.engine} · Kaynak: {data.provenance.source}</p>
              <p>{data.note}</p>
              <p>{data.provenance.note}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
