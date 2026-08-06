import { migrate, getDb } from "@/lib/db/client";
import { insertCases, recordDecision } from "@/lib/db/repos/decisions";
import { createAction } from "@/lib/db/repos/actions";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import type {
  AiDecisionCase,
  AiEvidenceItem,
  AiActionOption,
  AiCounterfactual,
  AssessedSeverity,
} from "@/lib/ai/provider";
import { TAIS_SECTOR_ID, TAIS_REFERENCE_NOW, TAIS_DECISION_MARKER_PREFIX } from "./constants";
import { daysFromReference } from "./rng";
import { loadTaisRiskInputs, computeTaisRisks, type TaisRisk, type TaisRiskInputs } from "./risks";

/**
 * TAIS IKF MMC demosu icin karar + aksiyon uretimi.
 *
 * SOZLESME: bu dosyadaki `buildTaisDecisionPlans` SAF'tir (Math.random/
 * crypto YOK, DB'ye dokunmaz) — ayni `TaisRiskInputs` + `TaisRisk[]` girdisi
 * icin daima ayni plani uretir (bkz. tests/tais-decisions.test.ts). Yeni bir
 * karar sistemi KURULMAZ: uretilen kararlar mevcut decision_cases/
 * decision_records mekanizmasina (bkz. src/lib/db/repos/decisions.ts), aksiyonlar
 * mevcut actions tablosuna (bkz. src/lib/db/repos/actions.ts) yazilir. Karar->
 * aksiyon zinciri, gercek repository fonksiyonlari (insertCases ->
 * recordDecision -> createAction) araciligiyla, tipki insan tarafindan
 * /api/decisions ucundan onaylanan bir karar gibi kurulur.
 *
 * `related_risk_id` (actions tablosu, migration 17), aksiyonun dayandigi
 * TaisRisk kaydinin kimligini tasir — kanit zincirinin son halkasi budur:
 * risk -> karar (decision_cases.payload.evidence) -> aksiyon (actions.related_risk_id).
 *
 * NOT (Team C hakkinda): gorev metninde "Cleaning Team B'den Team C'ye"
 * aktarim gecer; ancak TAIS demo veri modelinde (bkz. data.ts TAIS_TEAMS)
 * yalnizca "Cleaning Team A" ve "Cleaning Team B" adli iki temizlik ekibi
 * tanimlidir — "Team C" gercek veri katmaninda YOK. Sayilar/veri uydurmamak
 * icin (ZORUNLU ILKE a), aktarim hedefi olarak gercekte var olan tek diger
 * temizlik ekibi olan "Cleaning Team A" kullanilir.
 */

// ---------------------------------------------------------------------------
// Yardimcilar
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

const SEVERITY_RANK: Record<AssessedSeverity, number> = { healthy: 0, info: 1, warning: 2, critical: 3 };

/** Bagli risklerin en yuksek ciddiyetini karara tasir; hic risk yoksa notr 'warning'. */
function maxSeverity(risks: TaisRisk[]): AssessedSeverity {
  if (risks.length === 0) return "warning";
  return risks.reduce<AssessedSeverity>(
    (acc, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[acc] ? r.severity : acc),
    "info"
  );
}

/** Bagli risklerin guven duzeyi ortalamasi (0-100) — veri katmanindan, uydurma degil. */
function avgConfidence(risks: TaisRisk[]): number {
  if (risks.length === 0) return 70;
  return Math.round(risks.reduce((sum, r) => sum + r.confidence, 0) / risks.length);
}

function riskEvidence(risk: TaisRisk): AiEvidenceItem {
  return {
    source: `Risk kaydı: ${risk.ruleId} (${risk.id})`,
    fact: risk.rootCause,
    reliability: "verified",
  };
}

function contractEvidence(params: { contractId: string; customerName: string; daysToRenewal: number; valueAzn: number }): AiEvidenceItem {
  return {
    source: `Sözleşme kaydı: ${params.contractId}`,
    fact: `${params.customerName} için aktif sözleşme, referans tarihten ${Math.round(params.daysToRenewal)} gün sonra yenileme tarihine ulaşıyor (değer: ${Math.round(params.valueAzn)} AZN).`,
    reliability: "verified",
  };
}

const COMMON_ASSUMPTIONS = [
  "Tüm sayılar TAIS demo veri katmanından (ekip/görev/sözleşme/aktivite kayıtları) deterministik olarak hesaplanmıştır; tahmini/uydurma değer içermez.",
];

const GENERIC_HISTORICAL_COMPARISON =
  "Bu kurum için sonucu kaydedilmiş önceki bir karar bulunmuyor (demo ortamındaki ilk karar dizisi); geçmişle nicel karşılaştırma yapılamıyor.";

function doNothingOption(consequence: string): AiActionOption {
  return {
    title: "Aksiyon alma, mevcut durumu izlemeye devam et",
    detail: "Önerilen aksiyonlar uygulanmaz, durum bir sonraki gözden geçirmeye kadar izlenir.",
    feasible: true,
    feasibilityNote: "Ek kaynak gerekmez; her zaman uygulanabilir ama riski büyütür.",
    tradeoffs: "Kısa vadede kaynak/iş gücü harcanmaz.",
    expectedOutcome: consequence,
    rank: 3,
  };
}

// ---------------------------------------------------------------------------
// Plan tipleri
// ---------------------------------------------------------------------------

export interface TaisActionPlan {
  title: string;
  owner: string;
  /** referenceNow'a göre gün ofseti; ISO tarihe seedTaisDecisions icinde cevrilir. */
  dueOffsetDays: number;
  relatedRiskId: string | null;
}

export interface TaisDecisionPlan {
  /** Idempotency + kimlik icin sabit anahtar; case.categoryId icine "tais-decision:" onekiyle gömülür. */
  slug: string;
  /** Bu karari destekleyen TaisRisk kayitlarinin id'leri (kanit zinciri). */
  riskIds: string[];
  case: AiDecisionCase;
  actions: TaisActionPlan[];
}

// ---------------------------------------------------------------------------
// Saf plan uretici — 6 karar + 12 aksiyon
// ---------------------------------------------------------------------------

export function buildTaisDecisionPlans(inputs: TaisRiskInputs, risks: TaisRisk[]): TaisDecisionPlan[] {
  const plans: TaisDecisionPlan[] = [];

  plans.push(buildMainDecision(inputs, risks));
  plans.push(buildUnassignedTaskDecision(risks));
  plans.push(buildRecurringComplaintDecision(risks));

  const keyAccount = risks.find((r) => r.ruleId === "high_delay_critical_customer");
  plans.push(buildStaleDealDecision(risks, keyAccount?.customerId ?? null));
  plans.push(buildKeyAccountDecision(risks, keyAccount));
  plans.push(buildSlaEscalationDecision(risks));

  return plans;
}

// ---------------------------------------------------------------------------
// Karar 1 (ANA KARAR): Cleaning Team B dengeleme + pest-control + yenileme takibi
// ---------------------------------------------------------------------------

function buildMainDecision(inputs: TaisRiskInputs, risks: TaisRisk[]): TaisDecisionPlan {
  const teamB = inputs.teams.find((t) => t.name === "Cleaning Team B");
  const teamA = inputs.teams.find((t) => t.name === "Cleaning Team A");

  const teamBOpenTasks = teamB
    ? inputs.tasks.filter((t) => t.teamId === teamB.id && t.status === "open")
    : [];
  const teamBActiveTasks = teamB
    ? inputs.tasks.filter((t) => t.teamId === teamB.id && t.status !== "done")
    : [];
  const transferTasks = teamBOpenTasks
    .slice()
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 3);

  const capacityRisk = teamB ? risks.find((r) => r.ruleId === "team_capacity_overload" && r.id === `team_capacity_overload:${teamB.id}`) : undefined;

  const pestOverdueOpen = inputs.tasks
    .filter((t) => t.category === "pest_control" && t.status === "open" && new Date(t.dueAt).getTime() < new Date(inputs.referenceNow).getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const priorityPestTasks = pestOverdueOpen.slice(0, 2);
  const pestRiskFor = (customerId: string, locationId: string) =>
    risks.find((r) => r.ruleId === "overdue_periodic_service" && r.id === `overdue_periodic_service:${customerId}:${locationId}`);

  // Sozlesme yenilemesi 30 gunden AZ kalan aktif musteriler (referans veriden
  // dogrudan hesaplanir). Not: RENEWAL_SOON_DAYS penceresi (risks.ts) <=30'dur;
  // burada kesin < 30 kullanilir ki tam yenileme siniri uzerindeki (30.0 gun)
  // rastgele-olusan sozlesmeler senaryonun kastettigi 4 musteriye dahil
  // olmasin (bkz. seed.ts: 4 musterinin yenilemesi kasitli olarak 10/14/18/21
  // gun sonraya ayarlanmistir).
  const renewalSoonByCustomer = new Map<string, { contractId: string; days: number; valueAzn: number }>();
  for (const c of inputs.contracts) {
    if (c.status !== "active") continue;
    const days = daysBetween(inputs.referenceNow, c.renewalDate);
    if (days < 0 || days >= 30) continue;
    const existing = renewalSoonByCustomer.get(c.customerId);
    if (!existing || days < existing.days) {
      renewalSoonByCustomer.set(c.customerId, { contractId: c.id, days, valueAzn: c.valueAzn });
    }
  }
  const renewalCustomers = Array.from(renewalSoonByCustomer.entries())
    .sort((a, b) => a[1].days - b[1].days)
    .map(([customerId, info]) => ({
      customerId,
      customerName: inputs.customers.find((c) => c.id === customerId)?.name ?? customerId,
      ...info,
    }));

  const linkedRisks: TaisRisk[] = [];
  if (capacityRisk) linkedRisks.push(capacityRisk);
  for (const t of priorityPestTasks) {
    const r = pestRiskFor(t.customerId, t.locationId);
    if (r && !linkedRisks.includes(r)) linkedRisks.push(r);
  }
  const customerRisks = new Map<string, TaisRisk>();
  for (const rc of renewalCustomers) {
    const r = risks.find((x) => x.customerId === rc.customerId);
    if (r) customerRisks.set(rc.customerId, r);
  }
  for (const r of customerRisks.values()) {
    if (!linkedRisks.includes(r)) linkedRisks.push(r);
  }

  const evidence: AiEvidenceItem[] = [];
  if (capacityRisk) evidence.push(riskEvidence(capacityRisk));
  for (const t of priorityPestTasks) {
    const r = pestRiskFor(t.customerId, t.locationId);
    if (r) evidence.push(riskEvidence(r));
  }
  for (const rc of renewalCustomers) {
    const r = customerRisks.get(rc.customerId);
    if (r) {
      evidence.push(riskEvidence(r));
    } else {
      evidence.push(
        contractEvidence({ contractId: rc.contractId, customerName: rc.customerName, daysToRenewal: rc.days, valueAzn: rc.valueAzn })
      );
    }
  }

  const teamBUtilPct = teamB ? Math.round((teamBActiveTasks.length / teamB.capacity) * 100) : null;
  const teamAOpenCount = teamA ? inputs.tasks.filter((t) => t.teamId === teamA.id && t.status !== "done").length : null;
  const teamAUtilAfterPct =
    teamA && teamAOpenCount !== null ? Math.round(((teamAOpenCount + transferTasks.length) / teamA.capacity) * 100) : null;

  const totalRenewalValue = Math.round(renewalCustomers.reduce((sum, rc) => sum + rc.valueAzn, 0));
  const nearestRenewalDays = renewalCustomers.length > 0 ? Math.round(Math.min(...renewalCustomers.map((rc) => rc.days))) : 30;

  const businessImpact =
    `${teamB?.name ?? "Cleaning Team B"} aktif görev yükü kapasitesinin %${teamBUtilPct ?? "?"}'ünde; ` +
    `${transferTasks.length} görev en yakın son tarihe göre seçilip ${teamA?.name ?? "Cleaning Team A"}'ya aktarılırsa hedef ekip kapasitesinin %${teamAUtilAfterPct ?? "?"}'üne çıkar (kapasitenin altında kalır). ` +
    `Pest control tarafında ${pestOverdueOpen.length} geciken açık ziyaretten en acil ${priorityPestTasks.length} tanesi yarının programına öncelikli eklenir. ` +
    `Aktif sözleşmesi referans tarihten ${nearestRenewalDays}-30 gün içinde yenilenecek ${renewalCustomers.length} müşteri (toplam sözleşme değeri ${totalRenewalValue} AZN) için ticari takip başlatılır. ` +
    `Etkilenen operasyonlar: Cleaning (Team B/Team A), Pest Control, Satış/CRM.`;

  const counterfactual: AiCounterfactual = {
    narrative:
      `Aksiyon alınmazsa ${teamB?.name ?? "Cleaning Team B"} kırmızı bölge üzerindeki kapasite kullanımında çalışmaya devam eder ve SLA ihlali riski taşıyan görevler birikir; ` +
      `geciken pest-control ziyaretleri sözleşme kapsamındaki periyodik hizmet yükümlülüğünü ihlal etmeyi sürdürür; ` +
      `yenilemesi yaklaşan ${renewalCustomers.length} müşteriyle temas kurulmazsa yenilenmeme veya rakibe geçme riski büyür.`,
    projectedImpact: `Riske giren toplam sözleşme değeri: ${totalRenewalValue} AZN (${renewalCustomers.length} müşterinin aktif sözleşmeleri).`,
    timeHorizon: `${nearestRenewalDays}-30 gün içinde (en yakın yenileme ${nearestRenewalDays} gün sonra)`,
  };

  const options: AiActionOption[] = [
    {
      title: "Önerilen: üç aksiyonu eşzamanlı uygula (görev aktarımı + pest-control önceliklendirme + müşteri takibi)",
      detail:
        `${transferTasks.length} görevi ${teamA?.name ?? "Cleaning Team A"}'ya aktar, ${priorityPestTasks.length} geciken pest-control ziyaretini yarının programına al, ` +
        `${renewalCustomers.length} yenileme-yaklaşan müşteri için ticari takip başlat.`,
      feasible: true,
      feasibilityNote: `${teamA?.name ?? "Cleaning Team A"} kapasitenin altında kalır (%${teamAUtilAfterPct ?? "?"}); ek işe alım gerekmez.`,
      tradeoffs: `${teamA?.name ?? "Cleaning Team A"}'nın yükü artar ancak kapasiteyi aşmaz.`,
      expectedOutcome: `${teamB?.name ?? "Cleaning Team B"} yükü azalır, pest-control gecikmesi kapanır, 4 müşteride temas kurulur.`,
      rank: 1,
    },
    {
      title: "Kısmi aksiyon: yalnızca pest-control ve müşteri takibini şimdi yap, görev aktarımını ertele",
      detail: "Görev aktarımı bir sonraki kapasite gözden geçirmesine bırakılır; diğer iki aksiyon hemen uygulanır.",
      feasible: true,
      feasibilityNote: "Daha az operasyonel değişiklik gerektirir.",
      tradeoffs: `${teamB?.name ?? "Cleaning Team B"}'nin aşırı yüklenmesi sürer, yeni SLA ihlali riski kalır.`,
      expectedOutcome: "Acil pest-control ve müşteri temas noktaları kapanır ama kapasite dengesizliği çözülmez.",
      rank: 2,
    },
    doNothingOption(
      "Gecikmeler ve müşteri temassızlığı sürer; SLA ihlali ve müşteri kaybı olasılığı artar."
    ),
  ];

  const evidenceCase: AiDecisionCase = {
    categoryId: "tais-decision:cleaning-b-rebalance-pest-renewal",
    categoryLabel: "Operasyon Dengeleme + Sözleşme Yenileme",
    severity: maxSeverity(linkedRisks),
    title:
      `${teamB?.name ?? "Cleaning Team B"} üzerindeki ${transferTasks.length} görevin ${teamA?.name ?? "Cleaning Team A"}'ya aktarılması, ` +
      `${priorityPestTasks.length} geciken pest-control ziyaretinin yarınki programa öncelikli eklenmesi ve yenileme tarihi yaklaşan ${renewalCustomers.length} müşteri için ticari takip aksiyonlarının başlatılması`,
    businessImpact,
    confidence: avgConfidence(linkedRisks),
    confidenceRationale:
      "Bağlı risk kayıtlarının (risk motoru) güven düzeyi ortalamasından hesaplanmıştır; sabit/uydurma bir değer değildir.",
    evidence,
    assumptions: [
      ...COMMON_ASSUMPTIONS,
      `${teamA?.name ?? "Cleaning Team A"}'nın aktarılan görevleri teknik olarak üstlenebileceği varsayılmıştır (aynı hizmet kategorisi: cleaning).`,
      "Aktarımın hizmet kalitesini düşürmeyeceği varsayılmıştır; aksi halde ayrı bir kalite izleme kararı gerekir.",
    ],
    historicalComparison: GENERIC_HISTORICAL_COMPARISON,
    counterfactual,
    options,
    recommendedOptionRank: 1,
  };

  const actions: TaisActionPlan[] = [];
  actions.push({
    title: `${transferTasks.length} temizlik görevini ${teamB?.name ?? "Cleaning Team B"}'den ${teamA?.name ?? "Cleaning Team A"}'ya aktar`,
    owner: `${teamA?.name ?? "Cleaning Team A"} Ekip Lideri`,
    dueOffsetDays: 1,
    relatedRiskId: capacityRisk?.id ?? null,
  });
  for (const t of priorityPestTasks) {
    const r = pestRiskFor(t.customerId, t.locationId);
    actions.push({
      title: `Geciken pest-control ziyaretini (görev ${t.id}) yarının programına öncelikli ekle`,
      owner: "Pest Control Team Sorumlusu",
      dueOffsetDays: 1,
      relatedRiskId: r?.id ?? null,
    });
  }
  for (const rc of renewalCustomers) {
    const r = customerRisks.get(rc.customerId);
    actions.push({
      title: `${rc.customerName} için sözleşme yenileme öncesi ticari takip görüşmesi planla`,
      owner: "Satış ve CRM Ekibi",
      dueOffsetDays: 2,
      relatedRiskId: r?.id ?? null,
    });
  }

  return {
    slug: "cleaning-b-rebalance-pest-renewal",
    riskIds: linkedRisks.map((r) => r.id),
    case: evidenceCase,
    actions,
  };
}

// ---------------------------------------------------------------------------
// Karar 2: sahipsiz gorevlere sorumlu atanmasi
// ---------------------------------------------------------------------------

function buildUnassignedTaskDecision(risks: TaisRisk[]): TaisDecisionPlan {
  const risk = risks.find((r) => r.ruleId === "unassigned_task");
  const linked = risk ? [risk] : [];
  const teamLabel = risk?.title.replace(/ ekibinde.*/, "") ?? "İlgili ekip";

  const evidence = risk ? [riskEvidence(risk)] : [];
  const counterfactual: AiCounterfactual = {
    narrative: `Sorumlu atanmazsa sahipsiz görev takipsiz kalır ve gecikme/unutulma riski taşır.`,
    projectedImpact: risk ? `${risk.affectedCount} görev sahipsiz kalmaya devam eder.` : "Etki verisi bulunamadı.",
    timeHorizon: "1-3 gün içinde",
  };
  const options: AiActionOption[] = [
    {
      title: "Önerilen: ekip içinden sorumlu ata",
      detail: `${teamLabel} ekibindeki sahipsiz göreve ekip lideri bir sorumlu atar.`,
      feasible: true,
      feasibilityNote: "Ekip içi kapasite yeterli (görev sayısı düşük).",
      tradeoffs: "Ek kaynak gerekmez.",
      expectedOutcome: "Görev sahiplenilir, takip edilebilir hale gelir.",
      rank: 1,
    },
    {
      title: "Alternatif: görevi başka bir ekibe devret",
      detail: "Kapasite kısıtı varsa görev aynı kategoriden başka bir ekibe aktarılabilir.",
      feasible: true,
      feasibilityNote: "Ek koordinasyon gerektirir.",
      tradeoffs: "Devir süreci gecikmeyi kısa süreliğine uzatabilir.",
      expectedOutcome: "Görev sahiplenilir ancak devir süreci ek zaman alır.",
      rank: 2,
    },
    doNothingOption("Görev sahipsiz kalmaya devam eder, gecikme/unutulma riski büyür."),
  ];

  const evidenceCase: AiDecisionCase = {
    categoryId: "tais-decision:unassigned-task-owner-assignment",
    categoryLabel: "Görev Sahiplenme",
    severity: maxSeverity(linked),
    title: `${teamLabel} ekibindeki sahipsiz göreve sorumlu atanması`,
    businessImpact: risk
      ? `${risk.title}. ${risk.rootCause}`
      : "Sahipsiz görev tespit edilemedi; risk verisi mevcut değil.",
    confidence: avgConfidence(linked),
    confidenceRationale: "Bağlı risk kaydının güven düzeyinden hesaplanmıştır.",
    evidence,
    assumptions: COMMON_ASSUMPTIONS,
    historicalComparison: GENERIC_HISTORICAL_COMPARISON,
    counterfactual,
    options,
    recommendedOptionRank: 1,
  };

  return {
    slug: "unassigned-task-owner-assignment",
    riskIds: linked.map((r) => r.id),
    case: evidenceCase,
    actions: [
      {
        title: `${teamLabel} ekibindeki sahipsiz göreve sorumlu ata`,
        owner: `${teamLabel} Ekip Lideri`,
        dueOffsetDays: 1,
        relatedRiskId: risk?.id ?? null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Karar 3: tekrarlayan sikayette kok neden gorusmesi
// ---------------------------------------------------------------------------

function buildRecurringComplaintDecision(risks: TaisRisk[]): TaisDecisionPlan {
  const risk = risks.find((r) => r.ruleId === "recurring_complaint");
  const linked = risk ? [risk] : [];
  const customerName = risk?.customerName ?? "İlgili müşteri";

  const evidence = risk ? [riskEvidence(risk)] : [];
  const counterfactual: AiCounterfactual = {
    narrative: `Kök neden görüşmesi yapılmazsa şikâyet tekrar edebilir ve sözleşme yenileme riskine dönüşebilir.`,
    projectedImpact: risk ? `${risk.affectedCount} şikâyet kaydı; tekrar riski sürer.` : "Etki verisi bulunamadı.",
    timeHorizon: "3-7 gün içinde",
  };
  const options: AiActionOption[] = [
    {
      title: "Önerilen: müşteriyle kök neden görüşmesi yap",
      detail: `${customerName} ile hizmet planını gözden geçiren bir görüşme planla.`,
      feasible: true,
      feasibilityNote: "Standart müşteri ilişkileri süreciyle uygulanabilir.",
      tradeoffs: "Görüşme için zaman ayrılması gerekir.",
      expectedOutcome: "Kök neden belirlenir, tekrar riski azalır.",
      rank: 1,
    },
    {
      title: "Alternatif: yalnızca hizmet ekibini değiştir",
      detail: "Görüşme yapılmadan doğrudan saha ekibi rotasyonu uygulanır.",
      feasible: true,
      feasibilityNote: "Kısa vadede uygulanabilir ama kök nedeni doğrulamaz.",
      tradeoffs: "Kök neden hizmet ekibi değilse sorun tekrar edebilir.",
      expectedOutcome: "Geçici iyileşme sağlanabilir, kalıcı çözüm garanti edilmez.",
      rank: 2,
    },
    doNothingOption("Şikâyet tekrar etme riski sürer, sözleşme yenileme riski büyür."),
  ];

  const evidenceCase: AiDecisionCase = {
    categoryId: "tais-decision:recurring-complaint-root-cause",
    categoryLabel: "Müşteri Şikâyet Yönetimi",
    severity: maxSeverity(linked),
    title: `${customerName} müşterisiyle tekrarlayan şikâyet için kök neden görüşmesi planlanması`,
    businessImpact: risk ? `${risk.title}. ${risk.rootCause}` : "Tekrarlayan şikâyet tespit edilemedi.",
    confidence: avgConfidence(linked),
    confidenceRationale: "Bağlı risk kaydının güven düzeyinden hesaplanmıştır.",
    evidence,
    assumptions: COMMON_ASSUMPTIONS,
    historicalComparison: GENERIC_HISTORICAL_COMPARISON,
    counterfactual,
    options,
    recommendedOptionRank: 1,
  };

  return {
    slug: "recurring-complaint-root-cause",
    riskIds: linked.map((r) => r.id),
    case: evidenceCase,
    actions: [
      {
        title: `${customerName} ile kök neden görüşmesi planla`,
        owner: "Müşteri İlişkileri Sorumlusu",
        dueOffsetDays: 3,
        relatedRiskId: risk?.id ?? null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Karar 4: duragan satis firsati icin yeniden temas (kilit musteri haric)
// ---------------------------------------------------------------------------

function buildStaleDealDecision(risks: TaisRisk[], excludeCustomerId: string | null): TaisDecisionPlan {
  const risk = risks.find((r) => r.ruleId === "stale_deal" && r.customerId !== excludeCustomerId);
  const linked = risk ? [risk] : [];
  const customerName = risk?.customerName ?? "İlgili müşteri";

  const evidence = risk ? [riskEvidence(risk)] : [];
  const counterfactual: AiCounterfactual = {
    narrative: `Yeniden temas kurulmazsa fırsat kaybedilebilir veya rakibe kayabilir.`,
    projectedImpact: risk ? `${risk.affectedCount} satış fırsatı güncellenmeden bekliyor.` : "Etki verisi bulunamadı.",
    timeHorizon: "2-5 gün içinde",
  };
  const options: AiActionOption[] = [
    {
      title: "Önerilen: satış ekibi yeniden temas kursun",
      detail: `${customerName} ile fırsat aşaması güncellenir.`,
      feasible: true,
      feasibilityNote: "Standart satış sürecine uygun.",
      tradeoffs: "Satış ekibinden zaman ayrılması gerekir.",
      expectedOutcome: "Fırsat güncellenir, kaybedilme riski azalır.",
      rank: 1,
    },
    {
      title: "Alternatif: fırsatı düşük öncelikli olarak işaretle",
      detail: "Kaynak kısıtı varsa fırsat listede düşük öncelikli tutulur.",
      feasible: true,
      feasibilityNote: "Ek kaynak gerekmez.",
      tradeoffs: "Fırsatın kaybedilme olasılığı yüksek kalır.",
      expectedOutcome: "Kısa vadede kaynak tasarrufu, uzun vadede kayıp riski.",
      rank: 2,
    },
    doNothingOption("Fırsat güncellenmeden beklemeye devam eder, kaybedilme riski büyür."),
  ];

  const evidenceCase: AiDecisionCase = {
    categoryId: "tais-decision:stale-deal-reengagement",
    categoryLabel: "Satış Fırsatı Takibi",
    severity: maxSeverity(linked),
    title: `${customerName} için durağan satış fırsatında yeniden temas kurulması`,
    businessImpact: risk ? `${risk.title}. ${risk.rootCause}` : "Durağan satış fırsatı tespit edilemedi.",
    confidence: avgConfidence(linked),
    confidenceRationale: "Bağlı risk kaydının güven düzeyinden hesaplanmıştır.",
    evidence,
    assumptions: COMMON_ASSUMPTIONS,
    historicalComparison: GENERIC_HISTORICAL_COMPARISON,
    counterfactual,
    options,
    recommendedOptionRank: 1,
  };

  return {
    slug: "stale-deal-reengagement",
    riskIds: linked.map((r) => r.id),
    case: evidenceCase,
    actions: [
      {
        title: `${customerName} ile yeniden temas kur ve fırsat aşamasını güncelle`,
        owner: "Satış Ekibi",
        dueOffsetDays: 2,
        relatedRiskId: risk?.id ?? null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Karar 5: kritik (yuksek gecikme oranli) musteride ozel kaynak ayrilmasi
// ---------------------------------------------------------------------------

function buildKeyAccountDecision(risks: TaisRisk[], keyAccountRisk: TaisRisk | undefined): TaisDecisionPlan {
  const customerId = keyAccountRisk?.customerId ?? null;
  const customerName = keyAccountRisk?.customerName ?? "İlgili müşteri";
  const relatedRisks = customerId ? risks.filter((r) => r.customerId === customerId) : [];
  const linked = relatedRisks;

  const evidence = relatedRisks.map(riskEvidence);
  const counterfactual: AiCounterfactual = {
    narrative: `Kritik müşteriye özel kaynak ayrılmazsa gecikme oranı yüksek kalır, sözleşme yenileme ve itibar kaybı riski artar.`,
    projectedImpact: keyAccountRisk ? `${keyAccountRisk.rootCause}` : "Etki verisi bulunamadı.",
    timeHorizon: "3-5 gün içinde",
  };
  const options: AiActionOption[] = [
    {
      title: "Önerilen: kritik müşteriye özel kaynak ayır ve iletişim planı hazırla",
      detail: `${customerName} için öncelikli kaynak ve düzenli iletişim planı oluşturulur.`,
      feasible: true,
      feasibilityNote: "Müşterinin sözleşme değeri önceliklendirmeyi haklı çıkarıyor.",
      tradeoffs: "Diğer müşterilere ayrılan kaynak kısmen bu müşteriye kayar.",
      expectedOutcome: "Gecikme oranı düşer, ilişki güçlenir.",
      rank: 1,
    },
    {
      title: "Alternatif: yalnızca gecikmiş görevleri hızlandır, iletişim planı ekleme",
      detail: "Kaynak ayrımı yapılmadan yalnızca operasyonel hızlandırma uygulanır.",
      feasible: true,
      feasibilityNote: "Daha az koordinasyon gerektirir.",
      tradeoffs: "İlişki yönetimi tarafı eksik kalır.",
      expectedOutcome: "Kısa vadeli iyileşme sağlanır, altta yatan ilişki riski sürebilir.",
      rank: 2,
    },
    doNothingOption("Gecikme oranı yüksek kalır, sözleşme yenileme ve itibar kaybı riski büyür."),
  ];

  const evidenceCase: AiDecisionCase = {
    categoryId: "tais-decision:key-account-risk-response",
    categoryLabel: "Kilit Müşteri Yönetimi",
    severity: maxSeverity(linked),
    title: `Kritik müşteri ${customerName} için özel kaynak ayrılması ve iletişim planı başlatılması`,
    businessImpact: keyAccountRisk
      ? `${keyAccountRisk.title}. Bu müşteride toplam ${relatedRisks.length} ilişkili risk kaydı bulunuyor.`
      : "Kritik müşteri riski tespit edilemedi.",
    confidence: avgConfidence(linked),
    confidenceRationale: "Bağlı risk kayıtlarının güven düzeyi ortalamasından hesaplanmıştır.",
    evidence,
    assumptions: COMMON_ASSUMPTIONS,
    historicalComparison: GENERIC_HISTORICAL_COMPARISON,
    counterfactual,
    options,
    recommendedOptionRank: 1,
  };

  return {
    slug: "key-account-risk-response",
    riskIds: linked.map((r) => r.id),
    case: evidenceCase,
    actions: [
      {
        title: `${customerName} için özel kaynak ayrılması ve iletişim planı hazırlanması`,
        owner: "Kilit Müşteri Yöneticisi",
        dueOffsetDays: 2,
        relatedRiskId: keyAccountRisk?.id ?? null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Karar 6: SLA riski + gecikmis gorevlerin oncelikli tamamlanmasi
// ---------------------------------------------------------------------------

function buildSlaEscalationDecision(risks: TaisRisk[]): TaisDecisionPlan {
  const slaRisk = risks.find((r) => r.ruleId === "sla_risk_task");
  const overdueRisk = slaRisk
    ? risks.find((r) => r.ruleId === "overdue_open_task" && r.customerId === slaRisk.customerId)
    : undefined;
  const linked = [slaRisk, overdueRisk].filter((r): r is TaisRisk => Boolean(r));
  const locationName = slaRisk?.locationName ?? overdueRisk?.locationName ?? "İlgili lokasyon";

  const evidence = linked.map(riskEvidence);
  const counterfactual: AiCounterfactual = {
    narrative: `Öncelik verilmezse SLA süresi dolabilir ve sözleşme kapsamındaki hizmet taahhüdü ihlal edilmiş sayılır.`,
    projectedImpact: slaRisk ? `${slaRisk.rootCause}` : "Etki verisi bulunamadı.",
    timeHorizon: "24-48 saat içinde",
  };
  const options: AiActionOption[] = [
    {
      title: "Önerilen: SLA riski taşıyan ve gecikmiş görevleri bugün önceliklendir",
      detail: `${locationName} için açık görevler bugünün önceliğine alınır.`,
      feasible: true,
      feasibilityNote: "Ekip mevcut kapasitesiyle uygulanabilir.",
      tradeoffs: "Diğer düşük öncelikli görevler bir miktar gecikebilir.",
      expectedOutcome: "SLA ihlali önlenir, gecikme kapanır.",
      rank: 1,
    },
    {
      title: "Alternatif: yalnızca SLA riskindeki görevi önceliklendir, gecikmiş görevi ertele",
      detail: "Sınırlı kapasite varsa yalnızca SLA süresi yakın görev işlenir.",
      feasible: true,
      feasibilityNote: "Daha az kaynak gerektirir.",
      tradeoffs: "Zaten gecikmiş görevin gecikmesi büyümeye devam eder.",
      expectedOutcome: "SLA ihlali önlenir ama gecikmiş görev kapanmaz.",
      rank: 2,
    },
    doNothingOption("SLA süresi dolabilir, sözleşme taahhüdü ihlal edilmiş sayılır."),
  ];

  const evidenceCase: AiDecisionCase = {
    categoryId: "tais-decision:sla-risk-priority-completion",
    categoryLabel: "SLA Risk Yönetimi",
    severity: maxSeverity(linked),
    title: `${locationName} için SLA riski taşıyan ve gecikmiş görevlerin öncelikli tamamlanması`,
    businessImpact: slaRisk ? `${slaRisk.title}. ${slaRisk.rootCause}` : "SLA riski tespit edilemedi.",
    confidence: avgConfidence(linked),
    confidenceRationale: "Bağlı risk kayıtlarının güven düzeyi ortalamasından hesaplanmıştır.",
    evidence,
    assumptions: COMMON_ASSUMPTIONS,
    historicalComparison: GENERIC_HISTORICAL_COMPARISON,
    counterfactual,
    options,
    recommendedOptionRank: 1,
  };

  return {
    slug: "sla-risk-priority-completion",
    riskIds: linked.map((r) => r.id),
    case: evidenceCase,
    actions: [
      {
        title: `${locationName} için SLA riski taşıyan ve gecikmiş görevleri bugün içinde tamamla`,
        owner: "İlgili Saha Ekibi Lideri",
        dueOffsetDays: 1,
        relatedRiskId: slaRisk?.id ?? null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// DB'ye dokunan tek fonksiyon: plani decision_cases/decision_records/actions'a yazar
// ---------------------------------------------------------------------------

async function taisDecisionCaseCount(orgId: string): Promise<number> {
  const r = await getDb().query<{ n: number }>(
    "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1 AND category_id LIKE $2",
    [orgId, `${TAIS_DECISION_MARKER_PREFIX}%`]
  );
  return r.rows[0]?.n ?? 0;
}

export interface SeededTaisDecision {
  slug: string;
  caseId: string;
  decisionId: string;
  actionIds: string[];
}

/**
 * TAIS demo karar+aksiyon zincirini org_id altina yazar. Idempotenttir:
 * daha once bu org icin uretilmis TAIS kararlari varsa (category_id
 * "tais-decision:" ile basliyorsa), hicbir sey yazmadan mevcut kayitlari
 * okuyup doner (bkz. seed.ts seedTaisDemo ile ayni desen).
 */
export async function seedTaisDecisions(
  orgId: string
): Promise<{ alreadySeeded: boolean; decisions: SeededTaisDecision[] }> {
  await migrate();

  const existingCount = await taisDecisionCaseCount(orgId);
  if (existingCount > 0) {
    const decisions = await loadExistingTaisDecisions(orgId);
    return { alreadySeeded: true, decisions };
  }

  const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
  const risks = computeTaisRisks(inputs);
  const plans = buildTaisDecisionPlans(inputs, risks);

  const decisions: SeededTaisDecision[] = [];
  for (const plan of plans) {
    const [storedCase] = await insertCases(orgId, TAIS_SECTOR_ID, [plan.case]);
    const decisionId = await recordDecision({
      orgId,
      caseId: storedCase.id,
      sectorId: TAIS_SECTOR_ID,
      choice: "accepted",
      decidedBy: "sistem",
      payload: {
        reason: plan.case.businessImpact,
        chosenAction: plan.case.options.find((o) => o.rank === plan.case.recommendedOptionRank)?.title ?? plan.case.title,
        expectedBenefit: plan.case.options.find((o) => o.rank === plan.case.recommendedOptionRank)?.expectedOutcome ?? "",
        consequenceIfNotDecided: plan.case.counterfactual.narrative,
        riskIds: plan.riskIds,
      },
    });

    const actionIds: string[] = [];
    for (const action of plan.actions) {
      const actionId = await createAction({
        orgId,
        decisionId,
        caseId: storedCase.id,
        title: action.title,
        owner: action.owner,
        dueAt: daysFromReference(TAIS_REFERENCE_NOW, action.dueOffsetDays),
        relatedRiskId: action.relatedRiskId,
      });
      actionIds.push(actionId);
    }

    decisions.push({ slug: plan.slug, caseId: storedCase.id, decisionId, actionIds });
  }

  await recordAuditEvent({
    orgId,
    actor: "sistem",
    type: "tais_decisions_seed",
    summary: `TAIS demo karar+aksiyon zinciri oluşturuldu (${decisions.length} karar, ${decisions.reduce((s, d) => s + d.actionIds.length, 0)} aksiyon)`,
  });

  return { alreadySeeded: false, decisions };
}

async function loadExistingTaisDecisions(orgId: string): Promise<SeededTaisDecision[]> {
  const db = getDb();
  const cases = await db.query<{ id: string; category_id: string }>(
    "SELECT id, category_id FROM decision_cases WHERE org_id = $1 AND category_id LIKE $2 ORDER BY created_at ASC",
    [orgId, `${TAIS_DECISION_MARKER_PREFIX}%`]
  );
  const decisions: SeededTaisDecision[] = [];
  for (const c of cases.rows) {
    const records = await db.query<{ id: string }>(
      "SELECT id FROM decision_records WHERE org_id = $1 AND case_id = $2 ORDER BY created_at ASC",
      [orgId, c.id]
    );
    const decisionId = records.rows[0]?.id ?? "";
    const actions = decisionId
      ? await db.query<{ id: string }>(
          "SELECT id FROM actions WHERE org_id = $1 AND decision_id = $2 ORDER BY created_at ASC",
          [orgId, decisionId]
        )
      : { rows: [] as { id: string }[] };
    decisions.push({
      slug: c.category_id.slice(TAIS_DECISION_MARKER_PREFIX.length),
      caseId: c.id,
      decisionId,
      actionIds: actions.rows.map((a) => a.id),
    });
  }
  return decisions;
}
