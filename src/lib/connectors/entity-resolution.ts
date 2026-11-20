import { createHash } from "node:crypto";
import type { CanonicalEntity, CanonicalRecord } from "./types";

/**
 * Kaynak-bağımsız kimlik çözümlemesi. Yalnızca güçlü ve deterministik
 * eşleşmeler kaynaklar arasında birleştirilir: müşteri/tedarikçi/çalışan
 * için normalize e-posta, ürün için normalize SKU. Diğer kayıtlar kendi
 * kaynak kimliğiyle yaşar; isim benzerliği gibi yanlış pozitif üreten
 * sezgisel eşleşmeler otomatik uygulanmaz.
 */

export type EntityMatchStrategy = "email" | "sku" | "source-identity";

export interface CanonicalEntityLink {
  id: string;
  canonicalEntityId: string;
  entity: CanonicalEntity;
  sourceConfigId: string;
  sourceExternalId: string;
  matchStrategy: EntityMatchStrategy;
  matchConfidence: number;
}

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function normalizedText(value: CanonicalRecord["fields"][string]): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizedEmail(value: CanonicalRecord["fields"][string]): string | null {
  const email = normalizedText(value)?.toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function identityFor(record: CanonicalRecord): {
  strategy: EntityMatchStrategy;
  identity: string;
  confidence: number;
} {
  if (record.entity === "customer" || record.entity === "supplier" || record.entity === "employee") {
    const email = normalizedEmail(record.fields.email);
    if (email) return { strategy: "email", identity: email, confidence: 100 };
  }
  if (record.entity === "product") {
    const sku = normalizedText(record.fields.sku)?.toUpperCase();
    if (sku) return { strategy: "sku", identity: sku, confidence: 100 };
  }
  return {
    strategy: "source-identity",
    identity: `${record.entity}\u001f${record.externalId}`,
    confidence: 40,
  };
}

export function buildCanonicalEntityLink(
  orgId: string,
  sourceConfigId: string,
  record: CanonicalRecord
): CanonicalEntityLink {
  const identity = identityFor(record);
  const identityScope = identity.strategy === "source-identity" ? sourceConfigId : "organization";
  return {
    id: digest("entity-link", orgId, sourceConfigId, record.entity, record.externalId),
    canonicalEntityId: digest(
      "canonical-entity",
      orgId,
      record.entity,
      identityScope,
      identity.strategy,
      identity.identity
    ),
    entity: record.entity,
    sourceConfigId,
    sourceExternalId: record.externalId,
    matchStrategy: identity.strategy,
    matchConfidence: identity.confidence,
  };
}
