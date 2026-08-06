import type {
  AiProvider,
  Briefing,
  BriefingParams,
  DailyBriefingParams,
  ExtractDataParams,
  ExtractDataResult,
  AssessRiskParams,
  RiskAssessment,
  AnalyzeCasesParams,
  AiDecisionCase,
} from "../provider";

/**
 * Deterministik sağlayıcı (DEMO_DETERMINISTIC politikası, master plan md.4).
 * HİÇBİR dil modeli çağırmaz — kurallarla, girdideki gerçek sayıları ayıklayarak
 * yapısal çıktı üretir. Amaç: model kimlik bilgisi/Ollama olmadan ürünü uçtan
 * uca gösterilebilir kılmak. Uydurma sayı üretmez; yalnızca girdiden alıntılar.
 */

// Girdideki ilk birkaç "cümle/satır" — kanıt olarak kullanılır.
function facts(data: string, n: number): string[] {
  return data
    .split(/[\n.]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    .slice(0, n);
}

// Girdideki en büyük sayı (dakika/yüzde gibi) — kaba kritiklik göstergesi.
function maxNumber(data: string): number {
  const nums = (data.match(/\d[\d.,]*/g) ?? []).map((x) => Number(x.replace(/\./g, "").replace(",", ".")));
  return nums.filter((n) => Number.isFinite(n)).reduce((a, b) => Math.max(a, b), 0);
}

function severityFrom(data: string): AiDecisionCase["severity"] {
  const d = data.toLowerCase();
  if (/(kritik|acil|durdu|iptal|kaza|yıkık|ağır)/.test(d)) return "critical";
  if (/(gecikme|risk|eksik|düşük|aşıl|rötar|arıza)/.test(d)) return "warning";
  return "info";
}

async function analyzeDecisionCases(params: AnalyzeCasesParams): Promise<AiDecisionCase[]> {
  const { data, riskCategories, sectorLabel } = params;
  const ev = facts(data, 4);
  const cat = riskCategories[0] ?? { id: "genel", label: "Genel Operasyon", sources: [] };
  const sev = severityFrom(data);
  const big = maxNumber(data);

  return [
    {
      categoryId: cat.id,
      categoryLabel: cat.label,
      severity: sev,
      title: `${sectorLabel}: ${ev[0] ?? "operasyonel durum"} nedeniyle müdahale gerekiyor`,
      businessImpact:
        "Girdideki sinyaller operasyonel aksama işaret ediyor; erken müdahale gecikme ve maliyet birikimini sınırlar. (Demo modu: sayısal etki için gerçek model/veri gerekir.)",
      confidence: sev === "critical" ? 60 : 55,
      confidenceRationale:
        "Demo deterministik mod: çıktı kurallarla üretildi, dil modeli kullanılmadı. Güven bilinçli olarak düşük tutuldu.",
      evidence: ev.map((f) => ({ source: "Operasyonel veri", fact: f, reliability: "verified" as const })),
      assumptions: ["Girdi verisi güncel ve doğru kabul edildi."],
      historicalComparison: "Geçmiş veri demo modunda karşılaştırılmadı.",
      counterfactual: {
        narrative: "Aksiyon alınmazsa mevcut sinyallerin operasyona yayılması beklenir.",
        projectedImpact: big > 0 ? `Girdideki en yüksek değer (${big}) mertebesinde bir sapma büyüyebilir.` : "Sapma büyüyebilir.",
        timeHorizon: "yakın vade",
      },
      options: [
        { title: "Önceliklendir ve kaynağı kritik noktaya yönlendir", detail: "En yüksek etkili darboğaza mevcut kaynağı kaydır.", feasible: true, feasibilityNote: "", tradeoffs: "İkincil işler kısa süre bekler.", expectedOutcome: "Ana sapma sınırlanır.", rank: 1 },
        { title: "Durumu izlemeye devam et", detail: "Ek kaynak ayırmadan gözlem.", feasible: true, feasibilityNote: "", tradeoffs: "Sapma büyüyebilir.", expectedOutcome: "Belirsiz.", rank: 2 },
        { title: "Tüm ekibi tek noktaya topla", detail: "Maksimum kaynak.", feasible: false, feasibilityNote: "Diğer operasyonları durdurur — kısıt ihlali.", tradeoffs: "Yüksek yan etki.", expectedOutcome: "-", rank: 3 },
      ],
      recommendedOptionRank: 1,
    },
  ];
}

async function assessRisk(params: AssessRiskParams): Promise<RiskAssessment[]> {
  const sev = severityFrom(params.data);
  return params.riskCategories.map((rc, i) => ({
    categoryId: rc.id,
    categoryLabel: rc.label,
    severity: i === 0 ? sev : "info",
    explanation:
      i === 0
        ? "Girdideki sinyaller bu kategoride dikkat gerektiriyor. (Demo modu: kurallarla değerlendirildi.)"
        : "Bu kategori için girdide belirgin sinyal yok.",
    recommendedAction: i === 0 ? "İlgili darboğazı önceliklendirin ve izleyin." : "İzlemeye devam edin.",
  }));
}

async function generateBriefing(params: BriefingParams): Promise<Briefing> {
  const ev = facts(params.scenario, 1);
  return {
    status: ev[0] ?? "Durum girdiden okundu.",
    problem: "Sinyaller operasyonel bir sapmaya işaret ediyor (demo modu).",
    action: "En yüksek etkili darboğazı önceliklendirin.",
  };
}

async function generateDailyBriefing(params: DailyBriefingParams): Promise<string> {
  return `${params.companyName} için ${params.sectorLabel} sektöründe gün sakin başlıyor. Demo modu etkin — gerçek bulgular için yerel model (Ollama) çalıştırın. İzlenen kategoriler: ${params.riskCategoryLabels.join(", ")}.`;
}

async function extractData(params: ExtractDataParams): Promise<ExtractDataResult> {
  const fields = facts(params.rawText, 6).map((f, i) => ({ label: `Alan ${i + 1}`, value: f }));
  return { summary: "Demo modu: metinden kurallarla alanlar ayıklandı.", fields };
}

export const deterministicProvider: AiProvider = {
  id: "deterministic",
  generateBriefing,
  generateDailyBriefing,
  extractData,
  assessRisk,
  analyzeDecisionCases,
};
