export interface ExpectedEconomicImpact {
  value: number;
  low: number | null;
  high: number | null;
  currency: string;
  basis: string | null;
  assumptions: string[];
}

export interface RealizedEconomicImpact {
  value: number;
  currency: string;
  measurementStart: string | null;
  measurementEnd: string | null;
  evidence: string | null;
}

export interface EconomicVariance {
  amount: number;
  percent: number | null;
  currency: string;
}

export interface CurrencyEconomics {
  currency: string;
  expectedTotal: number;
  actualTotal: number;
  varianceTotal: number;
  expectedCount: number;
  actualCount: number;
  reconciledCount: number;
}

export interface DecisionEconomicsSummary {
  expectedValueCount: number;
  actualValueCount: number;
  reconciledCount: number;
  byCurrency: CurrencyEconomics[];
}

export interface RangeAccuracySummary {
  evaluableCount: number;
  hitCount: number;
  missCount: number;
  missingRangeCount: number;
  currencyMismatchCount: number;
  hitRate: number | null;
}

export interface ConfidenceBucketSummary {
  key: string;
  label: string;
  min: number;
  max: number;
  total: number;
  withOutcome: number;
  improved: number;
  improvedRate: number | null;
  rangeEvaluable: number;
  rangeHits: number;
  rangeHitRate: number | null;
}

export interface ChoiceDistributionSummary {
  total: number;
  accepted: number;
  rejected: number;
  modified: number;
  other: number;
  acceptanceRate: number | null;
}

export interface DecisionLearningSummary {
  rangeAccuracy: RangeAccuracySummary;
  confidenceBuckets: ConfidenceBucketSummary[];
  choices: ChoiceDistributionSummary;
}

export interface DecisionLearningEntry {
  confidence: number;
  choice: string;
  result: "improved" | "unchanged" | "worsened" | null;
  expectedImpact: ExpectedEconomicImpact | null;
  actualImpact: RealizedEconomicImpact | null;
}

/** Aynı para birimindeki beklenen ve gerçekleşen etkiyi karşılaştırır. */
export function computeEconomicVariance(
  expected: ExpectedEconomicImpact | null,
  actual: RealizedEconomicImpact | null
): EconomicVariance | null {
  if (!expected || !actual || expected.currency !== actual.currency) return null;
  const amount = actual.value - expected.value;
  return {
    amount,
    percent: expected.value === 0 ? null : (amount / Math.abs(expected.value)) * 100,
    currency: expected.currency,
  };
}

/**
 * Para birimlerini asla birbirine eklemez. Beklenen ve gerçekleşen toplamlar
 * ayrı tutulur; mutabakat yalnızca aynı para birimindeki karar çiftlerinde
 * sayılır.
 */
export function summarizeDecisionEconomics(
  entries: Array<{
    expectedImpact: ExpectedEconomicImpact | null;
    actualImpact: RealizedEconomicImpact | null;
  }>
): DecisionEconomicsSummary {
  const groups = new Map<string, CurrencyEconomics>();
  const group = (currency: string): CurrencyEconomics => {
    const existing = groups.get(currency);
    if (existing) return existing;
    const created: CurrencyEconomics = {
      currency,
      expectedTotal: 0,
      actualTotal: 0,
      varianceTotal: 0,
      expectedCount: 0,
      actualCount: 0,
      reconciledCount: 0,
    };
    groups.set(currency, created);
    return created;
  };

  let expectedValueCount = 0;
  let actualValueCount = 0;
  let reconciledCount = 0;
  for (const entry of entries) {
    if (entry.expectedImpact) {
      expectedValueCount += 1;
      const target = group(entry.expectedImpact.currency);
      target.expectedTotal += entry.expectedImpact.value;
      target.expectedCount += 1;
    }
    if (entry.actualImpact) {
      actualValueCount += 1;
      const target = group(entry.actualImpact.currency);
      target.actualTotal += entry.actualImpact.value;
      target.actualCount += 1;
    }
    const variance = computeEconomicVariance(entry.expectedImpact, entry.actualImpact);
    if (variance) {
      reconciledCount += 1;
      group(variance.currency).reconciledCount += 1;
      group(variance.currency).varianceTotal += variance.amount;
    }
  }

  return {
    expectedValueCount,
    actualValueCount,
    reconciledCount,
    byCurrency: [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

type RangeOutcome = "hit" | "miss" | "missing_range" | "currency_mismatch" | "not_evaluable";

function evaluateRange(
  expected: ExpectedEconomicImpact | null,
  actual: RealizedEconomicImpact | null
): RangeOutcome {
  if (!expected || !actual) return "not_evaluable";
  if (expected.currency !== actual.currency) return "currency_mismatch";
  if (expected.low === null || expected.high === null) return "missing_range";
  const low = Math.min(expected.low, expected.high);
  const high = Math.max(expected.low, expected.high);
  return actual.value >= low && actual.value <= high ? "hit" : "miss";
}

export function summarizeDecisionLearning(
  entries: DecisionLearningEntry[]
): DecisionLearningSummary {
  const buckets = [
    { key: "0-49", label: "0–49", min: 0, max: 49, total: 0, withOutcome: 0, improved: 0, rangeEvaluable: 0, rangeHits: 0 },
    { key: "50-69", label: "50–69", min: 50, max: 69, total: 0, withOutcome: 0, improved: 0, rangeEvaluable: 0, rangeHits: 0 },
    { key: "70-84", label: "70–84", min: 70, max: 84, total: 0, withOutcome: 0, improved: 0, rangeEvaluable: 0, rangeHits: 0 },
    { key: "85-100", label: "85–100", min: 85, max: 100, total: 0, withOutcome: 0, improved: 0, rangeEvaluable: 0, rangeHits: 0 },
  ];
  const choices: ChoiceDistributionSummary = {
    total: entries.length,
    accepted: 0,
    rejected: 0,
    modified: 0,
    other: 0,
    acceptanceRate: null,
  };
  const range: RangeAccuracySummary = {
    evaluableCount: 0,
    hitCount: 0,
    missCount: 0,
    missingRangeCount: 0,
    currencyMismatchCount: 0,
    hitRate: null,
  };

  for (const entry of entries) {
    if (entry.choice === "accepted") choices.accepted += 1;
    else if (entry.choice === "rejected") choices.rejected += 1;
    else if (entry.choice === "modified") choices.modified += 1;
    else choices.other += 1;

    const confidence = Number.isFinite(entry.confidence)
      ? Math.max(0, Math.min(100, entry.confidence))
      : 0;
    const bucket =
      buckets.find((candidate) => confidence >= candidate.min && confidence <= candidate.max) ??
      buckets[3];
    bucket.total += 1;
    if (entry.result) {
      bucket.withOutcome += 1;
      if (entry.result === "improved") bucket.improved += 1;
    }

    const outcome = evaluateRange(entry.expectedImpact, entry.actualImpact);
    if (outcome === "hit" || outcome === "miss") {
      range.evaluableCount += 1;
      bucket.rangeEvaluable += 1;
      if (outcome === "hit") {
        range.hitCount += 1;
        bucket.rangeHits += 1;
      } else {
        range.missCount += 1;
      }
    } else if (outcome === "missing_range") {
      range.missingRangeCount += 1;
    } else if (outcome === "currency_mismatch") {
      range.currencyMismatchCount += 1;
    }
  }

  choices.acceptanceRate =
    choices.total === 0 ? null : choices.accepted / choices.total;
  range.hitRate = range.evaluableCount === 0 ? null : range.hitCount / range.evaluableCount;

  return {
    rangeAccuracy: range,
    confidenceBuckets: buckets.map((bucket) => ({
      ...bucket,
      improvedRate: bucket.withOutcome === 0 ? null : bucket.improved / bucket.withOutcome,
      rangeHitRate: bucket.rangeEvaluable === 0 ? null : bucket.rangeHits / bucket.rangeEvaluable,
    })),
    choices,
  };
}
