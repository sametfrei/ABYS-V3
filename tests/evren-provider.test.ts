import { afterEach, describe, expect, it, vi } from "vitest";
import { evrenProvider } from "../src/lib/ai/providers/evren";

function sseResponse(frames: unknown[]): Response {
  const body =
    frames
      .map((frame) =>
        frame === "[DONE]" ? "data: [DONE]\n\n" : `data: ${JSON.stringify(frame)}\n\n`
      )
      .join("") + "";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("EVREN provider", () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    EVREN_API_KEY: process.env.EVREN_API_KEY,
    EVREN_BASE_URL: process.env.EVREN_BASE_URL,
    EVREN_MODEL: process.env.EVREN_MODEL,
    EVREN_MAX_TOKENS: process.env.EVREN_MAX_TOKENS,
    AI_POLICY: process.env.AI_POLICY,
  };

  afterEach(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends ABYS instructions to EVREN and validates strict structured output", async () => {
    process.env.EVREN_API_KEY = "test-evren-key";
    process.env.EVREN_BASE_URL = "https://evren.example/v1";
    process.env.EVREN_MODEL = "deepseek-v4.1-flash";
    process.env.EVREN_MAX_TOKENS = "8192";

    const expected = {
      status: "ABYS verileri anlamlandırır.",
      problem: "Henüz işletme verisi sağlanmadı.",
      action: "Önce veri kaynaklarını bağla.",
    };
    let requestUrl = "";
    let requestHeaders: Headers | undefined;
    let requestBody: Record<string, unknown> | undefined;

    global.fetch = vi.fn(async (input, init) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return sseResponse([
        { choices: [{ delta: { reasoning: "Kısa değerlendirme." }, finish_reason: null }] },
        { choices: [{ delta: { content: JSON.stringify(expected) }, finish_reason: null }] },
        {
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 80,
            completion_tokens: 40,
            total_tokens: 120,
            completion_tokens_details: { reasoning_tokens: 8 },
          },
        },
        "[DONE]",
      ]);
    }) as unknown as typeof fetch;

    const result = await evrenProvider.generateBriefing({
      roleLabel: "CEO",
      roleFocus: "Strateji ve riskler",
      scenario: "Şirketin ERP ve CRM kaynakları henüz bağlanmadı.",
    });

    expect(result).toEqual(expected);
    expect(requestUrl).toBe("https://evren.example/v1/chat/completions");
    expect(requestHeaders?.get("Authorization")).toBe("Bearer test-evren-key");
    expect(requestBody?.model).toBe("deepseek-v4.1-flash");
    expect(requestBody?.max_tokens).toBe(4096);
    expect(requestBody?.stream).toBe(true);

    const messages = requestBody?.messages as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("30 SECONDS TO CLARITY");
    expect(messages[0].content).toContain("DATA → UNDERSTANDING → RISK → PREDICTION → DECISION → ACTION");
    expect(messages[1].content).toContain("Şirketin ERP ve CRM kaynakları");

    const responseFormat = requestBody?.response_format as {
      type: string;
      json_schema: { strict: boolean; schema: { additionalProperties?: boolean } };
    };
    expect(responseFormat.type).toBe("json_schema");
    expect(responseFormat.json_schema.strict).toBe(true);
    expect(responseFormat.json_schema.schema.additionalProperties).toBe(false);
  });

  it("retries timed-out decision options with a compact prompt and requires a feasible recommendation", async () => {
    process.env.EVREN_API_KEY = "test-evren-key";
    process.env.EVREN_BASE_URL = "https://evren.example/v1";
    process.env.EVREN_MODEL = "deepseek-v4.1-flash";
    process.env.EVREN_MAX_TOKENS = "8192";

    const diagnosis = {
      categoryId: "cash_flow",
      categoryLabel: "Nakit akışı",
      severity: "critical",
      title: "Kısa vadeli nakit açığı bulunuyor.",
      businessImpact: "Vadesi gelen ödeme mevcut nakdi aşıyor.",
      confidence: 75,
      confidenceRationale: "Nakit ve ödeme kayıtları mevcut; tahsilat geçmişi yok.",
      evidence: [{ source: "Kasa raporu", fact: "Nakit 85.000 TL.", reliability: "verified" }],
      assumptions: ["Gelecek satış tahmini sağlanmadı."],
      historicalComparison: "Geçmiş veri sağlanmadı.",
      counterfactual: {
        narrative: "Aksiyon alınmazsa ödeme açığı oluşur.",
        projectedImpact: "35.000 TL açık.",
        timeHorizon: "3 gün",
      },
    };
    const options = {
      options: [
        {
          title: "Vadesi geçmiş alacaklar için müşteri bazlı ödeme teyidi al.",
          detail: "Alacak yaşlandırmasını müşteri bazında sırala ve yazılı ödeme tarihi iste.",
          feasible: true,
          feasibilityNote: "Kredi veya ödeme tarihi değişikliği gerektirmez.",
          tradeoffs: "Tahsilat taahhüdü nakde dönüş garantisi değildir.",
          expectedOutcome: "Tahsil edilebilir tutar belirsizliği azalır.",
          rank: 1,
        },
        {
          title: "Yeni kredi kullan.",
          detail: "Açığı krediyle kapat.",
          feasible: false,
          feasibilityNote: "Yeni borçlanma açıkça yasak.",
          tradeoffs: "Uygulanamaz.",
          expectedOutcome: "Uygulanamaz.",
          rank: 2,
        },
      ],
      recommendedOptionRank: 1,
    };
    const requestBodies: Record<string, unknown>[] = [];
    let call = 0;
    global.fetch = vi.fn(async (_input, init) => {
      call++;
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (call === 1) {
        return sseResponse([
          { choices: [{ delta: { content: JSON.stringify(diagnosis) }, finish_reason: null }] },
          { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 160 } },
          "[DONE]",
        ]);
      }
      if (call === 2) throw new Error("The operation was aborted due to timeout");
      return sseResponse([
        { choices: [{ delta: { content: JSON.stringify(options) }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 180 } },
        "[DONE]",
      ]);
    }) as unknown as typeof fetch;

    const result = await evrenProvider.analyzeDecisionCases({
      sectorLabel: "Perakende mağazacılık",
      riskCategories: [{ id: "cash_flow", label: "Nakit akışı", sources: ["kasa", "alacak"] }],
      constraints: "Yeni kredi/borç kullanılamaz. Ödeme tarihi değiştirilemez.",
      decisionMemory: "",
      domainKnowledge: "Test referansı.",
      data: "SENTETİK TEST VERİSİ: Nakit 85.000 TL; ödeme 120.000 TL.",
    });

    expect(call).toBe(3);
    expect(result[0].options).toHaveLength(2);
    expect(result[0].recommendedOptionRank).toBe(1);
    expect(result[0].options.find((option) => option.rank === 1)?.feasible).toBe(true);
    expect(requestBodies[1].max_tokens).toBe(4096);
    const retryMessages = requestBodies[2].messages as { role: string; content: string }[];
    expect(retryMessages[1].content).toContain("yalnızca aksiyon seçeneklerini üret");
    expect(retryMessages[1].content).toContain("şube, kanal, ekip");
  });

  it("does not return an incomplete decision case when both option attempts fail", async () => {
    process.env.EVREN_API_KEY = "test-evren-key";
    const diagnosis = {
      categoryId: "cash_flow",
      categoryLabel: "Nakit akışı",
      severity: "warning",
      title: "Test nakit açığı.",
      businessImpact: "Test etkisi.",
      confidence: 50,
      confidenceRationale: "Test gerekçesi.",
      evidence: [{ source: "Test", fact: "Test bulgusu.", reliability: "verified" }],
      assumptions: [],
      historicalComparison: "Geçmiş veri sağlanmadı.",
      counterfactual: { narrative: "Test.", projectedImpact: "Bilinmiyor.", timeHorizon: "Bilinmiyor." },
    };
    let call = 0;
    global.fetch = vi.fn(async () => {
      call++;
      if (call === 1) {
        return sseResponse([
          { choices: [{ delta: { content: JSON.stringify(diagnosis) }, finish_reason: null }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
          "[DONE]",
        ]);
      }
      throw new Error("The operation was aborted due to timeout");
    }) as unknown as typeof fetch;

    await expect(evrenProvider.analyzeDecisionCases({
      sectorLabel: "Perakende",
      riskCategories: [{ id: "cash_flow", label: "Nakit akışı", sources: ["kasa"] }],
      constraints: "Yeni borçlanma yasak.",
      decisionMemory: "",
      domainKnowledge: "",
      data: "SENTETİK TEST VERİSİ.",
    })).rejects.toThrow(/eksik seçenekli vaka döndürülmedi/);
    expect(call).toBe(3);
  });

  it("fails explicitly when the EVREN credential is missing", async () => {
    delete process.env.EVREN_API_KEY;
    await expect(
      evrenProvider.generateDailyBriefing({
        companyName: "Test AŞ",
        sectorLabel: "Üretim",
        roleLabel: "CEO",
        roleFocus: "Genel",
        riskCategoryLabels: [],
      })
    ).rejects.toThrow(/EVREN_API_KEY tanımlı değil/);
  });

  it("selects EVREN_ONLY without probing Ollama or falling back to Gemini", async () => {
    process.env.AI_POLICY = "EVREN_ONLY";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getActiveProvider } = await import("../src/lib/ai/provider");
    const provider = await getActiveProvider();

    expect(provider.id).toBe("evren");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
