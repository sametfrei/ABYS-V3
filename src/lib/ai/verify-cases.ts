import type { AiDecisionCase } from "./provider";

/**
 * Deterministik çıktı doğrulayıcı: "uydurma sayı yasak" kuralını koda taşır.
 *
 * Modelin ürettiği vakalardaki sayısal iddialar, kaynak metinlerde
 * (operasyonel veri + kısıtlar + bilgi paketi + karar hafızası) geçen
 * sayılarla karşılaştırılır. Kaynaklarda bulunmayan sayılar tespit edilirse:
 *  - o kanıt "verified" ise "estimated"a düşürülür,
 *  - vaka güven skoru sınırlandırılır ve gerekçeye not eklenir.
 * Doğrulayıcı içerik SİLMEZ, yalnızca güvenilirlik işaretlerini düzeltir.
 * Ayrıca yapısal tutarlılığı onarır (güven skoru aralığı, önerilen seçenek
 * rank'inin uygulanabilir bir seçeneğe işaret etmesi).
 */

export interface VerificationSources {
  data: string;
  constraints: string;
  domainKnowledge: string;
  decisionMemory: string;
}

/**
 * Metindeki "anlamlı" sayıları normalize edilmiş biçimde çıkarır.
 * Atlananlar: saat biçimleri (18:45), kod/işaret ekleri (TK-2043, D-100),
 * ve 10 ve altı küçük tamsayılar (adet/sıra gibi zararsız kullanım).
 */
export function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  const cleaned = text
    .replace(/\b\d{1,2}[:.]\d{2}\b(?=\s|$|[,.;)])/g, " ") // saatler: 18:45, 18.45
    .replace(/[A-ZÇĞİÖŞÜ]{1,4}-?\d+/g, " "); // kodlar: TK-2043, D-100, R4, SIP-8842

  const re = /\d[\d.,]*/g;
  for (const match of cleaned.match(re) ?? []) {
    for (const canon of canonicalForms(match)) {
      const asNum = Number(canon);
      if (Number.isFinite(asNum) && asNum > 10) out.add(canon);
    }
  }
  return out;
}

/** "1.200", "1,4", "1.234,5" gibi TR biçimlerini olası kanonik değerlere çevirir. */
function canonicalForms(token: string): string[] {
  const t = token.replace(/[.,]+$/, "");
  if (!t) return [];
  const forms = new Set<string>();

  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  if (hasDot && hasComma) {
    // 1.234,5 → 1234.5
    forms.add(t.replace(/\./g, "").replace(",", "."));
  } else if (hasComma) {
    forms.add(t.replace(",", ".")); // ondalık: 1,4 → 1.4
    forms.add(t.replace(/,/g, "")); // binlik: 1,200 → 1200
  } else if (hasDot) {
    forms.add(t.replace(/\./g, "")); // binlik: 1.200 → 1200
    forms.add(t); // ondalık: 2.5
  } else {
    forms.add(t);
  }
  return [...forms];
}

/**
 * Bir sayı "destekli" sayılır: kaynaklarda aynen geçiyorsa YA DA kaynaklarda
 * geçen iki sayının toplamıysa (model, kodun hesapladığı iki referansı
 * toplayabilir — ör. 6.000 € rötar + 700 € bagaj = 6.700 €).
 */
function isSupported(canon: string, sources: Set<string>): boolean {
  if (sources.has(canon)) return true;
  const target = Number(canon);
  if (!Number.isFinite(target)) return false;
  const values = [...sources].map(Number).filter((v) => Number.isFinite(v) && v < target);
  const seen = new Set(values);
  for (const v of values) {
    if (seen.has(Number((target - v).toFixed(6)))) return true;
  }
  return false;
}

function textNumbersUnsupported(text: string | undefined, sources: Set<string>): number {
  if (!text) return 0;
  let count = 0;
  for (const n of extractNumbers(text)) {
    if (!isSupported(n, sources)) count++;
  }
  return count;
}

export interface VerificationResult {
  cases: AiDecisionCase[];
  /** Vaka başına kaynaklarda bulunamayan sayı adedi (telemetri/log için). */
  unsupportedCounts: number[];
}

export function verifyDecisionCases(
  cases: AiDecisionCase[],
  sources: VerificationSources
): VerificationResult {
  const sourceNumbers = extractNumbers(
    [sources.data, sources.constraints, sources.domainKnowledge, sources.decisionMemory].join("\n")
  );

  const unsupportedCounts: number[] = [];

  const verified = cases.map((raw) => {
    // Yapısal tamamlama: token limitinde kesilip onarılan JSON'da alfabetik
    // sırada sona kalan alanlar (severity, title...) düşmüş olabilir.
    const validSeverities = ["critical", "warning", "info", "healthy"] as const;
    const c: AiDecisionCase = {
      ...raw,
      severity: validSeverities.includes(raw.severity) ? raw.severity : "warning",
      title:
        raw.title?.trim() ||
        raw.businessImpact?.split(/(?<=[.!?])\s/)[0]?.slice(0, 140) ||
        `${raw.categoryLabel ?? "Operasyonel"} vakası`,
      evidence: raw.evidence ?? [],
      assumptions: raw.assumptions ?? [],
      options: raw.options ?? [],
      historicalComparison: raw.historicalComparison ?? "Geçmiş veri sağlanmadı.",
      counterfactual: raw.counterfactual ?? { narrative: "", projectedImpact: "", timeHorizon: "" },
    };

    let unsupported = 0;

    // Kanıt zinciri: kaynağı doğrulanamayan sayı içeren "verified" kanıtları düşür.
    const evidence = (c.evidence ?? []).map((e) => {
      const bad = textNumbersUnsupported(e.fact, sourceNumbers);
      unsupported += bad;
      if (bad > 0 && e.reliability === "verified") {
        return { ...e, reliability: "estimated" as const };
      }
      return e;
    });

    // Anlatı alanlarındaki desteksiz sayılar
    unsupported += textNumbersUnsupported(c.businessImpact, sourceNumbers);
    unsupported += textNumbersUnsupported(c.historicalComparison, sourceNumbers);
    unsupported += textNumbersUnsupported(c.counterfactual?.narrative, sourceNumbers);
    unsupported += textNumbersUnsupported(c.counterfactual?.projectedImpact, sourceNumbers);
    for (const o of c.options ?? []) {
      unsupported += textNumbersUnsupported(o.detail, sourceNumbers);
      unsupported += textNumbersUnsupported(o.tradeoffs, sourceNumbers);
      unsupported += textNumbersUnsupported(o.expectedOutcome, sourceNumbers);
    }

    // Güven skoru: aralık + desteksiz sayı cezası
    let confidence = Math.max(0, Math.min(100, Math.round(c.confidence ?? 0)));
    let confidenceRationale = c.confidenceRationale ?? "";
    if (unsupported > 0) {
      const cap = unsupported >= 3 ? 70 : 85;
      confidence = Math.min(confidence, cap);
      confidenceRationale = `${confidenceRationale} [Otomatik doğrulama: çıktıdaki ${unsupported} sayısal değer kaynak veri/bilgi paketinde bulunamadı; ilgili kanıtlar tahmini olarak işaretlendi, güven skoru ${cap} ile sınırlandı.]`;
    }

    // Önerilen seçenek uygulanabilir bir seçeneğe işaret etmeli
    const options = c.options ?? [];
    const feasible = options.filter((o) => o.feasible);
    let recommendedOptionRank = c.recommendedOptionRank;
    if (feasible.length > 0 && !feasible.some((o) => o.rank === recommendedOptionRank)) {
      recommendedOptionRank = Math.min(...feasible.map((o) => o.rank));
    }

    unsupportedCounts.push(unsupported);
    return { ...c, evidence, confidence, confidenceRationale, recommendedOptionRank };
  });

  return { cases: verified, unsupportedCounts };
}
