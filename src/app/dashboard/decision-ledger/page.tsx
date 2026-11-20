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
  decisionState: string;
  execution: {
    actionId: string;
    title: string;
    owner: string;
    status: string;
    dueAt: string | null;
    progressNote: string | null;
    updatedAt: string;
    eventCount: number;
  } | null;
  expectedImpact: {
    value: number;
    low: number | null;
    high: number | null;
    currency: string;
    basis: string | null;
    assumptions: string[];
  } | null;
  actualImpact: {
    value: number;
    currency: string;
    measurementStart: string | null;
    measurementEnd: string | null;
    evidence: string | null;
  } | null;
  economicVariance: { amount: number; percent: number | null; currency: string } | null;
  outcome: LedgerOutcome | null;
}

interface Summary {
  totalDecisions: number;
  withOutcome: number;
  improved: number;
  unchanged: number;
  worsened: number;
  economics: {
    expectedValueCount: number;
    actualValueCount: number;
    reconciledCount: number;
    byCurrency: Array<{
      currency: string;
      expectedTotal: number;
      actualTotal: number;
      varianceTotal: number;
      expectedCount: number;
      actualCount: number;
      reconciledCount: number;
    }>;
  };
  learning: {
    rangeAccuracy: {
      evaluableCount: number;
      hitCount: number;
      missCount: number;
      missingRangeCount: number;
      currencyMismatchCount: number;
      hitRate: number | null;
    };
    confidenceBuckets: Array<{
      key: string;
      label: string;
      total: number;
      withOutcome: number;
      improvedRate: number | null;
      rangeEvaluable: number;
      rangeHitRate: number | null;
    }>;
    choices: {
      total: number;
      accepted: number;
      rejected: number;
      modified: number;
      other: number;
      acceptanceRate: number | null;
    };
  };
  calibration: {
    status: "measured" | "partial" | "insufficient_evidence";
    totalWithOutcome: number;
    threshold: number;
    note: string;
    buckets: Array<{
      key: string;
      label: string;
      statedConfidence: number;
      withOutcome: number;
      improvedRate: number | null;
      rangeHitRate: number | null;
      status: "measured" | "insufficient_evidence";
      gap: number | null;
      direction: "overconfident" | "aligned" | "underconfident" | null;
      adjustedConfidence: number | null;
      samplesNeeded: number;
    }>;
  };
  execution: {
    totalActions: number;
    open: number;
    inProgress: number;
    done: number;
    cancelled: number;
  };
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

const CALIBRATION_DIRECTION_LABEL: Record<string, string> = {
  overconfident: "Aşırı güvenli",
  aligned: "Tutarlı",
  underconfident: "Temkinli",
};

const CALIBRATION_DIRECTION_STYLE: Record<string, string> = {
  overconfident: "text-abys-critical",
  aligned: "text-abys-healthy",
  underconfident: "text-abys-warning",
};

const CHOICE_LABEL: Record<string, string> = {
  accepted: "Kabul",
  rejected: "Ret",
  modified: "Değiştirilmiş",
};

const DECISION_STATE_LABEL: Record<string, string> = {
  draft: "Taslak",
  under_review: "İnceleniyor",
  awaiting_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  in_execution: "Yürütmede",
  completed: "Tamamlandı",
  outcome_review: "Sonuç incelemesi",
  closed: "Kapandı",
};

const ACTION_STATUS_LABEL: Record<string, string> = {
  open: "Açık",
  in_progress: "Yürütülüyor",
  done: "Tamamlandı",
  cancelled: "İptal",
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("tr-TR");
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("tr-TR")} ${currency}`;
  }
}

function formatPercent(value: number | null): string {
  if (value === null) return "taban sıfır";
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;
}

function formatRate(value: number | null): string {
  if (value === null) return "örnek yok";
  return `${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;
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
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
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

                <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                      KARAR → YÜRÜTME BAĞLANTISI
                    </p>
                    <p className="text-[11px] text-abys-muted">
                      {summary.execution.totalActions} aksiyon · her geçiş değişmez olay kaydı taşır
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      ["Açık", summary.execution.open],
                      ["Yürütülüyor", summary.execution.inProgress],
                      ["Tamamlandı", summary.execution.done],
                      ["İptal", summary.execution.cancelled],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                        <p className="text-abys-muted">{label}</p>
                        <p className="mt-1 font-semibold text-abys-ink">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {summary.economics.byCurrency.length > 0 && (
                  <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                        SAYISAL EKONOMİK ETKİ
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {summary.economics.reconciledCount} mutabık karar · para birimleri ayrı toplanır
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {summary.economics.byCurrency.map((item) => (
                        <div
                          key={item.currency}
                          className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2"
                        >
                          <p className="text-xs font-semibold text-abys-ink">{item.currency}</p>
                          <p className="mt-1 text-[11px] text-abys-muted">
                            Beklenen {formatMoney(item.expectedTotal, item.currency)} · Gerçekleşen{" "}
                            {formatMoney(item.actualTotal, item.currency)}
                          </p>
                          <p
                            className={`mt-0.5 text-[11px] ${
                              item.varianceTotal >= 0 ? "text-abys-healthy" : "text-abys-critical"
                            }`}
                          >
                            Mutabık fark {formatMoney(item.varianceTotal, item.currency)} ·{" "}
                            {item.reconciledCount} çift
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                      KAPALI DÖNGÜ ÖĞRENME
                    </p>
                    <p className="text-[11px] text-abys-muted">
                      Öneri kabul oranı {formatRate(summary.learning.choices.acceptanceRate)} ·{" "}
                      {summary.learning.choices.total} karar
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">Aralık isabeti</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {formatRate(summary.learning.rangeAccuracy.hitRate)}
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {summary.learning.rangeAccuracy.hitCount} isabet ·{" "}
                        {summary.learning.rangeAccuracy.missCount} ıska
                      </p>
                    </div>
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">Aralık kapsamı</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {summary.learning.rangeAccuracy.evaluableCount} değerlendirilebilir
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {summary.learning.rangeAccuracy.missingRangeCount} aralıksız ·{" "}
                        {summary.learning.rangeAccuracy.currencyMismatchCount} para birimi farkı
                      </p>
                    </div>
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">Kabul / ret</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {summary.learning.choices.accepted} / {summary.learning.choices.rejected}
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        {summary.learning.choices.modified} değiştirilmiş
                      </p>
                    </div>
                    <div className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2">
                      <p className="text-abys-muted">Güven kovaları</p>
                      <p className="mt-1 font-semibold text-abys-ink">
                        {summary.learning.confidenceBuckets.length} kova
                      </p>
                      <p className="text-[11px] text-abys-muted">
                        Düşük örneklem açıkça gösterilir
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-abys-muted">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Güven</th>
                          <th className="py-1 pr-3 font-medium">Karar</th>
                          <th className="py-1 pr-3 font-medium">Sonuçlanan</th>
                          <th className="py-1 pr-3 font-medium">İyileşme</th>
                          <th className="py-1 pr-3 font-medium">Aralık isabeti</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.learning.confidenceBuckets.map((bucket) => (
                          <tr key={bucket.key} className="border-t border-abys-cream-border">
                            <td className="py-1 pr-3 text-abys-ink">{bucket.label}</td>
                            <td className="py-1 pr-3">{bucket.total}</td>
                            <td className="py-1 pr-3">{bucket.withOutcome}</td>
                            <td className="py-1 pr-3">
                              {formatRate(bucket.improvedRate)}{" "}
                              <span className="text-abys-muted">({bucket.withOutcome} örnek)</span>
                            </td>
                            <td className="py-1 pr-3">
                              {formatRate(bucket.rangeHitRate)}{" "}
                              <span className="text-abys-muted">({bucket.rangeEvaluable} örnek)</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-6 rounded-xl border border-abys-cream-border bg-abys-cream p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] tracking-widest text-abys-muted font-semibold">
                      GÜVEN KALİBRASYONU
                    </p>
                    <p className="text-[11px] text-abys-muted">
                      {summary.calibration.status === "insufficient_evidence"
                        ? `Kanıt yetersiz · kova başına en az ${summary.calibration.threshold} sonuç gerekir`
                        : `${summary.calibration.totalWithOutcome} sonuçlanan karardan türetildi`}
                    </p>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-abys-muted">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Güven</th>
                          <th className="py-1 pr-3 font-medium">Örnek</th>
                          <th className="py-1 pr-3 font-medium">Gözlenen iyileşme</th>
                          <th className="py-1 pr-3 font-medium">Değerlendirme</th>
                          <th className="py-1 pr-3 font-medium">Düzeltilmiş güven</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.calibration.buckets.map((bucket) => (
                          <tr key={bucket.key} className="border-t border-abys-cream-border">
                            <td className="py-1 pr-3 text-abys-ink">
                              %{bucket.statedConfidence} <span className="text-abys-muted">({bucket.label})</span>
                            </td>
                            <td className="py-1 pr-3">{bucket.withOutcome}</td>
                            <td className="py-1 pr-3">{formatRate(bucket.improvedRate)}</td>
                            <td className="py-1 pr-3">
                              {bucket.status === "measured" && bucket.direction ? (
                                <span className={CALIBRATION_DIRECTION_STYLE[bucket.direction]}>
                                  {CALIBRATION_DIRECTION_LABEL[bucket.direction]}
                                  {bucket.gap !== null && (
                                    <span className="text-abys-muted">
                                      {" "}(fark {(bucket.gap * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} puan)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-abys-muted">
                                  Kanıt yetersiz · {bucket.samplesNeeded} sonuç daha gerekli
                                </span>
                              )}
                            </td>
                            <td className="py-1 pr-3 text-abys-ink">
                              {bucket.adjustedConfidence === null ? "—" : `%${bucket.adjustedConfidence}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-[11px] text-abys-muted">{summary.calibration.note}</p>
                </div>
              </>
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

                  {entry.execution ? (
                    <div className="mt-2 rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-xs">
                      <p className="text-abys-ink">
                        <span className="text-abys-muted">Yürütme: </span>
                        {entry.execution.title} · {ACTION_STATUS_LABEL[entry.execution.status] ?? entry.execution.status}
                        <span className="text-abys-muted">
                          {" "}· {entry.execution.owner} · {entry.execution.eventCount} olay
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-abys-muted">
                        Karar durumu: {DECISION_STATE_LABEL[entry.decisionState] ?? entry.decisionState}
                        {entry.execution.dueAt && <> · Son tarih {formatDate(entry.execution.dueAt)}</>}
                        {entry.execution.progressNote && <> · Not: {entry.execution.progressNote}</>}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-abys-muted">
                      Yürütme kaydı yok · Karar durumu: {DECISION_STATE_LABEL[entry.decisionState] ?? entry.decisionState}
                    </p>
                  )}

                  {entry.businessImpact && (
                    <p className="mt-2 text-xs text-abys-ink">
                      <span className="text-abys-muted">Beklenen etki: </span>
                      {entry.businessImpact}
                    </p>
                  )}
                  {entry.expectedImpact && (
                    <div className="mt-2 rounded-lg border border-abys-cream-border bg-abys-cream/60 px-3 py-2 text-xs">
                      <p className="text-abys-ink">
                        <span className="text-abys-muted">Sayısal beklenti: </span>
                        {formatMoney(entry.expectedImpact.value, entry.expectedImpact.currency)}
                        {entry.expectedImpact.low !== null && entry.expectedImpact.high !== null && (
                          <span className="text-abys-muted">
                            {" "}· aralık {formatMoney(entry.expectedImpact.low, entry.expectedImpact.currency)} –{" "}
                            {formatMoney(entry.expectedImpact.high, entry.expectedImpact.currency)}
                          </span>
                        )}
                      </p>
                      {entry.expectedImpact.basis && (
                        <p className="mt-0.5 text-abys-muted">Dayanak: {entry.expectedImpact.basis}</p>
                      )}
                      {entry.expectedImpact.assumptions.length > 0 && (
                        <p className="mt-0.5 text-abys-muted">
                          Varsayımlar: {entry.expectedImpact.assumptions.join("; ")}
                        </p>
                      )}
                      {entry.actualImpact && (
                        <p className="mt-1 text-abys-ink">
                          <span className="text-abys-muted">Gerçekleşen: </span>
                          {formatMoney(entry.actualImpact.value, entry.actualImpact.currency)}
                          {entry.economicVariance && (
                            <span
                              className={
                                entry.economicVariance.amount >= 0
                                  ? " text-abys-healthy"
                                  : " text-abys-critical"
                              }
                            >
                              {" "}· fark {formatMoney(entry.economicVariance.amount, entry.economicVariance.currency)} (
                              {formatPercent(entry.economicVariance.percent)})
                            </span>
                          )}
                        </p>
                      )}
                      {entry.actualImpact && !entry.economicVariance && (
                        <p className="mt-1 text-[11px] text-abys-muted">
                          Fark hesaplanmadı: beklenen ve gerçekleşen para birimi farklı.
                        </p>
                      )}
                      {entry.actualImpact?.evidence && (
                        <p className="mt-0.5 text-abys-muted">Kanıt: {entry.actualImpact.evidence}</p>
                      )}
                    </div>
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
