import type { EnterpriseState } from "@/lib/db/repos/enterprise-state";

/**
 * Senaryo sonrası dijital ikiz karşılaştırması.
 *
 * Bu katman geleceği tahmin etmez; senaryonun AÇIKÇA verdiği finansal ve
 * operasyonel deltalarla mevcut durumun ne olacağını aynı şemada gösterir.
 * Para birimleri birbirine çevrilmez veya toplanmaz. KPI eşik durumu yeniden
 * hesaplanmış gibi gösterilmez.
 */

export type CurrencyAdjustmentField =
  | "orderValue"
  | "invoiceValue"
  | "paymentValue"
  | "accountBalance"
  | "projectBudget";

export interface CurrencyAdjustment {
  currency: string;
  orderValue?: number;
  invoiceValue?: number;
  paymentValue?: number;
  accountBalance?: number;
  projectBudget?: number;
}

export type OperationField =
  | "inventoryQuantity"
  | "projectCount"
  | "orderCount"
  | "invoiceCount"
  | "paymentCount"
  | "eventCount";

export interface DigitalTwinScenarioAdjustments {
  currencyAdjustments?: CurrencyAdjustment[];
  operationAdjustments?: Partial<Record<OperationField, number>>;
  kpiAdjustments?: Array<{ label: string; value: number }>;
  risks?: Array<{
    code: string;
    severity: "critical" | "warning" | "info";
    title: string;
    evidence: string;
  }>;
}

export interface DigitalTwinDelta {
  category: "financial" | "operation" | "kpi";
  key: string;
  currency: string | null;
  unit: string;
  baseline: number;
  projected: number;
  delta: number;
}

export interface DigitalTwinComparison {
  label: string;
  baselineAsOf: string;
  baseline: EnterpriseState;
  projected: EnterpriseState;
  deltas: DigitalTwinDelta[];
  summary: {
    currencies: string[];
    newCurrencies: string[];
    changedOperationalMetrics: number;
    changedKpis: number;
    addedRisks: number;
  };
  assumptions: string[];
  provenance: {
    source: string;
    method: string;
    note: string;
  };
}

const CURRENCY_FIELDS: CurrencyAdjustmentField[] = [
  "orderValue",
  "invoiceValue",
  "paymentValue",
  "accountBalance",
  "projectBudget",
];

const OPERATION_FIELDS: OperationField[] = [
  "inventoryQuantity",
  "projectCount",
  "orderCount",
  "invoiceCount",
  "paymentCount",
  "eventCount",
];

export const MAX_DIGITAL_TWIN_ADJUSTMENT = 1_000_000_000_000;

function round(value: number): number {
  const scaled = (value + Number.EPSILON) * 1_000_000;
  if (!Number.isFinite(value) || !Number.isFinite(scaled)) {
    throw new Error("Senaryo sonucu güvenli sayı aralığının dışına çıktı.");
  }
  return Math.round(scaled) / 1_000_000;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertAdjustment(value: unknown, label: string): asserts value is number {
  if (!finite(value)) throw new Error(`${label} sayısal olmalı.`);
  if (Math.abs(value) > MAX_DIGITAL_TWIN_ADJUSTMENT) {
    throw new Error(`${label} güvenli sayı aralığı dışında.`);
  }
}

function cloneState(state: EnterpriseState): EnterpriseState {
  return {
    ...state,
    entityCounts: state.entityCounts.map((item) => ({ ...item })),
    financials: {
      ...state.financials,
      byCurrency: state.financials.byCurrency.map((item) => ({ ...item })),
    },
    operations: { ...state.operations },
    kpis: state.kpis.map((item) => ({ ...item })),
    dependencies: state.dependencies.map((item) => ({ ...item })),
    risks: state.risks.map((item) => ({ ...item })),
    freshness: { ...state.freshness },
    coverage: { ...state.coverage },
    provenance: { ...state.provenance },
  };
}

export function compareDigitalTwinScenario(
  baseline: EnterpriseState,
  adjustments: DigitalTwinScenarioAdjustments,
  label = "Senaryo"
): DigitalTwinComparison {
  const projected = cloneState(baseline);
  const deltas: DigitalTwinDelta[] = [];
  const currencies = new Set<string>();
  const newCurrencies = new Set<string>();

  for (const adjustment of adjustments.currencyAdjustments ?? []) {
    const currency = adjustment.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Geçersiz para birimi: ${adjustment.currency}`);
    currencies.add(currency);
    let current = projected.financials.byCurrency.find((item) => item.currency === currency);
    if (!current) {
      current = {
        currency,
        orderValue: 0,
        invoiceValue: 0,
        paymentValue: 0,
        accountBalance: 0,
        projectBudget: 0,
      };
      projected.financials.byCurrency.push(current);
      newCurrencies.add(currency);
    }
    const baselineCurrency = baseline.financials.byCurrency.find((item) => item.currency === currency);
    for (const field of CURRENCY_FIELDS) {
      const delta = adjustment[field];
      if (delta === undefined) continue;
      assertAdjustment(delta, `${currency}.${field}`);
      const before = baselineCurrency?.[field] ?? 0;
      current[field] = round(current[field] + delta);
      deltas.push({
        category: "financial",
        key: field,
        currency,
        unit: currency,
        baseline: round(before),
        projected: round(current[field]),
        delta: round(delta),
      });
    }
  }

  for (const [field, delta] of Object.entries(adjustments.operationAdjustments ?? {}) as Array<
    [OperationField, number | undefined]
  >) {
    if (!OPERATION_FIELDS.includes(field)) throw new Error(`Geçersiz operasyon metriği: ${field}`);
    if (delta === undefined) continue;
    assertAdjustment(delta, field);
    const before = baseline.operations[field];
    const after = round(before + delta);
    if (after < 0) throw new Error(`${field} senaryo sonrası negatif olamaz.`);
    projected.operations[field] = after;
    deltas.push({
      category: "operation",
      key: field,
      currency: null,
      unit: field === "inventoryQuantity" ? "birim" : "adet",
      baseline: before,
      projected: after,
      delta: round(delta),
    });
  }

  for (const adjustment of adjustments.kpiAdjustments ?? []) {
    assertAdjustment(adjustment.value, `${adjustment.label} KPI değeri`);
    const target = projected.kpis.find((item) => item.label === adjustment.label);
    if (!target) throw new Error(`Senaryo KPI'sı mevcut dijital ikizde bulunamadı: ${adjustment.label}`);
    const before = target.value;
    if (before === null) throw new Error(`${adjustment.label} için mevcut sayısal KPI değeri yok.`);
    target.value = round(adjustment.value);
    target.thresholdStatus = "not_recalculated";
    deltas.push({
      category: "kpi",
      key: adjustment.label,
      currency: null,
      unit: target.unit ?? "",
      baseline: before,
      projected: target.value,
      delta: round(target.value - before),
    });
  }

  for (const risk of adjustments.risks ?? []) {
    if (!risk.code.trim() || !risk.title.trim() || !risk.evidence.trim()) {
      throw new Error("Senaryo riski kod, başlık ve kanıt içermeli.");
    }
    projected.risks.push({ ...risk });
  }

  const financialDeltas = deltas.filter((item) => item.category === "financial");
  const changedOperationalMetrics = deltas.filter(
    (item) => item.category === "operation" && item.delta !== 0
  ).length;
  const changedKpis = deltas.filter((item) => item.category === "kpi" && item.delta !== 0).length;
  projected.financials.byCurrency.sort((a, b) => a.currency.localeCompare(b.currency));
  projected.provenance = {
    source: `${baseline.provenance.source} + explicit scenario adjustments`,
    note: `${baseline.provenance.note} Senaryo farkları kullanıcı girdisidir; tahmin olarak sunulmaz.`,
  };

  return {
    label,
    baselineAsOf: baseline.asOf,
    baseline,
    projected,
    deltas,
    summary: {
      currencies: financialDeltas
        .map((item) => item.currency)
        .filter((value): value is string => Boolean(value))
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort(),
      newCurrencies: [...newCurrencies].sort(),
      changedOperationalMetrics,
      changedKpis,
      addedRisks: adjustments.risks?.length ?? 0,
    },
    assumptions: [
      "Senaryo etkileri açık delta olarak verilmiştir; motor bunları tahmin etmez.",
      "Para birimleri arasında dönüşüm veya toplama yapılmaz.",
      "KPI eşik durumu senaryo sonrası yeniden hesaplanmaz.",
    ],
    provenance: {
      source: "enterprise-state + digital-twin-comparison.ts",
      method: "deterministic-explicit-delta/v1",
      note: "Projeksiyon yalnızca verilen varsayımlar altında geçerlidir; nedensel veya istatistiksel tahmin iddiası taşımaz.",
    },
  };
}
