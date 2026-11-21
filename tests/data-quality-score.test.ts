import { describe, expect, it } from "vitest";
import { scoreDataQuality, type QualityObservation } from "../src/lib/data-quality-score";

const now = new Date("2026-11-21T00:00:00Z");

function row(label: string, value: string | null, day: string): QualityObservation {
  return { label, value, createdAt: day };
}

describe("veri kalitesi skoru", () => {
  it("boş girdide skor üretmez", () => {
    const report = scoreDataQuality([], now);
    expect(report.total).toBe(0);
    expect(report.overall).toBeNull();
    expect(report.worst).toBeNull();
    expect(report.dimensions.every((d) => d.score === null)).toBe(true);
  });

  it("tam ve geçerli veriyi 1.0 ile puanlar", () => {
    const report = scoreDataQuality(
      [row("Ciro", "100", "2026-11-20T00:00:00Z"), row("Ciro", "120.5", "2026-11-19T00:00:00Z")],
      now
    );
    expect(report.overall).toBe(1);
    expect(report.worst).toBe("completeness");
  });

  it("boş ve sayısal olmayan değerleri tamlık/geçerlilikte düşürür", () => {
    const report = scoreDataQuality(
      [
        row("Ciro", "100", "2026-11-20T00:00:00Z"),
        row("Ciro", "  ", "2026-11-20T00:00:00Z"),
        row("Ciro", "n/a", "2026-11-20T00:00:00Z"),
        row("Ciro", null, "2026-11-20T00:00:00Z"),
      ],
      now
    );
    const byDim = Object.fromEntries(report.dimensions.map((d) => [d.dimension, d]));
    expect(byDim.completeness.score).toBe(0.5);
    expect(byDim.validity.score).toBe(0.5);
    expect(byDim.uniqueness.score).toBe(1);
  });

  it("bayat gözlemleri tazelikte saymaz", () => {
    const report = scoreDataQuality(
      [row("Ciro", "1", "2026-11-20T00:00:00Z"), row("Ciro", "2", "2025-01-01T00:00:00Z")],
      now,
      { maxAgeDays: 30 }
    );
    expect(report.dimensions.find((d) => d.dimension === "freshness")?.score).toBe(0.5);
  });

  it("aynı etiket+tarih+değer tekrarlarını tekillikte cezalandırır", () => {
    const report = scoreDataQuality(
      [
        row("Ciro", "100", "2026-11-20T00:00:00Z"),
        row("Ciro", "100", "2026-11-20T00:00:00Z"),
        row("Ciro", "101", "2026-11-20T00:00:00Z"),
        row("Ciro", "102", "2026-11-20T00:00:00Z"),
      ],
      now
    );
    expect(report.dimensions.find((d) => d.dimension === "uniqueness")?.score).toBe(0.75);
    expect(report.worst).toBe("uniqueness");
  });

  it("geçersiz tarihleri tazelik örnekleminden çıkarır", () => {
    const report = scoreDataQuality(
      [row("Ciro", "1", "bozuk"), row("Ciro", "2", "2026-11-20T00:00:00Z")],
      now
    );
    const freshness = report.dimensions.find((d) => d.dimension === "freshness");
    expect(freshness?.sample).toBe(1);
    expect(freshness?.score).toBe(1);
  });
});
