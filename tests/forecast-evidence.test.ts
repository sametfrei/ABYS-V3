import { describe, expect, it } from "vitest";
import { forecastSeries } from "../src/lib/forecasting";

describe("tahmin kanıt sözleşmesi", () => {
  it("aralık ve kanıt alanlarını mevcut deterministik sonuçtan sağlar", () => {
    const result = forecastSeries([10, 12, 11, 13, 14, 15, 16, 17, 18, 19], 2);
    expect(result).not.toBeNull();

    for (const point of result!.points) {
      expect(Number.isFinite(point.value)).toBe(true);
      expect(point.p10).toBeLessThanOrEqual(point.value);
      expect(point.p90).toBeGreaterThanOrEqual(point.value);
    }
    expect(["low", "medium", "high"]).toContain(result!.evidence);
    expect(result!.selectedMae).toBeGreaterThanOrEqual(0);
    expect(result!.note).toContain("istatistiksel garanti değildir");
  });
});
