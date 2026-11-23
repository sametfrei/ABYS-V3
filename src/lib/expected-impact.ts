/**
 * Karar anında girilen beklenen ekonomik etkinin doğrulaması.
 * Saf fonksiyon: UI'lar aynı kuralları (ISO para birimi, alt ≤ değer ≤ üst)
 * paylaşır; sunucu tarafı zod şeması ayrıca doğrular.
 */

export interface ExpectedImpactDraft {
  value: string;
  currency: string;
  low: string;
  high: string;
}

export interface ExpectedImpactValue {
  value: number;
  currency: string;
  low?: number;
  high?: number;
}

export const EMPTY_EXPECTED_IMPACT: ExpectedImpactDraft = {
  value: "",
  currency: "AZN",
  low: "",
  high: "",
};

export type ExpectedImpactParse =
  | { ok: true; impact: ExpectedImpactValue | null }
  | { ok: false; error: "value" | "currency" | "range" };

function toNumber(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

export function parseExpectedImpact(draft: ExpectedImpactDraft): ExpectedImpactParse {
  const rawValue = draft.value.trim();
  if (!rawValue) return { ok: true, impact: null };
  const value = toNumber(rawValue);
  if (!Number.isFinite(value)) return { ok: false, error: "value" };
  const currency = draft.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "currency" };
  const low = draft.low.trim() ? toNumber(draft.low) : undefined;
  const high = draft.high.trim() ? toNumber(draft.high) : undefined;
  if (
    (low !== undefined && (!Number.isFinite(low) || low > value)) ||
    (high !== undefined && (!Number.isFinite(high) || high < value))
  ) {
    return { ok: false, error: "range" };
  }
  return {
    ok: true,
    impact: {
      value,
      currency,
      ...(low !== undefined ? { low } : {}),
      ...(high !== undefined ? { high } : {}),
    },
  };
}
