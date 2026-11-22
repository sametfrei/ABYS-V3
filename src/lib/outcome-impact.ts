import type { RealizedEconomicImpact } from "./decision-economics";

export type ActualImpactInputError =
  | "amount_required"
  | "amount_invalid"
  | "currency_invalid"
  | "measurement_start_invalid"
  | "measurement_end_invalid"
  | "measurement_range_invalid"
  | "evidence_too_long";

export interface ActualImpactDraft {
  amount: string;
  currency: string;
  measurementStart: string;
  measurementEnd: string;
  evidence: string;
}

export type ActualImpactResult =
  | { impact: RealizedEconomicImpact | null; error: null }
  | { impact: null; error: ActualImpactInputError };

function toIsoDate(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  const iso = new Date(timestamp).toISOString();
  return iso.slice(0, 10) === value ? iso : null;
}

/**
 * Formdaki isteğe bağlı gerçekleşen etki alanlarını API sözleşmesine çevirir.
 * Alanların tamamı boşsa etki kaydedilmez; kısmi giriş sessizce atılmaz.
 */
export function buildActualImpact(draft: ActualImpactDraft): ActualImpactResult {
  const amount = draft.amount.trim();
  const currency = draft.currency.trim().toUpperCase();
  const evidence = draft.evidence.trim();
  const hasAny =
    amount.length > 0 ||
    currency.length > 0 ||
    draft.measurementStart.length > 0 ||
    draft.measurementEnd.length > 0 ||
    evidence.length > 0;

  if (!hasAny) return { impact: null, error: null };
  if (!amount) return { impact: null, error: "amount_required" };

  const value = Number(amount);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000_000) {
    return { impact: null, error: "amount_invalid" };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { impact: null, error: "currency_invalid" };
  }
  if (evidence.length > 5000) {
    return { impact: null, error: "evidence_too_long" };
  }

  const measurementStart = toIsoDate(draft.measurementStart);
  if (draft.measurementStart && !measurementStart) {
    return { impact: null, error: "measurement_start_invalid" };
  }
  const measurementEnd = toIsoDate(draft.measurementEnd);
  if (draft.measurementEnd && !measurementEnd) {
    return { impact: null, error: "measurement_end_invalid" };
  }
  if (
    measurementStart &&
    measurementEnd &&
    Date.parse(measurementEnd) < Date.parse(measurementStart)
  ) {
    return { impact: null, error: "measurement_range_invalid" };
  }

  return {
    impact: {
      value,
      currency,
      measurementStart,
      measurementEnd,
      evidence: evidence || null,
    },
    error: null,
  };
}
