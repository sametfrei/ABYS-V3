import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-optimization-test-${process.pid}-${randomUUID()}`
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
const { optimizeResourceAllocation, validateOptimizationInput } = await import(
  "../src/lib/optimization"
);
const { POST } = await import("../src/app/api/optimization/route");

const BUDGET = { id: "budget", label: "Bütçe", capacity: 100, unit: "TRY" };

describe("deterministik kaynak optimizasyonu", () => {
  it("tek kaynakta kapasiteyi en yüksek değerle kullanır", () => {
    const result = optimizeResourceAllocation({
      resources: [BUDGET],
      options: [
        {
          id: "a",
          label: "A girişimi",
          maxUnits: 10,
          valuePerUnit: 5,
          resourcesPerUnit: { budget: 10 },
        },
        {
          id: "b",
          label: "B girişimi",
          maxUnits: 5,
          valuePerUnit: 9,
          resourcesPerUnit: { budget: 20 },
        },
      ],
      objectiveLabel: "Katkı",
      valueUnit: "TRY",
    });
    expect(result.status).toBe("optimal");
    expect(result.objectiveValue).toBe(50);
    expect(result.allocations.find((item) => item.optionId === "a")?.units).toBe(10);
    expect(result.allocations.find((item) => item.optionId === "b")?.units).toBe(0);
    expect(result.resourceUsage.budget).toBe(100);
    expect(result.remaining.budget).toBe(0);
  });

  it("minimum taahhütleri zorunlu tutar ve kalan kapasiteyi dağıtır", () => {
    const result = optimizeResourceAllocation({
      resources: [BUDGET],
      options: [
        {
          id: "mandatory",
          label: "Zorunlu bakım",
          minUnits: 2,
          maxUnits: 2,
          valuePerUnit: 1,
          resourcesPerUnit: { budget: 10 },
        },
        {
          id: "growth",
          label: "Büyüme",
          maxUnits: 10,
          valuePerUnit: 2,
          resourcesPerUnit: { budget: 10 },
        },
      ],
    });
    expect(result.status).toBe("optimal");
    expect(result.allocations.find((item) => item.optionId === "mandatory")?.units).toBe(2);
    expect(result.allocations.find((item) => item.optionId === "growth")?.units).toBe(8);
    expect(result.objectiveValue).toBe(18);
  });

  it("birden fazla kaynağı birlikte kısıtlar", () => {
    const result = optimizeResourceAllocation({
      resources: [
        { id: "budget", label: "Bütçe", capacity: 30, unit: "TRY" },
        { id: "labor", label: "İş gücü", capacity: 3, unit: "kişi" },
      ],
      options: [
        {
          id: "a",
          label: "A",
          maxUnits: 3,
          valuePerUnit: 10,
          resourcesPerUnit: { budget: 10, labor: 1 },
        },
        {
          id: "b",
          label: "B",
          maxUnits: 2,
          valuePerUnit: 16,
          resourcesPerUnit: { budget: 15, labor: 1 },
        },
      ],
    });
    expect(result.status).toBe("optimal");
    expect(result.objectiveValue).toBe(32);
    expect(result.allocations.find((item) => item.optionId === "b")?.units).toBe(2);
    expect(result.resourceUsage).toEqual({ budget: 30, labor: 2 });
  });

  it("karşılanamayan minimum taahhüdü uygulanabilir diye göstermez", () => {
    const result = optimizeResourceAllocation({
      resources: [BUDGET],
      options: [
        {
          id: "a",
          label: "A",
          minUnits: 2,
          maxUnits: 2,
          valuePerUnit: 10,
          resourcesPerUnit: { budget: 60 },
        },
      ],
    });
    expect(result.status).toBe("infeasible");
    expect(result.infeasibility).toEqual([
      { resourceId: "budget", required: 120, capacity: 100 },
    ]);
  });

  it("düğüm sınırında sonucu optimal diye etiketlemez", () => {
    const result = optimizeResourceAllocation({
      resources: [BUDGET],
      options: Array.from({ length: 8 }, (_, index) => ({
        id: `item-${index}`,
        label: `Yatırım ${index}`,
        maxUnits: 20,
        valuePerUnit: 10 + index,
        resourcesPerUnit: { budget: 5 + index },
      })),
      maxNodes: 1,
    });
    expect(result.complete).toBe(false);
    expect(result.status).toBe("feasible");
    expect(result.note).toContain("optimal olduğu iddia edilmez");
  });

  it("aynı girdi için aynı sonucu üretir ve geçersiz kaynağı reddeder", () => {
    const input = {
      resources: [BUDGET],
      options: [
        {
          id: "a",
          label: "A",
          maxUnits: 3,
          valuePerUnit: 4,
          resourcesPerUnit: { budget: 25 },
        },
      ],
    };
    expect(optimizeResourceAllocation(input)).toEqual(optimizeResourceAllocation(input));
    expect(
      validateOptimizationInput({
        ...input,
        options: [{ ...input.options[0], resourcesPerUnit: { unknown: 2 } }],
      })[0].message
    ).toContain("Tanımsız kaynak");
  });

  it("taşma üretebilecek büyüklükteki girdiyi güvenli aralık dışında reddeder", () => {
    expect(() =>
      optimizeResourceAllocation({
        resources: [{ ...BUDGET, capacity: 1e308 }],
        options: [
          {
            id: "overflow",
            label: "Taşma",
            maxUnits: 1,
            valuePerUnit: 1,
            resourcesPerUnit: { budget: 1 },
          },
        ],
      })
    ).toThrow(/Kapasite/);
    expect(() =>
      optimizeResourceAllocation({
        resources: [BUDGET],
        options: [
          {
            id: "overflow",
            label: "Taşma",
            maxUnits: 1,
            valuePerUnit: 1e308,
            resourcesPerUnit: { budget: 1 },
          },
        ],
      })
    ).toThrow(/Birim değeri/);
  });
});

describe("POST /api/optimization", () => {
  const ORG = "org-optimizer";
  let ceo: string;
  let guest: string;

  beforeAll(async () => {
    await migrate();
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Optimizer', 'other')",
      [ORG]
    );
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, role] of [
      ["optimizer-ceo", "ceo"],
      ["optimizer-guest", "guest"],
    ] as const) {
      await getDb().query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG, `${id}@optimizer.test`, id, role, pw]
      );
    }
    ceo = await createSession("optimizer-ceo", ORG);
    guest = await createSession("optimizer-guest", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function request(body: unknown) {
    return POST(
      new NextRequest("http://localhost/api/optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  const valid = {
    resources: [BUDGET],
    options: [
      {
        id: "a",
        label: "A",
        maxUnits: 4,
        valuePerUnit: 10,
        resourcesPerUnit: { budget: 25 },
      },
    ],
  };

  it("oturum ve analiz izni ister", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await request(valid)).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guest);
    expect((await request(valid)).status).toBe(403);
  });

  it("deterministik sonucu provenance ile döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    const res = await request(valid);
    const body = (await res.json()) as {
      status: string;
      objectiveValue: number;
      provenance: { calculation: string; engine: string };
    };
    expect(res.status).toBe(200);
    expect(body.status).toBe("optimal");
    expect(body.objectiveValue).toBe(40);
    expect(body.provenance.calculation).toBe("deterministic");
    expect(body.provenance.engine).toContain("optimization.ts");
  });

  it("geçersiz kaynak veya eksik seçenekte 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    expect((await request({ resources: [], options: [] })).status).toBe(400);
    expect(
      (
        await request({
          ...valid,
          options: [{ ...valid.options[0], resourcesPerUnit: { missing: 1 } }],
        })
      ).status
    ).toBe(400);
  });

  it("aşırı büyük sayıyı ve düğüm sınırını 400 ile reddeder", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    const huge = await request({
      ...valid,
      options: [{ ...valid.options[0], valuePerUnit: 1e308 }],
    });
    expect(huge.status).toBe(400);
    const tooManyNodes = await request({ ...valid, maxNodes: 2_000_000 });
    expect(tooManyNodes.status).toBe(400);
  });
});
