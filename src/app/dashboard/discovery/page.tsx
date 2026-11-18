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
  catalog: { id: string; label: string; version: number; subsectors: number; kpis: number }[];
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

export default function DiscoveryPage() {
  const [data, setData] = useState<Discovery | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/discovery", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Keşif analizi yüklenemedi (HTTP ${res.status}).`);
        if (!cancelled) setData(body as Discovery);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Keşif analizi yüklenemedi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
