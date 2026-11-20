import type { KpiSpec } from "./types";

/**
 * Sektör paketlerindeki `functionName` değerlerinin tek uygulama noktası.
 * Hesaplar saf ve deterministiktir: model çağrısı, tahmin veya varsayılan
 * dolgu yoktur. Girdi eksikse ya da payda sıfırsa sayı üretilmez.
 */

export interface KpiCalculation {
  functionName: string;
  value: number | null;
  inputs: Record<string, number>;
  missingFields: string[];
  invalidFields: string[];
  denominatorZero: boolean;
}

type Calculator = (inputs: Record<string, number>) => number | null;

function ratioPercent(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

const CALCULATORS: Record<string, Calculator> = {
  oee: (i) => {
    const runTime = i.planned_production_time - i.downtime_minutes;
    if (runTime <= 0 || i.planned_production_time <= 0 || i.total_units <= 0) return null;
    const availability = runTime / i.planned_production_time;
    const performance = (i.ideal_cycle_time_minutes * i.total_units) / runTime;
    const quality = i.good_units / i.total_units;
    return availability * performance * quality * 100;
  },
  firstPassYield: (i) => ratioPercent(i.good_units, i.total_units),
  scrapRate: (i) => ratioPercent(i.scrap_units, i.total_units),
  capacityUtilization: (i) => ratioPercent(i.actual_production_time, i.available_capacity_time),
  onTimeDelivery: (i) => ratioPercent(i.orders_delivered_on_time, i.orders_total),
  unitProductionCost: (i) => ratio(i.production_cost, i.total_units),
  inventoryTurnover: (i) => ratio(i.cogs, i.inventory_value),
  supplierDefectRate: (i) => ratioPercent(i.supplier_defect_units, i.received_units),
  grossMargin: (i) => {
    const revenue = i.net_sales ?? i.revenue;
    return revenue === undefined ? null : ratioPercent(revenue - i.cogs, revenue);
  },
  averageTransactionValue: (i) => ratio(i.net_sales, i.transactions),
  conversionRate: (i) => ratioPercent(i.transactions, i.footfall),
  stockoutRate: (i) => ratioPercent(i.stockout_units, i.demand_units),
  shrinkage: (i) => ratioPercent(i.shrink_value, i.net_sales),
  salesPerStore: (i) => ratio(i.net_sales, i.active_stores),
  returnRate: (i) => ratioPercent(i.returned_units, i.units_sold),
  netInterestMargin: (i) =>
    ratioPercent(i.interest_income - i.interest_expense, i.earning_assets),
  costIncomeRatio: (i) => ratioPercent(i.operating_expense, i.operating_income),
  nplRatio: (i) => ratioPercent(i.non_performing_loans, i.total_loans),
  loanToDeposit: (i) => ratioPercent(i.total_loans, i.total_deposits),
  returnOnEquity: (i) => ratioPercent(i.net_profit, i.equity),
  provisionCoverage: (i) => ratioPercent(i.loan_provisions, i.non_performing_loans),
  arr: (i) => i.mrr * 12,
  netRevenueRetention: (i) =>
    ratioPercent(
      i.starting_mrr + i.expansion_mrr - i.contraction_mrr - i.churned_mrr,
      i.starting_mrr
    ),
  churnRate: (i) => ratioPercent(i.churned_customers, i.starting_customers),
  cacPayback: (i) => {
    if (i.new_customers <= 0 || i.gross_margin_pct <= 0) return null;
    const cac = i.marketing_spend / i.new_customers;
    return ratio(cac, i.arpu * (i.gross_margin_pct / 100));
  },
  cloudCostRatio: (i) => ratioPercent(i.cloud_cost, i.revenue),
};

export function hasKpiCalculator(functionName: string): boolean {
  return Object.prototype.hasOwnProperty.call(CALCULATORS, functionName);
}

export function listKpiCalculatorNames(): string[] {
  return Object.keys(CALCULATORS).sort();
}

export function calculateKpiSpec(
  spec: Pick<KpiSpec, "functionName" | "requiredFields">,
  rawInputs: Record<string, unknown>
): KpiCalculation {
  const inputs: Record<string, number> = {};
  const invalidFields: string[] = [];
  for (const [field, raw] of Object.entries(rawInputs)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      inputs[field] = raw;
    } else if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) inputs[field] = parsed;
      else invalidFields.push(field);
    }
  }

  const missingFields = spec.requiredFields.filter((field) => inputs[field] === undefined);
  const calculator = CALCULATORS[spec.functionName];
  if (!calculator || missingFields.length > 0) {
    return {
      functionName: spec.functionName,
      value: null,
      inputs,
      missingFields,
      invalidFields,
      denominatorZero: false,
    };
  }

  const value = calculator(inputs);
  return {
    functionName: spec.functionName,
    value: value === null || !Number.isFinite(value) ? null : value,
    inputs,
    missingFields,
    invalidFields,
    denominatorZero: value === null,
  };
}
