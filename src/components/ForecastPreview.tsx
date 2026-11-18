"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LabelRow {
  label: string;
  numericPoints: number;
  forecastable: boolean;
}

interface Preview {
  label: string;
  horizon: number;
  p50: number;
  p10: number;
  p90: number;
  model: string;
  evidence: string;
}

const PREFERRED = "Haftalık fırsat hacmi (AZN)";

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

/**
 * Yönetim Merkezi'nde öngörü önizlemesi — gerçek `/api/forecast` ve
 * `/api/anomalies` uçlarına bağlanır. Veri yoksa hiçbir şey göstermez
 * (sahte ölçü/yer tutucu yok).
 */
export function ForecastPreview() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [anomalyLabels, setAnomalyLabels] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const labelsRes = await fetch("/api/forecast", { cache: "no-store" });
        if (!labelsRes.ok) return;
        const labelsBody = (await labelsRes.json()) as { labels: LabelRow[] };
        const candidates = labelsBody.labels.filter((l) => l.forecastable && l.numericPoints >= 6);
        if (candidates.length === 0) return;
        const label = candidates.find((l) => l.label === PREFERRED) ?? candidates[0];

        const res = await fetch(`/api/forecast?label=${encodeURIComponent(label.label)}&horizon=1`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          forecast: {
            horizon: number;
            points: { value: number; p10: number; p90: number }[];
            model: string;
            evidence: string;
          } | null;
        };
        const point = body.forecast?.points[0];
        if (cancelled || !point) return;
        setPreview({
          label: label.label,
          horizon: body.forecast?.horizon ?? 1,
          p50: point.value,
          p10: point.p10,
          p90: point.p90,
          model: body.forecast?.model ?? "",
          evidence: body.forecast?.evidence ?? "low",
        });
      } catch {
        // Sessiz: önizleme yardımcı bilgidir, ana ekranı bozmaz.
      }
    })();

    (async () => {
      try {
        const res = await fetch("/api/anomalies", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { flaggedLabels: number };
        if (!cancelled) setAnomalyLabels(body.flaggedLabels ?? 0);
      } catch {
        // Sessiz.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!preview) return null;

  return (
    <div className="mb-6 rounded-xl border border-abys-accent/25 bg-white/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] tracking-widest text-abys-accent font-semibold">ÖNGÖRÜ — GELECEK HAFTA</p>
        <Link href="/dashboard/forecast" className="text-[11px] text-abys-accent hover:underline">
          tahmin detayı →
        </Link>
      </div>
      <p className="text-sm text-abys-ink mt-1">{preview.label}</p>
      <p className="font-mono text-2xl text-abys-navy mt-0.5">
        {fmt(preview.p50)}
        <span className="text-sm text-abys-muted font-sans"> beklenen · aralık {fmt(preview.p10)}–{fmt(preview.p90)}</span>
      </p>
      <p className="text-[11px] text-abys-muted mt-1">
        {anomalyLabels > 0
          ? `Erken uyarı: ${anomalyLabels} seride sapma tespit edildi.`
          : "Erken uyarı: mevcut serilerde belirgin sapma yok."}
      </p>
    </div>
  );
}
