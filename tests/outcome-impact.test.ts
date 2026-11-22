import { describe, expect, it } from "vitest";
import { buildActualImpact } from "../src/lib/outcome-impact";

const EMPTY = {
  amount: "",
  currency: "",
  measurementStart: "",
  measurementEnd: "",
  evidence: "",
};

describe("gerçekleşen finansal etki form doğrulaması", () => {
  it("tüm alanlar boşsa etki göndermez", () => {
    expect(buildActualImpact(EMPTY)).toEqual({ impact: null, error: null });
  });

  it("kısmi girişi sessizce atmaz; tutarı zorunlu tutar", () => {
    expect(buildActualImpact({ ...EMPTY, currency: "TRY" })).toEqual({
      impact: null,
      error: "amount_required",
    });
    expect(buildActualImpact({ ...EMPTY, amount: "125000", evidence: "finans raporu" })).toEqual({
      impact: null,
      error: "currency_invalid",
    });
  });

  it("tutar, ISO kodu, tarih ve kanıtı API sözleşmesine dönüştürür", () => {
    expect(
      buildActualImpact({
        amount: "125000.50",
        currency: "try",
        measurementStart: "2026-01-01",
        measurementEnd: "2026-06-30",
        evidence: "  finans raporu  ",
      })
    ).toEqual({
      impact: {
        value: 125000.5,
        currency: "TRY",
        measurementStart: "2026-01-01T00:00:00.000Z",
        measurementEnd: "2026-06-30T00:00:00.000Z",
        evidence: "finans raporu",
      },
      error: null,
    });
  });

  it("geçersiz ve ters ölçüm aralığını reddeder", () => {
    expect(
      buildActualImpact({ ...EMPTY, amount: "1", currency: "USD", measurementStart: "2026-02-31" })
    ).toEqual({ impact: null, error: "measurement_start_invalid" });
    expect(
      buildActualImpact({
        ...EMPTY,
        amount: "1",
        currency: "USD",
        measurementStart: "2026-07-01",
        measurementEnd: "2026-06-30",
      })
    ).toEqual({ impact: null, error: "measurement_range_invalid" });
  });

  it("sayısal olmayan ve desteklenen aralık dışı tutarı reddeder", () => {
    expect(buildActualImpact({ ...EMPTY, amount: "NaN", currency: "USD" })).toEqual({
      impact: null,
      error: "amount_invalid",
    });
    expect(
      buildActualImpact({ ...EMPTY, amount: "1000000000000001", currency: "USD" })
    ).toEqual({ impact: null, error: "amount_invalid" });
  });
});
