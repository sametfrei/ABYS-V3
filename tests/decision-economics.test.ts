import { describe, expect, it } from "vitest";
import {
  computeEconomicVariance,
  summarizeDecisionEconomics,
  summarizeDecisionLearning,
  type ExpectedEconomicImpact,
  type RealizedEconomicImpact,
} from "../src/lib/decision-economics";

function expected(value: number, currency = "TRY"): ExpectedEconomicImpact {
  return { value, low: null, high: null, currency, basis: null, assumptions: [] };
}

function actual(value: number, currency = "TRY"): RealizedEconomicImpact {
  return {
    value,
    currency,
    measurementStart: null,
    measurementEnd: null,
    evidence: null,
  };
}

describe("karar ekonomisi", () => {
  it("farkı ve yüzdeyi yalnızca aynı para biriminde hesaplar", () => {
    expect(computeEconomicVariance(expected(100), actual(125))).toEqual({
      amount: 25,
      percent: 25,
      currency: "TRY",
    });
    expect(computeEconomicVariance(expected(100, "USD"), actual(125, "EUR"))).toBeNull();
  });

  it("sıfır beklenti tabanında yüzdeyi uydurmaz", () => {
    expect(computeEconomicVariance(expected(0), actual(25))).toEqual({
      amount: 25,
      percent: null,
      currency: "TRY",
    });
  });

  it("para birimlerini birbirine eklemez; mutabakatı çiftler üzerinden sayar", () => {
    const summary = summarizeDecisionEconomics([
      { expectedImpact: expected(100, "USD"), actualImpact: actual(120, "USD") },
      { expectedImpact: expected(50, "EUR"), actualImpact: actual(40, "USD") },
      { expectedImpact: expected(25, "TRY"), actualImpact: null },
    ]);
    expect(summary).toEqual({
      expectedValueCount: 3,
      actualValueCount: 2,
      reconciledCount: 1,
      byCurrency: [
        {
          currency: "EUR",
          expectedTotal: 50,
          actualTotal: 0,
          varianceTotal: 0,
          expectedCount: 1,
          actualCount: 0,
          reconciledCount: 0,
        },
        {
          currency: "TRY",
          expectedTotal: 25,
          actualTotal: 0,
          varianceTotal: 0,
          expectedCount: 1,
          actualCount: 0,
          reconciledCount: 0,
        },
        {
          currency: "USD",
          expectedTotal: 100,
          actualTotal: 160,
          varianceTotal: 20,
          expectedCount: 1,
          actualCount: 2,
          reconciledCount: 1,
        },
      ],
    });
  });

  it("aralık isabetini, güven kovalarını ve kabul oranını deterministik özetler", () => {
    const ranged: ExpectedEconomicImpact = {
      value: 100,
      low: 80,
      high: 120,
      currency: "TRY",
      basis: null,
      assumptions: [],
    };
    const learning = summarizeDecisionLearning([
      {
        confidence: 90,
        choice: "accepted",
        result: "improved",
        expectedImpact: ranged,
        actualImpact: actual(110),
      },
      {
        confidence: 60,
        choice: "rejected",
        result: "worsened",
        expectedImpact: expected(100),
        actualImpact: actual(120),
      },
      {
        confidence: 80,
        choice: "modified",
        result: null,
        expectedImpact: expected(100, "EUR"),
        actualImpact: actual(100, "USD"),
      },
      {
        confidence: 40,
        choice: "accepted",
        result: null,
        expectedImpact: null,
        actualImpact: null,
      },
    ]);

    expect(learning.rangeAccuracy).toEqual({
      evaluableCount: 1,
      hitCount: 1,
      missCount: 0,
      missingRangeCount: 1,
      currencyMismatchCount: 1,
      hitRate: 1,
    });
    expect(learning.choices).toEqual({
      total: 4,
      accepted: 2,
      rejected: 1,
      modified: 1,
      other: 0,
      acceptanceRate: 0.5,
    });
    expect(learning.confidenceBuckets).toEqual([
      expect.objectContaining({ key: "0-49", total: 1, withOutcome: 0, improvedRate: null }),
      expect.objectContaining({ key: "50-69", total: 1, withOutcome: 1, improvedRate: 0 }),
      expect.objectContaining({ key: "70-84", total: 1, withOutcome: 0, rangeHitRate: null }),
      expect.objectContaining({ key: "85-100", total: 1, withOutcome: 1, improvedRate: 1, rangeHitRate: 1 }),
    ]);
  });
});
