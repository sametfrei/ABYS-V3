/**
 * Karar brifingi — birden fazla kanıt kaynağını tek, izlenebilir yönetici
 * özetinde birleştirir.
 *
 * Kural: burada hiçbir sayı veya iddia LLM tarafından üretilmez. Girdiler
 * zaten deterministik motorlardan (vaka kaydı, sinyaller, tahmin, anomali,
 * nedensel bağlantılar, geçmiş sonuçlar) gelir; bu modül yalnızca seçer,
 * sıralar ve güven düzeyini kanıt kapsamına göre hesaplar.
 *
 * Korelasyon kanıt olarak sunulur, nedensellik olarak değil. Kanıt türleri
 * ve güvenilirlikleri açıkça etiketlenir.
 */

export type EvidenceReliability = "high" | "medium" | "low";

export interface BriefCase {
  title: string;
  severity: string;
  confidence: number;
  businessImpact: string;
  confidenceRationale: string;
  evidence: { fact: string; reliability: string }[];
  assumptions: string[];
  options: {
    label: string;
    description?: string;
    projection?: string;
    impact?: string;
    risk?: string;
  }[];
  recommendedOptionRank: number;
}

export interface BriefSignal {
  severity: string;
  title: string;
}

export interface BriefForecast {
  label: string;
  model: string;
  evidence: string;
  p10: number;
  p50: number;
  p90: number;
  horizon: number;
  unit: string;
}

export interface BriefAnomaly {
  score: number;
  direction: "above" | "below";
  timestamp: string | null;
}

export interface BriefCausalLink {
  fromLabel: string;
  toLabel: string;
  relationStatus: string;
  confidence: number;
}

export interface BriefOutcome {
  result: string;
  lesson: string | null;
}

export interface BriefInput {
  case: BriefCase;
  signals: BriefSignal[];
  forecast: BriefForecast | null;
  anomalies: BriefAnomaly[];
  causal: BriefCausalLink[];
  outcomes: BriefOutcome[];
}

export interface BriefEvidence {
  source: "vaka" | "sinyal" | "tahmin" | "anomali" | "nedensel" | "sonuç";
  summary: string;
  reliability: EvidenceReliability;
}

export interface DecisionBrief {
  headline: string;
  whyItMatters: string;
  whatNext: string;
  recommendation: { label: string; rationale: string; expected: string | null } | null;
  confidence: number;
  confidenceRationale: string[];
  evidence: BriefEvidence[];
  caveats: string[];
}

const RELIABILITY_ORDER: Record<EvidenceReliability, number> = { high: 3, medium: 2, low: 1 };

function clampConfidence(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function buildDecisionBrief(input: BriefInput): DecisionBrief {
  const { case: c, signals, forecast, anomalies, causal, outcomes } = input;

  const evidence: BriefEvidence[] = [];
  for (const item of c.evidence ?? []) {
    const reliability: EvidenceReliability =
      item.reliability === "high" || item.reliability === "medium" || item.reliability === "low"
        ? item.reliability
        : "medium";
    evidence.push({ source: "vaka", summary: item.fact, reliability });
  }

  const severeSignals = signals.filter((s) => s.severity === "critical" || s.severity === "high");
  if (severeSignals.length > 0) {
    evidence.push({
      source: "sinyal",
      summary: `${severeSignals.length} kritik/yüksek açık sinyal: ${severeSignals
        .slice(0, 3)
        .map((s) => s.title)
        .join(", ")}`,
      reliability: "medium",
    });
  }

  if (forecast) {
    evidence.push({
      source: "tahmin",
      summary: `${forecast.label}: ${forecast.model} modeli, +${forecast.horizon} dönem beklenen ${forecast.p50} ${forecast.unit} (P10–P90: ${forecast.p10}–${forecast.p90})`,
      reliability: forecast.evidence === "high" ? "high" : forecast.evidence === "medium" ? "medium" : "low",
    });
  }

  if (anomalies.length > 0) {
    const latest = anomalies[anomalies.length - 1];
    evidence.push({
      source: "anomali",
      summary: `${forecast?.label ?? "KPI serisinde"} sapma: skor ${latest.score} (${
        latest.direction === "above" ? "üst yönde" : "alt yönde"
      })${latest.timestamp ? ` · ${latest.timestamp}` : ""}`,
      reliability: "medium",
    });
  }

  for (const link of causal) {
    evidence.push({
      source: "nedensel",
      summary: `${link.fromLabel} → ${link.toLabel} · ${link.relationStatus} · güven %${link.confidence}`,
      reliability: link.relationStatus === "data_confirmed" || link.relationStatus === "expert_confirmed" ? "high" : "low",
    });
  }

  const failed = outcomes.filter((o) => o.result === "worsened").length;
  const improved = outcomes.filter((o) => o.result === "improved").length;
  if (outcomes.length > 0) {
    const lesson = outcomes.find((o) => o.lesson)?.lesson;
    evidence.push({
      source: "sonuç",
      summary: `Geçmiş ${outcomes.length} sonucun ${improved} iyileşme, ${failed} kötüleşme${
        lesson ? ` · ders: ${lesson}` : ""
      }`,
      reliability: "high",
    });
  }

  const coverage = [severeSignals.length > 0, Boolean(forecast), anomalies.length > 0, causal.length > 0, outcomes.length > 0];
  const coverageScore = (coverage.filter(Boolean).length / coverage.length) * 100;
  const confidence = clampConfidence(c.confidence * 0.5 + coverageScore * 0.5);

  const confidenceRationale = [
    `Vaka güveni %${c.confidence}${c.confidenceRationale ? ` (${c.confidenceRationale})` : ""}.`,
    `Kanıt kapsamı: ${coverage.filter(Boolean).length}/5 kaynak türü mevcut.`,
    forecast
      ? `Tahmin kanıt düzeyi: ${forecast.evidence}.`
      : "Bu vaka için bağlı KPI tahmini yok; gelecek projeksiyonu sınırlı.",
  ];

  const caveats: string[] = [];
  if (!forecast) {
    caveats.push("Sayısal gelecek projeksiyonu yok: vaka verisine `metricLabel` bağlanmadığı için tahmin üretilmedi.");
  }
  if (anomalies.length > 0) {
    caveats.push("Anomali skoru istatistiksel bir sinyaldir; tek başına neden göstermez.");
  }
  if (causal.length === 0) {
    caveats.push("Kanıtlanmış nedensel bağlantı yok; neden-sonuç iddiası kurulmadı.");
  }
  caveats.push("Güven skoru kanıt kapsamına göre hesaplanır; yeni veri geldikçe değişir.");

  const recommendedIdx = Math.max(0, (c.recommendedOptionRank ?? 1) - 1);
  const option = c.options?.[recommendedIdx] ?? c.options?.[0] ?? null;
  const recommendation = option
    ? {
        label: option.label,
        rationale:
          option.description ??
          "Vaka kaydında bu seçenek önerilen sırada işaretlendi; ayrıntı için seçenekler bölümüne bakın.",
        expected: option.projection ?? option.impact ?? null,
      }
    : null;

  const severityLabel =
    c.severity === "critical" ? "Kritik" : c.severity === "warning" || c.severity === "high" ? "Yüksek" : "Dikkat";

  const whyParts = [c.businessImpact];
  if (forecast) {
    whyParts.push(
      `${forecast.label} için beklenen değer ${forecast.p50} ${forecast.unit}; kötü senaryo (P90) ${forecast.p90} ${forecast.unit}.`
    );
  }
  if (severeSignals.length > 0) {
    whyParts.push(`${severeSignals.length} kritik/yüksek sinyal bu konuyu destekliyor.`);
  }

  return {
    headline: `${severityLabel}: ${c.title}`,
    whyItMatters: whyParts.join(" "),
    whatNext: forecast
      ? `Önümüzdeki ${forecast.horizon} dönem için ${forecast.model} modelinin aralığı ${forecast.p10}–${forecast.p90} ${forecast.unit}.`
      : "Gelecek projeksiyonu için yeterli bağlı veri yok.",
    recommendation,
    confidence,
    confidenceRationale,
    evidence: evidence.sort((a, b) => RELIABILITY_ORDER[b.reliability] - RELIABILITY_ORDER[a.reliability]),
    caveats,
  };
}
