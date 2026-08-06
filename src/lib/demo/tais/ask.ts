import { TAIS_CATEGORIES, type TaisCategoryId } from "./data";
import { computeTaisKpis, type TaisKpiInputs, type TaisTaskRow } from "./kpi";
import { computeTaisRisks, type TaisRisk, type TaisRiskInputs } from "./risks";
import { pickMainDecision, type TaisDecisionMeta } from "./executive-summary";

/**
 * TAIS demosu için Ask ABYS soru-cevap katmanı (master plan md.15 uzantısı).
 *
 * SÖZLEŞME: bu dosya DB'ye dokunmaz (SAF fonksiyon) — girdi olarak zaten
 * yüklenmiş `TaisKpiInputs`/`TaisRiskInputs`/karar listesini alır, mevcut
 * `computeTaisKpis`/`computeTaisRisks`/`pickMainDecision` motorlarını
 * DEĞİŞTİRMEDEN kullanır. Ask ABYS'nin var olan ekranını/route'unu (bkz.
 * src/app/api/ask/route.ts) değiştirmez, yalnızca org'da TAIS verisi
 * bulunduğunda devreye giren ek bir soru eşleme katmanı sağlar. Sayı
 * üretmez — yalnızca zaten hesaplanmış kayıtları biçimlendirir; eşleşen
 * kayıt yoksa dürüstçe "kayıt yok" der.
 */

export type AskLabel = "fact" | "inference" | "recommendation";

export interface TaisAskStatement {
  label: AskLabel;
  text: string;
  source: string;
}

export interface TaisAskSource {
  kind: string;
  ref: string;
  title: string;
}

export interface TaisAskResult {
  answer: string;
  statements: TaisAskStatement[];
  sources: TaisAskSource[];
}

const CATEGORY_LABEL: Record<TaisCategoryId, string> = Object.fromEntries(
  TAIS_CATEGORIES.map((c) => [c.id, c.label])
) as Record<TaisCategoryId, string>;

const DAY_MS = 24 * 60 * 60 * 1000;
function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

/** `iso` PGlite'tan zaman zaman Date nesnesi olarak da gelebilir (TIMESTAMPTZ). */
function dateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

interface NameMaps {
  customerById: Map<string, string>;
  locationById: Map<string, string>;
  teamById: Map<string, string>;
}

function buildNameMaps(kpiInputs: TaisKpiInputs, riskInputs: TaisRiskInputs): NameMaps {
  return {
    customerById: new Map(riskInputs.customers.map((c) => [c.id, c.name])),
    locationById: new Map(riskInputs.locations.map((l) => [l.id, l.name])),
    teamById: new Map(kpiInputs.teams.map((t) => [t.id, t.name])),
  };
}

function riskStatement(r: TaisRisk): TaisAskStatement {
  return {
    label: "fact",
    text: `[${r.severity}] ${r.title} — kök neden: ${r.rootCause} Önerilen aksiyon: ${r.recommendedAction}`,
    source: `risk:${r.id}`,
  };
}

function riskSource(r: TaisRisk): TaisAskSource {
  return { kind: "tais_risk", ref: r.id, title: r.title };
}

function taskStatement(t: TaisTaskRow, maps: NameMaps, referenceNow: string): TaisAskStatement {
  const customer = maps.customerById.get(t.customerId) ?? t.customerId;
  const location = maps.locationById.get(t.locationId) ?? t.locationId;
  const team = maps.teamById.get(t.teamId) ?? t.teamId;
  const overdueDays = Math.max(0, Math.round(daysBetween(t.dueAt, referenceNow)));
  return {
    label: "fact",
    text: `${CATEGORY_LABEL[t.category]} görevi — müşteri: ${customer}, lokasyon: ${location}, ekip: ${team}, son tarih: ${dateOnly(t.dueAt)} (${overdueDays} gün gecikmiş)`,
    source: `görev:${t.id.slice(0, 8)}`,
  };
}

function taskSource(t: TaisTaskRow): TaisAskSource {
  return { kind: "tais_task", ref: t.id, title: `${CATEGORY_LABEL[t.category]} görevi` };
}

function noRecordResult(text: string): TaisAskResult {
  return {
    answer: text,
    statements: [{ label: "fact", text, source: "tais_data_snapshot" }],
    sources: [],
  };
}

/**
 * TAIS org'una özgü sorulara (12 senaryo, bkz. kuyruk maddesi) deterministik
 * cevap üretir. Eşleşme yoksa null döner — çağıran mevcut genel Ask ABYS
 * mantığına (aksiyon/karar/sonuç/belge RAG) devam eder.
 */
export function answerTaisQuestion(params: {
  question: string;
  kpiInputs: TaisKpiInputs;
  riskInputs: TaisRiskInputs;
  decisions: TaisDecisionMeta[];
  referenceNow: string;
}): TaisAskResult | null {
  const { question, kpiInputs, riskInputs, decisions, referenceNow } = params;
  const q = question.toLocaleLowerCase("tr-TR");
  const asks = (...words: string[]) => words.some((w) => q.includes(w));

  const maps = buildNameMaps(kpiInputs, riskInputs);
  const kpis = computeTaisKpis(kpiInputs);
  const allRisks = computeTaisRisks(riskInputs);

  // 1) Belirli hizmet kategorisinde ("catering'de bugün risk var mı") bugünkü risk durumu
  const categoryMatch = TAIS_CATEGORIES.find((c) => asks(c.id.replace("_", " "), c.id, c.label.toLocaleLowerCase("tr-TR")));
  if (categoryMatch && asks("risk")) {
    const catRisks = allRisks.filter((r) => r.category === categoryMatch.id);
    if (catRisks.length === 0) {
      return noRecordResult(`Şu an ${categoryMatch.label} hizmetinde açık risk kaydı yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    return {
      answer: `${categoryMatch.label} hizmetinde ${catRisks.length} açık risk var; en kritiği: "${catRisks[0].title}".`,
      statements: catRisks.slice(0, 5).map(riskStatement),
      sources: catRisks.slice(0, 5).map(riskSource),
    };
  }

  // 2) Pest control gecikmeleri
  if (asks("pest control", "pest-control", "ilaçlama", "haşere")) {
    const overdue = kpiInputs.tasks.filter(
      (t) => t.category === "pest_control" && t.status !== "done" && new Date(t.dueAt).getTime() < new Date(referenceNow).getTime()
    );
    if (overdue.length === 0) {
      return noRecordResult(`Gecikmiş pest control görevi yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    return {
      answer: `${overdue.length} pest control görevi gecikmiş.`,
      statements: overdue.map((t) => taskStatement(t, maps, referenceNow)),
      sources: overdue.map(taskSource),
    };
  }

  // 3) SLA riski taşıyan müşteriler
  if (asks("sla")) {
    const slaRisks = allRisks.filter((r) => r.ruleId === "sla_risk_task");
    if (slaRisks.length === 0) {
      return noRecordResult(`SLA süresi 48 saat içinde dolacak açık görev yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    return {
      answer: `SLA riski taşıyan ${slaRisks.length} müşteri/lokasyon var; en acili: "${slaRisks[0].title}".`,
      statements: slaRisks.slice(0, 5).map(riskStatement),
      sources: slaRisks.slice(0, 5).map(riskSource),
    };
  }

  // 4) Ekip kapasite problemi
  if (asks("kapasite")) {
    const capacityRisks = allRisks.filter((r) => r.ruleId === "team_capacity_overload");
    if (capacityRisks.length === 0) {
      return noRecordResult(`Kapasite eşiğini aşan ekip yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    return {
      answer: `${capacityRisks.length} ekipte kapasite problemi var; en yüklüsü: "${capacityRisks[0].title}".`,
      statements: capacityRisks.map(riskStatement),
      sources: capacityRisks.map(riskSource),
    };
  }

  // 5) Yenileme tarihi yaklaşan müşteriler
  if (asks("yenileme")) {
    const RENEWAL_SOON_DAYS = 30;
    const upcoming = kpiInputs.contracts.filter(
      (c) => c.status === "active" && daysBetween(referenceNow, c.renewalDate) <= RENEWAL_SOON_DAYS && daysBetween(referenceNow, c.renewalDate) >= 0
    );
    if (upcoming.length === 0) {
      return noRecordResult(`Önümüzdeki ${RENEWAL_SOON_DAYS} gün içinde yenilenecek sözleşme yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    const sorted = [...upcoming].sort((a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime());
    return {
      answer: `Önümüzdeki ${RENEWAL_SOON_DAYS} gün içinde yenilenecek ${sorted.length} sözleşme var.`,
      statements: sorted.slice(0, 8).map((c) => ({
        label: "fact" as const,
        text: `${maps.customerById.get(c.customerId) ?? c.customerId} — yenileme tarihi: ${dateOnly(c.renewalDate)}, sözleşme değeri: ${c.valueAzn.toLocaleString("tr-TR")} AZN`,
        source: `sözleşme:${c.id.slice(0, 8)}`,
      })),
      sources: sorted.slice(0, 8).map((c) => ({ kind: "tais_contract", ref: c.id, title: maps.customerById.get(c.customerId) ?? c.customerId })),
    };
  }

  // 6) Takibi gecikmiş satış fırsatları
  if (asks("satış fırsat", "satis firsat", "fırsat", "firsat", "deal", "anlaşma", "anlasma")) {
    const staleRisks = allRisks.filter((r) => r.ruleId === "stale_deal");
    if (staleRisks.length === 0) {
      return noRecordResult(`Takibi gecikmiş satış fırsatı yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    return {
      answer: `${staleRisks.length} satış fırsatında takip gecikmiş.`,
      statements: staleRisks.map(riskStatement),
      sources: staleRisks.map(riskSource),
    };
  }

  // 7) Lokasyon bazında şikâyet/uygunsuzluk artışı
  if (asks("şikayet", "sikayet", "şikâyet", "uygunsuzluk")) {
    const complaintRisks = allRisks.filter((r) => r.ruleId === "recurring_complaint" || r.ruleId === "recurring_quality_issue");
    if (complaintRisks.length === 0) {
      return noRecordResult(`Tekrarlanan şikâyet/uygunsuzluk kaydı olan lokasyon yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    return {
      answer: `${complaintRisks.length} lokasyon/müşteride tekrarlanan şikâyet ya da kalite uygunsuzluğu var; en belirgini: "${complaintRisks[0].title}".`,
      statements: complaintRisks.slice(0, 5).map(riskStatement),
      sources: complaintRisks.slice(0, 5).map(riskSource),
    };
  }

  // 8) Riski azaltmak için yeniden dağıtılması gereken görevler
  if (asks("yeniden dağıt", "yeniden dagit", "görev aktar", "gorev aktar", "dağıtıl", "dagitil")) {
    const capacityRisks = allRisks.filter((r) => r.ruleId === "team_capacity_overload");
    if (capacityRisks.length === 0) {
      return noRecordResult(`Yeniden dağıtım gerektiren aşırı yüklü ekip yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    const top = capacityRisks[0];
    const overloadedTeamId = top.id.split(":")[1];
    const sameCategoryTeams = kpis.operations.workloadByTeam
      .filter((w) => w.teamId !== overloadedTeamId)
      .filter((w) => {
        const team = kpiInputs.teams.find((t) => t.id === w.teamId);
        return team?.category === top.category && w.utilization < 0.85;
      })
      .sort((a, b) => a.utilization - b.utilization);
    const suggestion = sameCategoryTeams[0]?.teamName;
    const overloadedTeamName = maps.teamById.get(overloadedTeamId) ?? overloadedTeamId;
    return {
      answer: suggestion
        ? `${overloadedTeamName} ekibindeki görevlerin bir kısmı ${suggestion} ekibine aktarılmalı (${top.affectedCount} açık görevden fazlası kapasiteyi aşıyor).`
        : `${top.title} — aynı kategoride boş kapasiteli ekip bulunamadı, geçici destek personeli değerlendirilmeli.`,
      statements: [riskStatement(top)],
      sources: [riskSource(top), ...top.evidence.slice(0, 5).map((e) => ({ kind: e.type, ref: e.id, title: `${CATEGORY_LABEL[top.category ?? "cleaning"]} görevi` }))],
    };
  }

  // 9) Yönetimin bugün vermesi gereken karar
  if (asks("karar") && (asks("bugün", "bugun", "yönetim", "yonetim", "vermesi gereken"))) {
    const filteredRiskIds = new Set(allRisks.map((r) => r.id));
    const main = pickMainDecision(decisions, filteredRiskIds);
    if (!main) {
      return noRecordResult("Şu an açık risklerle eşleşen, yönetim onayı bekleyen bir ana karar yok.");
    }
    const recommended = main.options.find((o) => o.rank === main.recommendedOptionRank);
    return {
      answer: `Bugünün ana kararı: "${main.title}". ${main.businessImpact}`,
      statements: [
        { label: "fact", text: `Kritiklik: ${main.severity}, güven: %${main.confidence} (${main.confidenceRationale})`, source: `karar:${main.caseId.slice(0, 8)}` },
        ...(recommended
          ? [{ label: "recommendation" as const, text: `Önerilen seçenek: ${recommended.title} — ${recommended.detail}`, source: `karar:${main.caseId.slice(0, 8)}` }]
          : []),
        { label: "fact", text: `${main.matchedRiskCount} açık riskle bağlantılı, ${main.evidenceCount} kanıt kaydına dayanıyor.`, source: `karar:${main.caseId.slice(0, 8)}` },
      ],
      sources: [{ kind: "case", ref: main.caseId, title: main.title }],
    };
  }

  // 10) Genel operasyon sağlığı
  if (asks("genel") && asks("sağl", "sagl", "durum")) {
    const m = kpis.management;
    const criticalCount = allRisks.filter((r) => r.severity === "critical").length;
    return {
      answer: `TAIS'in genel operasyon sağlık skoru %${m.operationsHealthScore} (SLA uyumu %${m.slaComplianceRatePct}, ekip kapasite skoru %${m.teamCapacityScore}, ${criticalCount} kritik açık risk var).`,
      statements: [
        { label: "fact", text: `Operasyon sağlık skoru: %${m.operationsHealthScore}`, source: "yönetim KPI" },
        { label: "fact", text: `SLA uyum oranı: %${m.slaComplianceRatePct}`, source: "yönetim KPI" },
        { label: "fact", text: `Ekip kapasite skoru: %${m.teamCapacityScore}`, source: "yönetim KPI" },
        { label: "fact", text: `Müşteri risk skoru: %${m.customerRiskScore}`, source: "yönetim KPI" },
        { label: "fact", text: `Açık kritik risk sayısı: ${criticalCount}`, source: "risk motoru" },
      ],
      sources: [],
    };
  }

  // 11) Hangi hizmet görevleri gecikiyor (genel)
  if (asks("hizmet görev", "hizmet gorev", "görev gecik", "gorev gecik", "geciken görev", "geciken gorev", "gecikiyor")) {
    const overdue = kpiInputs.tasks.filter(
      (t) => t.status !== "done" && new Date(t.dueAt).getTime() < new Date(referenceNow).getTime()
    );
    if (overdue.length === 0) {
      return noRecordResult(`Gecikmiş hizmet görevi yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    const sorted = [...overdue].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    return {
      answer: `${overdue.length} hizmet görevi gecikiyor.`,
      statements: sorted.slice(0, 8).map((t) => taskStatement(t, maps, referenceNow)),
      sources: sorted.slice(0, 8).map(taskSource),
    };
  }

  // 12) Genel risk/kritik/sinyal (yakalanmayan tüm risk sorularının varsayılanı)
  if (asks("en kritik", "risk", "sinyal", "kritik", "uyarı", "uyari", "sorun")) {
    if (allRisks.length === 0) {
      return noRecordResult(`Açık risk kaydı yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`);
    }
    const top = allRisks[0];
    return {
      answer: `Bugünün en kritik operasyonel riski: "${top.title}" (${top.severity}).`,
      statements: [riskStatement(top), ...allRisks.slice(1, 3).map(riskStatement)],
      sources: allRisks.slice(0, 3).map(riskSource),
    };
  }

  return null;
}
