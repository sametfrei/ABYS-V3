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
export type AskLocale = "tr" | "en";

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

function riskStatement(r: TaisRisk, locale: AskLocale): TaisAskStatement {
  return {
    label: "fact",
    text:
      locale === "tr"
        ? `[${r.severity}] ${r.title} — kök neden: ${r.rootCause} Önerilen aksiyon: ${r.recommendedAction}`
        : `[${r.severity}] ${r.title} — root cause: ${r.rootCause} Recommended action: ${r.recommendedAction}`,
    source: `risk:${r.id}`,
  };
}

function riskSource(r: TaisRisk): TaisAskSource {
  return { kind: "tais_risk", ref: r.id, title: r.title };
}

function taskStatement(
  t: TaisTaskRow,
  maps: NameMaps,
  referenceNow: string,
  locale: AskLocale
): TaisAskStatement {
  const customer = maps.customerById.get(t.customerId) ?? t.customerId;
  const location = maps.locationById.get(t.locationId) ?? t.locationId;
  const team = maps.teamById.get(t.teamId) ?? t.teamId;
  const overdueDays = Math.max(0, Math.round(daysBetween(t.dueAt, referenceNow)));
  return {
    label: "fact",
    text:
      locale === "tr"
        ? `${CATEGORY_LABEL[t.category]} görevi — müşteri: ${customer}, lokasyon: ${location}, ekip: ${team}, son tarih: ${dateOnly(t.dueAt)} (${overdueDays} gün gecikmiş)`
        : `${CATEGORY_LABEL[t.category]} task — customer: ${customer}, location: ${location}, team: ${team}, due: ${dateOnly(t.dueAt)} (${overdueDays} days overdue)`,
    source: `${locale === "tr" ? "görev" : "task"}:${t.id.slice(0, 8)}`,
  };
}

function taskSource(t: TaisTaskRow, locale: AskLocale): TaisAskSource {
  return {
    kind: "tais_task",
    ref: t.id,
    title: `${CATEGORY_LABEL[t.category]} ${locale === "tr" ? "görevi" : "task"}`,
  };
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
  locale?: AskLocale;
}): TaisAskResult | null {
  const { question, kpiInputs, riskInputs, decisions, referenceNow } = params;
  const locale: AskLocale = params.locale ?? "tr";
  const say = (tr: string, en: string) => (locale === "tr" ? tr : en);
  const q = question.toLocaleLowerCase("tr-TR");
  const asks = (...words: string[]) => words.some((w) => q.includes(w));

  const maps = buildNameMaps(kpiInputs, riskInputs);
  const kpis = computeTaisKpis(kpiInputs);
  const allRisks = computeTaisRisks(riskInputs);

  // 1) Belirli hizmet kategorisinde ("catering'de bugün risk var mı") bugünkü risk durumu
  const categoryMatch = TAIS_CATEGORIES.find((c) => asks(c.id.replace("_", " "), c.id, c.label.toLocaleLowerCase("tr-TR")));
  if (categoryMatch && asks("risk", "risks")) {
    const catRisks = allRisks.filter((r) => r.category === categoryMatch.id);
    if (catRisks.length === 0) {
      return noRecordResult(
        say(
          `Şu an ${categoryMatch.label} hizmetinde açık risk kaydı yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No open risk records in ${categoryMatch.label} right now (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    return {
      answer: say(
        `${categoryMatch.label} hizmetinde ${catRisks.length} açık risk var; en kritiği: "${catRisks[0].title}".`,
        `${categoryMatch.label} has ${catRisks.length} open risks; the most critical: "${catRisks[0].title}".`
      ),
      statements: catRisks.slice(0, 5).map((r) => riskStatement(r, locale)),
      sources: catRisks.slice(0, 5).map(riskSource),
    };
  }

  // 2) Pest control gecikmeleri
  if (asks("pest control", "pest-control", "ilaçlama", "haşere")) {
    const overdue = kpiInputs.tasks.filter(
      (t) => t.category === "pest_control" && t.status !== "done" && new Date(t.dueAt).getTime() < new Date(referenceNow).getTime()
    );
    if (overdue.length === 0) {
      return noRecordResult(
        say(
          `Gecikmiş pest control görevi yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No overdue pest control tasks (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    return {
      answer: say(
        `${overdue.length} pest control görevi gecikmiş.`,
        `${overdue.length} pest control tasks are overdue.`
      ),
      statements: overdue.map((t) => taskStatement(t, maps, referenceNow, locale)),
      sources: overdue.map((t) => taskSource(t, locale)),
    };
  }

  // 3) SLA riski taşıyan müşteriler
  if (asks("sla")) {
    const slaRisks = allRisks.filter((r) => r.ruleId === "sla_risk_task");
    if (slaRisks.length === 0) {
      return noRecordResult(
        say(
          `SLA süresi 48 saat içinde dolacak açık görev yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No open task breaches its SLA within 48 hours (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    return {
      answer: say(
        `SLA riski taşıyan ${slaRisks.length} müşteri/lokasyon var; en acili: "${slaRisks[0].title}".`,
        `${slaRisks.length} customers/locations carry SLA risk; the most urgent: "${slaRisks[0].title}".`
      ),
      statements: slaRisks.slice(0, 5).map((r) => riskStatement(r, locale)),
      sources: slaRisks.slice(0, 5).map(riskSource),
    };
  }

  // 4) Ekip kapasite problemi
  if (asks("kapasite", "capacity", "workload")) {
    const capacityRisks = allRisks.filter((r) => r.ruleId === "team_capacity_overload");
    if (capacityRisks.length === 0) {
      return noRecordResult(
        say(
          `Kapasite eşiğini aşan ekip yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No team exceeds its capacity threshold (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    return {
      answer: say(
        `${capacityRisks.length} ekipte kapasite problemi var; en yüklüsü: "${capacityRisks[0].title}".`,
        `${capacityRisks.length} teams have a capacity problem; the most loaded: "${capacityRisks[0].title}".`
      ),
      statements: capacityRisks.map((r) => riskStatement(r, locale)),
      sources: capacityRisks.map(riskSource),
    };
  }

  // 5) Yenileme tarihi yaklaşan müşteriler
  if (asks("yenileme", "renewal", "renew")) {
    const RENEWAL_SOON_DAYS = 30;
    const upcoming = kpiInputs.contracts.filter(
      (c) => c.status === "active" && daysBetween(referenceNow, c.renewalDate) <= RENEWAL_SOON_DAYS && daysBetween(referenceNow, c.renewalDate) >= 0
    );
    if (upcoming.length === 0) {
      return noRecordResult(
        say(
          `Önümüzdeki ${RENEWAL_SOON_DAYS} gün içinde yenilenecek sözleşme yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No contract renews within the next ${RENEWAL_SOON_DAYS} days (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    const sorted = [...upcoming].sort((a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime());
    return {
      answer: say(
        `Önümüzdeki ${RENEWAL_SOON_DAYS} gün içinde yenilenecek ${sorted.length} sözleşme var.`,
        `${sorted.length} contracts renew within the next ${RENEWAL_SOON_DAYS} days.`
      ),
      statements: sorted.slice(0, 8).map((c) => ({
        label: "fact" as const,
        text: say(
          `${maps.customerById.get(c.customerId) ?? c.customerId} — yenileme tarihi: ${dateOnly(c.renewalDate)}, sözleşme değeri: ${c.valueAzn.toLocaleString("tr-TR")} AZN`,
          `${maps.customerById.get(c.customerId) ?? c.customerId} — renewal date: ${dateOnly(c.renewalDate)}, contract value: ${c.valueAzn.toLocaleString("en-GB")} AZN`
        ),
        source: `${locale === "tr" ? "sözleşme" : "contract"}:${c.id.slice(0, 8)}`,
      })),
      sources: sorted.slice(0, 8).map((c) => ({ kind: "tais_contract", ref: c.id, title: maps.customerById.get(c.customerId) ?? c.customerId })),
    };
  }

  // 6) Takibi gecikmiş satış fırsatları
  if (asks("satış fırsat", "satis firsat", "fırsat", "firsat", "deal", "deals", "opportunit", "anlaşma", "anlasma", "pipeline")) {
    const staleRisks = allRisks.filter((r) => r.ruleId === "stale_deal");
    if (staleRisks.length === 0) {
      return noRecordResult(
        say(
          `Takibi gecikmiş satış fırsatı yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No stale sales opportunities (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    return {
      answer: say(
        `${staleRisks.length} satış fırsatında takip gecikmiş.`,
        `${staleRisks.length} sales opportunities have gone stale.`
      ),
      statements: staleRisks.map((r) => riskStatement(r, locale)),
      sources: staleRisks.map(riskSource),
    };
  }

  // 7) Lokasyon bazında şikâyet/uygunsuzluk artışı
  if (asks("şikayet", "sikayet", "şikâyet", "uygunsuzluk", "complaint", "complaints", "quality issue")) {
    const complaintRisks = allRisks.filter((r) => r.ruleId === "recurring_complaint" || r.ruleId === "recurring_quality_issue");
    if (complaintRisks.length === 0) {
      return noRecordResult(
        say(
          `Tekrarlanan şikâyet/uygunsuzluk kaydı olan lokasyon yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No location has recurring complaints or quality issues (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    return {
      answer: say(
        `${complaintRisks.length} lokasyon/müşteride tekrarlanan şikâyet ya da kalite uygunsuzluğu var; en belirgini: "${complaintRisks[0].title}".`,
        `${complaintRisks.length} locations/customers have recurring complaints or quality issues; the clearest: "${complaintRisks[0].title}".`
      ),
      statements: complaintRisks.slice(0, 5).map((r) => riskStatement(r, locale)),
      sources: complaintRisks.slice(0, 5).map(riskSource),
    };
  }

  // 8) Riski azaltmak için yeniden dağıtılması gereken görevler
  if (asks("yeniden dağıt", "yeniden dagit", "görev aktar", "gorev aktar", "dağıtıl", "dagitil", "reassign", "redistribut", "rebalance")) {
    const capacityRisks = allRisks.filter((r) => r.ruleId === "team_capacity_overload");
    if (capacityRisks.length === 0) {
      return noRecordResult(
        say(
          `Yeniden dağıtım gerektiren aşırı yüklü ekip yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No overloaded team needs reassignment (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
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
        ? say(
            `${overloadedTeamName} ekibindeki görevlerin bir kısmı ${suggestion} ekibine aktarılmalı (${top.affectedCount} açık görevden fazlası kapasiteyi aşıyor).`,
            `Some of ${overloadedTeamName}'s tasks should move to ${suggestion} (${top.affectedCount} open tasks exceed capacity).`
          )
        : say(
            `${top.title} — aynı kategoride boş kapasiteli ekip bulunamadı, geçici destek personeli değerlendirilmeli.`,
            `${top.title} — no team with spare capacity exists in the same category; consider temporary support staff.`
          ),
      statements: [riskStatement(top, locale)],
      sources: [riskSource(top), ...top.evidence.slice(0, 5).map((e) => ({ kind: e.type, ref: e.id, title: `${CATEGORY_LABEL[top.category ?? "cleaning"]} ${locale === "tr" ? "görevi" : "task"}` }))],
    };
  }

  // 9) Yönetimin bugün vermesi gereken karar
  if (asks("karar", "decision") && (asks("bugün", "bugun", "yönetim", "yonetim", "vermesi gereken", "today", "management", "approve"))) {
    const filteredRiskIds = new Set(allRisks.map((r) => r.id));
    const main = pickMainDecision(decisions, filteredRiskIds);
    if (!main) {
      return noRecordResult(
        say(
          "Şu an açık risklerle eşleşen, yönetim onayı bekleyen bir ana karar yok.",
          "No main decision tied to open risks is waiting for management approval."
        )
      );
    }
    const recommended = main.options.find((o) => o.rank === main.recommendedOptionRank);
    return {
      answer: say(
        `Bugünün ana kararı: "${main.title}". ${main.businessImpact}`,
        `Today's main decision: "${main.title}". ${main.businessImpact}`
      ),
      statements: [
        { label: "fact", text: say(
          `Kritiklik: ${main.severity}, güven: %${main.confidence} (${main.confidenceRationale})`,
          `Severity: ${main.severity}, confidence: ${main.confidence}% (${main.confidenceRationale})`
        ), source: `${locale === "tr" ? "karar" : "decision"}:${main.caseId.slice(0, 8)}` },
        ...(recommended
          ? [{ label: "recommendation" as const, text: say(
              `Önerilen seçenek: ${recommended.title} — ${recommended.detail}`,
              `Recommended option: ${recommended.title} — ${recommended.detail}`
            ), source: `${locale === "tr" ? "karar" : "decision"}:${main.caseId.slice(0, 8)}` }]
          : []),
        { label: "fact", text: say(
          `${main.matchedRiskCount} açık riskle bağlantılı, ${main.evidenceCount} kanıt kaydına dayanıyor.`,
          `Linked to ${main.matchedRiskCount} open risks and backed by ${main.evidenceCount} evidence records.`
        ), source: `${locale === "tr" ? "karar" : "decision"}:${main.caseId.slice(0, 8)}` },
      ],
      sources: [{ kind: "case", ref: main.caseId, title: main.title }],
    };
  }

  // 10) Genel operasyon sağlığı
  if ((asks("genel") && asks("sağl", "sagl", "durum")) || asks("overall health", "health score", "operational health")) {
    const m = kpis.management;
    const criticalCount = allRisks.filter((r) => r.severity === "critical").length;
    return {
      answer: say(
        `TAIS'in genel operasyon sağlık skoru %${m.operationsHealthScore} (SLA uyumu %${m.slaComplianceRatePct}, ekip kapasite skoru %${m.teamCapacityScore}, ${criticalCount} kritik açık risk var).`,
        `TAIS overall operations health is ${m.operationsHealthScore}% (SLA compliance ${m.slaComplianceRatePct}%, team capacity score ${m.teamCapacityScore}, ${criticalCount} critical open risks).`
      ),
      statements: [
        { label: "fact", text: say(`Operasyon sağlık skoru: %${m.operationsHealthScore}`, `Operations health score: ${m.operationsHealthScore}%`), source: say("yönetim KPI", "management KPI") },
        { label: "fact", text: say(`SLA uyum oranı: %${m.slaComplianceRatePct}`, `SLA compliance rate: ${m.slaComplianceRatePct}%`), source: say("yönetim KPI", "management KPI") },
        { label: "fact", text: say(`Ekip kapasite skoru: %${m.teamCapacityScore}`, `Team capacity score: ${m.teamCapacityScore}%`), source: say("yönetim KPI", "management KPI") },
        { label: "fact", text: say(`Müşteri risk skoru: %${m.customerRiskScore}`, `Customer risk score: ${m.customerRiskScore}%`), source: say("yönetim KPI", "management KPI") },
        { label: "fact", text: say(`Açık kritik risk sayısı: ${criticalCount}`, `Open critical risks: ${criticalCount}`), source: say("risk motoru", "risk engine") },
      ],
      sources: [],
    };
  }

  // 11) Hangi hizmet görevleri gecikiyor (genel)
  if (asks("hizmet görev", "hizmet gorev", "görev gecik", "gorev gecik", "geciken görev", "geciken gorev", "gecikiyor", "overdue", "late task", "delayed")) {
    const overdue = kpiInputs.tasks.filter(
      (t) => t.status !== "done" && new Date(t.dueAt).getTime() < new Date(referenceNow).getTime()
    );
    if (overdue.length === 0) {
      return noRecordResult(
        say(
          `Gecikmiş hizmet görevi yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No overdue service tasks (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    const sorted = [...overdue].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    return {
      answer: say(
        `${overdue.length} hizmet görevi gecikiyor.`,
        `${overdue.length} service tasks are overdue.`
      ),
      statements: sorted.slice(0, 8).map((t) => taskStatement(t, maps, referenceNow, locale)),
      sources: sorted.slice(0, 8).map((t) => taskSource(t, locale)),
    };
  }

  // 12) Genel risk/kritik/sinyal (yakalanmayan tüm risk sorularının varsayılanı)
  if (asks("en kritik", "risk", "sinyal", "kritik", "uyarı", "uyari", "sorun", "critical", "signal", "warning", "problem", "issue")) {
    if (allRisks.length === 0) {
      return noRecordResult(
        say(
          `Açık risk kaydı yok (veri anlık görüntüsü: ${dateOnly(referenceNow)}).`,
          `No open risk records (data snapshot: ${dateOnly(referenceNow)}).`
        )
      );
    }
    const top = allRisks[0];
    return {
      answer: say(
        `Bugünün en kritik operasyonel riski: "${top.title}" (${top.severity}).`,
        `Today's most critical operational risk: "${top.title}" (${top.severity}).`
      ),
      statements: [riskStatement(top, locale), ...allRisks.slice(1, 3).map((r) => riskStatement(r, locale))],
      sources: allRisks.slice(0, 3).map(riskSource),
    };
  }

  return null;
}
