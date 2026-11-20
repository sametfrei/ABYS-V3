import { describe, expect, it } from "vitest";
import {
  CANONICAL_CONTRACT_VERSION,
  CANONICAL_CONTRACTS,
  partitionCanonicalRecords,
  suggestCanonicalMappings,
  validateCanonicalRecord,
} from "../src/lib/connectors/contracts";
import { observeSourceSchema } from "../src/lib/connectors/schema-discovery";

describe("kanonik veri sözleşmeleri", () => {
  it("her kanonik varlık için sürümlü alan/tip sözleşmesi tanımlar", () => {
    expect(CANONICAL_CONTRACT_VERSION).toMatch(/^\d+\.\d+$/);
    expect(Object.keys(CANONICAL_CONTRACTS)).toHaveLength(11);
    for (const contract of Object.values(CANONICAL_CONTRACTS)) {
      expect(contract.version).toBe(CANONICAL_CONTRACT_VERSION);
      expect(Object.keys(contract.fields).length).toBeGreaterThan(0);
    }
    expect(CANONICAL_CONTRACTS.order.fields.customerId).toMatchObject({
      type: "reference",
      referenceEntity: "customer",
    });
  });

  it("sayısal metni ve tarihi normalize eder, bilinmeyen endüstri alanını korur", () => {
    const result = validateCanonicalRecord({
      entity: "product",
      externalId: " P-1 ",
      sourceUpdatedAt: "2026-01-02T03:04:05+02:00",
      fields: {
        name: " Motor ",
        price: "12.50",
        unitCost: "8",
        good_units: 9,
      },
    });
    expect(result.violations).toEqual([]);
    expect(result.record).toMatchObject({
      externalId: "P-1",
      sourceUpdatedAt: "2026-01-02T01:04:05.000Z",
      fields: {
        name: "Motor",
        price: 12.5,
        unit_cost: 8,
        good_units: 9,
      },
    });
  });

  it("zorunlu alanların hiç gönderilmemesini ve çoklu alias çakışmasını reddeder", () => {
    const missingRequired = validateCanonicalRecord({
      entity: "event",
      externalId: "E-1",
      sourceUpdatedAt: null,
      fields: { subject_ref: "order-1" },
    });
    expect(missingRequired.record).toBeNull();
    expect(missingRequired.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REQUIRED_FIELD_MISSING", field: "event_type" }),
        expect.objectContaining({ code: "REQUIRED_FIELD_MISSING", field: "occurred_at" }),
      ])
    );

    const duplicateAlias = validateCanonicalRecord({
      entity: "event",
      externalId: "E-2",
      sourceUpdatedAt: null,
      fields: {
        event_type: "order.approved",
        eventType: "order.approved",
        occurred_at: "2026-01-01T00:00:00Z",
      },
    });
    expect(duplicateAlias.record).toBeNull();
    expect(duplicateAlias.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_CANONICAL_FIELD", field: "event_type" }),
      ])
    );
  });

  it("geçersiz sayı, tarih ve referansı sessizce kabul etmez", () => {
    const result = validateCanonicalRecord({
      entity: "invoice",
      externalId: "INV-1",
      sourceUpdatedAt: "not-a-date",
      fields: {
        customerId: { nested: "C-1" },
        amount: "NaN",
        invoice_date: "31.02.2026",
      },
    } as unknown as Parameters<typeof validateCanonicalRecord>[0]);
    expect(result.record).toBeNull();
    expect(result.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining([
        "INVALID_SOURCE_UPDATED_AT",
        "INVALID_REFERENCE",
        "INVALID_FIELD_TYPE",
        "INVALID_DATE",
      ])
    );
  });

  it("geçerli kayıtları ayırır ve dış kimliği boş kayıtları reddeder", () => {
    const partition = partitionCanonicalRecords([
      { entity: "customer", externalId: "C-1", sourceUpdatedAt: null, fields: { name: "Acme" } },
      { entity: "customer", externalId: "  ", sourceUpdatedAt: null, fields: { name: "Boş" } },
    ]);
    expect(partition.accepted).toHaveLength(1);
    expect(partition.rejected).toHaveLength(1);
    expect(partition.rejected[0].violations[0].code).toBe("MISSING_EXTERNAL_ID");
  });

  it("kaynak şemasını yalnızca yol ve tip olarak gözler", () => {
    const schema = observeSourceSchema([
      { id: "gizli-musteri-123", contact: { email: "secret@example.test" }, amount: 10 },
    ]);
    expect(schema.map((field) => field.path)).toEqual(
      expect.arrayContaining(["id", "contact", "contact.email", "amount"])
    );
    expect(schema.find((field) => field.path === "amount")).toMatchObject({
      types: { number: 1 },
      observations: 1,
    });
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain("gizli-musteri-123");
    expect(serialized).not.toContain("secret@example.test");
  });

  it("kanonik alanlar için kaynak eşleme önerileri üretir", () => {
    const suggestions = suggestCanonicalMappings("order", [
      { path: "id", types: { string: 1 }, observations: 1 },
      { path: "customer_id", types: { string: 1 }, observations: 1 },
      { path: "header.totalAmount", types: { number: 1 }, observations: 1 },
      { path: "header.orderDate", types: { string: 1 }, observations: 1 },
    ]);
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalField: "customerId", sourcePath: "customer_id", confidence: 0.9 }),
        expect.objectContaining({ canonicalField: "total_amount", sourcePath: "header.totalAmount", confidence: 0.9 }),
        expect.objectContaining({ canonicalField: "order_date", sourcePath: "header.orderDate", confidence: 0.9 }),
      ])
    );
  });
});
