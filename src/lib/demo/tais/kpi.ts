import { getDb, migrate } from "@/lib/db/client";
import type { TaisCategoryId } from "./data";

/**
 * TAIS IKF MMC demosu icin KPI hesaplama katmani.
 *
 * SOZLESME: bu dosyadaki tum `compute*` fonksiyonlari SAF'tir — girdi olarak
 * yalnizca DB'den okunmus satirlari alir, sabit sayi/istatistik icermez ve
 * ayni girdi icin daima ayni ciktiyi uretir (bkz. tests/tais-kpi.test.ts).
 * `loadTaisKpiInputs` tek DB'ye dokunan fonksiyondur; satirlari okuyup bu
 * saf fonksiyonlara aktarir. LLM'e sayi urettirilmez — bkz. docs/AI_ARCHITECTURE.md.
 */

export interface TaisTeamRow {
  id: string;
  name: string;
  category: TaisCategoryId;
  capacity: number;
}

export interface TaisTaskRow {
  id: string;
  category: TaisCategoryId;
  teamId: string;
  locationId: string;
  customerId: string;
  employeeId: string | null;
  status: "open" | "in_progress" | "done";
  dueAt: string;
  completedAt: string | null;
}

export interface TaisContractRow {
  id: string;
  customerId: string;
  category: TaisCategoryId;
  status: string;
  valueAzn: number;
  renewalDate: string;
}

export interface TaisDealRow {
  id: string;
  customerId: string;
  category: TaisCategoryId;
  stage: "prospecting" | "negotiation" | "won" | "lost";
  valueAzn: number;
  updatedAt: string;
}

export interface TaisLeadRow {
  id: string;
  customerId: string | null;
  category: TaisCategoryId;
  stage: "new" | "contacted" | "qualified" | "lost";
}

export interface TaisActivityRow {
  id: string;
  customerId: string;
  dealId: string | null;
  occurredAt: string;
}

export interface TaisComplaintRow {
  id: string;
  customerId: string;
  locationId: string;
  category: TaisCategoryId;
  status: string;
  openedAt: string;
}

export interface TaisQualityIssueRow {
  id: string;
  locationId: string;
  category: TaisCategoryId;
  status: string;
  openedAt: string;
}

export interface TaisKpiInputs {
  /** Demo "su an"i — tum zaman-bagimli KPI'lar buna gore hesaplanir (bkz. seed.ts TAIS_REFERENCE_NOW). */
  referenceNow: string;
  teams: TaisTeamRow[];
  customerCount: number;
  tasks: TaisTaskRow[];
  contracts: TaisContractRow[];
  deals: TaisDealRow[];
  leads: TaisLeadRow[];
  activities: TaisActivityRow[];
  complaints: TaisComplaintRow[];
  qualityIssues: TaisQualityIssueRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (60 * 60 * 1000);
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : round1((part / total) * 100);
}

// ---------------------------------------------------------------------------
// Operasyon KPI'lari
// ---------------------------------------------------------------------------

/** SLA riski penceresi: acik gorev, son tarihi henuz gecmemis ama 48 saat icinde. */
const SLA_RISK_WINDOW_HOURS = 48;
/** "Takipsiz musteri" ve "veri guncelligi" pencereleri icin referans gun sayisi. */
const STALE_ACTIVITY_DAYS = 30;
const FRESHNESS_WINDOW_DAYS = 14;
/** Tekrarlanan hizmet problemi: ayni musteride en az bu kadar sikayet kaydi. */
const RECURRING_COMPLAINT_MIN = 2;
/** Yaklasan sozlesme yenilemesi penceresi (gun). */
const RENEWAL_SOON_DAYS = 30;

export interface OperationsKpis {
  /** status != 'done' olan tum gorevler. */
  activeTaskCount: number;
  /** status === 'done'. */
  completedTaskCount: number;
  /** status != 'done' && dueAt < referenceNow — son tarihi gecmis, hala acik/devam eden. */
  overdueTaskCount: number;
  /** status === 'open' && 0 <= dueAt-referenceNow <= 48s — henuz gecmemis ama yakin. */
  slaRiskTaskCount: number;
  /** employeeId NULL ve status != 'done'. */
  unassignedTaskCount: number;
  /**
   * Tamamlanan gorevlerde son tarihe gore ortalama sapma (gun). Negatif = ortalama
   * olarak son tarihten ONCE tamamlaniyor, pozitif = ortalama olarak GEC tamamlaniyor.
   */
  avgCompletionDeviationDays: number | null;
  /** Kategoriye gore gorev sayisi (toplam / acik / geciken). */
  tasksByCategory: Array<{ category: TaisCategoryId; total: number; open: number; overdue: number }>;
  /** Ekibe gore is yuku: acik gorev sayisi / kapasite orani. */
  workloadByTeam: Array<{ teamId: string; teamName: string; openTaskCount: number; capacity: number; utilization: number }>;
  /** Lokasyona gore acik is (status != 'done') sayisi. */
  openWorkByLocation: Array<{ locationId: string; openTaskCount: number }>;
  /** En az RECURRING_COMPLAINT_MIN sikayeti olan musteriler. */
  recurringComplaintCustomers: Array<{ customerId: string; complaintCount: number }>;
  /** status === 'open' kalite uygunsuzlugu sayisi. */
  openQualityIssueCount: number;
  /** status === 'open' sikayet sayisi. */
  openComplaintCount: number;
}

export function computeOperationsKpis(inputs: TaisKpiInputs): OperationsKpis {
  const { referenceNow, tasks, complaints, qualityIssues, teams } = inputs;

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const completedTasks = tasks.filter((t) => t.status === "done");
  const overdueTasks = activeTasks.filter((t) => new Date(t.dueAt).getTime() < new Date(referenceNow).getTime());
  const slaRiskTasks = tasks.filter((t) => {
    if (t.status !== "open") return false;
    const h = hoursBetween(referenceNow, t.dueAt);
    return h >= 0 && h <= SLA_RISK_WINDOW_HOURS;
  });
  const unassignedTasks = activeTasks.filter((t) => t.employeeId === null);

  const completedWithDue = completedTasks.filter((t) => t.completedAt !== null);
  const avgCompletionDeviationDays =
    completedWithDue.length === 0
      ? null
      : round1(
          completedWithDue.reduce((sum, t) => sum + daysBetween(t.dueAt, t.completedAt as string), 0) /
            completedWithDue.length
        );

  const categoryMap = new Map<TaisCategoryId, { total: number; open: number; overdue: number }>();
  for (const t of tasks) {
    const entry = categoryMap.get(t.category) ?? { total: 0, open: 0, overdue: 0 };
    entry.total += 1;
    if (t.status !== "done") entry.open += 1;
    if (t.status !== "done" && new Date(t.dueAt).getTime() < new Date(referenceNow).getTime()) entry.overdue += 1;
    categoryMap.set(t.category, entry);
  }
  const tasksByCategory = Array.from(categoryMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => a.category.localeCompare(b.category));

  const openByTeam = new Map<string, number>();
  for (const t of activeTasks) {
    openByTeam.set(t.teamId, (openByTeam.get(t.teamId) ?? 0) + 1);
  }
  const workloadByTeam = teams
    .map((team) => {
      const openTaskCount = openByTeam.get(team.id) ?? 0;
      return {
        teamId: team.id,
        teamName: team.name,
        openTaskCount,
        capacity: team.capacity,
        utilization: team.capacity === 0 ? 0 : round1(openTaskCount / team.capacity),
      };
    })
    .sort((a, b) => b.utilization - a.utilization);

  const openByLocation = new Map<string, number>();
  for (const t of activeTasks) {
    openByLocation.set(t.locationId, (openByLocation.get(t.locationId) ?? 0) + 1);
  }
  const openWorkByLocation = Array.from(openByLocation.entries())
    .map(([locationId, openTaskCount]) => ({ locationId, openTaskCount }))
    .sort((a, b) => b.openTaskCount - a.openTaskCount);

  const complaintsByCustomer = new Map<string, number>();
  for (const c of complaints) {
    complaintsByCustomer.set(c.customerId, (complaintsByCustomer.get(c.customerId) ?? 0) + 1);
  }
  const recurringComplaintCustomers = Array.from(complaintsByCustomer.entries())
    .filter(([, count]) => count >= RECURRING_COMPLAINT_MIN)
    .map(([customerId, complaintCount]) => ({ customerId, complaintCount }))
    .sort((a, b) => b.complaintCount - a.complaintCount);

  return {
    activeTaskCount: activeTasks.length,
    completedTaskCount: completedTasks.length,
    overdueTaskCount: overdueTasks.length,
    slaRiskTaskCount: slaRiskTasks.length,
    unassignedTaskCount: unassignedTasks.length,
    avgCompletionDeviationDays,
    tasksByCategory,
    workloadByTeam,
    openWorkByLocation,
    recurringComplaintCustomers,
    openQualityIssueCount: qualityIssues.filter((q) => q.status === "open").length,
    openComplaintCount: complaints.filter((c) => c.status === "open").length,
  };
}

// ---------------------------------------------------------------------------
// CRM / ticari KPI'lar
// ---------------------------------------------------------------------------

export interface CommercialKpis {
  /** stage 'lost' disindaki lead'ler. */
  openLeadCount: number;
  /** stage 'prospecting' | 'negotiation'. */
  openDealCount: number;
  /** Acik deal'lerden STALE_ACTIVITY_DAYS gundur guncellenmemis olanlar. */
  staleDealCount: number;
  /** Son STALE_ACTIVITY_DAYS gunde hic aktivitesi olmayan musteri sayisi (musteri kumesi = aktivite/anlasma/sozlesmesi olan tum musteriler). */
  inactiveCustomerCount: number;
  /** renewalDate, referenceNow'dan RENEWAL_SOON_DAYS gun icinde olan sozlesmeler. */
  upcomingRenewalCount: number;
  /**
   * Kaybedilme riski: yenilemesi yaklasan (<=RENEWAL_SOON_DAYS gun) VE son
   * STALE_ACTIVITY_DAYS gunde hic aktivitesi olmayan musteriler.
   */
  churnRiskCustomerIds: string[];
  /** Toplam aktivite kaydi sayisi. */
  salesActivityCount: number;
  /**
   * Lead nitelendirme orani (%) = 'qualified' asamasindaki lead / toplam lead.
   * NOT: semada lead->deal dogrudan iliski yok (bkz. docs/TAIS_DEMO_SCOPE.md);
   * bu yuzden gercek donusum yerine nitelendirme orani proxy olarak kullanilir.
   */
  leadQualificationRatePct: number;
  /** Acik (prospecting/negotiation) deal'lerin ortalama asamada bekleme suresi (gun). */
  avgDealStageAgeDays: number | null;
}

export function computeCommercialKpis(inputs: TaisKpiInputs): CommercialKpis {
  const { referenceNow, contracts, deals, leads, activities } = inputs;

  const openLeads = leads.filter((l) => l.stage !== "lost");
  const openDeals = deals.filter((d) => d.stage === "prospecting" || d.stage === "negotiation");
  const staleDeals = openDeals.filter((d) => daysBetween(d.updatedAt, referenceNow) >= STALE_ACTIVITY_DAYS);

  const lastActivityByCustomer = new Map<string, string>();
  for (const a of activities) {
    const prev = lastActivityByCustomer.get(a.customerId);
    if (!prev || new Date(a.occurredAt).getTime() > new Date(prev).getTime()) {
      lastActivityByCustomer.set(a.customerId, a.occurredAt);
    }
  }
  const trackedCustomerIds = new Set<string>([
    ...contracts.map((c) => c.customerId),
    ...deals.map((d) => d.customerId),
    ...activities.map((a) => a.customerId),
  ]);
  const inactiveCustomerIds = Array.from(trackedCustomerIds).filter((customerId) => {
    const last = lastActivityByCustomer.get(customerId);
    return !last || daysBetween(last, referenceNow) >= STALE_ACTIVITY_DAYS;
  });

  const upcomingRenewals = contracts.filter(
    (c) => c.status === "active" && daysBetween(referenceNow, c.renewalDate) <= RENEWAL_SOON_DAYS
  );
  const upcomingRenewalCustomerIds = new Set(upcomingRenewals.map((c) => c.customerId));
  const churnRiskCustomerIds = Array.from(upcomingRenewalCustomerIds).filter((customerId) =>
    inactiveCustomerIds.includes(customerId)
  );

  const qualifiedLeads = leads.filter((l) => l.stage === "qualified");
  const leadQualificationRatePct = pct(qualifiedLeads.length, leads.length);

  const avgDealStageAgeDays =
    openDeals.length === 0
      ? null
      : round1(openDeals.reduce((sum, d) => sum + daysBetween(d.updatedAt, referenceNow), 0) / openDeals.length);

  return {
    openLeadCount: openLeads.length,
    openDealCount: openDeals.length,
    staleDealCount: staleDeals.length,
    inactiveCustomerCount: inactiveCustomerIds.length,
    upcomingRenewalCount: upcomingRenewals.length,
    churnRiskCustomerIds,
    salesActivityCount: activities.length,
    leadQualificationRatePct,
    avgDealStageAgeDays,
  };
}

// ---------------------------------------------------------------------------
// Yonetim (kompozit) KPI'lari
// ---------------------------------------------------------------------------

export interface ManagementKpis {
  /**
   * Operasyon sagligi (0-100) = 100 - (gecikme_orani*0.5 + sahipsiz_oran*0.3 + acik_sikayet_orani*0.2)*100
   * gecikme_orani = geciken/aktif, sahipsiz_oran = sahipsiz/aktif, acik_sikayet_orani = acikSikayet/toplamMusteri.
   */
  operationsHealthScore: number;
  /**
   * Musteri riski (0-100) = 100 * (kaybedilme riskindeki musteri / toplam musteri).
   * Yuksek skor = daha fazla musteri riskli demek (dusuk iyi degil, izleme skoru).
   */
  customerRiskScore: number;
  /** SLA uyum orani (%) = (toplam gorev - geciken - gec tamamlanan) / toplam gorev * 100. */
  slaComplianceRatePct: number;
  /**
   * Ekip kapasite skoru (0-100) = 100 - 100*ortalama(max(0, utilization-1)), teamlerin
   * ortalama asiri yuklenme oranina gore; hicbir ekip kapasiteyi asmiyorsa 100.
   */
  teamCapacityScore: number;
  /**
   * Veri guncellik skoru (%) = son FRESHNESS_WINDOW_DAYS gunde olusmus/guncellenmis
   * aktivite+tamamlanan gorev+deal-guncelleme olaylarinin toplam benzer olaylara orani.
   */
  dataFreshnessScorePct: number;
  /**
   * Tahmini onlenebilir kayip (AZN) = yaklasan yenilemesi olan VE kaybedilme
   * riskindeki musterilerin sozlesme degerleri toplami (bu tutar, aksiyon alinmazsa
   * kaybedilme riski tasiyan gelir olarak yorumlanir).
   */
  estimatedPreventableLossAzn: number;
}

export function computeManagementKpis(inputs: TaisKpiInputs, ops: OperationsKpis, commercial: CommercialKpis): ManagementKpis {
  const { referenceNow, tasks, contracts, activities, deals } = inputs;

  const overdueRatio = ops.activeTaskCount === 0 ? 0 : ops.overdueTaskCount / ops.activeTaskCount;
  const unassignedRatio = ops.activeTaskCount === 0 ? 0 : ops.unassignedTaskCount / ops.activeTaskCount;
  const openComplaintRatio = inputs.customerCount === 0 ? 0 : ops.openComplaintCount / inputs.customerCount;
  const operationsHealthScore = Math.max(
    0,
    round1(100 - (overdueRatio * 0.5 + unassignedRatio * 0.3 + openComplaintRatio * 0.2) * 100)
  );

  const customerRiskScore = pct(commercial.churnRiskCustomerIds.length, inputs.customerCount);

  const lateCompletedCount = tasks.filter(
    (t) => t.status === "done" && t.completedAt !== null && new Date(t.completedAt).getTime() > new Date(t.dueAt).getTime()
  ).length;
  const slaComplianceRatePct =
    tasks.length === 0 ? 100 : pct(tasks.length - ops.overdueTaskCount - lateCompletedCount, tasks.length);

  const overageRatios = ops.workloadByTeam.map((t) => Math.max(0, t.utilization - 1));
  const avgOverage = overageRatios.length === 0 ? 0 : overageRatios.reduce((a, b) => a + b, 0) / overageRatios.length;
  const teamCapacityScore = Math.max(0, round1(100 - avgOverage * 100));

  const recentDone = tasks.filter(
    (t) => t.completedAt !== null && daysBetween(t.completedAt, referenceNow) <= FRESHNESS_WINDOW_DAYS
  ).length;
  const recentActivities = activities.filter((a) => daysBetween(a.occurredAt, referenceNow) <= FRESHNESS_WINDOW_DAYS).length;
  const recentDeals = deals.filter((d) => daysBetween(d.updatedAt, referenceNow) <= FRESHNESS_WINDOW_DAYS).length;
  const totalFreshnessEvents = tasks.filter((t) => t.completedAt !== null).length + activities.length + deals.length;
  const dataFreshnessScorePct = pct(recentDone + recentActivities + recentDeals, totalFreshnessEvents);

  const churnRiskSet = new Set(commercial.churnRiskCustomerIds);
  const estimatedPreventableLossAzn = contracts
    .filter((c) => churnRiskSet.has(c.customerId) && daysBetween(referenceNow, c.renewalDate) <= RENEWAL_SOON_DAYS)
    .reduce((sum, c) => sum + c.valueAzn, 0);

  return {
    operationsHealthScore,
    customerRiskScore,
    slaComplianceRatePct,
    teamCapacityScore,
    dataFreshnessScorePct,
    estimatedPreventableLossAzn,
  };
}

export interface TaisKpiSnapshot {
  operations: OperationsKpis;
  commercial: CommercialKpis;
  management: ManagementKpis;
}

/** Tum KPI gruplarini tek cagrida hesaplar (sirasi onemli: management, digerlerine bagli). */
export function computeTaisKpis(inputs: TaisKpiInputs): TaisKpiSnapshot {
  const operations = computeOperationsKpis(inputs);
  const commercial = computeCommercialKpis(inputs);
  const management = computeManagementKpis(inputs, operations, commercial);
  return { operations, commercial, management };
}

// ---------------------------------------------------------------------------
// DB'ye dokunan tek fonksiyon — satirlari okur, saf fonksiyonlara aktarilacak
// bicimde esler. compute* fonksiyonlarinin kendisi bu fonksiyona bagimli DEGIL.
// ---------------------------------------------------------------------------

/** Org'a ait TAIS demo satirlarini okuyup TaisKpiInputs bicimine esler. */
export async function loadTaisKpiInputs(orgId: string, referenceNow: string): Promise<TaisKpiInputs> {
  await migrate();
  const db = getDb();

  const [teams, customers, tasks, contracts, deals, leads, activities, complaints, qualityIssues] = await Promise.all([
    db.query<{ id: string; name: string; category: TaisCategoryId; capacity: number }>(
      "SELECT id, name, category, capacity FROM tais_teams WHERE org_id = $1",
      [orgId]
    ),
    db.query<{ id: string }>("SELECT id FROM tais_customers WHERE org_id = $1", [orgId]),
    db.query<{
      id: string;
      category: TaisCategoryId;
      team_id: string;
      location_id: string;
      customer_id: string;
      employee_id: string | null;
      status: "open" | "in_progress" | "done";
      due_at: string;
      completed_at: string | null;
    }>(
      "SELECT id, category, team_id, location_id, customer_id, employee_id, status, due_at, completed_at FROM tais_tasks WHERE org_id = $1",
      [orgId]
    ),
    db.query<{
      id: string;
      customer_id: string;
      category: TaisCategoryId;
      status: string;
      value_azn: string | number;
      renewal_date: string;
    }>("SELECT id, customer_id, category, status, value_azn, renewal_date FROM tais_contracts WHERE org_id = $1", [orgId]),
    db.query<{
      id: string;
      customer_id: string;
      category: TaisCategoryId;
      stage: "prospecting" | "negotiation" | "won" | "lost";
      value_azn: string | number;
      updated_at: string;
    }>("SELECT id, customer_id, category, stage, value_azn, updated_at FROM tais_deals WHERE org_id = $1", [orgId]),
    db.query<{ id: string; customer_id: string | null; category: TaisCategoryId; stage: "new" | "contacted" | "qualified" | "lost" }>(
      "SELECT id, customer_id, category, stage FROM tais_leads WHERE org_id = $1",
      [orgId]
    ),
    db.query<{ id: string; customer_id: string; deal_id: string | null; occurred_at: string }>(
      "SELECT id, customer_id, deal_id, occurred_at FROM tais_activities WHERE org_id = $1",
      [orgId]
    ),
    db.query<{
      id: string;
      customer_id: string;
      location_id: string;
      category: TaisCategoryId;
      status: string;
      opened_at: string;
    }>("SELECT id, customer_id, location_id, category, status, opened_at FROM tais_complaints WHERE org_id = $1", [orgId]),
    db.query<{ id: string; location_id: string; category: TaisCategoryId; status: string; opened_at: string }>(
      "SELECT id, location_id, category, status, opened_at FROM tais_quality_issues WHERE org_id = $1",
      [orgId]
    ),
  ]);

  return {
    referenceNow,
    customerCount: customers.rows.length,
    teams: teams.rows.map((t) => ({ id: t.id, name: t.name, category: t.category, capacity: Number(t.capacity) })),
    tasks: tasks.rows.map((t) => ({
      id: t.id,
      category: t.category,
      teamId: t.team_id,
      locationId: t.location_id,
      customerId: t.customer_id,
      employeeId: t.employee_id,
      status: t.status,
      dueAt: t.due_at,
      completedAt: t.completed_at,
    })),
    contracts: contracts.rows.map((c) => ({
      id: c.id,
      customerId: c.customer_id,
      category: c.category,
      status: c.status,
      valueAzn: Number(c.value_azn),
      renewalDate: c.renewal_date,
    })),
    deals: deals.rows.map((d) => ({
      id: d.id,
      customerId: d.customer_id,
      category: d.category,
      stage: d.stage,
      valueAzn: Number(d.value_azn),
      updatedAt: d.updated_at,
    })),
    leads: leads.rows.map((l) => ({ id: l.id, customerId: l.customer_id, category: l.category, stage: l.stage })),
    activities: activities.rows.map((a) => ({
      id: a.id,
      customerId: a.customer_id,
      dealId: a.deal_id,
      occurredAt: a.occurred_at,
    })),
    complaints: complaints.rows.map((c) => ({
      id: c.id,
      customerId: c.customer_id,
      locationId: c.location_id,
      category: c.category,
      status: c.status,
      openedAt: c.opened_at,
    })),
    qualityIssues: qualityIssues.rows.map((q) => ({
      id: q.id,
      locationId: q.location_id,
      category: q.category,
      status: q.status,
      openedAt: q.opened_at,
    })),
  };
}
