import { getDb, migrate } from "@/lib/db/client";
import { TAIS_CATEGORIES, type TaisCategoryId } from "./data";
import {
  loadTaisKpiInputs,
  type TaisTeamRow,
  type TaisTaskRow,
  type TaisContractRow,
  type TaisDealRow,
  type TaisComplaintRow,
  type TaisQualityIssueRow,
} from "./kpi";

/**
 * TAIS IKF MMC demosu icin risk/sinyal kurallari.
 *
 * SOZLESME: bu dosyadaki tum `computeTaisRisks` ve kural fonksiyonlari SAF'tir
 * (Math.random YOK, LLM cagrisi YOK) — ayni girdi icin daima ayni riskleri ve
 * ayni sirayi uretir (bkz. tests/tais-risks.test.ts). `loadTaisRiskInputs` tek
 * DB'ye dokunan fonksiyondur. Bu modul, mevcut `signals` tablosu/RiskAssessment
 * mekanizmasinin (bkz. src/lib/db/repos/data.ts) yerine gecmez; TAIS'e ozgu,
 * kanit kayitlarina baglanan, deterministik olarak skorlanan risk kayitlari
 * uretir ve bunlar `signals` tablosuna kaydedilebilir (payload olarak).
 *
 * Skorlama: her risk, 0-1 araligina normalize edilmis alti faktorun agirlikli
 * toplamiyla 0-100 puana cevrilir (bkz. `scoreRisk`): etki, aciliyet, etkilenen
 * kayit sayisi/tekrarlanma, musteri onemi (aktif sozlesme degeri), kanitin
 * guncelligi, guven seviyesi. Puan >= 70 kritik, >= 40 uyari, altı bilgi'dir.
 */

export type TaisRiskRuleId =
  | "overdue_open_task"
  | "sla_risk_task"
  | "unassigned_task"
  | "team_capacity_overload"
  | "recurring_complaint"
  | "stale_deal"
  | "renewal_without_activity"
  | "overdue_periodic_service"
  | "recurring_quality_issue"
  | "stale_data_source"
  | "unmatched_service_request"
  | "high_delay_critical_customer";

export type TaisRiskSeverity = "critical" | "warning" | "info";

export interface TaisRiskEvidenceRef {
  type: "task" | "complaint" | "deal" | "quality_issue" | "service_request" | "contract";
  id: string;
}

export interface TaisRisk {
  id: string;
  ruleId: TaisRiskRuleId;
  title: string;
  /** Hesaplanan TAIS bulguları yalnızca halen geçerli/açık riskleri temsil eder. */
  status: "open";
  severity: TaisRiskSeverity;
  customerId: string | null;
  customerName: string | null;
  locationId: string | null;
  locationName: string | null;
  category: TaisCategoryId | null;
  rootCause: string;
  recommendedAction: string;
  expectedImpact: string;
  /** Bu riskin hesaplandigi veri anlik goruntusu (bkz. seed.ts TAIS_REFERENCE_NOW). */
  dataAsOf: string;
  /** 0-100: bulgunun kesinlik derecesi (LLM tahmini degil, veri tamligina bagli). */
  confidence: number;
  affectedCount: number;
  evidence: TaisRiskEvidenceRef[];
  /** 0-100 deterministik kompozit skor; sirala(y/m)a bu alana gore yapilir. */
  score: number;
}

export interface TaisCustomerRow {
  id: string;
  name: string;
}

export interface TaisLocationRow {
  id: string;
  name: string;
  customerId: string;
  category: TaisCategoryId;
}

export interface TaisServiceRequestRow {
  id: string;
  customerId: string;
  locationId: string;
  category: TaisCategoryId;
  status: string;
  matchedTaskId: string | null;
  openedAt: string;
}

export interface TaisRiskInputs {
  referenceNow: string;
  teams: TaisTeamRow[];
  customers: TaisCustomerRow[];
  locations: TaisLocationRow[];
  tasks: TaisTaskRow[];
  contracts: TaisContractRow[];
  deals: TaisDealRow[];
  activities: { id: string; customerId: string; dealId: string | null; occurredAt: string }[];
  complaints: TaisComplaintRow[];
  qualityIssues: TaisQualityIssueRow[];
  serviceRequests: TaisServiceRequestRow[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / HOUR_MS;
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

/** Kanitin ne kadar guncel oldugu: 1 = tam simdi/yakin gelecek, 0 = windowDays once veya daha eski. */
function recencyFactor(evidenceIso: string, referenceNow: string, windowDays: number): number {
  const ageDays = daysBetween(evidenceIso, referenceNow);
  return Math.max(0, Math.min(1, 1 - ageDays / windowDays));
}

// ---------------------------------------------------------------------------
// Kural esikleri (deterministik, sabit)
// ---------------------------------------------------------------------------

const SLA_RISK_WINDOW_HOURS = 48;
/** Kapasite planlamasinda "kirmizi bolge" esigi — %100'u beklemeden erken uyari verir. */
const TEAM_OVERLOAD_UTILIZATION = 0.85;
const RECURRING_COMPLAINT_MIN = 2;
const STALE_DEAL_DAYS = 30;
const RENEWAL_SOON_DAYS = 30;
const NO_ACTIVITY_DAYS = 30;
const RECURRING_QUALITY_MIN = 2;
const DATA_STALE_DAYS = 14;
/** Periyodik (planli, tekrarlanan) ziyaretle yurutulen hizmet kategorileri. */
const PERIODIC_SERVICE_CATEGORIES: TaisCategoryId[] = ["pest_control"];
/** Normalize sozlesme degeri bu esigin uzerindeyse musteri "kritik" sayilir. */
const CRITICAL_CUSTOMER_IMPORTANCE = 0.7;
const HIGH_DELAY_RATIO = 0.3;
const MIN_TASKS_FOR_DELAY_RATIO = 3;
const CRITICAL_SCORE_THRESHOLD = 70;
const WARNING_SCORE_THRESHOLD = 40;
/** Musteri baglantisi olmayan (ekip/kategori seviyesi) riskler icin notr taban deger. */
const DEFAULT_IMPORTANCE = 0.3;

const TAIS_CATEGORY_IDS = TAIS_CATEGORIES.map((c) => c.id);

// ---------------------------------------------------------------------------
// Baglam ve skorlama
// ---------------------------------------------------------------------------

function buildContext(inputs: TaisRiskInputs) {
  const customerById = new Map(inputs.customers.map((c) => [c.id, c]));
  const locationById = new Map(inputs.locations.map((l) => [l.id, l]));
  const teamById = new Map(inputs.teams.map((t) => [t.id, t]));
  const valueByCustomer = new Map<string, number>();
  for (const c of inputs.contracts) {
    if (c.status !== "active") continue;
    valueByCustomer.set(c.customerId, (valueByCustomer.get(c.customerId) ?? 0) + c.valueAzn);
  }
  const maxContractValue = Math.max(0, ...Array.from(valueByCustomer.values()));
  return { customerById, locationById, teamById, valueByCustomer, maxContractValue };
}

type RiskContext = ReturnType<typeof buildContext>;

/** Musterinin aktif sozlesme degerinin, en yuksek degerli musteriye orani (0-1). */
function importanceFactor(customerId: string | null, ctx: RiskContext): number {
  if (!customerId || ctx.maxContractValue <= 0) return DEFAULT_IMPORTANCE;
  const v = ctx.valueByCustomer.get(customerId) ?? 0;
  return v / ctx.maxContractValue;
}

interface RiskFactors {
  /** 0-1: kural tetiklendiginde isin buyuklugu/onemi (kural bazinda sabit temel deger). */
  impact: number;
  /** 0-1: son tarihe/esige yakinlik veya asilma buyuklugu. */
  urgency: number;
  /** 0-1: etkilenen kayit sayisi/tekrarlanma (normalize edilmis). */
  countFactor: number;
  /** 0-1: etkilenen musterinin aktif sozlesme degerine gore onemi. */
  customerImportance: number;
  /** 0-1: kanitin ne kadar guncel oldugu. */
  freshness: number;
  /** 0-100: bulgunun kesinlik derecesi. */
  confidence: number;
}

function scoreRisk(f: RiskFactors): { score: number; severity: TaisRiskSeverity } {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const raw =
    0.25 * clamp01(f.impact) +
    0.2 * clamp01(f.urgency) +
    0.15 * clamp01(f.countFactor) +
    0.15 * clamp01(f.customerImportance) +
    0.1 * clamp01(f.freshness) +
    0.15 * clamp01(f.confidence / 100);
  const score = Math.round(raw * 100);
  const severity: TaisRiskSeverity =
    score >= CRITICAL_SCORE_THRESHOLD ? "critical" : score >= WARNING_SCORE_THRESHOLD ? "warning" : "info";
  return { score, severity };
}

function buildRisk(params: {
  ruleId: TaisRiskRuleId;
  idParts: (string | null | undefined)[];
  title: string;
  customerId?: string | null;
  customerName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  category: TaisCategoryId | null;
  rootCause: string;
  recommendedAction: string;
  expectedImpact: string;
  dataAsOf: string;
  affectedCount: number;
  evidence: TaisRiskEvidenceRef[];
  factors: RiskFactors;
}): TaisRisk {
  const { score, severity } = scoreRisk(params.factors);
  return {
    id: `${params.ruleId}:${params.idParts.filter((p): p is string => Boolean(p)).join(":")}`,
    ruleId: params.ruleId,
    title: params.title,
    status: "open",
    severity,
    customerId: params.customerId ?? null,
    customerName: params.customerName ?? null,
    locationId: params.locationId ?? null,
    locationName: params.locationName ?? null,
    category: params.category,
    rootCause: params.rootCause,
    recommendedAction: params.recommendedAction,
    expectedImpact: params.expectedImpact,
    dataAsOf: params.dataAsOf,
    confidence: params.factors.confidence,
    affectedCount: params.affectedCount,
    evidence: params.evidence,
    score,
  };
}

// ---------------------------------------------------------------------------
// Kural 1: son tarihi gecmis acik gorev (musteri + lokasyon bazinda gruplu)
// ---------------------------------------------------------------------------

function ruleOverdueOpenTask(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, { customerId: string; locationId: string; category: TaisCategoryId; tasks: TaisTaskRow[] }>();
  for (const t of inputs.tasks) {
    if (t.status === "done") continue;
    if (new Date(t.dueAt).getTime() >= new Date(inputs.referenceNow).getTime()) continue;
    const key = `${t.customerId}|${t.locationId}`;
    const g = groups.get(key) ?? { customerId: t.customerId, locationId: t.locationId, category: t.category, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }
  const results: TaisRisk[] = [];
  for (const g of groups.values()) {
    const maxOverdueDays = Math.max(...g.tasks.map((t) => daysBetween(t.dueAt, inputs.referenceNow)));
    const latest = g.tasks.reduce((a, b) => (new Date(b.dueAt).getTime() > new Date(a.dueAt).getTime() ? b : a));
    const customer = ctx.customerById.get(g.customerId);
    const location = ctx.locationById.get(g.locationId);
    results.push(
      buildRisk({
        ruleId: "overdue_open_task",
        idParts: [g.customerId, g.locationId],
        title: `${location?.name ?? g.locationId} lokasyonunda ${g.tasks.length} gecikmiş görev`,
        customerId: g.customerId,
        customerName: customer?.name ?? null,
        locationId: g.locationId,
        locationName: location?.name ?? null,
        category: g.category,
        rootCause: `${g.tasks.length} görev son tarihini geçti ve hâlâ açık/devam ediyor (en uzun gecikme ${Math.round(maxOverdueDays)} gün).`,
        recommendedAction: "Gecikmiş görevleri önceliklendir, sorumlu ata veya yeniden planla.",
        expectedImpact: "Gecikme sürdükçe SLA ihlali ve müşteri memnuniyetsizliği riski artar.",
        dataAsOf: inputs.referenceNow,
        affectedCount: g.tasks.length,
        evidence: g.tasks.map((t) => ({ type: "task", id: t.id })),
        factors: {
          impact: 0.55,
          urgency: Math.min(1, maxOverdueDays / 7),
          countFactor: Math.min(1, g.tasks.length / 5),
          customerImportance: importanceFactor(g.customerId, ctx),
          freshness: recencyFactor(latest.dueAt, inputs.referenceNow, 14),
          confidence: 90,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 2: SLA suresine yaklasan gorev (48 saat penceresi)
// ---------------------------------------------------------------------------

function ruleSlaRiskTask(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, { customerId: string; locationId: string; category: TaisCategoryId; tasks: TaisTaskRow[] }>();
  for (const t of inputs.tasks) {
    if (t.status !== "open") continue;
    const h = hoursBetween(inputs.referenceNow, t.dueAt);
    if (h < 0 || h > SLA_RISK_WINDOW_HOURS) continue;
    const key = `${t.customerId}|${t.locationId}`;
    const g = groups.get(key) ?? { customerId: t.customerId, locationId: t.locationId, category: t.category, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }
  const results: TaisRisk[] = [];
  for (const g of groups.values()) {
    const minHoursLeft = Math.min(...g.tasks.map((t) => hoursBetween(inputs.referenceNow, t.dueAt)));
    const customer = ctx.customerById.get(g.customerId);
    const location = ctx.locationById.get(g.locationId);
    results.push(
      buildRisk({
        ruleId: "sla_risk_task",
        idParts: [g.customerId, g.locationId],
        title: `${location?.name ?? g.locationId} için ${g.tasks.length} görevde SLA süresi ${SLA_RISK_WINDOW_HOURS} saat içinde doluyor`,
        customerId: g.customerId,
        customerName: customer?.name ?? null,
        locationId: g.locationId,
        locationName: location?.name ?? null,
        category: g.category,
        rootCause: `En yakın görev ${Math.max(0, Math.round(minHoursLeft))} saat içinde son tarihine ulaşacak ve henüz tamamlanmadı.`,
        recommendedAction: "Kalan görevleri bugünün önceliğine al ve tamamlanma durumunu takip et.",
        expectedImpact: "SLA süresi dolarsa sözleşme kapsamındaki hizmet taahhüdü ihlal edilmiş sayılır.",
        dataAsOf: inputs.referenceNow,
        affectedCount: g.tasks.length,
        evidence: g.tasks.map((t) => ({ type: "task", id: t.id })),
        factors: {
          impact: 0.6,
          urgency: 1 - Math.max(0, minHoursLeft) / SLA_RISK_WINDOW_HOURS,
          countFactor: Math.min(1, g.tasks.length / 5),
          customerImportance: importanceFactor(g.customerId, ctx),
          freshness: 1,
          confidence: 92,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 3: sorumlusu olmayan gorev (ekip bazinda gruplu)
// ---------------------------------------------------------------------------

function ruleUnassignedTask(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, TaisTaskRow[]>();
  for (const t of inputs.tasks) {
    if (t.status === "done") continue;
    if (t.employeeId !== null) continue;
    const arr = groups.get(t.teamId) ?? [];
    arr.push(t);
    groups.set(t.teamId, arr);
  }
  const results: TaisRisk[] = [];
  for (const [teamId, tasks] of groups) {
    const team = ctx.teamById.get(teamId);
    const overdueCount = tasks.filter((t) => new Date(t.dueAt).getTime() < new Date(inputs.referenceNow).getTime()).length;
    const latest = tasks.reduce((a, b) => (new Date(b.dueAt).getTime() > new Date(a.dueAt).getTime() ? b : a));
    results.push(
      buildRisk({
        ruleId: "unassigned_task",
        idParts: [teamId],
        title: `${team?.name ?? teamId} ekibinde ${tasks.length} sahipsiz görev`,
        category: team?.category ?? tasks[0].category,
        rootCause: `${tasks.length} görevde sorumlu atanmamış (${overdueCount} tanesi son tarihini de geçmiş).`,
        recommendedAction: "Sahipsiz görevlere ekip içinden sorumlu ata.",
        expectedImpact: "Sahipsiz görevler takipsiz kalıp gecikme ve unutulma riski taşır.",
        dataAsOf: inputs.referenceNow,
        affectedCount: tasks.length,
        evidence: tasks.map((t) => ({ type: "task", id: t.id })),
        factors: {
          impact: 0.45,
          urgency: Math.min(1, overdueCount / Math.max(1, tasks.length)),
          countFactor: Math.min(1, tasks.length / 5),
          customerImportance: DEFAULT_IMPORTANCE,
          freshness: recencyFactor(latest.dueAt, inputs.referenceNow, 14),
          confidence: 80,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 4: ayni ekipte asiri gorev yogunlugu (kapasite esigi asimi)
// ---------------------------------------------------------------------------

function ruleTeamCapacityOverload(inputs: TaisRiskInputs): TaisRisk[] {
  const openByTeam = new Map<string, TaisTaskRow[]>();
  for (const t of inputs.tasks) {
    if (t.status === "done") continue;
    const arr = openByTeam.get(t.teamId) ?? [];
    arr.push(t);
    openByTeam.set(t.teamId, arr);
  }
  const results: TaisRisk[] = [];
  for (const team of inputs.teams) {
    if (team.capacity === 0) continue;
    const tasks = openByTeam.get(team.id) ?? [];
    const utilization = tasks.length / team.capacity;
    if (utilization <= TEAM_OVERLOAD_UTILIZATION) continue;
    results.push(
      buildRisk({
        ruleId: "team_capacity_overload",
        idParts: [team.id],
        title: `${team.name} kapasitesinin %${Math.round(utilization * 100)}'ünde çalışıyor`,
        category: team.category,
        rootCause: `${tasks.length} aktif görev, ${team.capacity} kapasitede kırmızı bölge eşiğini aşıyor (kullanım oranı ${utilization.toFixed(2)}).`,
        recommendedAction: "Aşırı yüklü ekibe görev aktarımı yap veya geçici destek ata.",
        expectedImpact: "Kapasite aşımı sürerse görev gecikmeleri ve SLA riskleri artar.",
        dataAsOf: inputs.referenceNow,
        affectedCount: tasks.length,
        evidence: tasks.map((t) => ({ type: "task", id: t.id })),
        factors: {
          impact: 0.7,
          urgency: Math.min(1, utilization),
          countFactor: Math.min(1, tasks.length / (team.capacity * 1.5)),
          customerImportance: DEFAULT_IMPORTANCE,
          freshness: 1,
          confidence: 88,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 5: ayni musteride tekrarlanan sikayet
// ---------------------------------------------------------------------------

function ruleRecurringComplaint(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, TaisComplaintRow[]>();
  for (const c of inputs.complaints) {
    const arr = groups.get(c.customerId) ?? [];
    arr.push(c);
    groups.set(c.customerId, arr);
  }
  const results: TaisRisk[] = [];
  for (const [customerId, complaints] of groups) {
    if (complaints.length < RECURRING_COMPLAINT_MIN) continue;
    const customer = ctx.customerById.get(customerId);
    const latest = complaints.reduce((a, b) => (new Date(b.openedAt).getTime() > new Date(a.openedAt).getTime() ? b : a));
    const openCount = complaints.filter((c) => c.status === "open").length;
    results.push(
      buildRisk({
        ruleId: "recurring_complaint",
        idParts: [customerId],
        title: `${customer?.name ?? customerId} müşterisinde ${complaints.length} tekrarlayan şikâyet`,
        customerId,
        customerName: customer?.name ?? null,
        category: latest.category,
        rootCause: `Aynı müşteride ${complaints.length} şikâyet kaydedildi (${openCount} tanesi hâlâ açık); tekrar eden bir hizmet sorunu olabilir.`,
        recommendedAction: "Müşteriyle kök neden görüşmesi yap ve hizmet planını gözden geçir.",
        expectedImpact: "Tekrarlayan şikâyet çözülmezse sözleşme yenileme riskine dönüşebilir.",
        dataAsOf: inputs.referenceNow,
        affectedCount: complaints.length,
        evidence: complaints.map((c) => ({ type: "complaint", id: c.id })),
        factors: {
          impact: 0.65,
          urgency: Math.min(1, openCount / Math.max(1, complaints.length)),
          countFactor: Math.min(1, complaints.length / 4),
          customerImportance: importanceFactor(customerId, ctx),
          freshness: recencyFactor(latest.openedAt, inputs.referenceNow, 30),
          confidence: 85,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 6: uzun sure guncellenmeyen deal (musteri bazinda gruplu)
// ---------------------------------------------------------------------------

function ruleStaleDeal(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, TaisDealRow[]>();
  for (const d of inputs.deals) {
    if (d.stage !== "prospecting" && d.stage !== "negotiation") continue;
    if (daysBetween(d.updatedAt, inputs.referenceNow) < STALE_DEAL_DAYS) continue;
    const arr = groups.get(d.customerId) ?? [];
    arr.push(d);
    groups.set(d.customerId, arr);
  }
  const results: TaisRisk[] = [];
  for (const [customerId, deals] of groups) {
    const customer = ctx.customerById.get(customerId);
    const maxGap = Math.max(...deals.map((d) => daysBetween(d.updatedAt, inputs.referenceNow)));
    results.push(
      buildRisk({
        ruleId: "stale_deal",
        idParts: [customerId],
        title: `${customer?.name ?? customerId} için ${deals.length} satış fırsatı ${STALE_DEAL_DAYS}+ gündür güncellenmedi`,
        customerId,
        customerName: customer?.name ?? null,
        category: deals[0].category,
        rootCause: `En eski güncellemeden bu yana ${Math.round(maxGap)} gün geçti; takip aktivitesi kaydedilmemiş.`,
        recommendedAction: "Satış ekibi müşteriyle yeniden temas kursun ve fırsat aşamasını güncellesin.",
        expectedImpact: "Takip edilmeyen fırsat kaybedilme veya rakibe kayma riski taşır.",
        dataAsOf: inputs.referenceNow,
        affectedCount: deals.length,
        evidence: deals.map((d) => ({ type: "deal", id: d.id })),
        factors: {
          impact: 0.5,
          urgency: Math.min(1, maxGap / 90),
          countFactor: Math.min(1, deals.length / 3),
          customerImportance: importanceFactor(customerId, ctx),
          freshness: 0.5,
          confidence: 75,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 7: yenileme tarihi yaklasan ama aktivitesi olmayan musteri
// ---------------------------------------------------------------------------

function ruleRenewalWithoutActivity(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const lastActivityByCustomer = new Map<string, string>();
  for (const a of inputs.activities) {
    const prev = lastActivityByCustomer.get(a.customerId);
    if (!prev || new Date(a.occurredAt).getTime() > new Date(prev).getTime()) {
      lastActivityByCustomer.set(a.customerId, a.occurredAt);
    }
  }
  const results: TaisRisk[] = [];
  const seen = new Set<string>();
  for (const c of inputs.contracts) {
    if (c.status !== "active") continue;
    const daysToRenewal = daysBetween(inputs.referenceNow, c.renewalDate);
    if (daysToRenewal < 0 || daysToRenewal > RENEWAL_SOON_DAYS) continue;
    const lastActivity = lastActivityByCustomer.get(c.customerId);
    const inactiveDays = lastActivity ? daysBetween(lastActivity, inputs.referenceNow) : Infinity;
    if (inactiveDays < NO_ACTIVITY_DAYS) continue;
    if (seen.has(c.customerId)) continue; // musteri basina tek risk (birden fazla sozlesmesi olsa da)
    seen.add(c.customerId);
    const customer = ctx.customerById.get(c.customerId);
    results.push(
      buildRisk({
        ruleId: "renewal_without_activity",
        idParts: [c.customerId],
        title: `${customer?.name ?? c.customerId} yenilemesi yaklaşıyor ama son ${NO_ACTIVITY_DAYS} günde temas yok`,
        customerId: c.customerId,
        customerName: customer?.name ?? null,
        category: c.category,
        rootCause: `Sözleşme yenilemesine ${Math.round(daysToRenewal)} gün kaldı ve ${
          lastActivity ? `${Math.round(inactiveDays)} gündür` : "hiç"
        } satış/CRM aktivitesi kaydedilmedi.`,
        recommendedAction: "Yenileme öncesi müşteriyle görüşme planla ve memnuniyet durumunu doğrula.",
        expectedImpact: "Temassız yenileme dönemi, sözleşmenin yenilenmeme veya rakibe geçme riskini artırır.",
        dataAsOf: inputs.referenceNow,
        affectedCount: 1,
        evidence: [{ type: "contract", id: c.id }],
        factors: {
          impact: 0.75,
          urgency: 1 - Math.max(0, daysToRenewal) / RENEWAL_SOON_DAYS,
          countFactor: 0.4,
          customerImportance: importanceFactor(c.customerId, ctx),
          freshness: 0.5,
          confidence: 85,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 8: geciken periyodik hizmet (pest control)
// ---------------------------------------------------------------------------

function ruleOverduePeriodicService(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, { customerId: string; locationId: string; category: TaisCategoryId; tasks: TaisTaskRow[] }>();
  for (const t of inputs.tasks) {
    if (!PERIODIC_SERVICE_CATEGORIES.includes(t.category)) continue;
    if (t.status === "done") continue;
    if (new Date(t.dueAt).getTime() >= new Date(inputs.referenceNow).getTime()) continue;
    const key = `${t.customerId}|${t.locationId}`;
    const g = groups.get(key) ?? { customerId: t.customerId, locationId: t.locationId, category: t.category, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }
  const results: TaisRisk[] = [];
  for (const g of groups.values()) {
    const maxOverdueDays = Math.max(...g.tasks.map((t) => daysBetween(t.dueAt, inputs.referenceNow)));
    const latest = g.tasks.reduce((a, b) => (new Date(b.dueAt).getTime() > new Date(a.dueAt).getTime() ? b : a));
    const customer = ctx.customerById.get(g.customerId);
    const location = ctx.locationById.get(g.locationId);
    results.push(
      buildRisk({
        ruleId: "overdue_periodic_service",
        idParts: [g.customerId, g.locationId],
        title: `${location?.name ?? g.locationId} için periyodik ${g.category} ziyareti kaçırıldı`,
        customerId: g.customerId,
        customerName: customer?.name ?? null,
        locationId: g.locationId,
        locationName: location?.name ?? null,
        category: g.category,
        rootCause: `${g.tasks.length} periyodik hizmet ziyareti planlanan tarihte yapılmadı (en uzun gecikme ${Math.round(maxOverdueDays)} gün).`,
        recommendedAction: "Kaçırılan periyodik ziyaretleri en yakın uygun slotla yeniden planla.",
        expectedImpact: "Periyodik hizmetin aksaması sözleşme kapsamındaki uygunluk yükümlülüğünü ihlal edebilir.",
        dataAsOf: inputs.referenceNow,
        affectedCount: g.tasks.length,
        evidence: g.tasks.map((t) => ({ type: "task", id: t.id })),
        factors: {
          impact: 0.7,
          urgency: Math.min(1, maxOverdueDays / 5),
          countFactor: Math.min(1, g.tasks.length / 3),
          customerImportance: importanceFactor(g.customerId, ctx),
          freshness: recencyFactor(latest.dueAt, inputs.referenceNow, 14),
          confidence: 90,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 9: ayni lokasyonda tekrar eden uygunsuzluk
// ---------------------------------------------------------------------------

function ruleRecurringQualityIssue(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, TaisQualityIssueRow[]>();
  for (const q of inputs.qualityIssues) {
    const arr = groups.get(q.locationId) ?? [];
    arr.push(q);
    groups.set(q.locationId, arr);
  }
  const results: TaisRisk[] = [];
  for (const [locationId, issues] of groups) {
    if (issues.length < RECURRING_QUALITY_MIN) continue;
    const location = ctx.locationById.get(locationId);
    const customer = location ? ctx.customerById.get(location.customerId) : undefined;
    const latest = issues.reduce((a, b) => (new Date(b.openedAt).getTime() > new Date(a.openedAt).getTime() ? b : a));
    results.push(
      buildRisk({
        ruleId: "recurring_quality_issue",
        idParts: [locationId],
        title: `${location?.name ?? locationId} lokasyonunda ${issues.length} tekrarlayan kalite uygunsuzluğu`,
        customerId: location?.customerId ?? null,
        customerName: customer?.name ?? null,
        locationId,
        locationName: location?.name ?? null,
        category: location?.category ?? issues[0].category,
        rootCause: `Aynı lokasyonda ${issues.length} kalite uygunsuzluğu kaydedildi; kök neden tekrar ediyor olabilir.`,
        recommendedAction: "Lokasyondaki hizmet sürecini denetle ve kök nedeni gider.",
        expectedImpact: "Tekrarlayan uygunsuzluk, müşteri güveninde ve sözleşme kalite standardında aşınmaya yol açar.",
        dataAsOf: inputs.referenceNow,
        affectedCount: issues.length,
        evidence: issues.map((q) => ({ type: "quality_issue", id: q.id })),
        factors: {
          impact: 0.6,
          urgency: Math.min(1, issues.length / 4),
          countFactor: Math.min(1, issues.length / 3),
          customerImportance: importanceFactor(location?.customerId ?? null, ctx),
          freshness: recencyFactor(latest.openedAt, inputs.referenceNow, 30),
          confidence: 78,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 10: veri kaynagindan belirli sure guncelleme gelmemesi (kategori bazinda)
// ---------------------------------------------------------------------------

function ruleStaleDataSource(inputs: TaisRiskInputs): TaisRisk[] {
  const now = new Date(inputs.referenceNow).getTime();
  const byCategory = new Map<TaisCategoryId, TaisRiskEvidenceRef & { at: string }>();
  const consider = (category: TaisCategoryId, ref: TaisRiskEvidenceRef, at: string) => {
    if (new Date(at).getTime() > now) return; // gelecekteki bir tarih "gelen veri" sayilmaz
    const current = byCategory.get(category);
    if (!current || new Date(at).getTime() > new Date(current.at).getTime()) {
      byCategory.set(category, { ...ref, at });
    }
  };
  for (const t of inputs.tasks) {
    if (t.completedAt) consider(t.category, { type: "task", id: t.id }, t.completedAt);
  }
  for (const c of inputs.complaints) {
    consider(c.category, { type: "complaint", id: c.id }, c.openedAt);
  }
  for (const q of inputs.qualityIssues) {
    consider(q.category, { type: "quality_issue", id: q.id }, q.openedAt);
  }
  for (const d of inputs.deals) {
    consider(d.category, { type: "deal", id: d.id }, d.updatedAt);
  }

  const results: TaisRisk[] = [];
  for (const category of TAIS_CATEGORY_IDS) {
    const latest = byCategory.get(category);
    if (!latest) continue; // hic kayit yoksa bu kural degerlendirilemez
    const gapDays = daysBetween(latest.at, inputs.referenceNow);
    if (gapDays < DATA_STALE_DAYS) continue;
    results.push(
      buildRisk({
        ruleId: "stale_data_source",
        idParts: [category],
        title: `${category} hizmet alanında veri kaynağından ${Math.round(gapDays)} gündür güncelleme yok`,
        category,
        rootCause: `En son kayıt ${Math.round(gapDays)} gün önce alındı (${latest.type} #${latest.id}); bu sürede yeni görev/aktivite/şikâyet/anlaşma güncellemesi görülmedi.`,
        recommendedAction: "Veri kaynağı bağlantısını ve ilgili ekibin kayıt girişini kontrol et.",
        expectedImpact: "Güncel olmayan veri, yönetici ekranındaki KPI ve risklerin gerçek durumu yansıtmamasına yol açabilir.",
        dataAsOf: inputs.referenceNow,
        affectedCount: 1,
        evidence: [{ type: latest.type, id: latest.id }],
        factors: {
          impact: 0.5,
          urgency: Math.min(1, gapDays / 30),
          countFactor: 0.3,
          customerImportance: DEFAULT_IMPORTANCE,
          freshness: 0.5,
          confidence: 65,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 11: hizmet talebi <-> gorev eslesmemesi
// ---------------------------------------------------------------------------

function ruleUnmatchedServiceRequest(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const groups = new Map<string, { customerId: string; category: TaisCategoryId; requests: TaisServiceRequestRow[] }>();
  for (const r of inputs.serviceRequests) {
    if (r.matchedTaskId !== null) continue;
    if (r.status === "resolved") continue;
    const key = `${r.customerId}|${r.category}`;
    const g = groups.get(key) ?? { customerId: r.customerId, category: r.category, requests: [] };
    g.requests.push(r);
    groups.set(key, g);
  }
  const results: TaisRisk[] = [];
  for (const g of groups.values()) {
    const customer = ctx.customerById.get(g.customerId);
    const oldest = g.requests.reduce((a, b) => (new Date(b.openedAt).getTime() < new Date(a.openedAt).getTime() ? b : a));
    const oldestAgeDays = daysBetween(oldest.openedAt, inputs.referenceNow);
    results.push(
      buildRisk({
        ruleId: "unmatched_service_request",
        idParts: [g.customerId, g.category],
        title: `${customer?.name ?? g.customerId} için ${g.requests.length} hizmet talebi bir göreve eşleşmedi`,
        customerId: g.customerId,
        customerName: customer?.name ?? null,
        category: g.category,
        rootCause: `${g.requests.length} açık hizmet talebi henüz bir operasyon görevine bağlanmadı (en eskisi ${Math.round(oldestAgeDays)} gün önce açıldı).`,
        recommendedAction: "Eşleşmemiş talepler için görev oluştur veya mevcut görevle ilişkilendir.",
        expectedImpact: "Talebin görevle eşleşmemesi, hizmetin fiilen planlanmadığı ve unutulma riski taşıdığı anlamına gelebilir.",
        dataAsOf: inputs.referenceNow,
        affectedCount: g.requests.length,
        evidence: g.requests.map((r) => ({ type: "service_request", id: r.id })),
        factors: {
          impact: 0.45,
          urgency: Math.min(1, oldestAgeDays / 14),
          countFactor: Math.min(1, g.requests.length / 3),
          customerImportance: importanceFactor(g.customerId, ctx),
          freshness: recencyFactor(oldest.openedAt, inputs.referenceNow, 14),
          confidence: 70,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Kural 12: kritik musteride yuksek gecikme orani
// ---------------------------------------------------------------------------

function ruleHighDelayCriticalCustomer(inputs: TaisRiskInputs, ctx: RiskContext): TaisRisk[] {
  const tasksByCustomer = new Map<string, TaisTaskRow[]>();
  for (const t of inputs.tasks) {
    const arr = tasksByCustomer.get(t.customerId) ?? [];
    arr.push(t);
    tasksByCustomer.set(t.customerId, arr);
  }
  const results: TaisRisk[] = [];
  for (const [customerId, tasks] of tasksByCustomer) {
    if (tasks.length < MIN_TASKS_FOR_DELAY_RATIO) continue;
    const importance = importanceFactor(customerId, ctx);
    if (importance < CRITICAL_CUSTOMER_IMPORTANCE) continue;
    const overdue = tasks.filter(
      (t) => t.status !== "done" && new Date(t.dueAt).getTime() < new Date(inputs.referenceNow).getTime()
    );
    const ratio = overdue.length / tasks.length;
    if (ratio < HIGH_DELAY_RATIO) continue;
    const customer = ctx.customerById.get(customerId);
    const latestOverdue = overdue.reduce((a, b) => (new Date(b.dueAt).getTime() > new Date(a.dueAt).getTime() ? b : a));
    results.push(
      buildRisk({
        ruleId: "high_delay_critical_customer",
        idParts: [customerId],
        title: `Kritik müşteri ${customer?.name ?? customerId} için gecikme oranı %${Math.round(ratio * 100)}`,
        customerId,
        customerName: customer?.name ?? null,
        category: overdue[0]?.category ?? tasks[0].category,
        rootCause: `${overdue.length}/${tasks.length} görev gecikmiş durumda; müşteri sözleşme değeri açısından önemli müşteriler arasında.`,
        recommendedAction: "Bu müşteriye özel kaynak/öncelik ayrılarak gecikme oranını düşür.",
        expectedImpact: "Önemli müşteride süregelen gecikme, sözleşme yenileme riskini ve itibar kaybını artırır.",
        dataAsOf: inputs.referenceNow,
        affectedCount: overdue.length,
        evidence: overdue.map((t) => ({ type: "task", id: t.id })),
        factors: {
          impact: 0.8,
          urgency: Math.min(1, ratio),
          countFactor: Math.min(1, overdue.length / 5),
          customerImportance: importance,
          freshness: recencyFactor(latestOverdue.dueAt, inputs.referenceNow, 14),
          confidence: 82,
        },
      })
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Toplayici: 12 kurali calistirir, deterministik skora gore sirali dondurur
// ---------------------------------------------------------------------------

export function computeTaisRisks(inputs: TaisRiskInputs): TaisRisk[] {
  const ctx = buildContext(inputs);
  const risks: TaisRisk[] = [
    ...ruleOverdueOpenTask(inputs, ctx),
    ...ruleSlaRiskTask(inputs, ctx),
    ...ruleUnassignedTask(inputs, ctx),
    ...ruleTeamCapacityOverload(inputs),
    ...ruleRecurringComplaint(inputs, ctx),
    ...ruleStaleDeal(inputs, ctx),
    ...ruleRenewalWithoutActivity(inputs, ctx),
    ...ruleOverduePeriodicService(inputs, ctx),
    ...ruleRecurringQualityIssue(inputs, ctx),
    ...ruleStaleDataSource(inputs),
    ...ruleUnmatchedServiceRequest(inputs, ctx),
    ...ruleHighDelayCriticalCustomer(inputs, ctx),
  ];
  // IDs are regenerated on reset; semantic tie-breakers keep the visible order stable.
  return risks.sort(
    (a, b) =>
      b.score - a.score ||
      a.ruleId.localeCompare(b.ruleId) ||
      (a.customerName ?? "").localeCompare(b.customerName ?? "") ||
      (a.locationName ?? "").localeCompare(b.locationName ?? "") ||
      a.title.localeCompare(b.title)
  );
}

// ---------------------------------------------------------------------------
// DB'ye dokunan tek fonksiyon — kpi.ts'in yukleyicisini yeniden kullanir,
// musteri adi/lokasyon/hizmet talebi satirlarini ekler.
// ---------------------------------------------------------------------------

export async function loadTaisRiskInputs(orgId: string, referenceNow: string): Promise<TaisRiskInputs> {
  const kpiInputs = await loadTaisKpiInputs(orgId, referenceNow);
  await migrate();
  const db = getDb();

  const [customers, locations, serviceRequests, activities] = await Promise.all([
    db.query<{ id: string; name: string }>("SELECT id, name FROM tais_customers WHERE org_id = $1", [orgId]),
    db.query<{ id: string; name: string; customer_id: string; category: TaisCategoryId }>(
      "SELECT id, name, customer_id, category FROM tais_locations WHERE org_id = $1",
      [orgId]
    ),
    db.query<{
      id: string;
      customer_id: string;
      location_id: string;
      category: TaisCategoryId;
      status: string;
      matched_task_id: string | null;
      opened_at: string;
    }>(
      "SELECT id, customer_id, location_id, category, status, matched_task_id, opened_at FROM tais_service_requests WHERE org_id = $1",
      [orgId]
    ),
    db.query<{ id: string; customer_id: string; deal_id: string | null; occurred_at: string }>(
      "SELECT id, customer_id, deal_id, occurred_at FROM tais_activities WHERE org_id = $1",
      [orgId]
    ),
  ]);

  return {
    referenceNow,
    teams: kpiInputs.teams,
    tasks: kpiInputs.tasks,
    contracts: kpiInputs.contracts,
    deals: kpiInputs.deals,
    complaints: kpiInputs.complaints,
    qualityIssues: kpiInputs.qualityIssues,
    customers: customers.rows,
    locations: locations.rows.map((l) => ({ id: l.id, name: l.name, customerId: l.customer_id, category: l.category })),
    serviceRequests: serviceRequests.rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      locationId: r.location_id,
      category: r.category,
      status: r.status,
      matchedTaskId: r.matched_task_id,
      openedAt: r.opened_at,
    })),
    activities: activities.rows.map((a) => ({
      id: a.id,
      customerId: a.customer_id,
      dealId: a.deal_id,
      occurredAt: a.occurred_at,
    })),
  };
}
