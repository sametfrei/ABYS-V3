import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-discovery-test-${process.pid}-${randomUUID()}`
);

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => store.set(name, value),
      delete: (name: string) => store.delete(name),
    }),
    __setTestCookie: (name: string, value: string | undefined) => {
      if (value === undefined) store.delete(name);
      else store.set(name, value);
    },
  };
});

const nextHeaders = (await import("next/headers")) as unknown as {
  __setTestCookie: (name: string, value: string | undefined) => void;
};
const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET } = await import("../src/app/api/discovery/route");
const { discoverBusiness } = await import("../src/lib/industry/classifier");
const { INDUSTRY_PACKS } = await import("../src/lib/industry/packs");

const BASE = { sectorId: null, entityCounts: {}, fieldNames: [] as string[], kpiLabels: [] as string[] };

describe("Sektör keşif sınıflandırıcısı", () => {
  it("üretim sinyallerinden üretim sektörünü çıkarır", () => {
    const r = discoverBusiness({
      ...BASE,
      entityCounts: { product: 400, inventory: 120 },
      fieldNames: ["machine_id", "work_order", "downtime_minutes", "good_units", "total_units"],
      kpiLabels: ["OEE", "fire oranı"],
    });
    expect(r.primary?.packId).toBe("manufacturing");
    expect(r.confidence).toBeGreaterThan(30);
    expect(r.kpis.length).toBeGreaterThan(0);
    expect(r.primary?.evidence.length).toBeGreaterThan(0);
  });

  it("perakende sinyallerinden perakende sektörünü çıkarır", () => {
    const r = discoverBusiness({
      ...BASE,
      entityCounts: { product: 900, order: 300, inventory: 80 },
      fieldNames: ["store_id", "sku", "units_sold", "footfall", "stockout_units"],
      kpiLabels: ["stok devir hızı"],
    });
    expect(r.primary?.packId).toBe("retail");
    expect(r.rankings.map((x) => x.packId)).toContain("manufacturing");
  });

  it("banka sinyallerinden bankacılık sektörünü çıkarır", () => {
    const r = discoverBusiness({
      ...BASE,
      entityCounts: { account: 50, payment: 20 },
      fieldNames: ["loan", "deposit", "interest_income", "non_performing_loans", "equity"],
      kpiLabels: ["net faiz marjı"],
    });
    expect(r.primary?.packId).toBe("banking");
  });

  it("SaaS sinyallerinden teknoloji sektörünü çıkarır", () => {
    const r = discoverBusiness({
      ...BASE,
      entityCounts: { customer: 200, subscription: 200 },
      fieldNames: ["mrr", "churn_rate", "seats", "cloud_cost"],
      kpiLabels: ["ARR"],
    });
    expect(r.primary?.packId).toBe("technology");
  });

  it("veri yokken sınıflandırma uydurmaz", () => {
    const r = discoverBusiness(BASE);
    expect(r.primary).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.requiresConfirmation).toBe(true);
    expect(r.kpis).toHaveLength(0);
    expect(r.missingInformation.length).toBeGreaterThan(0);
  });

  it("KPI'ları yalnızca gerekli alanlar varsa kullanılabilir sayar", () => {
    const r = discoverBusiness({
      ...BASE,
      fieldNames: ["good_units", "total_units"],
      entityCounts: {},
    });
    const fpy = r.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("available");
    const oee = r.kpis.find((k) => k.kpi.id === "oee");
    expect(oee?.availability).toBe("partial");
    expect(oee?.missingFields).toContain("downtime_minutes");
  });

  it("alanlar tek varlıkta birleşiyorsa KPI hesaplanabilir ve varlık bildirilir", () => {
    const r = discoverBusiness({
      ...BASE,
      fieldNames: ["good_units", "total_units"],
      entityCounts: { product: 10 },
      entityFields: { product: ["good_units", "total_units"] },
    });
    const fpy = r.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("available");
    expect(fpy?.entity).toBe("product");
    expect(fpy?.scope).toBe("entity");
    expect(fpy?.missingFields).toHaveLength(0);
  });

  it("alanlar farklı varlıklara dağılmışsa KPI hesaplanabilir sayılmaz", () => {
    const r = discoverBusiness({
      ...BASE,
      fieldNames: ["good_units", "total_units"],
      entityCounts: { order: 10, product: 5 },
      entityFields: { order: ["good_units"], product: ["total_units"] },
    });
    const fpy = r.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("partial");
    expect(fpy?.entity).toBeNull();
    expect(fpy?.scope).toBe("organization");
    expect(fpy?.missingFields).toHaveLength(0);
    expect(fpy?.partialEntities).toEqual(["order", "product"]);
    expect(r.missingInformation.join(" ")).toContain("farklı varlıklara dağılmış");
  });

  it("alan var ama tipi sayısal değilse KPI hesaplanabilir sayılmaz", () => {
    const r = discoverBusiness({
      ...BASE,
      fieldNames: ["good_units", "total_units"],
      entityCounts: { product: 10 },
      entityFields: { product: ["good_units", "total_units"] },
      entityFieldTypes: {
        product: {
          good_units: { number: 10 },
          total_units: { string: 10 },
        },
      },
    });
    const fpy = r.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("partial");
    expect(fpy?.entity).toBe("product");
    expect(fpy?.scope).toBe("entity");
    expect(fpy?.missingFields).toHaveLength(0);
    expect(fpy?.matchedFields).toEqual(["good_units"]);
    expect(fpy?.nonNumericFields).toEqual(["total_units"]);
    expect(r.missingInformation.join(" ")).toContain("Sayısal olmayan alan");
  });

  it("tüm alanlar tek varlıkta ve sayısalsa KPI kullanılabilir olur", () => {
    const r = discoverBusiness({
      ...BASE,
      fieldNames: ["good_units", "total_units"],
      entityCounts: { product: 10 },
      entityFields: { product: ["good_units", "total_units"] },
      entityFieldTypes: {
        product: { good_units: { number: 10 }, total_units: { number: 10 } },
      },
    });
    const fpy = r.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("available");
    expect(fpy?.entity).toBe("product");
    expect(fpy?.nonNumericFields).toEqual([]);
  });

  it("paketler sürümlü ve formüllüdür", () => {
    expect(INDUSTRY_PACKS.length).toBeGreaterThanOrEqual(4);
    for (const pack of INDUSTRY_PACKS) {
      expect(pack.version).toBeGreaterThanOrEqual(1);
      for (const kpi of pack.kpis) {
        expect(kpi.formula.length).toBeGreaterThan(0);
        expect(kpi.requiredFields.length).toBeGreaterThan(0);
      }
    }
  });
});

const ORG_A = "org-disc-a";
const ORG_B = "org-disc-b";
const ORG_C = "org-disc-c";
const ORG_D = "org-disc-d";

describe("GET /api/discovery", () => {
  let ceoA: string;
  let guestA: string;
  let ceoC: string;
  let ceoD: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A"],
      [ORG_B, "B"],
      [ORG_C, "C"],
      [ORG_D, "D"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [id, name]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, role] of [
      ["disc-ceo-a", ORG_A, "ceo"],
      ["disc-guest-a", ORG_A, "guest"],
      ["disc-ceo-c", ORG_C, "ceo"],
      ["disc-ceo-d", ORG_D, "ceo"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@disc.test`, id, role, pw]
      );
    }

    await db.query(
      `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
       VALUES ('cfg-disc', $1, 'rest-generic', 'ERP', '{}'::jsonb, 'tester')`,
      [ORG_A]
    );
    for (let i = 0; i < 3; i++) {
      await db.query(
        `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data)
         VALUES ($1, $2, 'cfg-disc', 'product', $3, $4::jsonb)`,
        [
          `rec-disc-${i}`,
          ORG_A,
          `p-${i}`,
          JSON.stringify({
            fields: {
              machine_id: `M-${i}`,
              work_order: `WO-${i}`,
              downtime_minutes: 30,
              good_units: 90,
              total_units: 100,
            },
          }),
        ]
      );
    }

    // ORG_C: gerekli alanlar farklı varlıklara dağılmış — aynı org içinde
    // hepsi görünse de tek varlıkta birleşmediği için KPI hesaplanabilir değil.
    await db.query(
      `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
       VALUES ('cfg-disc-c', $1, 'rest-generic', 'ERP-C', '{}'::jsonb, 'tester')`,
      [ORG_C]
    );
    await db.query(
      `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data)
       VALUES ('rec-disc-c-order', $1, 'cfg-disc-c', 'order', 'o-1', $2::jsonb)`,
      [ORG_C, JSON.stringify({ fields: { good_units: 90 } })]
    );
    await db.query(
      `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data)
       VALUES ('rec-disc-c-product', $1, 'cfg-disc-c', 'product', 'p-1', $2::jsonb)`,
      [ORG_C, JSON.stringify({ fields: { total_units: 100 } })]
    );

    // ORG_D: alanlar aynı varlıkta ama biri metin tipinde — tip bilgisi
    // KPI'yı "kullanılabilir" saymamalı.
    await db.query(
      `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
       VALUES ('cfg-disc-d', $1, 'rest-generic', 'ERP-D', '{}'::jsonb, 'tester')`,
      [ORG_D]
    );
    await db.query(
      `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data)
       VALUES ('rec-disc-d-1', $1, 'cfg-disc-d', 'product', 'p-1', $2::jsonb)`,
      [ORG_D, JSON.stringify({ fields: { good_units: 90, total_units: "100" } })]
    );

    ceoA = await createSession("disc-ceo-a", ORG_A);
    guestA = await createSession("disc-guest-a", ORG_A);
    ceoC = await createSession("disc-ceo-c", ORG_C);
    ceoD = await createSession("disc-ceo-d", ORG_D);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await GET()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await GET()).status).toBe(403);
  });

  it("org verisinden keşif üretir ve KPI durumlarını hesaplar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      primary: { packId: string } | null;
      inputs: { fieldCount: number; entities: Record<string, number> };
      kpis: { kpi: { id: string }; availability: string; missingFields: string[] }[];
      catalog: unknown[];
    };
    expect(body.inputs.entities.product).toBe(3);
    expect(body.inputs.fieldCount).toBe(5);
    expect(body.primary?.packId).toBe("manufacturing");
    expect(body.catalog.length).toBeGreaterThanOrEqual(4);
    const fpy = body.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("available");
    const oee = body.kpis.find((k) => k.kpi.id === "oee");
    expect(oee?.missingFields).toContain("planned_production_time");
  });

  it("varlıklara dağılmış alanları 'hesaplanabilir' saymaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoC);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      primary: { packId: string } | null;
      kpis: { kpi: { id: string }; availability: string; entity: string | null; scope: string; partialEntities: string[] }[];
    };
    expect(body.primary?.packId).toBe("manufacturing");
    const fpy = body.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("partial");
    expect(fpy?.entity).toBeNull();
    expect(fpy?.scope).toBe("organization");
    expect(fpy?.partialEntities).toEqual(["order", "product"]);
  });

  it("metin tipindeki alanı hesaplamaya uygun saymaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoD);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kpis: {
        kpi: { id: string };
        availability: string;
        entity: string | null;
        missingFields: string[];
        nonNumericFields: string[];
        scope: string;
      }[];
    };
    const fpy = body.kpis.find((k) => k.kpi.id === "first_pass_yield");
    expect(fpy?.availability).toBe("partial");
    expect(fpy?.entity).toBe("product");
    expect(fpy?.scope).toBe("entity");
    expect(fpy?.missingFields).toHaveLength(0);
    expect(fpy?.nonNumericFields).toEqual(["total_units"]);
  });

  it("başka org'un verisi keşfe karışmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const bodyA = (await (await GET()).json()) as { inputs: { fieldCount: number } };
    expect(bodyA.inputs.fieldCount).toBe(5);

    const db = getDb();
    await db.query(
      `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
       VALUES ('disc-ceo-b', $1, 'b@disc.test', 'b', 'ceo', $2)`,
      [ORG_B, hashPassword("mevcut-parola-123")]
    );
    nextHeaders.__setTestCookie(SESSION_COOKIE, await createSession("disc-ceo-b", ORG_B));
    const bodyB = (await (await GET()).json()) as { inputs: { fieldCount: number }; primary: unknown };
    expect(bodyB.inputs.fieldCount).toBe(0);
    expect(bodyB.primary).toBeNull();
  });
});
