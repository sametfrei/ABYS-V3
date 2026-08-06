export interface Briefing {
  status: string;
  problem: string;
  action: string;
}

export interface BriefingParams {
  roleLabel: string;
  roleFocus: string;
  scenario: string;
}

export interface DailyBriefingParams {
  companyName: string;
  sectorLabel: string;
  roleLabel: string;
  roleFocus: string;
  riskCategoryLabels: string[];
  realFindings?: string;
}

export interface ExtractedField {
  label: string;
  value: string;
}

export interface ExtractDataParams {
  rawText: string;
  sectorLabel: string;
}

export interface ExtractDataResult {
  summary: string;
  fields: ExtractedField[];
}

export type AssessedSeverity = "critical" | "warning" | "info" | "healthy";

export interface RiskAssessment {
  categoryId: string;
  categoryLabel: string;
  severity: AssessedSeverity;
  explanation: string;
  recommendedAction: string;
}

export interface AssessRiskParams {
  sectorLabel: string;
  riskCategories: { id: string; label: string; sources: string[] }[];
  data: string;
}

export interface AiEvidenceItem {
  source: string;
  fact: string;
  reliability: "verified" | "estimated" | "unknown";
}

export interface AiCounterfactual {
  narrative: string;
  projectedImpact: string;
  timeHorizon: string;
}

export interface AiActionOption {
  title: string;
  detail: string;
  feasible: boolean;
  feasibilityNote: string;
  tradeoffs: string;
  expectedOutcome: string;
  rank: number;
}

export interface AiDecisionCase {
  categoryId: string;
  categoryLabel: string;
  severity: AssessedSeverity;
  title: string;
  businessImpact: string;
  confidence: number;
  confidenceRationale: string;
  evidence: AiEvidenceItem[];
  assumptions: string[];
  historicalComparison: string;
  counterfactual: AiCounterfactual;
  options: AiActionOption[];
  recommendedOptionRank: number;
}

export interface AnalyzeCasesParams {
  sectorLabel: string;
  riskCategories: { id: string; label: string; sources: string[] }[];
  constraints: string;
  decisionMemory: string;
  /** Sektör bilgi paketi: eşikler, katsayılar, kodda hesaplanmış referans değerler. */
  domainKnowledge: string;
  data: string;
}

export interface AiProvider {
  id: string;
  generateBriefing(params: BriefingParams): Promise<Briefing>;
  generateDailyBriefing(params: DailyBriefingParams): Promise<string>;
  extractData(params: ExtractDataParams): Promise<ExtractDataResult>;
  assessRisk(params: AssessRiskParams): Promise<RiskAssessment[]>;
  analyzeDecisionCases(params: AnalyzeCasesParams): Promise<AiDecisionCase[]>;
}

/**
 * AI çalıştırma politikası — kurumsal veri gizliliğinin çekirdek kuralı.
 *
 * LOCAL_ONLY (varsayılan): Sadece Ollama. Yerel model ayakta değilse NET
 *   operasyonel hata döner; hiçbir prompt/veri buluta SESSİZCE gönderilmez.
 * CLOUD_ALLOWED: Önce yerel model; yerel yoksa buluta (Gemini) düşebilir.
 *   Bu, yönetici tarafından .env ile verilmiş AÇIK bir karardır ve her bulut
 *   kullanımı sunucu loguna yazılır; providerId yanıtla birlikte UI'a gider.
 * CLOUD_ONLY: Sadece bulut (Gemini) — demo/hızlı sonuç senaryosu için.
 *
 * Eski AI_PROVIDER değişkeni geriye dönük desteklenir:
 * ollama→LOCAL_ONLY, auto→CLOUD_ALLOWED, gemini→CLOUD_ONLY.
 */
export type AiPolicy = "LOCAL_ONLY" | "CLOUD_ALLOWED" | "CLOUD_ONLY" | "DEMO_DETERMINISTIC";

function activePolicy(): AiPolicy {
  const p = (process.env.AI_POLICY || "").toUpperCase();
  if (p === "LOCAL_ONLY" || p === "CLOUD_ALLOWED" || p === "CLOUD_ONLY" || p === "DEMO_DETERMINISTIC") return p;
  // Geriye dönük uyumluluk — eski değişken varsa politikaya çevir.
  switch (process.env.AI_PROVIDER) {
    case "gemini":
      return "CLOUD_ONLY";
    case "auto":
      return "CLOUD_ALLOWED";
    default:
      return "LOCAL_ONLY";
  }
}

async function localProvider(): Promise<AiProvider> {
  const { ollamaProvider } = await import("./providers/ollama");
  return ollamaProvider;
}

async function cloudProvider(): Promise<AiProvider> {
  const { geminiProvider } = await import("./providers/gemini");
  return geminiProvider;
}

export async function getActiveProvider(): Promise<AiProvider> {
  const policy = activePolicy();

  if (policy === "DEMO_DETERMINISTIC") {
    console.info("[ai-policy] DEMO_DETERMINISTIC: model çağrılmadı, deterministik çıktı üretiliyor.");
    const { deterministicProvider } = await import("./providers/deterministic");
    return deterministicProvider;
  }

  if (policy === "CLOUD_ONLY") {
    console.info("[ai-policy] CLOUD_ONLY: istek bulut sağlayıcıya (gemini) gidiyor.");
    return cloudProvider();
  }

  const { isOllamaAvailable } = await import("./providers/ollama");
  const localUp = await isOllamaAvailable();

  if (localUp) return localProvider();

  if (policy === "CLOUD_ALLOWED") {
    console.warn(
      "[ai-policy] CLOUD_ALLOWED: yerel model kapalı, istek BULUT sağlayıcıya (gemini) yönlendirildi. Bu geçiş yönetici politikasıyla açıktır."
    );
    return cloudProvider();
  }

  // LOCAL_ONLY: sessiz bulut geçişi YOK — net hata dön.
  throw new Error(
    "Yerel AI motoru (Ollama) çalışmıyor ve kurum politikası LOCAL_ONLY. Veri gizliliği gereği bulut sağlayıcıya geçilmedi. Ollama'yı başlatın ya da yönetici olarak AI_POLICY=CLOUD_ALLOWED ayarlayın."
  );
}
