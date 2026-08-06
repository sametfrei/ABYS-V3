import { describe, expect, it } from "vitest";
import { buildOptionsPrompt, type AiDiagnosis } from "../src/lib/ai/decision-prompt";
import type { AnalyzeCasesParams } from "../src/lib/ai/provider";

function baseParams(overrides: Partial<AnalyzeCasesParams> = {}): AnalyzeCasesParams {
  return {
    sectorLabel: "Üretim",
    riskCategories: [{ id: "cat-1", label: "Operasyonel", sources: ["kpi-1"] }],
    constraints: "Kısıt yok.",
    decisionMemory: "",
    domainKnowledge: "",
    data: "örnek veri",
    ...overrides,
  };
}

describe("buildOptionsPrompt", () => {
  it("evidence undefined geldiğinde çökmeden çalışır", () => {
    const diagnosis = {
      categoryId: "cat-1",
      categoryLabel: "Operasyonel",
      severity: "warning",
      title: "Teşhis başlığı",
      businessImpact: "Etki metni.",
      confidence: 70,
      confidenceRationale: "Gerekçe.",
      // evidence kasıtlı olarak eksik — kesik JSON onarımı bu alanı düşürebilir
      assumptions: [],
      historicalComparison: "",
      counterfactual: { narrative: "Senaryo.", projectedImpact: "Etki.", timeHorizon: "1 hafta" },
    } as unknown as AiDiagnosis;

    expect(() => buildOptionsPrompt(baseParams(), diagnosis)).not.toThrow();
    const prompt = buildOptionsPrompt(baseParams(), diagnosis);
    expect(prompt).toContain("kanıt bildirilmedi");
  });

  it("counterfactual tamamen eksik geldiğinde çökmeden 'bilinmiyor' ile devam eder", () => {
    const diagnosis = {
      categoryId: "cat-1",
      categoryLabel: "Operasyonel",
      severity: "warning",
      title: "Teşhis başlığı",
      businessImpact: "Etki metni.",
      confidence: 70,
      confidenceRationale: "Gerekçe.",
      evidence: [{ source: "kpi-1", fact: "olgu", reliability: "verified" }],
      assumptions: [],
      historicalComparison: "",
      // counterfactual kasıtlı olarak eksik
    } as unknown as AiDiagnosis;

    expect(() => buildOptionsPrompt(baseParams(), diagnosis)).not.toThrow();
    const prompt = buildOptionsPrompt(baseParams(), diagnosis);
    expect(prompt).toContain("bilinmiyor");
  });

  it("counterfactual'ın yalnızca bir alt alanı eksikken diğerlerini korur", () => {
    const diagnosis: AiDiagnosis = {
      categoryId: "cat-1",
      categoryLabel: "Operasyonel",
      severity: "warning",
      title: "Teşhis başlığı",
      businessImpact: "Etki metni.",
      confidence: 70,
      confidenceRationale: "Gerekçe.",
      evidence: [],
      assumptions: [],
      historicalComparison: "",
      counterfactual: {
        narrative: "Aksiyon alınmazsa gecikme büyür.",
        projectedImpact: "",
        timeHorizon: "",
      } as unknown as AiDiagnosis["counterfactual"],
    };
    // projectedImpact/timeHorizon boş string (falsy değil) olduğundan aynen korunmalı
    const prompt = buildOptionsPrompt(baseParams(), diagnosis);
    expect(prompt).toContain("Aksiyon alınmazsa gecikme büyür.");
  });
});
