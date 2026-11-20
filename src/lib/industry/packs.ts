import type { IndustryPack, KpiSpec } from "./types";

/**
 * Sektör zekâ paketleri (v1). Her KPI'nın formülü ve gerekli kanonik alanları
 * açıktır. Paketler yalnızca öneri üretir: veri yoksa KPI "kullanılamaz"
 * olarak işaretlenir, sayı uydurulmaz.
 */

const MANUFACTURING: IndustryPack = {
  id: "manufacturing",
  label: "Üretim ve sanayi",
  version: 2,
  note: "Kesikli/süreç üretimi, otomotiv tedarikçileri ve elektronik için ortak çekirdek.",
  subsectors: [
    { id: "discrete", label: "Kesikli üretim", keywords: ["work_order", "bom", "assembly"] },
    { id: "process", label: "Süreç üretimi", keywords: ["batch", "reactor", "formula"] },
    { id: "automotive_supplier", label: "Otomotiv tedarikçisi", keywords: ["ppap", "oem", "line_side"] },
  ],
  sectorHints: ["manufacturing", "industrial"],
  signals: {
    fieldKeywords: [
      "machine",
      "work_order",
      "bom",
      "yield",
      "scrap",
      "downtime",
      "planned_production",
      "good_units",
      "defect",
      "production_cost",
      "wip",
    ],
    entityHints: ["product", "inventory"],
    labelKeywords: ["oee", "yield", "scrap", "duruş", "üretim", "hat", "fire"],
  },
  kpis: [
    {
      id: "oee",
      name: "Ekipman etkinliği (OEE)",
      category: "operational",
      functionName: "oee",
      formula:
        "kullanılabilirlik × performans × kalite; performans = ideal çevrim süresi × üretilen birim / çalışma süresi",
      unit: "%",
      requiredFields: [
        "planned_production_time",
        "downtime_minutes",
        "ideal_cycle_time_minutes",
        "total_units",
        "good_units",
      ],
      priority: "core",
    },
    {
      id: "first_pass_yield",
      name: "İlk geçiş verimi",
      category: "operational",
      functionName: "firstPassYield",
      formula: "ilk seferde hatasız birim / toplam birim",
      unit: "%",
      requiredFields: ["good_units", "total_units"],
      priority: "core",
    },
    {
      id: "scrap_rate",
      name: "Fire oranı",
      category: "operational",
      functionName: "scrapRate",
      formula: "fire birim / toplam üretim",
      unit: "%",
      requiredFields: ["scrap_units", "total_units"],
      priority: "core",
    },
    {
      id: "capacity_utilization",
      name: "Kapasite kullanımı",
      category: "operational",
      functionName: "capacityUtilization",
      formula: "gerçek üretim süresi / kullanılabilir kapasite",
      unit: "%",
      requiredFields: ["actual_production_time", "available_capacity_time"],
      priority: "core",
    },
    {
      id: "on_time_delivery",
      name: "Zamanında teslimat",
      category: "supply-chain",
      functionName: "onTimeDelivery",
      formula: "zamanında teslim edilen sipariş / toplam sipariş",
      unit: "%",
      requiredFields: ["orders_delivered_on_time", "orders_total"],
      priority: "core",
    },
    {
      id: "unit_production_cost",
      name: "Birim üretim maliyeti",
      category: "financial",
      functionName: "unitProductionCost",
      formula: "toplam üretim maliyeti / üretilen birim",
      unit: "currency/unit",
      requiredFields: ["production_cost", "total_units"],
      priority: "core",
    },
    {
      id: "inventory_turnover",
      name: "Stok devir hızı",
      category: "supply-chain",
      functionName: "inventoryTurnover",
      formula: "satılan malın maliyeti / ortalama stok değeri",
      unit: "x",
      requiredFields: ["cogs", "inventory_value"],
      priority: "extended",
    },
    {
      id: "supplier_defect_rate",
      name: "Tedarikçi hata oranı",
      category: "supply-chain",
      functionName: "supplierDefectRate",
      formula: "hatalı gelen birim / gelen toplam birim",
      unit: "%",
      requiredFields: ["supplier_defect_units", "received_units"],
      priority: "extended",
    },
  ],
};

const RETAIL: IndustryPack = {
  id: "retail",
  label: "Perakende ve e-ticaret",
  version: 1,
  note: "Market, moda, elektronik, indirim perakendesi ve pazar yerleri için ortak çekirdek.",
  subsectors: [
    { id: "grocery", label: "Market", keywords: ["basket", "fresh", "store"] },
    { id: "fashion", label: "Moda", keywords: ["sku", "season", "size"] },
    { id: "electronics", label: "Elektronik", keywords: ["warranty", "serial"] },
    { id: "marketplace", label: "Pazar yeri", keywords: ["seller", "listing", "gmv"] },
  ],
  sectorHints: ["retail", "ecommerce", "commerce"],
  signals: {
    fieldKeywords: [
      "store",
      "sku",
      "units_sold",
      "basket",
      "footfall",
      "stockout",
      "shrink",
      "sell_through",
      "transactions",
      "inventory_units",
      "returns",
    ],
    entityHints: ["product", "order", "inventory"],
    labelKeywords: ["stok", "mağaza", "sepet", "ciro", "satış", "iade", "shrink"],
  },
  kpis: [
    {
      id: "gross_margin",
      name: "Brüt kâr marjı",
      category: "financial",
      functionName: "grossMargin",
      formula: "(net satış − satılan malın maliyeti) / net satış",
      unit: "%",
      requiredFields: ["net_sales", "cogs"],
      priority: "core",
    },
    {
      id: "average_transaction_value",
      name: "Ortalama sepet tutarı",
      category: "commercial",
      functionName: "averageTransactionValue",
      formula: "net satış / işlem sayısı",
      unit: "currency",
      requiredFields: ["net_sales", "transactions"],
      priority: "core",
    },
    {
      id: "conversion_rate",
      name: "Dönüşüm oranı",
      category: "commercial",
      functionName: "conversionRate",
      formula: "işlem sayısı / ziyaretçi sayısı",
      unit: "%",
      requiredFields: ["transactions", "footfall"],
      priority: "core",
    },
    {
      id: "inventory_turnover",
      name: "Stok devir hızı",
      category: "supply-chain",
      functionName: "inventoryTurnover",
      formula: "satılan malın maliyeti / ortalama stok değeri",
      unit: "x",
      requiredFields: ["cogs", "inventory_value"],
      priority: "core",
    },
    {
      id: "stockout_rate",
      name: "Stokta yoklama oranı",
      category: "operational",
      functionName: "stockoutRate",
      formula: "stokta olmayan SKU-zaman / toplam SKU-zaman",
      unit: "%",
      requiredFields: ["stockout_units", "demand_units"],
      priority: "core",
    },
    {
      id: "shrinkage",
      name: "Kayıp/kaçak oranı",
      category: "operational",
      functionName: "shrinkage",
      formula: "açıklanamayan stok kaybı / satış",
      unit: "%",
      requiredFields: ["shrink_value", "net_sales"],
      priority: "core",
    },
    {
      id: "sales_per_store",
      name: "Mağaza başına satış",
      category: "commercial",
      functionName: "salesPerStore",
      formula: "net satış / aktif mağaza sayısı",
      unit: "currency",
      requiredFields: ["net_sales", "active_stores"],
      priority: "extended",
    },
    {
      id: "return_rate",
      name: "İade oranı",
      category: "operational",
      functionName: "returnRate",
      formula: "iade edilen birim / satılan birim",
      unit: "%",
      requiredFields: ["returned_units", "units_sold"],
      priority: "extended",
    },
  ],
};

const BANKING: IndustryPack = {
  id: "banking",
  label: "Bankacılık ve finansal hizmetler",
  version: 1,
  note: "Ticari bankacılık, ödeme ve varlık yönetimi için ortak çekirdek.",
  subsectors: [
    { id: "commercial_banking", label: "Ticari bankacılık", keywords: ["loan", "deposit", "branch"] },
    { id: "payments", label: "Ödemeler", keywords: ["transaction", "merchant", "settlement"] },
    { id: "asset_management", label: "Varlık yönetimi", keywords: ["aum", "portfolio", "fund"] },
  ],
  sectorHints: ["banking", "finance", "financial"],
  signals: {
    fieldKeywords: [
      "loan",
      "deposit",
      "interest_income",
      "interest_expense",
      "non_performing",
      "npl",
      "equity",
      "capital",
      "provision",
      "branch",
      "account",
    ],
    entityHints: ["account", "invoice", "payment"],
    labelKeywords: ["kredi", "mevduat", "faiz", "sermaye", "takipteki", "likidite"],
  },
  kpis: [
    {
      id: "net_interest_margin",
      name: "Net faiz marjı",
      category: "financial",
      functionName: "netInterestMargin",
      formula: "(faiz geliri − faiz gideri) / ortalama faiz getiren varlıklar",
      unit: "%",
      requiredFields: ["interest_income", "interest_expense", "earning_assets"],
      priority: "core",
    },
    {
      id: "cost_income_ratio",
      name: "Maliyet/gelir oranı",
      category: "financial",
      functionName: "costIncomeRatio",
      formula: "faaliyet gideri / faaliyet geliri",
      unit: "%",
      requiredFields: ["operating_expense", "operating_income"],
      priority: "core",
    },
    {
      id: "npl_ratio",
      name: "Takipteki kredi oranı",
      category: "risk",
      functionName: "nplRatio",
      formula: "takipteki krediler / toplam krediler",
      unit: "%",
      requiredFields: ["non_performing_loans", "total_loans"],
      priority: "core",
    },
    {
      id: "loan_to_deposit",
      name: "Kredi/mevduat oranı",
      category: "risk",
      functionName: "loanToDeposit",
      formula: "toplam krediler / toplam mevduat",
      unit: "%",
      requiredFields: ["total_loans", "total_deposits"],
      priority: "core",
    },
    {
      id: "return_on_equity",
      name: "Özkaynak kârlılığı",
      category: "financial",
      functionName: "returnOnEquity",
      formula: "net kâr / ortalama özkaynak",
      unit: "%",
      requiredFields: ["net_profit", "equity"],
      priority: "core",
    },
    {
      id: "provision_coverage",
      name: "Karşılık kapsama oranı",
      category: "risk",
      functionName: "provisionCoverage",
      formula: "ayrılan karşılık / takipteki krediler",
      unit: "%",
      requiredFields: ["loan_provisions", "non_performing_loans"],
      priority: "extended",
    },
  ],
};

const TECHNOLOGY: IndustryPack = {
  id: "technology",
  label: "Teknoloji ve SaaS",
  version: 1,
  note: "Abonelik, lisans, bulut altyapısı ve pazar yeri iş modelleri için ortak çekirdek.",
  subsectors: [
    { id: "saas", label: "SaaS", keywords: ["subscription", "seat", "arr"] },
    { id: "cloud_infra", label: "Bulut altyapısı", keywords: ["compute", "usage", "cloud_cost"] },
    { id: "marketplace", label: "Pazar yeri", keywords: ["gmv", "take_rate", "seller"] },
  ],
  sectorHints: ["technology", "software", "saas"],
  signals: {
    fieldKeywords: [
      "subscription",
      "arr",
      "mrr",
      "churn",
      "seats",
      "cloud_cost",
      "support_cost",
      "marketing_spend",
      "active_users",
      "take_rate",
    ],
    entityHints: ["customer", "subscription", "product"],
    labelKeywords: ["abonelik", "churn", "arr", "mrr", "müşteri", "bulut"],
  },
  kpis: [
    {
      id: "arr",
      name: "Yıllık yinelenen gelir (ARR)",
      category: "financial",
      functionName: "arr",
      formula: "aktif aboneliklerin yıllıklandırılmış geliri",
      unit: "currency",
      requiredFields: ["mrr"],
      priority: "core",
    },
    {
      id: "net_revenue_retention",
      name: "Net gelir tutundurma (NRR)",
      category: "commercial",
      functionName: "netRevenueRetention",
      formula: "(başlangıç + genişleme − daralma − churn) / başlangıç MRR",
      unit: "%",
      requiredFields: ["starting_mrr", "expansion_mrr", "contraction_mrr", "churned_mrr"],
      priority: "core",
    },
    {
      id: "churn_rate",
      name: "Müşteri churn oranı",
      category: "commercial",
      functionName: "churnRate",
      formula: "dönem içinde kaybedilen müşteri / dönem başı müşteri",
      unit: "%",
      requiredFields: ["churned_customers", "starting_customers"],
      priority: "core",
    },
    {
      id: "gross_margin",
      name: "Brüt kâr marjı",
      category: "financial",
      functionName: "grossMargin",
      formula: "(gelir − servis maliyeti) / gelir",
      unit: "%",
      requiredFields: ["revenue", "cogs"],
      priority: "core",
    },
    {
      id: "cac_payback",
      name: "CAC geri ödeme süresi",
      category: "commercial",
      functionName: "cacPayback",
      formula: "müşteri edinme maliyeti / aylık brüt kâr (müşteri başına)",
      unit: "months",
      requiredFields: ["marketing_spend", "new_customers", "arpu", "gross_margin_pct"],
      priority: "extended",
    },
    {
      id: "cloud_cost_ratio",
      name: "Bulut maliyeti/gelir oranı",
      category: "operational",
      functionName: "cloudCostRatio",
      formula: "bulut altyapı maliyeti / gelir",
      unit: "%",
      requiredFields: ["cloud_cost", "revenue"],
      priority: "extended",
    },
  ],
};

export const INDUSTRY_PACKS: IndustryPack[] = [MANUFACTURING, RETAIL, BANKING, TECHNOLOGY];

export function getPack(id: string): IndustryPack | undefined {
  return INDUSTRY_PACKS.find((p) => p.id === id);
}

export interface LocatedKpiSpec {
  packId: string;
  packVersion: number;
  spec: KpiSpec;
}

/** Aynı KPI kimliğinin bulunduğu tüm paketleri döndürür. */
export function listKpiSpecCandidates(id: string): LocatedKpiSpec[] {
  return INDUSTRY_PACKS.flatMap((pack) =>
    pack.kpis
      .filter((kpi) => kpi.id === id)
      .map((spec) => ({ packId: pack.id, packVersion: pack.version, spec }))
  );
}

/** Aynı KPI kimliği birden fazla pakette olabilir; öncelik verilen paket seçilir. */
export function getKpiSpec(id: string, preferredPackId?: string): LocatedKpiSpec | undefined {
  const candidates = listKpiSpecCandidates(id);
  return preferredPackId
    ? candidates.find((candidate) => candidate.packId === preferredPackId)
    : candidates[0];
}

/**
 * Konnektör yapılandırmasında `kpiId` veya `packId:kpiId` kabul edilir.
 * Alan kümesi verildiğinde aynı kimliğin paketler arasındaki uygun sürümü
 * gerekli kanonik alanlara göre seçilir; belirsizlik sessizce çözülmez.
 */
export function resolveKpiSpec(key: string, availableFields?: string[]): LocatedKpiSpec | undefined {
  const [maybePack, maybeId] = key.includes(":") ? key.split(":", 2) : [undefined, key];
  const candidates = maybePack
    ? listKpiSpecCandidates(maybeId).filter((candidate) => candidate.packId === maybePack)
    : listKpiSpecCandidates(maybeId);
  if (candidates.length === 0) return undefined;
  if (maybePack || !availableFields) return candidates.length === 1 ? candidates[0] : undefined;

  const matches = candidates.filter((located) =>
    located.spec.requiredFields.every((field) => availableFields.includes(field))
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return undefined;
  return candidates.length === 1 ? candidates[0] : undefined;
}
