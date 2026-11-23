import { describe, expect, it } from "vitest";
import {
  detectBusinessConcepts,
  inferBusinessModelHints,
  type ConceptDetectionInput,
} from "../src/lib/industry/concepts";
import { discoverBusiness } from "../src/lib/industry/classifier";

function input(
  entityFields: Record<string, string[]>,
  entityCounts: Record<string, number> = {}
): ConceptDetectionInput {
  const fieldNames = [...new Set(Object.values(entityFields).flat())].sort();
  return { entityFields, entityCounts, fieldNames };
}

function conceptIds(data: ConceptDetectionInput): string[] {
  return detectBusinessConcepts(data).map((concept) => concept.id);
}

describe("Ortak iş kavramları", () => {
  it("hayvancılık/süt verisinden hayvan, üretim ve maliyet kavramlarını çıkarır", () => {
    const data = input(
      {
        animal: ["animal_id", "lactation_days", "milk_yield_liters", "feed_cost"],
        milk_production: ["milk_liters", "somatic_cell_count", "production_date"],
        feed: ["feed_type", "feed_quantity_kg"],
      },
      { animal: 120, milk_production: 900, feed: 300 }
    );
    const concepts = detectBusinessConcepts(data);
    const ids = concepts.map((concept) => concept.id);
    expect(ids).toContain("livestock");
    expect(ids).toContain("production");
    expect(ids).toContain("cost");
    const livestock = concepts.find((concept) => concept.id === "livestock");
    expect(livestock?.recordCount).toBeGreaterThan(0);
    expect(livestock?.matchedFields.some((match) => match.source === "entity")).toBe(true);
    expect(inferBusinessModelHints(concepts)[0]?.id).toBe("livestock_dairy");
  });

  it("üretim verisinden üretim ve makine kavramlarını çıkarır", () => {
    const data = input(
      {
        product: [
          "machine_id",
          "work_order",
          "planned_production_time",
          "downtime_minutes",
          "good_units",
          "total_units",
          "scrap_units",
        ],
      },
      { product: 400 }
    );
    const concepts = detectBusinessConcepts(data);
    expect(concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining(["production", "machine", "quality"])
    );
    expect(inferBusinessModelHints(concepts).map((hint) => hint.id)).toContain("manufacturing");
  });

  it("perakende verisinden stok, sipariş ve gelir kavramlarını çıkarır", () => {
    const data = input(
      {
        order: [
          "order_id",
          "net_sales",
          "cogs",
          "transactions",
          "units_sold",
          "store_id",
          "footfall",
        ],
        product: ["sku", "unit_price", "inventory_units"],
      },
      { order: 300, product: 900 }
    );
    const concepts = detectBusinessConcepts(data);
    expect(concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining(["inventory", "order", "revenue", "product"])
    );
    expect(inferBusinessModelHints(concepts)[0]?.id).toBe("retail");
  });

  it("lojistik verisinden teslimat, konum ve sipariş kavramlarını çıkarır", () => {
    const data = input(
      {
        shipment: [
          "shipment_id",
          "delivery_date",
          "carrier",
          "eta_hours",
          "route",
          "order_id",
          "freight_cost",
        ],
      },
      { shipment: 250 }
    );
    const concepts = detectBusinessConcepts(data);
    expect(concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining(["delivery", "location", "order"])
    );
    expect(inferBusinessModelHints(concepts)[0]?.id).toBe("logistics");
  });

  it("hizmet verisinden hizmet, proje ve müşteri kavramlarını çıkarır", () => {
    const data = input(
      {
        project: [
          "project_id",
          "consultant_id",
          "billable_hours",
          "ticket_id",
          "sla_hours",
          "customer_id",
        ],
      },
      { project: 80 }
    );
    const concepts = detectBusinessConcepts(data);
    expect(concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining(["service", "project", "customer"])
    );
    expect(inferBusinessModelHints(concepts)[0]?.id).toBe("service");
  });

  it("abonelik verisinden yinelenen gelir ve müşteri kavramlarını çıkarır", () => {
    const data = input(
      {
        subscription: ["subscription_id", "mrr", "arr", "churn_rate", "seats", "customer_id", "revenue"],
      },
      { subscription: 200 }
    );
    const concepts = detectBusinessConcepts(data);
    expect(concepts.map((concept) => concept.id)).toEqual(
      expect.arrayContaining(["subscription", "revenue", "customer"])
    );
    expect(inferBusinessModelHints(concepts)[0]?.id).toBe("subscription");
  });

  it("tanınmayan veride kavram ve iş modeli uydurmaz", () => {
    const data = input(
      { zorblax: ["zorblax_qx", "glorp_count", "flim_flam"] },
      { zorblax: 12 }
    );
    expect(conceptIds(data)).toEqual([]);
    expect(inferBusinessModelHints(detectBusinessConcepts(data))).toEqual([]);
  });
});

describe("Keşif sonucuna entegrasyon", () => {
  it("sektör paketi dışındaki veride kavram ve iş modeli ipuçlarını döndürür", () => {
    const data = input(
      {
        animal: ["animal_id", "milk_yield_liters", "feed_cost"],
        milk_production: ["milk_liters", "production_date"],
      },
      { animal: 120, milk_production: 900 }
    );
    const result = discoverBusiness({
      sectorId: null,
      entityCounts: data.entityCounts,
      fieldNames: data.fieldNames,
      kpiLabels: [],
      entityFields: data.entityFields,
    });
    expect(result.concepts.some((concept) => concept.id === "livestock")).toBe(true);
    expect(result.businessModelHints.some((hint) => hint.id === "livestock_dairy")).toBe(true);
    expect(result.businessModelHints[0]?.note).toContain("doğrulanmış sektör değildir");
  });

  it("veri yokken kavram üretmez ve bunu eksik bilgi olarak bildirir", () => {
    const result = discoverBusiness({
      sectorId: null,
      entityCounts: {},
      fieldNames: [],
      kpiLabels: [],
    });
    expect(result.concepts).toEqual([]);
    expect(result.businessModelHints).toEqual([]);
  });

  it("hiçbir kavram eşleşmezse alan adlarının yetersiz olduğunu söyler", () => {
    const result = discoverBusiness({
      sectorId: null,
      entityCounts: { zorblax: 5 },
      fieldNames: ["zorblax_qx"],
      kpiLabels: [],
      entityFields: { zorblax: ["zorblax_qx"] },
    });
    expect(result.concepts).toEqual([]);
    expect(result.missingInformation.join(" ")).toContain("Ortak iş kavramı tespit edilemedi");
  });
});
