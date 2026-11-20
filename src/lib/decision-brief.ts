/**
 * Karar brifingi — birden fazla kanıt kaynağını tek, izlenebilir yönetici
 * özetinde birleştirir.
 *
 * Kural: burada hiçbir sayı veya iddia LLM tarafından üretilmez. Girdiler
 * zaten deterministik motorlardan (vaka kaydı, tahmin, anomali, nedensel
 * bağlantılar, geçmiş sonuçlar) gelir; bu modül yalnızca seçer, sıralar ve
 * güven düzeyini vaka kanıtı kapsamına göre hesaplar. Kurum genelindeki açık
 * sinyaller vaka kanıtı sayılmaz; ayrı bir "kurum bağlamı" bölümünde gösterilir.
 *
 * Korelasyon kanıt olarak sunulur, nedensellik olarak değil. Kanıt türleri
 * ve güvenilirlikleri açıkça etiketlenir.
 */

export type EvidenceReliability = "high" | "medium" | "low";

import {
  assessCausalEvidence,
  CAUSAL_EVIDENCE_LABELS,
  CAUSAL_METHOD_LABELS,
  causalRelationLabel,
  type CausalEvidenceLevel,
} from "./causal-evidence";

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
  /** İsteğe bağlı kanıt üst verisi; yoksa sınıflandırma temkinli kalır. */
  method?: string | null;
  sampleSize?: number | null;
  dataQuality?: string | null;
  uncertainty?: string | null;
}

export interface BriefOutcome {
  result: string;
  lesson: string | null;
}

export interface BriefInput {
  case: BriefCase;
  caseSignals: BriefSignal[];
  contextSignals: BriefSignal[];
  forecast: BriefForecast | null;
  anomalies: BriefAnomaly[];
  causal: BriefCausalLink[];
  outcomes: BriefOutcome[];
}

export interface BriefEvidence {
  source: "vaka" | "sinyal" | "bağlam" | "tahmin" | "anomali" | "nedensel" | "sonuç";
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
  /** Vakaya bağlanmamış, yalnızca kurum geneli bağlam sağlayan gözlemler. */
  context: BriefEvidence[];
  caveats: string[];
}

const RELIABILITY_ORDER: Record<EvidenceReliability, number> = { high: 3, medium: 2, low: 1 };

function briefReliability(level: CausalEvidenceLevel): EvidenceReliability {
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  return "low";
}

function clampConfidence(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function buildDecisionBrief(input: BriefInput): DecisionBrief {
  const { case: c, caseSignals, contextSignals, forecast, anomalies, causal, outcomes } = input;

  const evidence: BriefEvidence[] = [];
  for (const item of c.evidence ?? []) {
    const reliability: EvidenceReliability =
      item.reliability === "high" || item.reliability === "medium" || item.reliability === "low"
        ? item.reliability
        : "medium";
    evidence.push({ source: "vaka", summary: item.fact, reliability });
  }

  const severeCaseSignals = caseSignals.filter(
    (s) => s.severity === "critical" || s.severity === "high"
  );
  if (severeCaseSignals.length > 0) {
    evidence.push({
      source: "sinyal",
      summary: `Vakaya bağlı ${severeCaseSignals.length} kritik/yüksek sinyal: ${severeCaseSignals
        .slice(0, 3)
        .map((s) => s.title)
        .join(", ")}`,
      reliability: "medium",
    });
  }

  const severeContextSignals = contextSignals.filter(
    (s) => s.severity === "critical" || s.severity === "high"
  );
  const context: BriefEvidence[] = severeContextSignals.length
    ? [
        {
          source: "bağlam",
          summary: `Kurum genelinde ${severeContextSignals.length} kritik/yüksek açık sinyal: ${severeContextSignals
            .slice(0, 3)
            .map((s) => s.title)
            .join(", ")}. Bu sinyaller bu vakaya bağlanmadığı için vaka kanıtı sayılmadı.`,
          reliability: "low",
        },
      ]
    : [];

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

  const causalAssessments = causal.map((link) => ({ link, assessment: assessCausalEvidence(link) }));
  for (const { link, assessment } of causalAssessments) {
    const sample = assessment.sampleSize === null ? "n bilinmiyor" : `n=${assessment.sampleSize}`;
    const conclusion = assessment.causalConclusionSupported
      ? "nedensel çıkarım eşiğini karşılıyor"
      : "nedensel sonuç desteklenmiyor";
    evidence.push({
      source: "nedensel",
      summary: `${link.fromLabel} → ${link.toLabel} · ${causalRelationLabel(
        link.relationStatus
      )} · kanıt ${CAUSAL_EVIDENCE_LABELS[assessment.level]} (${assessment.score}/100) · ${
        CAUSAL_METHOD_LABELS[assessment.method]
      } · ${sample} · ${conclusion} · güven %${link.confidence}`,
      reliability: briefReliability(assessment.level),
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

  const coverage = [
    severeCaseSignals.length > 0,
    Boolean(forecast),
    anomalies.length > 0,
    causal.length > 0,
    outcomes.length > 0,
  ];
  const coverageScore = (coverage.filter(Boolean).length / coverage.length) * 100;
  const confidence = clampConfidence(c.confidence * 0.5 + coverageScore * 0.5);

  const confidenceRationale = [
    `Vaka güveni %${c.confidence}${c.confidenceRationale ? ` (${c.confidenceRationale})` : ""}.`,
    `Vaka kanıtı kapsamı: ${coverage.filter(Boolean).length}/5 kaynak türü mevcut.`,
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
  const unsupportedCausal = causalAssessments.filter(({ assessment }) => !assessment.causalConclusionSupported);
  if (unsupportedCausal.length > 0) {
    const correlationOnly = unsupportedCausal.some(
      ({ assessment }) => assessment.relationStatus === "observed_correlation"
    );
    caveats.push(
      correlationOnly
        ? "Gözlemlenen korelasyonlar nedensel sonuç olarak sunulmadı; yöntem ve veri kanıtı ayrıca değerlendirilmelidir."
        : "Bazı ilişkiler nedensel çıkarım eşiğini karşılamıyor; sonuçlar temkinli yorumlanmalıdır."
    );
  }
  if (context.length > 0) {
    caveats.push("Kurum bağlamı sinyalleri vaka ile açıkça ilişkilendirilmedi; karar kanıtına dahil edilmedi.");
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
    context,
    caveats,
  };
}
