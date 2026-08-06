import { TAIS_CATEGORIES, type TaisCategoryId } from "./data";
import {
  computeOperationsKpis,
  computeCommercialKpis,
  computeManagementKpis,
  type TaisKpiInputs,
  type TaisKpiSnapshot,
} from "./kpi";
import { computeTaisRisks, type TaisRisk, type TaisRiskInputs } from "./risks";
import type { AiActionOption, AiCounterfactual, AiDecisionCase, AssessedSeverity } from "@/lib/ai/provider";

/**
 * TAIS "30 saniyelik yönetici ekranı" için veri katmanı (SAF fonksiyonlar).
 *
 * SOZLESME: bu dosya DB'ye dokunmaz. Filtreleme (zaman aralığı + hizmet türü +
 * müşteri + lokasyon), mevcut `computeTaisKpis`/`computeTaisRisks` motorlarını
 * DEĞİŞTİRMEDEN, onlara verilen HAM SATIRLARI (girdi) daraltarak yapılır —
 * böylece tüm hesaplamalar aynı deterministik çekirdekten geçer (bkz.
 * kpi.ts / risks.ts SÖZLEŞME notları). Zaman araligi anlami: gorev/sozlesme
 * gibi ILERI donuk (due) tarihler icin "gecikmis olan HER ZAMAN kapsamda"
 * (zaten dikkat gerektirir), henuz gelmemis olanlar icin secilen pencere
 * icinde mi diye bakilir; sikayet/kalite/aktivite/firsat gibi GERI donuk
 * (occurred/updated) tarihler icin pencere GERIYE dogru uygulanir (son N gun).
 */

export const TAIS_EXEC_RANGES = ["today", "7d", "30d"] as const;
export type TaisExecRange = (typeof TAIS_EXEC_RANGES)[number];

export const RANGE_LABEL: Record<TaisExecRange, string> = {
  today: "Bugün",
  "7d": "Son 7 gün",
  "30d": "Son 30 gün",
};

/** "today" = 1 gunluk ileri/geri pencere (bugune kadar/bugunden itibaren). */
export const RANGE_WINDOW_DAYS: Record<TaisExecRange, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
};

export interface TaisExecFilters {
  range: TaisExecRange;
  category: TaisCategoryId | null;
  customerId: string | null;
  locationId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ileri donuk (due) tarih: gecikmis olan her zaman kapsamda, degilse pencere icinde mi. */
function isForwardInRange(dueIso: string, referenceNowIso: string, windowDays: number): boolean {
  const due = new Date(dueIso).getTime();
  const now = new Date(referenceNowIso).getTime();
  if (due < now) return true;
  return due - now <= windowDays * DAY_MS;
}

/** Geri donuk (occurred/updated) tarih: son N gun icinde mi (gelecek tarihli kayit varsayilan olarak gizlenmez). */
function isBackwardInRange(occurredIso: string, referenceNowIso: string, windowDays: number): boolean {
  const occurred = new Date(occurredIso).getTime();
  const now = new Date(referenceNowIso).getTime();
  if (occurred > now) return true;
  return now - occurred <= windowDays * DAY_MS;
}

function computeFilteredCustomerCount(riskInputsFull: TaisRiskInputs, filters: TaisExecFilters): number {
  if (filters.customerId) return 1;
  if (filters.locationId) return 1;
  if (!filters.category) return riskInputsFull.customers.length;
  const withCategory = new Set(
    riskInputsFull.locations.filter((l) => l.category === filters.category).map((l) => l.customerId)
  );
  return withCategory.size;
}

/**
 * Yonetici ekrani filtrelerini (zaman araligi + hizmet turu + musteri +
 * lokasyon) HAM satirlara uygular; KPI/risk motorlari degismeden ayni
 * daraltilmis girdiyle yeniden calisir. Sozlesmeler zaman araligi
 * filtresine TABI DEGILDIR: yenileme penceresi risk motorunda zaten sabit
 * (30 gun), musteri onem agirligi ise tum aktif sozlesme gecmisine dayanir.
 */
export function filterExecutiveInputs(
  kpiInputsFull: TaisKpiInputs,
  riskInputsFull: TaisRiskInputs,
  filters: TaisExecFilters
): { kpiInputs: TaisKpiInputs; riskInputs: TaisRiskInputs } {
  const { referenceNow } = kpiInputsFull;
  const windowDays = RANGE_WINDOW_DAYS[filters.range];
  const locationCustomer = new Map(riskInputsFull.locations.map((l) => [l.id, l.customerId]));

  const matchCategory = (cat: TaisCategoryId) => !filters.category || cat === filters.category;
  const matchCustomer = (id: string | null) => !filters.customerId || id === filters.customerId;
  const matchLocation = (id: string | null) => !filters.locationId || id === filters.locationId;
  const matchCustomerOfLocation = (locationId: string) =>
    !filters.customerId || locationCustomer.get(locationId) === filters.customerId;

  const tasks = kpiInputsFull.tasks.filter(
    (t) =>
      matchCategory(t.category) &&
      matchCustomer(t.customerId) &&
      matchLocation(t.locationId) &&
      isForwardInRange(t.dueAt, referenceNow, windowDays)
  );
  const contracts = kpiInputsFull.contracts.filter((c) => matchCategory(c.category) && matchCustomer(c.customerId));
  const deals = kpiInputsFull.deals.filter(
    (d) =>
      matchCategory(d.category) &&
      matchCustomer(d.customerId) &&
      isBackwardInRange(d.updatedAt, referenceNow, windowDays)
  );
  const leads = kpiInputsFull.leads.filter((l) => matchCategory(l.category) && matchCustomer(l.customerId));
  const activities = kpiInputsFull.activities.filter(
    (a) => matchCustomer(a.customerId) && isBackwardInRange(a.occurredAt, referenceNow, windowDays)
  );
  const complaints = kpiInputsFull.complaints.filter(
    (c) =>
      matchCategory(c.category) &&
      matchCustomer(c.customerId) &&
      matchLocation(c.locationId) &&
      isBackwardInRange(c.openedAt, referenceNow, windowDays)
  );
  const qualityIssues = kpiInputsFull.qualityIssues.filter(
    (q) =>
      matchCategory(q.category) &&
      matchLocation(q.locationId) &&
      matchCustomerOfLocation(q.locationId) &&
      isBackwardInRange(q.openedAt, referenceNow, windowDays)
  );
  const teams = kpiInputsFull.teams.filter((t) => matchCategory(t.category));
  const customerCount = computeFilteredCustomerCount(riskInputsFull, filters);

  const kpiInputs: TaisKpiInputs = {
    referenceNow,
    teams,
    customerCount,
    tasks,
    contracts,
    deals,
    leads,
    activities,
    complaints,
    qualityIssues,
  };

  const customers = riskInputsFull.customers.filter((c) => matchCustomer(c.id));
  const locations = riskInputsFull.locations.filter(
    (l) => matchCategory(l.category) && matchCustomer(l.customerId) && matchLocation(l.id)
  );
  const serviceRequests = riskInputsFull.serviceRequests.filter(
    (r) =>
      matchCategory(r.category) &&
      matchCustomer(r.customerId) &&
      matchLocation(r.locationId) &&
      isBackwardInRange(r.openedAt, referenceNow, windowDays)
  );

  const riskInputs: TaisRiskInputs = {
    referenceNow,
    teams,
    customers,
    locations,
    tasks,
    contracts,
    deals,
    activities,
    complaints,
    qualityIssues,
    serviceRequests,
  };

  return { kpiInputs, riskInputs };
}

export interface TaisServiceAreaStatus {
  category: TaisCategoryId;
  label: string;
  status: "normal" | "attention" | "critical";
  healthScore: number;
  openTaskCount: number;
  overdueTaskCount: number;
  topRiskTitle: string | null;
}

/** Saglik skoru esikleri: operationsHealthScore (yuksek=iyi) uzerinden. */
export const HEALTH_THRESHOLDS = { critical: 40, attention: 70 } as const;

export function healthLevel(score: number): "normal" | "attention" | "critical" {
  if (score < HEALTH_THRESHOLDS.critical) return "critical";
  if (score < HEALTH_THRESHOLDS.attention) return "attention";
  return "normal";
}

/**
 * 6 hizmet alaninin kompakt durumu — her alan icin AYNI filtreler (zaman
 * araligi + musteri + lokasyon) uygulanir, kategori alanin kendisiyle
 * sabitlenir (bolum, "hizmet turu" filtresinden bagimsiz olarak HER ZAMAN
 * 6 alani gosterir). En kritik alan once siralanir.
 */
export function computeServiceAreaStatuses(
  kpiInputsFull: TaisKpiInputs,
  riskInputsFull: TaisRiskInputs,
  filters: Omit<TaisExecFilters, "category">
): TaisServiceAreaStatus[] {
  const areas = TAIS_CATEGORIES.map((cat) => {
    const areaFilters: TaisExecFilters = { ...filters, category: cat.id };
    const { kpiInputs, riskInputs } = filterExecutiveInputs(kpiInputsFull, riskInputsFull, areaFilters);
    const ops = computeOperationsKpis(kpiInputs);
    const commercial = computeCommercialKpis(kpiInputs);
    const management = computeManagementKpis(kpiInputs, ops, commercial);
    const risks = computeTaisRisks(riskInputs);
    return {
      category: cat.id,
      label: cat.label,
      status: healthLevel(management.operationsHealthScore),
      healthScore: management.operationsHealthScore,
      openTaskCount: ops.activeTaskCount,
      overdueTaskCount: ops.overdueTaskCount,
      topRiskTitle: risks[0]?.title ?? null,
    };
  });
  return areas.sort((a, b) => a.healthScore - b.healthScore || a.category.localeCompare(b.category));
}

export function selectTopRisks(risks: TaisRisk[], n = 3): TaisRisk[] {
  return risks.slice(0, n);
}

export interface TaisDecisionMeta {
  caseId: string;
  decisionId: string;
  state: string;
  riskIds: string[];
  case: AiDecisionCase;
}

export interface TaisMainDecisionView {
  caseId: string;
  decisionId: string;
  state: string;
  title: string;
  businessImpact: string;
  confidence: number;
  confidenceRationale: string;
  severity: AssessedSeverity;
  options: AiActionOption[];
  recommendedOptionRank: number;
  counterfactual: AiCounterfactual;
  evidenceCount: number;
  matchedRiskCount: number;
}

/**
 * TAIS'in sabit 6 kararindan, mevcut filtreye gore riskleri en cok kesisen
 * karari secer (baglanti = decision_records.payload.riskIds, bkz.
 * decisions.ts). Kesisim 0 olan kararlar elenir; hicbiri eslesmezse null
 * doner (UI "bu filtrede oncelikli karar yok" gosterir — uydurma yok).
 * Beraberlikte `decisions` dizisindeki ILK eslesen (created_at ASC —
 * cagiran bu sirada sorgular) tercih edilir, bu da varsayilan olarak ana
 * karari (en cok risk baglantili olan) one cikarir.
 */
export function pickMainDecision(
  decisions: TaisDecisionMeta[],
  filteredRiskIds: Set<string>
): TaisMainDecisionView | null {
  let best: { d: TaisDecisionMeta; match: number } | null = null;
  for (const d of decisions) {
    const match = d.riskIds.filter((id) => filteredRiskIds.has(id)).length;
    if (match === 0) continue;
    if (!best || match > best.match) best = { d, match };
  }
  if (!best) return null;
  const { d, match } = best;
  return {
    caseId: d.caseId,
    decisionId: d.decisionId,
    state: d.state,
    title: d.case.title,
    businessImpact: d.case.businessImpact,
    confidence: d.case.confidence,
    confidenceRationale: d.case.confidenceRationale,
    severity: d.case.severity,
    options: d.case.options,
    recommendedOptionRank: d.case.recommendedOptionRank,
    counterfactual: d.case.counterfactual,
    evidenceCount: d.case.evidence.length,
    matchedRiskCount: match,
  };
}

export interface TaisActionRow {
  id: string;
  decisionId: string;
  caseId: string;
  title: string;
  owner: string;
  dueAt: string | null;
  status: string;
  relatedRiskId: string | null;
}

/**
 * Aksiyonu su anki filtreli risk kumesine (relatedRiskId) veya (baglanti
 * yoksa) secilen ana karara (decisionId) gore kapsam-icinde sayar. Girdi
 * `actions` cagiran tarafindan zaten son tarihe gore siralanmis olmalidir.
 */
export function selectTopActions(
  actions: TaisActionRow[],
  filteredRiskIds: Set<string>,
  fallbackDecisionId: string | null,
  n = 3
): TaisActionRow[] {
  const inScope = actions.filter(
    (a) =>
      (a.relatedRiskId !== null && filteredRiskIds.has(a.relatedRiskId)) ||
      (fallbackDecisionId !== null && a.decisionId === fallbackDecisionId)
  );
  return inScope.slice(0, n);
}

/**
 * 80-120 kelime hedefleyen, TAMAMEN veri katmanindan turetilmis yonetici
 * brifingi (LLM cagrisi YOK — sayi uydurma riskini yapisal olarak ortadan
 * kaldirir). Kapsam bos ise (risk/karar/aksiyon yok) metin dogal olarak
 * kisalir; bu durumda da tum ifadeler gercek (bos) durumu yansitir.
 */
export function buildExecutiveBrief(params: {
  range: TaisExecRange;
  kpis: TaisKpiSnapshot;
  topRisks: TaisRisk[];
  main: TaisMainDecisionView | null;
  actionCount: number;
  totalRiskCount?: number;
  criticalRiskCount?: number;
  warningRiskCount?: number;
}): string {
  const { range, kpis, topRisks, main, actionCount } = params;
  const periodLabel = RANGE_LABEL[range].toLocaleLowerCase("tr-TR");
  const { operationsHealthScore, slaComplianceRatePct, customerRiskScore, dataFreshnessScorePct, estimatedPreventableLossAzn } =
    kpis.management;
  const criticalCount = params.criticalRiskCount ?? topRisks.filter((r) => r.severity === "critical").length;
  const warningCount = params.warningRiskCount ?? topRisks.filter((r) => r.severity === "warning").length;
  const totalRiskCount = params.totalRiskCount ?? topRisks.length;
  const topRisk = topRisks[0];

  const sentences: string[] = [
    `${periodLabel} kapsamında TAIS operasyon sağlık skoru %${operationsHealthScore}, SLA uyum oranı %${slaComplianceRatePct} olarak ölçülüyor.`,
    topRisk
      ? `En öncelikli risk "${topRisk.title}" (güven %${topRisk.confidence}); bu kapsamda toplam ${totalRiskCount} risk kaydı, ${criticalCount} kritik ve ${warningCount} uyarı seviyesi bulunuyor.`
      : `Bu kapsamda öne çıkan bir risk kaydı bulunmuyor.`,
    main
      ? `Yönetimin bugün vermesi gereken karar: "${main.title}"; ${main.evidenceCount} kanıt kaydına dayanıyor, güven düzeyi %${main.confidence}.`
      : `Bu filtre kapsamında öncelikli bir yönetici kararı bulunmuyor.`,
    actionCount > 0
      ? `Şu an ${actionCount} önerilen aksiyon takip ediliyor.`
      : `Şu an bu kapsamda açık önerilen aksiyon yok.`,
    `Kaybedilme riski taşıyan müşteri oranı %${customerRiskScore}, önlenebilir tahmini kayıp ${Math.round(estimatedPreventableLossAzn)} AZN; veri güncellik skoru %${dataFreshnessScorePct}. Bu özet Bitrix24 uyumlu demo verisinden deterministik olarak hesaplanmıştır.`,
  ];
  return sentences.join(" ");
}
