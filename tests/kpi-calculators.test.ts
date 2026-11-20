import { describe, expect, it } from "vitest";
import { INDUSTRY_PACKS, listKpiSpecCandidates, resolveKpiSpec } from "../src/lib/industry/packs";
import {
  calculateKpiSpec,
  hasKpiCalculator,
  listKpiCalculatorNames,
} from "../src/lib/industry/kpi-calculators";

describe("sektör paketi KPI hesaplayıcıları", () => {
  it("her paket KPI'sının çalıştırılabilir bir hesaplayıcısı vardır", () => {
    const names = new Set(listKpiCalculatorNames());
    for (const pack of INDUSTRY_PACKS) {
      for (const spec of pack.kpis) {
        expect(hasKpiCalculator(spec.functionName), `${pack.id}/${spec.id}`).toBe(true);
        expect(names.has(spec.functionName), `${pack.id}/${spec.id}`).toBe(true);
      }
    }
  });

  it("temel oranları deterministik hesaplar", () => {
    expect(
      calculateKpiSpec(
        { functionName: "firstPassYield", requiredFields: ["good_units", "total_units"] },
        { good_units: 90, total_units: 100 }
      ).value
    ).toBe(90);
    expect(
      calculateKpiSpec(
        { functionName: "grossMargin", requiredFields: ["net_sales", "cogs"] },
        { net_sales: 1000, cogs: 600 }
      ).value
    ).toBe(40);
    expect(
      calculateKpiSpec({ functionName: "arr", requiredFields: ["mrr"] }, { mrr: 100 }).value
    ).toBe(1200);
    expect(
      calculateKpiSpec(
        {
          functionName: "oee",
          requiredFields: [
            "planned_production_time",
            "downtime_minutes",
            "ideal_cycle_time_minutes",
            "total_units",
            "good_units",
          ],
        },
        {
          planned_production_time: 600,
          downtime_minutes: 60,
          ideal_cycle_time_minutes: 1,
          total_units: 540,
          good_units: 480,
        }
      ).value
    ).toBeCloseTo(80, 6);
  });

  it("eksik alan veya sıfır paydada sayı üretmez", () => {
    const missing = calculateKpiSpec(
      { functionName: "firstPassYield", requiredFields: ["good_units", "total_units"] },
      { good_units: 90 }
    );
    expect(missing.value).toBeNull();
    expect(missing.missingFields).toEqual(["total_units"]);

    const zero = calculateKpiSpec(
      { functionName: "scrapRate", requiredFields: ["scrap_units", "total_units"] },
      { scrap_units: 1, total_units: 0 }
    );
    expect(zero.value).toBeNull();
    expect(zero.denominatorZero).toBe(true);
  });

  it("metinsel sayıları kabul eder, geçersiz metni raporlar", () => {
    const result = calculateKpiSpec(
      { functionName: "conversionRate", requiredFields: ["transactions", "footfall"] },
      { transactions: "25", footfall: "100", note: "abc" }
    );
    expect(result.value).toBe(25);
    expect(result.invalidFields).toEqual(["note"]);
  });

  it("paketler arası KPI belirsizliğini sessizce ilk pakete çözmez", () => {
    expect(listKpiSpecCandidates("gross_margin").map((candidate) => candidate.packId)).toEqual(
      expect.arrayContaining(["retail", "technology"])
    );
    expect(resolveKpiSpec("gross_margin", ["net_sales", "cogs"])?.packId).toBe("retail");
    expect(resolveKpiSpec("gross_margin", ["revenue", "cogs"])?.packId).toBe("technology");
    expect(resolveKpiSpec("gross_margin", ["net_sales", "revenue", "cogs"])).toBeUndefined();
    expect(resolveKpiSpec("retail:gross_margin", ["revenue", "cogs"])?.packId).toBe("retail");
  });
});
