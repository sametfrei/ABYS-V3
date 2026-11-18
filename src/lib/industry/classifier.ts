import { INDUSTRY_PACKS } from "./packs";
import type {
  DiscoveryEvidence,
  DiscoveryInput,
  DiscoveryResult,
  IndustryPack,
  KpiAvailability,
  PackRanking,
} from "./types";

/**
 * İşletme keşif sınıflandırıcısı.
 *
 * Tek bir alan adına (şirket adı, seçilmiş sektör) güvenmez. Üç bağımsız
 * sinyal türünü birleştirir: bağlı sistemlerdeki kanonik alan adları, mevcut
 * KPI etiketleri ve varlık yapısı. Mevcut `sector_id` yalnızca zayıf bir
 * ipucudur. Sonuç her zaman kanıt satırları, eksik bilgi ve güven düzeyiyle
 * birlikte döner; düşük güvende yönetici onayı istenir.
 */

const FEATURE_WEIGHTS = { field: 3, kpi: 2, entity: 2, subsector: 1, sector: 1 } as const;

function includesAny(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((n) => lower.includes(n.toLowerCase()));
}

function maxPossible(pack: IndustryPack): number {
  return (
    pack.signals.fieldKeywords.length * FEATURE_WEIGHTS.field +
    pack.signals.labelKeywords.length * FEATURE_WEIGHTS.kpi +
    pack.signals.entityHints.length * FEATURE_WEIGHTS.entity +
    pack.subsectors.length * FEATURE_WEIGHTS.subsector +
    pack.sectorHints.length * FEATURE_WEIGHTS.sector
  );
}

function scorePack(pack: IndustryPack, input: DiscoveryInput): {
  score: number;
  evidence: DiscoveryEvidence[];
  subsector: { id: string; label: string } | null;
} {
  let points = 0;
  const evidence: DiscoveryEvidence[] = [];

  const fieldText = input.fieldNames.join(" ");
  const matchedFields = includesAny(fieldText, pack.signals.fieldKeywords);
  for (const f of matchedFields) {
    points += FEATURE_WEIGHTS.field;
    evidence.push({ signal: `Kanonik alan: ${f}`, kind: "field" });
  }

  const labelText = input.kpiLabels.join(" ");
  const matchedLabels = includesAny(labelText, pack.signals.labelKeywords);
  for (const l of matchedLabels) {
    points += FEATURE_WEIGHTS.kpi;
    evidence.push({ signal: `KPI etiketi: ${l}`, kind: "metric" });
  }

  for (const entity of pack.signals.entityHints) {
    if ((input.entityCounts[entity] ?? 0) > 0) {
      points += FEATURE_WEIGHTS.entity;
      evidence.push({ signal: `Varlık: ${entity} (${input.entityCounts[entity]} kayıt)`, kind: "structure" });
    }
  }

  let bestSub: { id: string; label: string } | null = null;
  let bestSubHits = 0;
  for (const sub of pack.subsectors) {
    const hits = includesAny(`${fieldText} ${labelText}`, sub.keywords).length;
    if (hits > 0) {
      points += hits * FEATURE_WEIGHTS.subsector;
      evidence.push({ signal: `Alt sektör ipucu: ${sub.label}`, kind: "structure" });
      if (hits > bestSubHits) {
        bestSubHits = hits;
        bestSub = { id: sub.id, label: sub.label };
      }
    }
  }

  if (input.sectorId && includesAny(input.sectorId, pack.sectorHints).length > 0) {
    points += FEATURE_WEIGHTS.sector;
    evidence.push({ signal: `Kayıtlı sektör alanı: ${input.sectorId}`, kind: "sector" });
  }

  const score = Math.round((points / Math.max(1, maxPossible(pack))) * 100);
  return { score, evidence, subsector: bestSub };
}

function availabilityFor(pack: IndustryPack, fields: Set<string>): KpiAvailability[] {
  return pack.kpis
    .map((kpi) => {
      const matched = kpi.requiredFields.filter((f) => fields.has(f));
      const missing = kpi.requiredFields.filter((f) => !fields.has(f));
      const availability: KpiAvailability["availability"] =
        missing.length === 0 ? "available" : matched.length > 0 ? "partial" : "unavailable";
      return { kpi, availability, matchedFields: matched, missingFields: missing };
    })
    .sort((a, b) => {
      const rank = { available: 0, partial: 1, unavailable: 2 } as const;
      if (rank[a.availability] !== rank[b.availability]) return rank[a.availability] - rank[b.availability];
      if (a.kpi.priority !== b.kpi.priority) return a.kpi.priority === "core" ? -1 : 1;
      return a.kpi.name.localeCompare(b.kpi.name);
    });
}

export function discoverBusiness(input: DiscoveryInput): DiscoveryResult {
  const fieldSet = new Set(input.fieldNames.map((f) => f.toLowerCase()));
  const rankings: PackRanking[] = INDUSTRY_PACKS.map((pack) => {
    const scored = scorePack(pack, input);
    return {
      packId: pack.id,
      label: pack.label,
      score: scored.score,
      subsector: scored.subsector,
      evidence: scored.evidence,
    };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.packId.localeCompare(b.packId));

  const primary = rankings[0] ?? null;
  const runnerUp = rankings[1] ?? null;
  const margin = primary && runnerUp ? primary.score - runnerUp.score : primary?.score ?? 0;
  // Güven: birincil skorun %60'ı + ikinciyle farkın %40'ı (0–100).
  const confidence = primary ? Math.max(0, Math.min(100, Math.round(primary.score * 0.6 + margin * 0.4))) : 0;
  const requiresConfirmation = !primary || confidence < 65 || margin < 10;
  const diversified = Boolean(primary && runnerUp && primary.score >= 40 && margin < 15);

  const primaryPack = primary ? INDUSTRY_PACKS.find((p) => p.id === primary.packId) : undefined;
  const kpis = primaryPack ? availabilityFor(primaryPack, fieldSet) : [];

  const missingInformation: string[] = [];
  if (kpis.length > 0) {
    const missingFields = new Set<string>();
    for (const k of kpis.filter((x) => x.availability !== "available")) {
      for (const f of k.missingFields) missingFields.add(f);
    }
    for (const f of missingFields) missingInformation.push(`Eksik kanonik alan: ${f}`);
  }
  if (input.fieldNames.length === 0) missingInformation.push("Bağlı sistemden eşlenmiş alan yok.");
  if (input.kpiLabels.length === 0) missingInformation.push("Mevcut KPI serisi yok.");

  return {
    primary,
    rankings: rankings.slice(0, 3),
    confidence,
    requiresConfirmation,
    diversified,
    kpis,
    missingInformation: missingInformation.slice(0, 20),
    note:
      "Sınıflandırma bağlı verinin yapısal sinyallerinden türetilir; şirket adı veya tek bir sektör etiketi " +
      "kullanılmaz. Düşük güvende yönetici onayı gerekir. KPI'lar yalnızca gerekli alanlar mevcutsa 'kullanılabilir' sayılır.",
  };
}
