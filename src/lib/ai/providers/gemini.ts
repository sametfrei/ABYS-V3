import { GoogleGenAI, Type } from "@google/genai";
import type {
  AiProvider,
  Briefing,
  BriefingParams,
  DailyBriefingParams,
  ExtractDataParams,
  ExtractDataResult,
  AssessRiskParams,
  RiskAssessment,
  AnalyzeCasesParams,
  AiDecisionCase,
} from "../provider";
import { buildDecisionCasesPrompt } from "../decision-prompt";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY tanımlı değil (.env.local dosyasına ekleyin).");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function friendlyError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || msg.includes("quota")) {
    return new Error(
      "Gemini ücretsiz plan günlük istek kotası doldu (günde 20 istek). Yarın tekrar deneyin ya da Google AI Studio'da faturalandırmayı etkinleştirin: https://ai.google.dev/gemini-api/docs/rate-limits"
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function generateContentSafe(
  ai: GoogleGenAI,
  args: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
) {
  let result;
  try {
    result = await ai.models.generateContent(args);
  } catch (err) {
    throw friendlyError(err);
  }
  const text = result.text ?? "";
  if (text.trimStart().startsWith('{"error"')) {
    throw friendlyError(text);
  }
  return result;
}

const briefingSchema = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, description: "Tek cümlelik güncel durum özeti." },
    problem: { type: Type.STRING, description: "Tek cümlelik, en kritik problemin nedeni." },
    action: { type: Type.STRING, description: "Tek cümlelik, önerilen somut aksiyon." },
  },
  required: ["status", "problem", "action"],
};

async function generateBriefing(params: BriefingParams): Promise<Briefing> {
  const { roleLabel, roleFocus, scenario } = params;

  const prompt = `Sen ABYS Intelligence adlı bir yönetici karar-destek asistanısın.
Rol: ${roleLabel}
Bu rolün odak alanı: ${roleFocus}

Aşağıda bu rolün girdiği ham durum/senaryo açıklaması var. Buna dayanarak, o rolün 3 saniyede okuyup karar verebileceği kısa ve net bir brifing üret:
- status: şu anda ne oluyor (tek cümle, somut)
- problem: bunun asıl nedeni ne (tek cümle, somut, varsa sayısal referans ver)
- action: şimdi ne yapılmalı (tek cümle, uygulanabilir, spesifik)

Genel geçer laf kalabalığı yapma, girdide verilen bilgiye sadık kal, varsayım yapman gerekiyorsa makul ve açık varsayımlar kullan.

Senaryo:
"""
${scenario}
"""`;

  const ai = getClient();
  const result = await generateContentSafe(ai, {
    model: "gemini-flash-latest",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: briefingSchema },
  });

  const text = result.text;
  if (!text) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }
  return JSON.parse(text) as Briefing;
}

async function generateDailyBriefing(params: DailyBriefingParams): Promise<string> {
  const { companyName, sectorLabel, roleLabel, roleFocus, riskCategoryLabels, realFindings } = params;

  const prompt = realFindings
    ? `Sen ABYS Intelligence adlı bir yönetici karar-destek asistanısın.
Şirket: ${companyName}
Sektör: ${sectorLabel}
Rol: ${roleLabel} (odak: ${roleFocus})

Aşağıda şirketin GERÇEK, güncel risk değerlendirmesi var:
"""
${realFindings}
"""

Bu role, güne başlarken okuyacağı 3-4 cümlelik sakin ve somut bir günlük brifing yaz. Yukarıdaki gerçek bulgulara dayan, en kritik 1-2 noktayı öne çıkar, uydurma sayı ekleme — sadece verilen bulgulara sadık kal. Türkçe yaz.`
    : `Sen ABYS Intelligence adlı bir yönetici karar-destek asistanısın.
Şirket: ${companyName}
Sektör: ${sectorLabel}
Rol: ${roleLabel} (odak: ${roleFocus})
Bu sektörde izlenen risk kategorileri: ${riskCategoryLabels.join(", ")}

Bu role, güne başlarken okuyacağı 3-4 cümlelik sakin ve somut bir günlük brifing yaz. Genel durumu özetle, varsa dikkat edilmesi gereken bir noktaya değin, gerçekçi ama uydurma sayısal detay kullanma (veri kaynağı henüz bağlı değil, bunu varsayımsal ama makul bir üslupla ifade et). Türkçe yaz.`;

  const ai = getClient();
  const result = await generateContentSafe(ai, {
    model: "gemini-flash-latest",
    contents: prompt,
  });

  const text = result.text;
  if (!text) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }
  return text.trim();
}

const extractSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "Metnin 1-2 cümlelik özeti." },
    fields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
        },
        required: ["label", "value"],
      },
    },
  },
  required: ["summary", "fields"],
};

async function extractData(params: ExtractDataParams): Promise<ExtractDataResult> {
  const { rawText, sectorLabel } = params;

  const prompt = `Sen ABYS Intelligence'ın veri çıkarım motorusun. Sektör: ${sectorLabel}.
Aşağıdaki serbest metni (rapor, e-posta, tutanak, tablo dökümü vb. olabilir) oku ve içindeki somut, yapılandırılmış alanları (tarih, tutar, miktar, isim, durum, KPI değeri gibi) çıkar. Alan bulamazsan boş liste dön, uydurma değer üretme.

Metin:
"""
${rawText}
"""`;

  const ai = getClient();
  const result = await generateContentSafe(ai, {
    model: "gemini-flash-latest",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: extractSchema },
  });

  const text = result.text;
  if (!text) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }
  return JSON.parse(text) as ExtractDataResult;
}

const assessRiskSchema = {
  type: Type.OBJECT,
  properties: {
    assessments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          categoryId: { type: Type.STRING },
          categoryLabel: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["critical", "warning", "info", "healthy"] },
          explanation: { type: Type.STRING, description: "Bu değerlendirmeye neden varıldığı, gerçek verilere referansla, tek-iki cümle." },
          recommendedAction: { type: Type.STRING, description: "Önerilen somut aksiyon, tek cümle." },
        },
        required: ["categoryId", "categoryLabel", "severity", "explanation", "recommendedAction"],
      },
    },
  },
  required: ["assessments"],
};

async function assessRisk(params: AssessRiskParams): Promise<RiskAssessment[]> {
  const { sectorLabel, riskCategories, data } = params;

  const categoriesDesc = riskCategories
    .map((rc) => `- ${rc.id} (${rc.label}): kaynak KPI'lar: ${rc.sources.join(", ")}`)
    .join("\n");

  const prompt = `Sen ABYS Intelligence'ın risk değerlendirme motorusun. Sektör: ${sectorLabel}.

Aşağıdaki risk kategorileri ve her birinin dayandığı KPI'lar tanımlı:
${categoriesDesc}

Aşağıda gerçek, güncel operasyonel veri var (CRM/sistem export'undan). Bu veriye dayanarak YUKARIDAKİ HER KATEGORİ İÇİN bir değerlendirme üret: severity (critical/warning/info/healthy), açıklama (verideki somut sayılara referansla) ve önerilen aksiyon. Veride bir kategoriyle ilgili yeterli bilgi yoksa severity "info" ver ve bunu açıklamada belirt. Uydurma sayı kullanma, sadece verilen veriye dayan.

Veri:
"""
${data}
"""`;

  const ai = getClient();
  const result = await generateContentSafe(ai, {
    model: "gemini-flash-latest",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: assessRiskSchema },
  });

  const text = result.text;
  if (!text) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }
  const parsed = JSON.parse(text) as { assessments: RiskAssessment[] };
  return parsed.assessments;
}

const decisionCasesSchema = {
  type: Type.OBJECT,
  properties: {
    cases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          categoryId: { type: Type.STRING },
          categoryLabel: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ["critical", "warning", "info", "healthy"] },
          title: { type: Type.STRING },
          businessImpact: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          confidenceRationale: { type: Type.STRING },
          evidence: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING },
                fact: { type: Type.STRING },
                reliability: { type: Type.STRING, enum: ["verified", "estimated", "unknown"] },
              },
              required: ["source", "fact", "reliability"],
            },
          },
          assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
          historicalComparison: { type: Type.STRING },
          counterfactual: {
            type: Type.OBJECT,
            properties: {
              narrative: { type: Type.STRING },
              projectedImpact: { type: Type.STRING },
              timeHorizon: { type: Type.STRING },
            },
            required: ["narrative", "projectedImpact", "timeHorizon"],
          },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                feasible: { type: Type.BOOLEAN },
                feasibilityNote: { type: Type.STRING },
                tradeoffs: { type: Type.STRING },
                expectedOutcome: { type: Type.STRING },
                rank: { type: Type.NUMBER },
              },
              required: ["title", "detail", "feasible", "feasibilityNote", "tradeoffs", "expectedOutcome", "rank"],
            },
          },
          recommendedOptionRank: { type: Type.NUMBER },
        },
        required: [
          "categoryId",
          "categoryLabel",
          "severity",
          "title",
          "businessImpact",
          "confidence",
          "confidenceRationale",
          "evidence",
          "assumptions",
          "historicalComparison",
          "counterfactual",
          "options",
          "recommendedOptionRank",
        ],
      },
    },
  },
  required: ["cases"],
};

async function analyzeDecisionCases(params: AnalyzeCasesParams): Promise<AiDecisionCase[]> {
  const prompt = buildDecisionCasesPrompt(params);

  const ai = getClient();
  const result = await generateContentSafe(ai, {
    model: "gemini-flash-latest",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: decisionCasesSchema },
  });

  const text = result.text;
  if (!text) {
    throw new Error("Gemini boş yanıt döndürdü.");
  }
  const parsed = JSON.parse(text) as { cases: AiDecisionCase[] };
  return parsed.cases ?? [];
}

export const geminiProvider: AiProvider = {
  id: "gemini",
  generateBriefing,
  generateDailyBriefing,
  extractData,
  assessRisk,
  analyzeDecisionCases,
};
