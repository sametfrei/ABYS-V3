/**
 * Sektörden bağımsız ortak iş kavramları.
 *
 * Amaç: paket kataloğunda karşılığı olmayan bir işletme geldiğinde bile
 * verinin yapısından (alan ve varlık adları, kayıt hacmi) ortak ticari ve
 * operasyonel kavramları çıkarmak. Bu katman yalnızca GÖZLENEN adlardan
 * kanıt üretir; değer okumaz, örnek kayıt taşımaz, şirket adına bakmaz.
 * Hiçbir kavram eşleşmiyorsa boş döner — tahmin uydurulmaz.
 *
 * İş modeli ipuçları da doğrulanmış sektör değildir; kavram kombinasyonuna
 * dayalı, güven düzeyi ve kanıt listesiyle sunulan önerilerdir.
 */

export type ConceptKind =
  | "financial"
  | "volume"
  | "party"
  | "operational"
  | "commercial"
  | "temporal";

export interface ConceptDefinition {
  id: string;
  label: string;
  kind: ConceptKind;
  keywords: string[];
}

export interface ConceptFieldEvidence {
  entity: string;
  field: string;
  recordCount: number;
  /** Kanıt alan adından mı, varlık adından mı geldi? */
  source: "field" | "entity";
}

export interface DetectedConcept {
  id: string;
  label: string;
  kind: ConceptKind;
  confidence: number;
  entityCount: number;
  recordCount: number;
  matchedFields: ConceptFieldEvidence[];
}

export interface BusinessModelHint {
  id: string;
  label: string;
  confidence: number;
  requiredConceptIds: string[];
  supportingConceptIds: string[];
  evidence: string[];
  note: string;
}

export interface ConceptDetectionInput {
  fieldNames: string[];
  entityCounts: Record<string, number>;
  entityFields?: Record<string, string[]>;
}

export const BUSINESS_CONCEPTS: ConceptDefinition[] = [
  { id: "revenue", label: "Gelir / ciro", kind: "financial", keywords: ["revenue", "sales", "sale", "income", "turnover", "gmv", "ciro", "gelir"] },
  { id: "cost", label: "Maliyet / gider", kind: "financial", keywords: ["cost", "cogs", "expense", "maliyet", "gider"] },
  { id: "profit", label: "Kâr / marj", kind: "financial", keywords: ["profit", "margin", "ebitda", "ebit", "kar"] },
  { id: "price", label: "Fiyat", kind: "commercial", keywords: ["price", "fiyat"] },
  { id: "quantity", label: "Miktar / adet", kind: "volume", keywords: ["quantity", "qty", "units", "adet", "miktar"] },
  { id: "currency", label: "Para birimi", kind: "financial", keywords: ["currency", "doviz"] },
  { id: "customer", label: "Müşteri", kind: "party", keywords: ["customer", "client", "buyer", "musteri"] },
  { id: "supplier", label: "Tedarikçi", kind: "party", keywords: ["supplier", "vendor", "tedarikci"] },
  { id: "product", label: "Ürün / hizmet kalemi", kind: "commercial", keywords: ["product", "sku", "item", "urun"] },
  { id: "inventory", label: "Stok / envanter", kind: "operational", keywords: ["inventory", "stock", "warehouse", "stok", "depo"] },
  { id: "order", label: "Sipariş / işlem", kind: "commercial", keywords: ["order", "siparis", "purchase", "transaction"] },
  { id: "employee", label: "Çalışan / personel", kind: "party", keywords: ["employee", "staff", "personel", "calisan"] },
  { id: "time", label: "Zaman / tarih", kind: "temporal", keywords: ["date", "time", "timestamp", "tarih", "zaman"] },
  { id: "production", label: "Üretim", kind: "operational", keywords: ["production", "produced", "manufacturing", "uretim", "output", "batch"] },
  { id: "machine", label: "Makine / ekipman", kind: "operational", keywords: ["machine", "equipment", "makine", "tezgah"] },
  { id: "quality", label: "Kalite / hata", kind: "operational", keywords: ["quality", "defect", "scrap", "rework", "kalite", "hata"] },
  { id: "delivery", label: "Teslimat / sevkiyat", kind: "operational", keywords: ["delivery", "shipment", "shipping", "carrier", "teslimat", "sevkiyat"] },
  { id: "subscription", label: "Abonelik / yinelenen gelir", kind: "commercial", keywords: ["subscription", "subscriber", "mrr", "arr", "churn", "abonelik"] },
  { id: "marketing", label: "Pazarlama / talep", kind: "commercial", keywords: ["marketing", "campaign", "lead", "pazarlama", "reklam"] },
  { id: "service", label: "Hizmet / destek", kind: "operational", keywords: ["service", "ticket", "support", "billable", "hizmet", "sla"] },
  { id: "project", label: "Proje", kind: "operational", keywords: ["project", "proje", "milestone"] },
  { id: "finance", label: "Kredi / mevduat / faiz", kind: "financial", keywords: ["loan", "deposit", "interest", "credit", "npl", "equity", "kredi", "mevduat", "faiz"] },
  { id: "livestock", label: "Hayvan / süt / yem", kind: "operational", keywords: ["animal", "cattle", "cow", "herd", "livestock", "milk", "feed", "lactation", "veterinary", "hayvan", "inek", "sut", "yem"] },
  { id: "location", label: "Konum / bölge", kind: "operational", keywords: ["location", "city", "country", "region", "address", "route", "lokasyon", "sehir", "bolge"] },
];

export const BUSINESS_MODEL_RULES: Array<{
  id: string;
  label: string;
  required: string[];
  supporting: string[];
}> = [
  { id: "livestock_dairy", label: "Hayvancılık / süt üretimi", required: ["livestock"], supporting: ["production", "cost", "quality"] },
  { id: "manufacturing", label: "Üretim / imalat", required: ["production"], supporting: ["machine", "quality", "inventory"] },
  { id: "retail", label: "Perakende / stoktan satış", required: ["inventory", "order"], supporting: ["product", "revenue", "price"] },
  { id: "logistics", label: "Lojistik / teslimat", required: ["delivery"], supporting: ["order", "location", "cost"] },
  { id: "subscription", label: "Abonelik / yinelenen gelir", required: ["subscription"], supporting: ["revenue", "customer", "price"] },
  { id: "service", label: "Hizmet / proje", required: ["service"], supporting: ["project", "employee", "customer"] },
  { id: "banking", label: "Finans / kredi", required: ["finance"], supporting: ["customer", "quantity"] },
  { id: "commerce", label: "Gelir / ticaret modeli", required: ["revenue"], supporting: ["customer", "product", "order"] },
];

/** camelCase / snake_case / boşluk ayrımını tek tip token'lara indirger. */
export function conceptTokens(value: string): Set<string> {
  return new Set(
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0)
  );
}

function keywordMatches(tokens: Set<string>, keyword: string): boolean {
  if (tokens.has(keyword)) return true;
  if (tokens.has(`${keyword}s`)) return true;
  if (keyword.endsWith("s") && tokens.has(keyword.slice(0, -1))) return true;
  return false;
}

function normalizeEntityFields(input: ConceptDetectionInput): Array<{ entity: string; fields: string[]; recordCount: number }> {
  if (input.entityFields) {
    return Object.entries(input.entityFields)
      .map(([entity, fields]) => ({
        entity,
        fields,
        recordCount: input.entityCounts[entity] ?? 0,
      }))
      .sort((a, b) => a.entity.localeCompare(b.entity));
  }
  return [{ entity: "unknown", fields: input.fieldNames, recordCount: 0 }];
}

/**
 * Gözlenen alan adlarından kavram kanıtı üretir. Aynı alan yalnızca bir
 * kavrama atanmaz: token'lar birden fazla kavramı destekleyebilir, ancak
 * güven yalnızca gerçek eşleşme sayısıyla artar.
 */
export function detectBusinessConcepts(input: ConceptDetectionInput): DetectedConcept[] {
  const entities = normalizeEntityFields(input);
  const detected: DetectedConcept[] = [];

  for (const definition of BUSINESS_CONCEPTS) {
    const matchedFields: ConceptFieldEvidence[] = [];
    let recordCount = 0;
    for (const entity of entities) {
      const entityTokens = conceptTokens(entity.entity);
      if (definition.keywords.some((keyword) => keywordMatches(entityTokens, keyword))) {
        matchedFields.push({
          entity: entity.entity,
          field: entity.entity,
          recordCount: entity.recordCount,
          source: "entity",
        });
        recordCount += entity.recordCount;
      }
      for (const field of entity.fields) {
        const tokens = conceptTokens(field);
        if (!definition.keywords.some((keyword) => keywordMatches(tokens, keyword))) continue;
        matchedFields.push({
          entity: entity.entity,
          field,
          recordCount: entity.recordCount,
          source: "field",
        });
        recordCount += entity.recordCount;
      }
    }
    if (matchedFields.length === 0) continue;
    const entityCount = new Set(matchedFields.map((match) => match.entity)).size;
    // Dürüst ve deterministik güven: tek alan zayıf kanıttır (40), alan ve
    // varlık çeşitliliği arttıkça yükselir, 95'i geçmez.
    const confidence = Math.min(
      95,
      25 + 15 * Math.min(matchedFields.length, 4) + 10 * Math.min(entityCount - 1, 3)
    );
    detected.push({
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      confidence,
      entityCount,
      recordCount,
      matchedFields,
    });
  }

  return detected.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}

/**
 * Kavram kombinasyonlarından olası iş modelleri çıkarır. Zorunlu kavramların
 * tamamı yoksa kural ateşlenmez. Güven, en zayıf zorunlu kavramın güvenine
 * destek kavramı başına +6 eklenerek hesaplanır ve 92 ile sınırlanır.
 */
export function inferBusinessModelHints(concepts: DetectedConcept[]): BusinessModelHint[] {
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const hints: BusinessModelHint[] = [];

  for (const rule of BUSINESS_MODEL_RULES) {
    const required = rule.required.map((id) => byId.get(id));
    if (required.some((concept) => !concept)) continue;
    const supporting = rule.supporting
      .map((id) => byId.get(id))
      .filter((concept): concept is DetectedConcept => concept !== undefined);
    const weakestRequired = Math.min(...required.map((concept) => concept!.confidence));
    const confidence = Math.min(92, weakestRequired + 6 * Math.min(supporting.length, 3));
    hints.push({
      id: rule.id,
      label: rule.label,
      confidence,
      requiredConceptIds: rule.required,
      supportingConceptIds: supporting.map((concept) => concept.id),
      evidence: [...required, ...supporting].map((concept) => concept!.label),
      note: "Kavram kombinasyonuna dayalı öneridir; doğrulanmış sektör değildir.",
    });
  }

  return hints.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
}
