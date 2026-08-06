import { describe, expect, it } from "vitest";
import { extractNumbers, verifyDecisionCases } from "../src/lib/ai/verify-cases";
import type { AiDecisionCase } from "../src/lib/ai/provider";

function baseCase(overrides: Partial<AiDecisionCase> = {}): AiDecisionCase {
  return {
    categoryId: "cat-1",
    categoryLabel: "Operasyonel",
    severity: "warning",
    title: "Test vakası",
    businessImpact: "Etki metni.",
    confidence: 80,
    confidenceRationale: "Gerekçe metni.",
    evidence: [],
    assumptions: [],
    historicalComparison: "Geçmiş veri.",
    counterfactual: { narrative: "", projectedImpact: "", timeHorizon: "" },
    options: [],
    recommendedOptionRank: 1,
    ...overrides,
  };
}

describe("extractNumbers", () => {
  it("anlamlı sayıları çıkarır, saat/kod biçimlerini ve küçük sayıları atlar", () => {
    const result = extractNumbers(
      "Rötar 18:45 uçuş TK-2043, tazminat 6.000 EUR, 25 yolcu etkilendi, 3 gişe açıktı"
    );
    expect(result.has("6000")).toBe(true);
    expect(result.has("25")).toBe(true);
    // saat, kod ve <=10 tamsayılar dışlanmalı
    expect(result.has("18")).toBe(false);
    expect(result.has("45")).toBe(false);
    expect(result.has("2043")).toBe(false);
    expect(result.has("3")).toBe(false);
  });

  it("TR ondalık/binlik biçimlerini kanonik forma çevirir", () => {
    const result = extractNumbers("Toplam 1.234,5 TL ve ayrıca 12,5 kat artış");
    expect(result.has("1234.5")).toBe(true);
    expect(result.has("12.5")).toBe(true);
  });
});

describe("verifyDecisionCases — desteksiz sayı tespiti", () => {
  it("kaynaklarda olmayan sayıyı işaretler, güveni sınırlar ve verified kanıtı estimated'a düşürür", () => {
    const sources = {
      data: "Uçuş sayısı 40 idi.",
      constraints: "",
      domainKnowledge: "",
      decisionMemory: "",
    };
    const raw = baseCase({
      confidence: 95,
      businessImpact: "Toplam kayıp 150000 TL oldu.",
      evidence: [{ source: "veri", fact: "Kayıp 150000 TL", reliability: "verified" }],
    });

    const { cases, unsupportedCounts } = verifyDecisionCases([raw], sources);

    expect(unsupportedCounts[0]).toBeGreaterThan(0);
    expect(cases[0].evidence[0].reliability).toBe("estimated");
    expect(cases[0].confidence).toBeLessThanOrEqual(85);
    expect(cases[0].confidenceRationale).toContain("Otomatik doğrulama");
  });

  it("kaynaklarda aynen geçen sayıları desteksiz saymaz", () => {
    const sources = {
      data: "Toplam kayıp 150000 TL oldu.",
      constraints: "",
      domainKnowledge: "",
      decisionMemory: "",
    };
    const raw = baseCase({
      confidence: 90,
      businessImpact: "Toplam kayıp 150000 TL oldu.",
      evidence: [{ source: "veri", fact: "Kayıp 150000 TL", reliability: "verified" }],
    });

    const { cases, unsupportedCounts } = verifyDecisionCases([raw], sources);

    expect(unsupportedCounts[0]).toBe(0);
    expect(cases[0].evidence[0].reliability).toBe("verified");
    expect(cases[0].confidence).toBe(90);
  });
});

describe("verifyDecisionCases — toplam toleransı", () => {
  it("iki kaynak sayının toplamı olan değeri destekli sayar (6000 + 700 = 6700)", () => {
    const sources = {
      data: "Rötar tazminatı 6000 TL, ek bagaj kaybı 700 TL.",
      constraints: "",
      domainKnowledge: "",
      decisionMemory: "",
    };
    const raw = baseCase({
      confidence: 90,
      businessImpact: "Toplam etki 6700 TL oldu.",
      evidence: [{ source: "veri", fact: "Toplam 6700 TL", reliability: "verified" }],
    });

    const { cases, unsupportedCounts } = verifyDecisionCases([raw], sources);

    expect(unsupportedCounts[0]).toBe(0);
    expect(cases[0].evidence[0].reliability).toBe("verified");
    expect(cases[0].confidence).toBe(90);
  });
});

describe("verifyDecisionCases — yapısal tamamlama", () => {
  it("eksik title'ı businessImpact'ten türetir ve geçersiz severity'yi warning'e düşürür", () => {
    const sources = { data: "", constraints: "", domainKnowledge: "", decisionMemory: "" };
    const raw = baseCase({
      title: "",
      severity: "unknown" as unknown as AiDecisionCase["severity"],
      businessImpact: "Bagaj kaybı müşteri memnuniyetsizliğine yol açtı. Devamı burada.",
    });

    const { cases } = verifyDecisionCases([raw], sources);

    expect(cases[0].severity).toBe("warning");
    expect(cases[0].title).toBe("Bagaj kaybı müşteri memnuniyetsizliğine yol açtı.");
  });

  it("eksik alanları (evidence, assumptions, options, historicalComparison, counterfactual) varsayılanlarla doldurur", () => {
    const sources = { data: "", constraints: "", domainKnowledge: "", decisionMemory: "" };
    const raw = {
      categoryId: "cat-1",
      categoryLabel: "Operasyonel",
      severity: "critical",
      title: "Vaka",
      businessImpact: "Etki.",
      confidence: 70,
      confidenceRationale: "Gerekçe.",
      recommendedOptionRank: 1,
    } as unknown as AiDecisionCase;

    const { cases } = verifyDecisionCases([raw], sources);

    expect(cases[0].evidence).toEqual([]);
    expect(cases[0].assumptions).toEqual([]);
    expect(cases[0].options).toEqual([]);
    expect(cases[0].historicalComparison).toBe("Geçmiş veri sağlanmadı.");
    expect(cases[0].counterfactual).toEqual({ narrative: "", projectedImpact: "", timeHorizon: "" });
  });
});

describe("verifyDecisionCases — önerilen seçenek düzeltmesi", () => {
  it("uygulanamaz seçeneği işaret eden recommendedOptionRank'i en küçük uygulanabilir seçeneğe düzeltir", () => {
    const sources = { data: "", constraints: "", domainKnowledge: "", decisionMemory: "" };
    const raw = baseCase({
      recommendedOptionRank: 1,
      options: [
        {
          title: "Seçenek A",
          detail: "",
          feasible: false,
          feasibilityNote: "",
          tradeoffs: "",
          expectedOutcome: "",
          rank: 1,
        },
        {
          title: "Seçenek B",
          detail: "",
          feasible: true,
          feasibilityNote: "",
          tradeoffs: "",
          expectedOutcome: "",
          rank: 2,
        },
        {
          title: "Seçenek C",
          detail: "",
          feasible: true,
          feasibilityNote: "",
          tradeoffs: "",
          expectedOutcome: "",
          rank: 3,
        },
      ],
    });

    const { cases } = verifyDecisionCases([raw], sources);

    expect(cases[0].recommendedOptionRank).toBe(2);
  });

  it("önerilen seçenek zaten uygulanabilir olduğunda değiştirmez", () => {
    const sources = { data: "", constraints: "", domainKnowledge: "", decisionMemory: "" };
    const raw = baseCase({
      recommendedOptionRank: 3,
      options: [
        {
          title: "Seçenek A",
          detail: "",
          feasible: true,
          feasibilityNote: "",
          tradeoffs: "",
          expectedOutcome: "",
          rank: 1,
        },
        {
          title: "Seçenek C",
          detail: "",
          feasible: true,
          feasibilityNote: "",
          tradeoffs: "",
          expectedOutcome: "",
          rank: 3,
        },
      ],
    });

    const { cases } = verifyDecisionCases([raw], sources);

    expect(cases[0].recommendedOptionRank).toBe(3);
  });
});
