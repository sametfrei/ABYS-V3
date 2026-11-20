/**
 * Nedensel kanıt kalibrasyonu — tamamen deterministik ve açıklanabilir.
 *
 * İlişki durumu tek başına nedensellik kanıtı değildir. Kanıt seviyesi;
 * çalışma yöntemi, örneklem büyüklüğü, veri kalitesi ve belirsizlik birlikte
 * değerlendirilerek hesaplanır. `observed_correlation` her koşulda düşük
 * kanıt olarak kalır ve nedensel sonuç için yeterli sayılmaz.
 */

export type CausalEvidenceLevel = "high" | "medium" | "low" | "insufficient";

export type CausalMethod =
  | "randomized_controlled_trial"
  | "quasi_experimental"
  | "difference_in_differences"
  | "instrumental_variable"
  | "regression_adjustment"
  | "observational"
  | "expert_judgment"
  | "unknown";

export type DataQualityLevel = "high" | "medium" | "low" | "unknown";
export type UncertaintyLevel = "low" | "medium" | "high" | "unknown";

export interface CausalEvidenceInput {
  relationStatus: string;
  confidence?: number;
  method?: string | null;
  sampleSize?: number | null;
  dataQuality?: string | null;
  uncertainty?: string | null;
}

export interface CausalEvidenceAssessment {
  level: CausalEvidenceLevel;
  score: number;
  causalConclusionSupported: boolean;
  relationStatus: string;
  method: CausalMethod;
  sampleSize: number | null;
  dataQuality: DataQualityLevel;
  uncertainty: UncertaintyLevel;
  reportedConfidence: number | null;
  reasons: string[];
  limitations: string[];
}

const METHOD_POINTS: Record<CausalMethod, number> = {
  randomized_controlled_trial: 55,
  quasi_experimental: 44,
  difference_in_differences: 40,
  instrumental_variable: 36,
  regression_adjustment: 24,
  observational: 8,
  expert_judgment: 16,
  unknown: 0,
};

const DATA_QUALITY_POINTS: Record<DataQualityLevel, number> = {
  high: 20,
  medium: 12,
  low: 2,
  unknown: 0,
};

const UNCERTAINTY_POINTS: Record<UncertaintyLevel, number> = {
  low: 10,
  medium: 0,
  high: -15,
  unknown: -8,
};

const EXPERIMENTAL_METHODS = new Set<CausalMethod>([
  "randomized_controlled_trial",
  "quasi_experimental",
  "difference_in_differences",
  "instrumental_variable",
]);

const METHOD_ALIASES: Record<string, CausalMethod> = {
  randomized_controlled_trial: "randomized_controlled_trial",
  randomized_controlled: "randomized_controlled_trial",
  rct: "randomized_controlled_trial",
  experiment: "randomized_controlled_trial",
  experimental: "randomized_controlled_trial",
  quasi_experimental: "quasi_experimental",
  quasi_experiment: "quasi_experimental",
  natural_experiment: "quasi_experimental",
  difference_in_differences: "difference_in_differences",
  diff_in_diff: "difference_in_differences",
  did: "difference_in_differences",
  instrumental_variable: "instrumental_variable",
  iv: "instrumental_variable",
  regression_adjustment: "regression_adjustment",
  regression: "regression_adjustment",
  observational: "observational",
  observation: "observational",
  expert_judgment: "expert_judgment",
  expert: "expert_judgment",
};

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeMethod(value: string | null | undefined): CausalMethod {
  return METHOD_ALIASES[normalizeToken(value)] ?? "unknown";
}

function normalizeDataQuality(value: string | null | undefined): DataQualityLevel {
  const token = normalizeToken(value);
  return token === "high" || token === "medium" || token === "low" ? token : "unknown";
}

function normalizeUncertainty(value: string | null | undefined): UncertaintyLevel {
  const token = normalizeToken(value);
  return token === "low" || token === "medium" || token === "high" ? token : "unknown";
}

function normalizeSampleSize(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function normalizeConfidence(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreSampleSize(sampleSize: number | null): number {
  if (sampleSize === null) return 0;
  if (sampleSize >= 200) return 20;
  if (sampleSize >= 100) return 18;
  if (sampleSize >= 30) return 14;
  if (sampleSize >= 10) return 7;
  return 0;
}

function levelFromScore(score: number): CausalEvidenceLevel {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  if (score >= 20) return "low";
  return "insufficient";
}

/**
 * Kanıt düzeyini hesaplar. Hiçbir alan tek başına yeterli değildir; özellikle
 * yüksek örneklem veya yüksek güven, zayıf bir tasarımı nedensel kanıta
 * dönüştürmez. Dönen tüm sayılar aynı girdi için aynıdır.
 */
export function assessCausalEvidence(input: CausalEvidenceInput): CausalEvidenceAssessment {
  const relationStatus = normalizeToken(input.relationStatus) || "unknown";
  const method = normalizeMethod(input.method);
  const sampleSize = normalizeSampleSize(input.sampleSize);
  const dataQuality = normalizeDataQuality(input.dataQuality);
  const uncertainty = normalizeUncertainty(input.uncertainty);
  const reportedConfidence = normalizeConfidence(input.confidence);
  const reasons: string[] = [];
  const limitations: string[] = [];

  let score = METHOD_POINTS[method];
  score += scoreSampleSize(sampleSize);
  score += DATA_QUALITY_POINTS[dataQuality];
  score += UNCERTAINTY_POINTS[uncertainty];

  if (method === "unknown") {
    limitations.push("Kanıt yöntemi belirtilmedi; ilişki durumu tek başına yeterli sayılmadı.");
  }
  if (sampleSize === null) {
    limitations.push("Örneklem büyüklüğü yok; kanıt yüksek seviyeye çıkarılamadı.");
  } else if (sampleSize < 10) {
    limitations.push(`Örneklem çok küçük (n=${sampleSize}); kanıt seviyesi sınırlandırıldı.`);
  } else if (sampleSize < 30) {
    limitations.push(`Küçük örneklem (n=${sampleSize}); yüksek kanıt için yetersiz.`);
  }
  if (dataQuality === "low" || dataQuality === "unknown") {
    limitations.push("Veri kalitesi düşük veya doğrulanmamış; nedensel çıkarım sınırlıdır.");
  }
  if (uncertainty === "high" || uncertainty === "unknown") {
    limitations.push("Belirsizlik yüksek veya değerlendirilmemiş; sonuç temkinli yorumlanmalı.");
  }

  if (relationStatus === "data_confirmed") {
    score += 5;
    reasons.push("İlişki veri ile doğrulanmış olarak işaretlenmiş.");
  } else if (relationStatus === "expert_confirmed") {
    score += 3;
    limitations.push("Uzman onayı tek başına deneysel nedensellik kanıtı değildir.");
  } else if (relationStatus === "observed_correlation") {
    score -= 20;
    limitations.push("Gözlemlenen korelasyon; nedensel sonuç için yeterli değildir.");
  } else if (relationStatus === "inferred") {
    limitations.push("Çıkarım aşamasındaki ilişki; doğrulanmış nedensellik değildir.");
  } else if (relationStatus === "disputed") {
    score -= 20;
    limitations.push("İlişki tartışmalı; karar kanıtı olarak kullanılmamalıdır.");
  } else {
    limitations.push("İlişki durumu tanınmadı; temkinli sınıflandırıldı.");
  }

  let cap = 100;
  if (relationStatus === "observed_correlation") cap = Math.min(cap, 24);
  if (relationStatus === "disputed") cap = Math.min(cap, 19);
  if (relationStatus === "inferred") cap = Math.min(cap, 44);
  if (relationStatus === "expert_confirmed") cap = Math.min(cap, 69);
  if (!EXPERIMENTAL_METHODS.has(method)) cap = Math.min(cap, 69);
  if (sampleSize === null) cap = Math.min(cap, 44);
  else if (sampleSize < 3) cap = Math.min(cap, 19);
  else if (sampleSize < 10) cap = Math.min(cap, 39);
  else if (sampleSize < 30) cap = Math.min(cap, 69);
  else if (sampleSize < 100) cap = Math.min(cap, 74);
  if (dataQuality === "low") cap = Math.min(cap, 44);
  if (dataQuality === "unknown") cap = Math.min(cap, 69);
  if (uncertainty === "high") cap = Math.min(cap, 39);
  if (uncertainty === "unknown") cap = Math.min(cap, 69);
  if (reportedConfidence !== null && reportedConfidence < 30) cap = Math.min(cap, 19);
  else if (reportedConfidence !== null && reportedConfidence < 60) cap = Math.min(cap, 69);

  score = Math.max(0, Math.min(cap, Math.round(score)));
  const level = levelFromScore(score);

  const causalConclusionSupported =
    relationStatus === "data_confirmed" &&
    EXPERIMENTAL_METHODS.has(method) &&
    sampleSize !== null &&
    sampleSize >= 30 &&
    dataQuality !== "low" &&
    dataQuality !== "unknown" &&
    uncertainty !== "high" &&
    uncertainty !== "unknown" &&
    level !== "insufficient" &&
    level !== "low";

  if (causalConclusionSupported) {
    reasons.push("Yöntem ve veri koşulları nedensel çıkarım için asgari eşiği karşılıyor.");
  } else {
    limitations.push("Nedensel sonuç için yöntem, örneklem ve veri kalitesi birlikte yeterli değil.");
  }

  return {
    level,
    score,
    causalConclusionSupported,
    relationStatus,
    method,
    sampleSize,
    dataQuality,
    uncertainty,
    reportedConfidence,
    reasons,
    limitations,
  };
}

export const CAUSAL_EVIDENCE_LABELS: Record<CausalEvidenceLevel, string> = {
  high: "yüksek",
  medium: "orta",
  low: "düşük",
  insufficient: "yetersiz",
};

export const CAUSAL_METHOD_LABELS: Record<CausalMethod, string> = {
  randomized_controlled_trial: "randomize kontrollü çalışma",
  quasi_experimental: "yarı deneysel çalışma",
  difference_in_differences: "farkların farkı",
  instrumental_variable: "araç değişken",
  regression_adjustment: "regresyon düzeltmesi",
  observational: "gözlemsel çalışma",
  expert_judgment: "uzman yargısı",
  unknown: "belirtilmemiş yöntem",
};

export function causalRelationLabel(relationStatus: string): string {
  switch (normalizeToken(relationStatus)) {
    case "observed_correlation":
      return "gözlemlenen korelasyon (nedensel sonuç değil)";
    case "inferred":
      return "çıkarım (doğrulanmamış)";
    case "expert_confirmed":
      return "uzman onaylı";
    case "data_confirmed":
      return "veri ile doğrulanmış";
    case "disputed":
      return "tartışmalı";
    default:
      return "durumu belirsiz ilişki";
  }
}
