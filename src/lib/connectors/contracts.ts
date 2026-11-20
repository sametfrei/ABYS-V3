import type { CanonicalEntity, CanonicalRecord, ObservedSourceField } from "./types";

/**
 * Kanonik veri sözleşmeleri — kaynak sistemden bağımsız alan, tip ve referans
 * kuralları. Sözleşme bilinmeyen alanları silmez; endüstri/KPI alanlarının
 * kaynak sistemler arasında farklılaşmasına izin verir. Bilinen kanonik
 * alanlar ise yanlış tipte zekâ hattına geçemez.
 */

export const CANONICAL_CONTRACT_VERSION = "1.0";

export type CanonicalFieldType = "string" | "number" | "boolean" | "date" | "reference";

export interface CanonicalFieldContract {
  type: CanonicalFieldType;
  required?: boolean;
  referenceEntity?: CanonicalEntity;
  aliases?: string[];
  description?: string;
}

export interface CanonicalEntityContract {
  entity: CanonicalEntity;
  version: string;
  description: string;
  fields: Record<string, CanonicalFieldContract>;
}

export type ContractViolationCode =
  | "MISSING_EXTERNAL_ID"
  | "INVALID_EXTERNAL_ID"
  | "INVALID_SOURCE_UPDATED_AT"
  | "REQUIRED_FIELD_MISSING"
  | "DUPLICATE_CANONICAL_FIELD"
  | "INVALID_FIELD_TYPE"
  | "INVALID_DATE"
  | "INVALID_REFERENCE";

export interface ContractViolation {
  code: ContractViolationCode;
  field: string;
  message: string;
}

export interface ContractValidationResult {
  record: CanonicalRecord | null;
  violations: ContractViolation[];
}

export interface MappingSuggestion {
  canonicalField: string;
  sourcePath: string;
  confidence: number;
  reason: "exact" | "normalized" | "alias";
}

const entity = (entity: CanonicalEntity, description: string, fields: Record<string, CanonicalFieldContract>): CanonicalEntityContract => ({
  entity,
  version: CANONICAL_CONTRACT_VERSION,
  description,
  fields,
});

export const CANONICAL_CONTRACTS: Record<CanonicalEntity, CanonicalEntityContract> = {
  customer: entity("customer", "Müşteri veya ticari karşı taraf", {
    name: { type: "string", description: "Görünen ad / unvan" },
    email: { type: "string" },
    phone: { type: "string" },
    status: { type: "string" },
    segment: { type: "string" },
    country: { type: "string", aliases: ["country_code"] },
  }),
  supplier: entity("supplier", "Tedarikçi", {
    name: { type: "string" },
    email: { type: "string" },
    status: { type: "string" },
    country: { type: "string", aliases: ["country_code"] },
  }),
  employee: entity("employee", "Çalışan", {
    name: { type: "string" },
    email: { type: "string" },
    department: { type: "string" },
    role: { type: "string" },
    status: { type: "string" },
  }),
  product: entity("product", "Ürün / hizmet", {
    name: { type: "string" },
    sku: { type: "string" },
    category: { type: "string" },
    price: { type: "number" },
    unit_cost: { type: "number", aliases: ["unitCost"] },
    currency: { type: "string" },
  }),
  order: entity("order", "Satış veya satın alma siparişi", {
    customerId: { type: "reference", referenceEntity: "customer", aliases: ["customer_id"] },
    total_amount: { type: "number", aliases: ["totalAmount"] },
    order_date: { type: "date", aliases: ["orderDate"] },
    status: { type: "string" },
    currency: { type: "string" },
  }),
  invoice: entity("invoice", "Fatura", {
    customerId: { type: "reference", referenceEntity: "customer", aliases: ["customer_id"] },
    invoice_number: { type: "string", aliases: ["invoiceNumber"] },
    amount: { type: "number" },
    invoice_date: { type: "date", aliases: ["invoiceDate"] },
    due_date: { type: "date", aliases: ["dueDate"] },
    currency: { type: "string" },
    status: { type: "string" },
  }),
  payment: entity("payment", "Ödeme / tahsilat", {
    invoiceId: { type: "reference", referenceEntity: "invoice", aliases: ["invoice_id"] },
    customerId: { type: "reference", referenceEntity: "customer", aliases: ["customer_id"] },
    amount: { type: "number" },
    paid_at: { type: "date", aliases: ["paidAt"] },
    currency: { type: "string" },
    status: { type: "string" },
  }),
  account: entity("account", "Muhasebe hesabı veya cari hesap", {
    name: { type: "string" },
    type: { type: "string", aliases: ["account_type"] },
    balance: { type: "number" },
    currency: { type: "string" },
    status: { type: "string" },
  }),
  project: entity("project", "Proje", {
    name: { type: "string" },
    customerId: { type: "reference", referenceEntity: "customer", aliases: ["customer_id"] },
    status: { type: "string" },
    start_date: { type: "date", aliases: ["startDate"] },
    end_date: { type: "date", aliases: ["endDate"] },
    budget: { type: "number" },
  }),
  inventory: entity("inventory", "Stok / envanter bakiyesi", {
    productId: { type: "reference", referenceEntity: "product", aliases: ["product_id"] },
    warehouse_id: { type: "string", aliases: ["warehouseId"] },
    quantity: { type: "number" },
    unit_cost: { type: "number", aliases: ["unitCost"] },
    currency: { type: "string" },
  }),
  event: entity("event", "Süreç veya iş olayı", {
    event_type: { type: "string", required: true, aliases: ["eventType", "type"] },
    occurred_at: { type: "date", required: true, aliases: ["occurredAt", "timestamp"] },
    subject_ref: { type: "string", aliases: ["subjectRef", "subject"] },
    correlation_id: { type: "string", aliases: ["correlationId"] },
  }),
};

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELD_ALIAS_INDEX = new Map<string, Map<string, string>>();
for (const contract of Object.values(CANONICAL_CONTRACTS)) {
  const index = new Map<string, string>();
  for (const [field, spec] of Object.entries(contract.fields)) {
    index.set(normalizedName(field), field);
    for (const alias of spec.aliases ?? []) index.set(normalizedName(alias), field);
  }
  FIELD_ALIAS_INDEX.set(contract.entity, index);
}

export function resolveContractField(
  entityName: CanonicalEntity,
  field: string
): { canonicalField: string; spec: CanonicalFieldContract } | null {
  const index = FIELD_ALIAS_INDEX.get(entityName);
  if (!index) return null;
  const canonical = index.get(normalizedName(field));
  if (!canonical) return null;
  return { canonicalField: canonical, spec: CANONICAL_CONTRACTS[entityName].fields[canonical] };
}

/** Bilinen alias'ı kanonik ada çevirir; endüstriye özel bilinmeyen alanı korur. */
export function canonicalFieldName(entityName: CanonicalEntity, field: string): string {
  return resolveContractField(entityName, field)?.canonicalField ?? field;
}

function normalizeString(value: unknown, maxLength = 2_000): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  const text = String(value).trim();
  return text.length === 0 || text.length > maxLength ? null : text;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function validateCanonicalRecord(record: CanonicalRecord): ContractValidationResult {
  const violations: ContractViolation[] = [];
  const externalId =
    typeof record.externalId === "string" || typeof record.externalId === "number"
      ? String(record.externalId).trim()
      : "";

  if (!externalId) {
    violations.push({
      code: "MISSING_EXTERNAL_ID",
      field: "externalId",
      message: "Kaynağın dış kimliği boş.",
    });
  } else if (externalId.length > 300) {
    violations.push({
      code: "INVALID_EXTERNAL_ID",
      field: "externalId",
      message: "Dış kimlik 300 karakteri aşamaz.",
    });
  }

  let sourceUpdatedAt = record.sourceUpdatedAt;
  if (sourceUpdatedAt !== null) {
    sourceUpdatedAt = normalizeDate(sourceUpdatedAt);
    if (!sourceUpdatedAt) {
      violations.push({
        code: "INVALID_SOURCE_UPDATED_AT",
        field: "sourceUpdatedAt",
        message: "Kaynak güncelleme zamanı geçerli bir tarih değil.",
      });
    }
  }

  const fields: CanonicalRecord["fields"] = {};
  const canonicalKeys = new Set<string>();
  const contract = CANONICAL_CONTRACTS[record.entity];
  for (const [name, raw] of Object.entries(record.fields)) {
    const resolved = resolveContractField(record.entity, name);
    const targetName = resolved?.canonicalField ?? name;
    if (canonicalKeys.has(targetName)) {
      violations.push({
        code: "DUPLICATE_CANONICAL_FIELD",
        field: targetName,
        message: `'${targetName}' kanonik alanı birden fazla kaynak alanıyla eşlenmiş.`,
      });
      continue;
    }
    canonicalKeys.add(targetName);

    if (raw === null || raw === undefined) {
      fields[targetName] = null;
    } else {
      if (!resolved) {
        fields[targetName] = raw;
        continue;
      }
      const { spec } = resolved;
      let normalized: string | number | boolean | null = null;
      let errorCode: ContractViolationCode = "INVALID_FIELD_TYPE";
      let errorMessage = `'${name}' alanı ${spec.type} tipinde olmalı.`;

      if (spec.type === "string") {
        normalized = normalizeString(raw);
      } else if (spec.type === "number") {
        normalized = normalizeNumber(raw);
      } else if (spec.type === "boolean") {
        normalized = normalizeBoolean(raw);
      } else if (spec.type === "date") {
        normalized = normalizeDate(raw);
        errorCode = "INVALID_DATE";
        errorMessage = `'${name}' alanı geçerli bir tarih olmalı.`;
      } else {
        normalized = normalizeString(raw, 300);
        errorCode = "INVALID_REFERENCE";
        errorMessage = `'${name}' alanı ${spec.referenceEntity ?? "varlık"} referansı olmalı.`;
      }

      if (normalized === null) {
        violations.push({ code: errorCode, field: targetName, message: errorMessage });
        fields[targetName] = raw;
      } else {
        fields[targetName] = normalized;
      }
    }
  }

  for (const [canonicalField, spec] of Object.entries(contract.fields)) {
    if (!spec.required) continue;
    const value = fields[canonicalField];
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
      violations.push({
        code: "REQUIRED_FIELD_MISSING",
        field: canonicalField,
        message: `Zorunlu kanonik alan '${canonicalField}' eksik veya boş.`,
      });
    }
  }

  return {
    record:
      violations.length === 0
        ? {
            ...record,
            externalId,
            sourceUpdatedAt,
            fields,
          }
        : null,
    violations,
  };
}

export function partitionCanonicalRecords(records: CanonicalRecord[]): {
  accepted: CanonicalRecord[];
  rejected: Array<{ record: CanonicalRecord; violations: ContractViolation[] }>;
} {
  const accepted: CanonicalRecord[] = [];
  const rejected: Array<{ record: CanonicalRecord; violations: ContractViolation[] }> = [];
  for (const record of records) {
    const result = validateCanonicalRecord(record);
    if (result.record) accepted.push(result.record);
    else rejected.push({ record, violations: result.violations });
  }
  return { accepted, rejected };
}

function lastPathSegment(path: string): string {
  const parts = path.split(".");
  return (parts[parts.length - 1] ?? path).replace(/\[\]$/, "");
}

/** Kaynak alan adlarını kullanır; gözlenen değerleri veya örnek veriyi taşımaz. */
export function suggestCanonicalMappings(
  entityName: CanonicalEntity,
  observedFields: ObservedSourceField[]
): MappingSuggestion[] {
  const contract = CANONICAL_CONTRACTS[entityName];
  const suggestions: MappingSuggestion[] = [];
  const usedPaths = new Set<string>();

  for (const [canonicalField, spec] of Object.entries(contract.fields)) {
    const targetNames = new Map<string, MappingSuggestion["reason"]>();
    targetNames.set(normalizedName(canonicalField), "exact");
    for (const alias of spec.aliases ?? []) targetNames.set(normalizedName(alias), "alias");

    let match: MappingSuggestion | null = null;
    for (const observed of observedFields) {
      if (usedPaths.has(observed.path)) continue;
      const segment = normalizedName(lastPathSegment(observed.path));
      const reason = targetNames.get(segment);
      if (!reason) continue;
      const confidence = reason === "exact" ? 1 : 0.9;
      if (!match || confidence > match.confidence) {
        match = { canonicalField, sourcePath: observed.path, confidence, reason };
      }
    }
    if (match) {
      usedPaths.add(match.sourcePath);
      suggestions.push(match);
    }
  }
  return suggestions.sort((a, b) => a.canonicalField.localeCompare(b.canonicalField));
}
