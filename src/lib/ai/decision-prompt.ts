import type {
  AnalyzeCasesParams,
  AssessedSeverity,
  AiEvidenceItem,
  AiCounterfactual,
  AiActionOption,
} from "./provider";

/**
 * Karar-vakası analizi: ABYS'in çekirdek akıl yürütme sözleşmesi.
 * Prompt, Tim Draper görüşmesinde tanımlanan ilkeleri kodlar:
 *  - kanıt zinciri (doğrulanmış / tahmini / bilinmeyen ayrımı)
 *  - güven skoru + gerekçesi
 *  - karşı senaryo (aksiyon alınmazsa ne olur)
 *  - kısıt kontrolü: uygulanamaz seçenek önerme, ele ve gerekçesini yaz
 *  - uydurma sayı yasak, belirsizlik zekânın parçası
 *  - karar hafızasından öğrenme
 */
export function buildDecisionCasesPrompt(params: AnalyzeCasesParams): string {
  const { sectorLabel, riskCategories, constraints, decisionMemory, domainKnowledge, data } = params;

  const categoriesDesc = riskCategories
    .map((rc) => `- ${rc.id} (${rc.label}) — izlenen sinyaller: ${rc.sources.join(", ")}`)
    .join("\n");

  const memoryBlock = decisionMemory
    ? `\nKURUMSAL KARAR HAFIZASI (geçmiş öneriler, yöneticinin kararları ve sonuçları — önerilerini buna göre kalibre et; reddedilen yaklaşımları tekrarlama, işe yaradığı kanıtlanan müdahaleleri öne al):\n${decisionMemory}\n`
    : "";

  const knowledgeBlock = domainKnowledge
    ? `\nSEKTÖR BİLGİ PAKETİ (eşikler, katsayılar ve kod tarafından hesaplanmış referans değerler — sayısal etki/maliyet ifadelerinde SADECE buradaki değerleri ve operasyonel verideki sayıları kullan):\n${domainKnowledge}\n`
    : "";

  return `Sen ABYS Intelligence'ın karar motorusun. Sektör: ${sectorLabel}.
Görevin: aşağıdaki gerçek operasyonel veriyi analiz edip yöneticiye karar vakaları üretmek.

RİSK KATEGORİLERİ:
${categoriesDesc}

CANLI OPERASYONEL KISITLAR (bir aksiyonu önermeden önce MUTLAKA bu kısıtlara karşı kontrol et):
${constraints}
${knowledgeBlock}${memoryBlock}
KURALLAR:
1. Sadece verilen veriye dayan. UYDURMA SAYI ÜRETME. Yazdığın HER sayı ya operasyonel veriden ya da SEKTÖR BİLGİ PAKETİ'nden gelmeli; maliyet/etki hesabı gerekiyorsa REFERANS HESAPLAR'daki hazır değeri alıntıla, kendin çarpma yapma. Bu iki kaynaktan türetemediğin sayıyı yazma — onun yerine niteliksel ifade kullan ("belirgin maliyet artışı" gibi). Veride olmayan bir değeri tahmin ediyorsan bunu "estimated" olarak işaretle; bilinmiyorsa "unknown" de. Belirsizliği kabul etmek zekânın parçasıdır.
2. Her vaka için kanıt zinciri kur: hangi veri noktası hangi kaynaktan geliyor, doğrulanmış mı tahmini mi.
3. Güven skoru (0-100) ver ve NEDEN o skorda olduğunu açıkla (veri eksikse skor düşer ve bunu söylersin).
4. Karşı senaryo yaz: yönetici hiçbir aksiyon almazsa ne olur, hangi zaman ufkunda, tahmini etki ne.
5. Aksiyon seçenekleri üret ve HER BİRİNİ kısıtlara karşı test et:
   - Uygulanabilir seçenekleri rank ile sırala (1 = en iyi uygulanabilir seçenek).
   - Kısıtlara takılan seçenekleri de listele ama feasible=false yap ve feasibilityNote'ta HANGİ kısıta takıldığını yaz.
   - Her seçeneğin trade-off'unu ve beklenen sonucunu yaz.
   - Amaç teorik olarak mükemmel aksiyon değil, önümüzdeki dakikalarda GERÇEKTEN uygulanabilecek en iyi aksiyondur.
6. SADECE 1 VAKA üret: verideki EN KRİTİK sinyali seç. İkincil sinyalleri bu vakanın kanıt zincirine ve karşı senaryosuna dahil et — ayrı vaka açma.
7. title: tek cümle, ne oluyor. businessImpact: tek-iki cümle, bu neden önemli (operasyonel/finansal etki). Yönetici ilk ekranda sadece bunları görecek.
8. historicalComparison: verideki geçmiş kalıplarla karşılaştır (varsa). Yoksa "Geçmiş veri sağlanmadı" yaz.
9. Tüm metinler Türkçe olacak.
10. severity: critical (hemen müdahale) / warning (yakın takip) / info (bilgi) / healthy (sağlıklı).
11. recommendedOptionRank: önerdiğin seçeneğin rank değeri (genelde 1).
12. KISA YAZ: her metin alanı en fazla 1-2 kısa cümle. En fazla 4 kanıt, en fazla 3 seçenek (biri kısıta takılan uygulanamaz örnek), en fazla 2 varsayım. Toplam çıktıyı kompakt tut — bu bir yönetici ekranı, rapor değil.

OPERASYONEL VERİ:
"""
${data}
"""`;
}

/**
 * JSON Schema (draft uyumlu) — Ollama structured output için.
 */
export const decisionCasesJsonSchema = {
  type: "object",
  properties: {
    cases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          categoryId: { type: "string" },
          categoryLabel: { type: "string" },
          severity: { type: "string", enum: ["critical", "warning", "info", "healthy"] },
          title: { type: "string" },
          businessImpact: { type: "string" },
          confidence: { type: "number" },
          confidenceRationale: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string" },
                fact: { type: "string" },
                reliability: { type: "string", enum: ["verified", "estimated", "unknown"] },
              },
              required: ["source", "fact", "reliability"],
            },
          },
          assumptions: { type: "array", items: { type: "string" } },
          historicalComparison: { type: "string" },
          counterfactual: {
            type: "object",
            properties: {
              narrative: { type: "string" },
              projectedImpact: { type: "string" },
              timeHorizon: { type: "string" },
            },
            required: ["narrative", "projectedImpact", "timeHorizon"],
          },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                detail: { type: "string" },
                feasible: { type: "boolean" },
                feasibilityNote: { type: "string" },
                tradeoffs: { type: "string" },
                expectedOutcome: { type: "string" },
                rank: { type: "number" },
              },
              required: [
                "title",
                "detail",
                "feasible",
                "feasibilityNote",
                "tradeoffs",
                "expectedOutcome",
                "rank",
              ],
            },
          },
          recommendedOptionRank: { type: "number" },
        },
        required: [
          "categoryId",
          "categoryLabel",
          "severity",
          "title",
          "businessImpact",
          "confidence",
          "confidenceRationale",
          "evidence",
          "assumptions",
          "historicalComparison",
          "counterfactual",
          "options",
          "recommendedOptionRank",
        ],
      },
    },
  },
  required: ["cases"],
} as const;

/**
 * İki aşamalı üretim (teşhis → seçenekler) — mevcut buildDecisionCasesPrompt'a
 * DOKUNMADAN eklenir. Gerekçe: Ollama structured output anahtarları alfabetik
 * ürettiği için token limitine takılınca sona kalan options/severity/title
 * kesiliyor. Teşhis ve seçenekleri ayrı çağrılara bölmek her çağrının çıktısını
 * küçültüp kesilme riskini yapısal olarak azaltır.
 */
function buildContextBlocks(params: AnalyzeCasesParams) {
  const { riskCategories, constraints, decisionMemory, domainKnowledge } = params;

  const categoriesDesc = riskCategories
    .map((rc) => `- ${rc.id} (${rc.label}) — izlenen sinyaller: ${rc.sources.join(", ")}`)
    .join("\n");

  const memoryBlock = decisionMemory
    ? `\nKURUMSAL KARAR HAFIZASI (geçmiş öneriler, yöneticinin kararları ve sonuçları — önerilerini buna göre kalibre et; reddedilen yaklaşımları tekrarlama, işe yaradığı kanıtlanan müdahaleleri öne al):\n${decisionMemory}\n`
    : "";

  const knowledgeBlock = domainKnowledge
    ? `\nSEKTÖR BİLGİ PAKETİ (eşikler, katsayılar ve kod tarafından hesaplanmış referans değerler — sayısal etki/maliyet ifadelerinde SADECE buradaki değerleri ve operasyonel verideki sayıları kullan):\n${domainKnowledge}\n`
    : "";

  return { categoriesDesc, memoryBlock, knowledgeBlock, constraints };
}

/** İki aşamalı üretimin 1. adımı: teşhis (seçenekler İSTENMEZ). */
export interface AiDiagnosis {
  categoryId: string;
  categoryLabel: string;
  severity: AssessedSeverity;
  title: string;
  businessImpact: string;
  confidence: number;
  confidenceRationale: string;
  evidence: AiEvidenceItem[];
  assumptions: string[];
  historicalComparison: string;
  counterfactual: AiCounterfactual;
}

/** İki aşamalı üretimin 2. adımı: teşhise karşı aksiyon seçenekleri. */
export interface AiOptionsResult {
  options: AiActionOption[];
  recommendedOptionRank: number;
}

export function buildDiagnosisPrompt(params: AnalyzeCasesParams): string {
  const { sectorLabel, data } = params;
  const { categoriesDesc, memoryBlock, knowledgeBlock, constraints } = buildContextBlocks(params);

  return `Sen ABYS Intelligence'ın karar motorusun. Sektör: ${sectorLabel}.
Görevin: aşağıdaki gerçek operasyonel veriyi analiz edip TEK bir karar vakasının TEŞHİSİNİ üretmek. Bu ilk aşama — aksiyon seçenekleri AYRI bir aşamada üretilecek, ŞİMDİ SEÇENEK YAZMA.

RİSK KATEGORİLERİ:
${categoriesDesc}

CANLI OPERASYONEL KISITLAR (bağlamı anlamak için oku; seçenek üretmeyeceksin ama teşhisin bu kısıtlarla çelişmemeli):
${constraints}
${knowledgeBlock}${memoryBlock}
KURALLAR:
1. Sadece verilen veriye dayan. UYDURMA SAYI ÜRETME. Yazdığın HER sayı ya operasyonel veriden ya da SEKTÖR BİLGİ PAKETİ'nden gelmeli; maliyet/etki hesabı gerekiyorsa REFERANS HESAPLAR'daki hazır değeri alıntıla, kendin çarpma yapma. Bu iki kaynaktan türetemediğin sayıyı yazma — onun yerine niteliksel ifade kullan ("belirgin maliyet artışı" gibi). Veride olmayan bir değeri tahmin ediyorsan bunu "estimated" olarak işaretle; bilinmiyorsa "unknown" de. Belirsizliği kabul etmek zekânın parçasıdır.
2. Kanıt zinciri kur: hangi veri noktası hangi kaynaktan geliyor, doğrulanmış mı tahmini mi.
3. Güven skoru (0-100) ver ve NEDEN o skorda olduğunu açıkla (veri eksikse skor düşer ve bunu söylersin).
4. Karşı senaryo yaz: yönetici hiçbir aksiyon almazsa ne olur, hangi zaman ufkunda, tahmini etki ne.
5. SADECE 1 VAKA üret: verideki EN KRİTİK sinyali seç. İkincil sinyalleri bu vakanın kanıt zincirine ve karşı senaryosuna dahil et — ayrı vaka açma.
6. title: tek cümle, ne oluyor. businessImpact: tek-iki cümle, bu neden önemli (operasyonel/finansal etki). Yönetici ilk ekranda sadece bunları görecek.
7. historicalComparison: verideki geçmiş kalıplarla karşılaştır (varsa). Yoksa "Geçmiş veri sağlanmadı" yaz.
8. Tüm metinler Türkçe olacak.
9. severity: critical (hemen müdahale) / warning (yakın takip) / info (bilgi) / healthy (sağlıklı).
10. KISA YAZ: her metin alanı en fazla 1-2 kısa cümle. En fazla 4 kanıt, en fazla 2 varsayım. SEÇENEK/AKSİYON ÜRETME — bu aşamanın kapsamı dışında, ayrı bir çağrıda üretilecek.

OPERASYONEL VERİ:
"""
${data}
"""`;
}

export function buildOptionsPrompt(params: AnalyzeCasesParams, diagnosis: AiDiagnosis): string {
  const { sectorLabel, data } = params;
  const { knowledgeBlock, memoryBlock, constraints } = buildContextBlocks(params);

  const evidenceSummary =
    (diagnosis.evidence ?? []).map((e) => `- [${e.reliability}] ${e.source}: ${e.fact}`).join("\n") ||
    "- (kanıt bildirilmedi)";

  const counterfactualNarrative = diagnosis.counterfactual?.narrative ?? "bilinmiyor";
  const counterfactualTimeHorizon = diagnosis.counterfactual?.timeHorizon ?? "bilinmiyor";
  const counterfactualProjectedImpact = diagnosis.counterfactual?.projectedImpact ?? "bilinmiyor";

  return `Sen ABYS Intelligence'ın karar motorusun. Sektör: ${sectorLabel}.
Bir önceki aşamada aşağıdaki TEŞHİS üretildi. Görevin: bu teşhise karşı GERÇEKÇİ ve UYGULANABİLİR aksiyon seçenekleri üretmek. Teşhisi TEKRAR ÜRETME — sadece seçenekleri ve önerilen seçeneği üret.

TEŞHİS:
- Başlık: ${diagnosis.title ?? "bilinmiyor"}
- Önem derecesi: ${diagnosis.severity ?? "bilinmiyor"}
- İş etkisi: ${diagnosis.businessImpact ?? "bilinmiyor"}
- Güven: %${diagnosis.confidence ?? 0} — ${diagnosis.confidenceRationale ?? "bilinmiyor"}
- Kanıtlar:
${evidenceSummary}
- Karşı senaryo (aksiyon alınmazsa): ${counterfactualNarrative} (${counterfactualTimeHorizon} ufkunda, beklenen etki: ${counterfactualProjectedImpact})

CANLI OPERASYONEL KISITLAR (bir aksiyonu önermeden önce MUTLAKA bu kısıtlara karşı kontrol et):
${constraints}
${knowledgeBlock}${memoryBlock}
KURALLAR:
1. Sadece verilen veriye ve SEKTÖR BİLGİ PAKETİ'ne dayan. UYDURMA SAYI ÜRETME — maliyet/etki hesabı gerekiyorsa REFERANS HESAPLAR'daki hazır değeri alıntıla, kendin çarpma yapma; türetemediğin sayıyı yazma, niteliksel ifade kullan.
2. Aksiyon seçenekleri üret ve HER BİRİNİ kısıtlara karşı test et:
   - Uygulanabilir seçenekleri rank ile sırala (1 = en iyi uygulanabilir seçenek).
   - Kısıtlara takılan seçenekleri de listele ama feasible=false yap ve feasibilityNote'ta HANGİ kısıta takıldığını yaz.
   - Her seçeneğin trade-off'unu ve beklenen sonucunu yaz.
   - Amaç teorik olarak mükemmel aksiyon değil, önümüzdeki dakikalarda GERÇEKTEN uygulanabilecek en iyi aksiyondur.
3. recommendedOptionRank: önerdiğin seçeneğin rank değeri (genelde 1, en iyi uygulanabilir seçenek).
4. Tüm metinler Türkçe olacak.
5. KISA YAZ: her metin alanı en fazla 1-2 kısa cümle. En fazla 3 seçenek (biri kısıta takılan uygulanamaz örnek olsun). Toplam çıktıyı kompakt tut.

OPERASYONEL VERİ (referans için):
"""
${data}
"""`;
}

/** JSON Schema — teşhis aşaması (options/recommendedOptionRank İÇERMEZ). */
export const diagnosisJsonSchema = {
  type: "object",
  properties: {
    categoryId: { type: "string" },
    categoryLabel: { type: "string" },
    severity: { type: "string", enum: ["critical", "warning", "info", "healthy"] },
    title: { type: "string" },
    businessImpact: { type: "string" },
    confidence: { type: "number" },
    confidenceRationale: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          fact: { type: "string" },
          reliability: { type: "string", enum: ["verified", "estimated", "unknown"] },
        },
        required: ["source", "fact", "reliability"],
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
    historicalComparison: { type: "string" },
    counterfactual: {
      type: "object",
      properties: {
        narrative: { type: "string" },
        projectedImpact: { type: "string" },
        timeHorizon: { type: "string" },
      },
      required: ["narrative", "projectedImpact", "timeHorizon"],
    },
  },
  required: [
    "categoryId",
    "categoryLabel",
    "severity",
    "title",
    "businessImpact",
    "confidence",
    "confidenceRationale",
    "evidence",
    "assumptions",
    "historicalComparison",
    "counterfactual",
  ],
} as const;

/** JSON Schema — seçenekler aşaması (SADECE options + recommendedOptionRank). */
export const optionsJsonSchema = {
  type: "object",
  properties: {
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          feasible: { type: "boolean" },
          feasibilityNote: { type: "string" },
          tradeoffs: { type: "string" },
          expectedOutcome: { type: "string" },
          rank: { type: "number" },
        },
        required: [
          "title",
          "detail",
          "feasible",
          "feasibilityNote",
          "tradeoffs",
          "expectedOutcome",
          "rank",
        ],
      },
    },
    recommendedOptionRank: { type: "number" },
  },
  required: ["options", "recommendedOptionRank"],
} as const;
