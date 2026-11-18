"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

interface LedgerOutcome {
  result: "improved" | "unchanged" | "worsened";
  note: string;
  lesson: string | null;
  recordedBy: string;
  recordedAt: string;
}

interface LedgerEntry {
  decisionId: string;
  title: string;
  severity: string;
  confidence: number;
  businessImpact: string | null;
  choice: string;
  decidedBy: string;
  decidedAt: string;
  outcome: LedgerOutcome | null;
}

interface Summary {
  totalDecisions: number;
  withOutcome: number;
  improved: number;
  unchanged: number;
  worsened: number;
}

const RESULT_LABEL: Record<LedgerOutcome["result"], string> = {
  improved: "İyileşti",
  unchanged: "Değişmedi",
  worsened: "Kötüleşti",
};

const RESULT_STYLE: Record<LedgerOutcome["result"], string> = {
  improved: "bg-abys-healthy-soft text-abys-healthy",
  unchanged: "bg-abys-cream text-abys-muted",
  worsened: "bg-abys-critical-soft text-abys-critical",
};

const CHOICE_LABEL: Record<string, string> = {
  accepted: "Kabul",
  rejected: "Ret",
  modified: "Değiştirilmiş",
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("tr-TR");
}

/** Decision Value Ledger — kararlar ve gerçekleşen sonuçları. Salt okunur. */
export default function DecisionLedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/decision-ledger", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) throw new Error("Bu sayfa için oturum gerekir.");
          if (res.status === 403) throw new Error("Karar geçmişini görüntüleme yetkiniz yok.");
          throw new Error(`Karar geçmişi yüklenemedi (HTTP ${res.status}).`);
        }
        const data = (await res.json()) as { summary?: Summary; entries?: LedgerEntry[] };
        if (cancelled) return;
        setSummary(data.summary ?? null);
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Yükleme başarısız.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="KARAR DEFTERİ"
        title="Ne karar verdik,"
        accent="ne oldu?"
        desc="Alınan kararlar ve kaydedilmiş sonuçları. Kurumsal öğrenme: hangi karar hangi koşulda işe yaradı."
      />

      <div className="px-10 pb-16 max-w-4xl">
        {loading ? (
          <p className="text-sm text-abys-muted" role="status">Yükleniyor…</p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-abys-muted">Henüz karar kaydı bulunmuyor.</p>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  ["Toplam karar", summary.totalDecisions],
                  ["Sonuçlanan", summary.withOutcome],
                  ["İyileşen", summary.improved],
                  ["Kötüleşen", summary.worsened],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3"
                  >
                    <p className="text-[11px] tracking-wide text-abys-muted uppercase">{label}</p>
                    <p className="font-serif text-2xl text-abys-navy">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}

            <ul className="space-y-2 list-none p-0 m-0">
              {entries.map((entry) => (
                <li
                  key={entry.decisionId}
                  className="rounded-xl border border-abys-cream-border bg-white/50 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-abys-ink">{entry.title}</p>
                      <p className="text-xs text-abys-muted mt-0.5">
                        {CHOICE_LABEL[entry.choice] ?? entry.choice} · {entry.decidedBy} ·{" "}
                        {formatDate(entry.decidedAt)} · güven %{entry.confidence}
                      </p>
                    </div>
                    {entry.outcome ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RESULT_STYLE[entry.outcome.result]}`}
                      >
                        {RESULT_LABEL[entry.outcome.result]}
                      </span>
                    ) : (
                      <span className="rounded-full bg-abys-cream px-2 py-0.5 text-[10px] text-abys-muted">
                        Sonuç bekliyor
                      </span>
                    )}
                  </div>

                  {entry.businessImpact && (
                    <p className="mt-2 text-xs text-abys-ink">
                      <span className="text-abys-muted">Beklenen etki: </span>
                      {entry.businessImpact}
                    </p>
                  )}
                  {entry.outcome && (
                    <div className="mt-2 text-xs text-abys-muted">
                      <p>
                        <span className="text-abys-ink">Sonuç: </span>
                        {entry.outcome.note}
                      </p>
                      {entry.outcome.lesson && (
                        <p className="mt-0.5">
                          <span className="text-abys-ink">Ders: </span>
                          {entry.outcome.lesson}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
