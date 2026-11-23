import { describe, expect, it } from "vitest";
import {
  EMPTY_EXPECTED_IMPACT,
  parseExpectedImpact,
} from "../src/lib/expected-impact";

describe("parseExpectedImpact", () => {
  it("boş taslakta etki üretmez (opsiyonel alan)", () => {
    expect(parseExpectedImpact(EMPTY_EXPECTED_IMPACT)).toEqual({ ok: true, impact: null });
  });

  it("değer ve para birimini normalize eder, sınırları taşır", () => {
    expect(
      parseExpectedImpact({ value: "40000", currency: "azn", low: "25000", high: "60000" })
    ).toEqual({ ok: true, impact: { value: 40000, currency: "AZN", low: 25000, high: 60000 } });
  });

  it("virgüllü ondalığı kabul eder", () => {
    expect(parseExpectedImpact({ value: "1250,5", currency: "TRY", low: "", high: "" })).toEqual({
      ok: true,
      impact: { value: 1250.5, currency: "TRY" },
    });
  });

  it("sayı olmayan değeri reddeder", () => {
    expect(parseExpectedImpact({ value: "abc", currency: "AZN", low: "", high: "" })).toEqual({
      ok: false,
      error: "value",
    });
  });

  it("geçersiz para birimini reddeder", () => {
    expect(parseExpectedImpact({ value: "10", currency: "A1", low: "", high: "" })).toEqual({
      ok: false,
      error: "currency",
    });
  });

  it("alt sınır değerden büyükse veya üst sınır değerden küçükse reddeder", () => {
    expect(parseExpectedImpact({ value: "10", currency: "AZN", low: "20", high: "" })).toEqual({
      ok: false,
      error: "range",
    });
    expect(parseExpectedImpact({ value: "10", currency: "AZN", low: "", high: "5" })).toEqual({
      ok: false,
      error: "range",
    });
  });
});
