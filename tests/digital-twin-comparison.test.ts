import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EnterpriseState } from "../src/lib/db/repos/enterprise-state";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-twin-compare-test-${process.pid}-${randomUUID()}`
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
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const { compareDigitalTwinScenario } = await import("../src/lib/digital-twin-comparison");
const { POST } = await import("../src/app/api/digital-twin/compare/route");

function baselineState(): EnterpriseState {
  return {
    orgId: "org-twin",
    asOf: "2026-01-01T00:00:00.000Z",
    entityCounts: [{ entity: "order", count: 2 }],
    financials: {
      byCurrency: [
        {
          currency: "TRY",
          orderValue: 1000,
          invoiceValue: 900,
          paymentValue: 400,
          accountBalance: 250,
          projectBudget: 100,
        },
        {
          currency: "USD",
          orderValue: 200,
          invoiceValue: 180,
          paymentValue: 100,
          accountBalance: 50,
          projectBudget: 20,
        },
      ],
      unclassifiedValueCount: 0,
      policy: "Para birimleri toplanmaz.",
    },
    operations: {
      inventoryQuantity: 50,
      projectCount: 2,
      orderCount: 10,
      invoiceCount: 9,
      paymentCount: 7,
      eventCount: 30,
    },
    kpis: [
      {
        label: "Gecikme oranı",
        value: 0.1,
        observedAt: "2026-01-01T00:00:00.000Z",
        thresholdStatus: "healthy",
        target: 0.08,
        unit: "ratio",
      },
    ],
    dependencies: [],
    risks: [],
    freshness: { lastSyncedAt: null, ageMinutes: null, stale: false, thresholdHours: 24 },
    coverage: {
      mode: "current",
      asOf: "2026-01-01T00:00:00.000Z",
      recordsRead: 2,
      canonicalEntities: 2,
      multiSourceEntities: 0,
      sourceCount: 1,
      truncated: false,
      graphNodeCount: 0,
      graphEdgeCount: 0,
      unresolvedReferenceCount: 0,
    },
    provenance: { source: "test", note: "fixture" },
  };
}

describe("dijital ikiz senaryo karşılaştırması", () => {
  it("açık deltaları aynı şemada uygular ve para birimlerini ayrı tutar", () => {
    const result = compareDigitalTwinScenario(
      baselineState(),
      {
        currencyAdjustments: [
          { currency: "TRY", accountBalance: -250 },
          { currency: "EUR", orderValue: 500 },
        ],
        operationAdjustments: { orderCount: 3, inventoryQuantity: -5 },
        kpiAdjustments: [{ label: "Gecikme oranı", value: 0.14 }],
        risks: [
          {
            code: "SCENARIO_DELAY",
            severity: "warning",
            title: "Teslim gecikmesi",
            evidence: "Senaryo varsayımı",
          },
        ],
      },
      "Tedarik gecikmesi"
    );

    expect(result.projected.financials.byCurrency).toHaveLength(3);
    expect(result.projected.financials.byCurrency.find((item) => item.currency === "TRY")?.accountBalance).toBe(0);
    expect(result.projected.financials.byCurrency.find((item) => item.currency === "USD")?.accountBalance).toBe(50);
    expect(result.projected.financials.byCurrency.find((item) => item.currency === "EUR")?.orderValue).toBe(500);
    expect(result.projected.operations.orderCount).toBe(13);
    expect(result.projected.operations.inventoryQuantity).toBe(45);
    expect(result.projected.kpis[0].thresholdStatus).toBe("not_recalculated");
    expect(result.summary).toMatchObject({
      currencies: ["EUR", "TRY"],
      newCurrencies: ["EUR"],
      changedOperationalMetrics: 2,
      changedKpis: 1,
      addedRisks: 1,
    });
    expect(result.assumptions.join(" ")).toContain("Para birimleri arasında dönüşüm");
  });

  it("bilinmeyen KPI ve negatif operasyon sonucunu reddeder", () => {
    expect(() =>
      compareDigitalTwinScenario(baselineState(), {
        kpiAdjustments: [{ label: "Olmayan KPI", value: 1 }],
      })
    ).toThrow(/bulunamadı/);
    expect(() =>
      compareDigitalTwinScenario(baselineState(), {
        operationAdjustments: { orderCount: -11 },
      })
    ).toThrow(/negatif olamaz/);
  });

  it("taşma üretebilecek senaryo deltalarını güvenli aralık dışında reddeder", () => {
    expect(() =>
      compareDigitalTwinScenario(baselineState(), {
        currencyAdjustments: [{ currency: "TRY", accountBalance: 1e308 }],
      })
    ).toThrow(/güvenli sayı aralığı/);
    expect(() =>
      compareDigitalTwinScenario(baselineState(), {
        operationAdjustments: { orderCount: 1e308 },
      })
    ).toThrow(/güvenli sayı aralığı/);
  });
});

describe("POST /api/digital-twin/compare", () => {
  const ORG = "org-twin-compare";
  let ceo: string;
  let guest: string;

  beforeAll(async () => {
    await migrate();
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Twin Compare', 'other')",
      [ORG]
    );
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, role] of [
      ["twin-ceo", "ceo"],
      ["twin-guest", "guest"],
    ] as const) {
      await getDb().query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG, `${id}@twin.test`, id, role, pw]
      );
    }
    ceo = await createSession("twin-ceo", ORG);
    guest = await createSession("twin-guest", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function request(body: unknown) {
    return POST(
      new NextRequest("http://localhost/api/digital-twin/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  const valid = {
    label: "API senaryosu",
    adjustments: {
      currencyAdjustments: [{ currency: "TRY", accountBalance: 100 }],
      operationAdjustments: { orderCount: 2 },
    },
  };

  it("oturum ve analiz izni ister", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await request(valid)).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guest);
    expect((await request(valid)).status).toBe(403);
  });

  it("mevcut ikizle karşılaştırma döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    const res = await request(valid);
    const body = (await res.json()) as {
      label: string;
      baseline: { operations: { orderCount: number } };
      projected: { operations: { orderCount: number } };
      provenance: { method: string };
    };
    expect(res.status).toBe(200);
    expect(body.label).toBe("API senaryosu");
    expect(body.projected.operations.orderCount).toBe(body.baseline.operations.orderCount + 2);
    expect(body.provenance.method).toBe("deterministic-explicit-delta/v1");
  });

  it("geçersiz gövdeyi 400 ile reddeder", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    expect((await request({ adjustments: { currencyAdjustments: [{ currency: "X" }] } })).status).toBe(400);
    expect(
      (
        await request({
          adjustments: {
            currencyAdjustments: [{ currency: "TRY", accountBalance: 1e308 }],
          },
        })
      ).status
    ).toBe(400);
  });
});
