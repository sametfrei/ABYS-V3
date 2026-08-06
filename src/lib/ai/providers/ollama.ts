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
import {
  buildDiagnosisPrompt,
  buildOptionsPrompt,
  diagnosisJsonSchema,
  optionsJsonSchema,
  type AiDiagnosis,
  type AiOptionsResult,
} from "../decision-prompt";

/**
 * Yerel AI sağlayıcı: Ollama üzerinde çalışan açık kaynak model.
 * Veri hiçbir dış servise gitmez — kota yok, istek limiti yok.
 * OLLAMA_URL ve OLLAMA_MODEL env değişkenleriyle yapılandırılır.
 */

const BASE_URL = () => process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = () => process.env.OLLAMA_MODEL || "qwen3:4b-instruct";

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

interface ChatOptions {
  prompt: string;
  schema?: object;
  maxTokens?: number;
}

async function chat({ prompt, schema, maxTokens }: ChatOptions): Promise<string> {
  let res: Response;
  try {
    // stream: true şart — Node fetch (undici) yanıt başlıklarını 300 sn içinde
    // bekler; CPU üzerinde uzun üretimlerde stream'siz istek "fetch failed" ile düşer.
    res = await fetch(`${BASE_URL()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL(),
        messages: [{ role: "user", content: prompt }],
        stream: true,
        format: schema,
        // think:false ZORUNLU — qwen3 bir "thinking" modelidir ve varsayılan
        // olarak düşünme token'ları üretir. Bu token'lar message.content'e
        // yazılmaz ama num_predict bütçesinden harcanır: model bütçeyi
        // düşünerek bitirir ve İÇERİK ÜRETMEDEN durur (done_reason=length,
        // content uzunluğu 0). Belirti: "Yerel AI boş yanıt döndürdü".
        // 2026-07-20'de ölçüldü: manufacturing teşhis çağrısı think açıkken
        // 2048 token harcayıp 0 karakter, think:false ile 1790 karakter
        // geçerli JSON üretti. Uzun/karmaşık promptlarda (genişletilmiş sektör
        // bilgi paketleri) düşünme uzadığı için önce o sektörler düşüyordu.
        think: false,
        keep_alive: "30m",
        options: {
          temperature: 0.2,
          num_ctx: 8192,
          num_predict: maxTokens ?? 4096,
        },
      }),
      signal: AbortSignal.timeout(1_800_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timeout") || msg.includes("Timeout")) {
      throw new Error("Yerel AI yanıtı zaman aşımına uğradı. Model CPU üzerinde çalışıyor; daha kısa veri girin ya da tekrar deneyin.");
    }
    throw new Error(
      `Yerel AI motoruna (Ollama, ${BASE_URL()}) ulaşılamadı. Ollama'nın çalıştığından emin olun: ${msg}`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404 && body.includes("not found")) {
      throw new Error(
        `Yerel model "${MODEL()}" bulunamadı. Terminalde şunu çalıştırın: ollama pull ${MODEL()}`
      );
    }
    throw new Error(`Yerel AI hatası (${res.status}): ${body.slice(0, 300)}`);
  }

  if (!res.body) {
    throw new Error("Yerel AI yanıt gövdesi boş.");
  }

  // NDJSON stream'ini oku: her satır {"message":{"content":"..."},"done":false}
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const chunk = JSON.parse(trimmed) as { message?: { content?: string }; error?: string };
        if (chunk.error) throw new Error(`Yerel AI hatası: ${chunk.error}`);
        text += chunk.message?.content ?? "";
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Yerel AI")) throw err;
        // yarım satır — buffer'da birikmeye devam eder
      }
    }
  }
  if (buffer.trim()) {
    try {
      const chunk = JSON.parse(buffer.trim()) as { message?: { content?: string } };
      text += chunk.message?.content ?? "";
    } catch {
      // son satır bozuksa mevcut metinle devam et
    }
  }

  if (!text.trim()) {
    throw new Error("Yerel AI boş yanıt döndürdü.");
  }
  return text;
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Şema dışına taşan metin olabilir; ilk JSON bloğunu ayıkla.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        // devam: kesilmiş JSON onarımına düş
      }
    }
    if (start >= 0) {
      const repaired = repairTruncatedJson(text.slice(start));
      if (repaired) return JSON.parse(repaired) as T;
    }
    throw new Error("Yerel AI geçerli JSON döndürmedi.");
  }
}

/**
 * Token limitine takılıp yarıda kesilen JSON'u onarır: son tamamlanmış
 * nesneye kadar geri sarar ve açık kalan dizi/nesneleri kapatır.
 */
function repairTruncatedJson(text: string): string | null {
  let cut = text.length;
  for (let attempt = 0; attempt < 30; attempt++) {
    cut = text.lastIndexOf("}", cut - 1);
    if (cut <= 0) return null;
    const prefix = text.slice(0, cut + 1);

    // String-farkındalıklı ayraç dengesi çıkar.
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let broken = false;
    for (const ch of prefix) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") {
        const open = stack.pop();
        if ((ch === "}" && open !== "{") || (ch === "]" && open !== "[")) {
          broken = true;
          break;
        }
      }
    }
    if (broken || inString) continue;

    const closers = stack
      .reverse()
      .map((c) => (c === "{" ? "}" : "]"))
      .join("");
    const candidate = prefix + closers;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // bir önceki '}' konumundan tekrar dene
    }
  }
  return null;
}

const briefingSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    problem: { type: "string" },
    action: { type: "string" },
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

Genel geçer laf kalabalığı yapma, girdide verilen bilgiye sadık kal. Türkçe yaz.

Senaryo:
"""
${scenario}
"""`;

  const text = await chat({ prompt, schema: briefingSchema, maxTokens: 600 });
  return parseJson<Briefing>(text);
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

Bu role, güne başlarken okuyacağı 3-4 cümlelik sakin ve somut bir günlük brifing yaz. Yukarıdaki gerçek bulgulara dayan, en kritik 1-2 noktayı öne çıkar, uydurma sayı ekleme. Sadece brifing metnini yaz, başka hiçbir şey ekleme. Türkçe yaz.`
    : `Sen ABYS Intelligence adlı bir yönetici karar-destek asistanısın.
Şirket: ${companyName}
Sektör: ${sectorLabel}
Rol: ${roleLabel} (odak: ${roleFocus})
Bu sektörde izlenen risk kategorileri: ${riskCategoryLabels.join(", ")}

Bu role, güne başlarken okuyacağı 3-4 cümlelik sakin ve somut bir günlük brifing yaz. Genel durumu özetle, gerçekçi ama uydurma sayısal detay kullanma (veri kaynağı henüz bağlı değil, bunu makul bir üslupla ifade et). Sadece brifing metnini yaz. Türkçe yaz.`;

  const text = await chat({ prompt, maxTokens: 800 });
  return text.trim();
}

const extractSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
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
Aşağıdaki serbest metni (rapor, e-posta, tutanak, tablo dökümü vb. olabilir) oku ve içindeki somut, yapılandırılmış alanları (tarih, tutar, miktar, isim, durum, KPI değeri gibi) çıkar. Alan bulamazsan boş liste dön, uydurma değer üretme. Türkçe yaz.

Metin:
"""
${rawText}
"""`;

  const text = await chat({ prompt, schema: extractSchema, maxTokens: 2048 });
  return parseJson<ExtractDataResult>(text);
}

const assessRiskSchema = {
  type: "object",
  properties: {
    assessments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoryId: { type: "string" },
          categoryLabel: { type: "string" },
          severity: { type: "string", enum: ["critical", "warning", "info", "healthy"] },
          explanation: { type: "string" },
          recommendedAction: { type: "string" },
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

Aşağıda gerçek, güncel operasyonel veri var. Bu veriye dayanarak YUKARIDAKİ HER KATEGORİ İÇİN bir değerlendirme üret: severity (critical/warning/info/healthy), açıklama (verideki somut sayılara referansla) ve önerilen aksiyon. Veride bir kategoriyle ilgili yeterli bilgi yoksa severity "info" ver ve bunu açıklamada belirt. Uydurma sayı kullanma. Türkçe yaz.

Veri:
"""
${data}
"""`;

  const text = await chat({ prompt, schema: assessRiskSchema, maxTokens: 2048 });
  const parsed = parseJson<{ assessments: RiskAssessment[] }>(text);
  return parsed.assessments;
}

async function requestDiagnosis(prompt: string): Promise<AiDiagnosis> {
  // Bütçe ÖLÇÜLEREK seçildi (2026-07-20), tahminle değil. Bol bütçe (4096)
  // verilip modelin doğal bitiş noktası ölçüldü:
  //   manufacturing teşhisi → 2964 token harcayıp done_reason=stop ile
  //   tamamladı, 1849 karakter geçerli JSON.
  // Eski 2048 bütçe gerçek ihtiyacın ~%70'iydi; bu yüzden büyük sektör bilgi
  // paketli senaryolarda JSON yarıda kesiliyor ve "Yerel AI geçerli JSON
  // döndürmedi" hatası alınıyordu. 4096 = ölçülen ihtiyaç + ~%38 pay.
  // Bütçe yalnızca ÜST sınırdır: model erken bitirirse token harcanmaz,
  // dolayısıyla küçük senaryolar bundan yavaşlamaz.
  const text = await chat({ prompt, schema: diagnosisJsonSchema, maxTokens: 4096 });
  return parseJson<AiDiagnosis>(text);
}

async function requestOptions(prompt: string): Promise<AiOptionsResult> {
  const text = await chat({ prompt, schema: optionsJsonSchema, maxTokens: 1536 });
  return parseJson<AiOptionsResult>(text);
}

async function analyzeDecisionCases(params: AnalyzeCasesParams): Promise<AiDecisionCase[]> {
  // İki aşamalı üretim: önce teşhis, sonra seçenekler. CPU'da tek büyük
  // çağrı yerine iki küçük çağrı, structured output'un alfabetik anahtar
  // sırasında token limitine takılıp options/severity/title'ı kesme riskini
  // yapısal olarak azaltır (bkz. buildDiagnosisPrompt/buildOptionsPrompt).
  const diagnosisPrompt = buildDiagnosisPrompt(params);
  let diagnosis: AiDiagnosis;
  try {
    diagnosis = await requestDiagnosis(diagnosisPrompt);
  } catch {
    try {
      diagnosis = await requestDiagnosis(diagnosisPrompt);
    } catch (err) {
      throw new Error(
        `Yerel AI teşhis üretimi iki denemede de başarısız oldu: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  const optionsPrompt = buildOptionsPrompt(params, diagnosis);
  let optionsResult: AiOptionsResult;
  try {
    optionsResult = await requestOptions(optionsPrompt);
  } catch {
    try {
      optionsResult = await requestOptions(optionsPrompt);
    } catch (err) {
      console.warn(
        `[ai-two-stage] seçenek üretimi iki denemede de başarısız oldu, options=[] ile devam ediliyor: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      optionsResult = { options: [], recommendedOptionRank: 0 };
    }
  }

  const merged: AiDecisionCase = {
    ...diagnosis,
    options: optionsResult.options ?? [],
    recommendedOptionRank: optionsResult.recommendedOptionRank ?? 0,
  };
  return [merged];
}

export const ollamaProvider: AiProvider = {
  id: "ollama",
  generateBriefing,
  generateDailyBriefing,
  extractData,
  assessRisk,
  analyzeDecisionCases,
};
