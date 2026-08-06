import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeCasesParams } from "../src/lib/ai/provider";

function ndjsonResponse(payload: unknown): Response {
  const line = JSON.stringify({ message: { content: JSON.stringify(payload) }, done: false }) + "\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(line));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const diagnosisPayload = {
  categoryId: "cat-1",
  categoryLabel: "Operasyonel",
  severity: "warning",
  title: "Teşhis",
  businessImpact: "Etki",
  confidence: 70,
  confidenceRationale: "Gerekçe",
  evidence: [],
  assumptions: [],
  historicalComparison: "",
  counterfactual: { narrative: "n", projectedImpact: "p", timeHorizon: "t" },
};

const optionsPayload = { options: [], recommendedOptionRank: 0 };

function baseParams(): AnalyzeCasesParams {
  return {
    sectorLabel: "Üretim",
    riskCategories: [{ id: "cat-1", label: "Operasyonel", sources: ["kpi-1"] }],
    constraints: "",
    decisionMemory: "",
    domainKnowledge: "",
    data: "veri",
  };
}

describe("analyzeDecisionCases - teşhis yeniden deneme", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("teşhis çağrısı ilk denemede ağ hatasıyla düşerse ikinci denemeyi yapar ve başarıyla döner", async () => {
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("network down");
      if (callCount === 2) return ndjsonResponse(diagnosisPayload);
      return ndjsonResponse(optionsPayload);
    }) as unknown as typeof fetch;

    const { ollamaProvider } = await import("../src/lib/ai/providers/ollama");
    const result = await ollamaProvider.analyzeDecisionCases(baseParams());
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Teşhis");
    expect(callCount).toBe(3);
  });

  it("teşhis çağrısı iki denemede de başarısız olursa açık hata fırlatır", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const { ollamaProvider } = await import("../src/lib/ai/providers/ollama");
    await expect(ollamaProvider.analyzeDecisionCases(baseParams())).rejects.toThrow(
      /teşhis üretimi iki denemede de başarısız/
    );
  });
});
