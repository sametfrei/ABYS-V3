/**
 * Sektör zekâ paketleri — sürümlenebilir KPI bilgi kütüphanesi sözleşmesi.
 *
 * Paketler evrensel çekirdekten ayrıdır: yeni sektör eklemek çekirdeği
 * değiştirmez. Her KPI'nın formülü, gerekli kanonik alanları ve önceliği
 * açıkça tanımlıdır; hiçbir metrik "adı var, hesabı yok" biçiminde sunulmaz.
 */

export type KpiCategory =
  | "financial"
  | "operational"
  | "commercial"
  | "supply-chain"
  | "workforce"
  | "risk";

export type KpiPriority = "core" | "extended";

export interface KpiSpec {
  id: string;
  name: string;
  category: KpiCategory;
  functionName: string;
  formula: string;
  unit: string;
  /** Kanonik alan adları; semantic mapping bu adlara eşler. */
  requiredFields: string[];
  priority: KpiPriority;
  note?: string;
}

export interface Subsector {
  id: string;
  label: string;
  keywords: string[];
}

export interface PackSignals {
  /** Kanonik alan adlarında aranan anahtar sözcükler (küçük harf). */
  fieldKeywords: string[];
  /** Varlık türü ipuçları. */
  entityHints: string[];
  /** KPI etiketlerinde aranan anahtar sözcükler. */
  labelKeywords: string[];
}

export interface IndustryPack {
  id: string;
  label: string;
  version: number;
  subsectors: Subsector[];
  kpis: KpiSpec[];
  signals: PackSignals;
  /** Organizasyonun mevcut sektör alanı için zayıf ipucu (tek başına yeterli değil). */
  sectorHints: string[];
  note: string;
}

export interface DiscoveryInput {
  sectorId: string | null;
  entityCounts: Record<string, number>;
  fieldNames: string[];
  kpiLabels: string[];
  /**
   * Varlık bazında gözlenen kanonik alanlar. Verildiğinde KPI kullanılabilirliği
   * yalnızca tüm gerekli alanların AYNI varlıkta birlikte bulunduğu durumda
   * "available" sayılır. Verilmezse org geneli alan birleşimine düşülür
   * (geriye dönük uyumluluk; birleşim "hesaplanabilir" anlamına gelmez).
   */
  entityFields?: Record<string, string[]>;
  /**
   * Varlık → alan → gözlenen JSON tipi dağılımı. Verildiğinde bir alan, yalnızca
   * gözlenen boş olmayan değerlerinin tamamı sayısal (`number`) ise KPI için
   * kullanılabilir sayılır. Tip bilgisi yoksa alan varlığına güvenilir.
   */
  entityFieldTypes?: Record<string, Record<string, Record<string, number>>>;
}

export interface DiscoveryEvidence {
  signal: string;
  kind: "structure" | "field" | "metric" | "sector";
}

export interface PackRanking {
  packId: string;
  label: string;
  score: number;
  subsector: { id: string; label: string } | null;
  evidence: DiscoveryEvidence[];
}

export interface KpiAvailability {
  kpi: KpiSpec;
  availability: "available" | "partial" | "unavailable";
  matchedFields: string[];
  missingFields: string[];
  /**
   * KPI'yı tek bir varlıktan hesaplamayı mümkün kılan varlık. Yalnızca
   * `availability === "available"` iken doludur; alanlar farklı varlıklara
   * dağılmışsa `null` olur ve KPI "hesaplanabilir" sayılmaz.
   */
  entity: string | null;
  /** Gerekli alanların en az birini taşıyan varlıklar (kanıt izi). */
  partialEntities: string[];
  /** Alan mevcut ama gözlenen tipi sayısal olmadığı için hesaplamaya girmeyen alanlar. */
  nonNumericFields: string[];
  /** Değerlendirme kapsamı: tek varlıkta tam eşleşme mi, yoksa org birleşimi mi. */
  scope: "entity" | "organization";
}

export interface DiscoveryResult {
  primary: PackRanking | null;
  rankings: PackRanking[];
  confidence: number;
  requiresConfirmation: boolean;
  diversified: boolean;
  kpis: KpiAvailability[];
  missingInformation: string[];
  note: string;
}
