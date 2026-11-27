import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-scenario-sim-test-${process.pid}-${randomUUID()}`
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
const { POST } = await import("../src/app/api/scenarios/route");
const { getTemplate } = await import("../src/lib/scenario-engine");
const { mulberry32, percentile, runMonteCarlo, sampleTriangular } = await import(
  "../src/lib/scenario-simulation"
);

const ORG = "org-sim";

function template() {
  const t = getTemplate("aviation", "turnaround-delay");
  if (!t) throw new Error("test şablonu bulunamadı");
  return t;
}

function postBody(body: unknown) {
  return new Request("http://localhost/api/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("Monte Carlo simülasyon motoru", () => {
  it("üçgensel örnekleme sınırların içinde kalır", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = sampleTriangular(rng(), 10, 20, 40);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(40);
      expect(Number.isFinite(x)).toBe(true);
    }
    expect(sampleTriangular(0.5, 5, 5, 5)).toBe(5);
  });

  it("yüzdelik sıralı dizide doğrusal interpolasyon yapar", () => {
    const sorted = [0, 10, 20, 30, 40];
    expect(percentile(sorted, 0)).toBe(0);
    expect(percentile(sorted, 0.5)).toBe(20);
    expect(percentile(sorted, 1)).toBe(40);
    expect(percentile([], 0.5)).toBe(0);
  });

  it("aynı tohum aynı dağılımı üretir (deterministik)", () => {
    const t = template();
    const inputs = { delayMin: 30, connections: 2, rushBags: 10 };
    const a = runMonteCarlo(t, inputs, { samples: 500, seed: 99 });
    const b = runMonteCarlo(t, inputs, { samples: 500, seed: 99 });
    expect(a.distribution).toEqual(b.distribution);
    expect(a.histogram).toEqual(b.histogram);
    expect(a.probabilityAboveBase).toBe(b.probabilityAboveBase);
  });

  it("P10 ≤ P50 ≤ P90 ve dağılım sonlu değerler içerir", () => {
    const t = template();
    const r = runMonteCarlo(t, { delayMin: 30, connections: 2, rushBags: 10 }, { samples: 800, seed: 5 });
    expect(r.samples).toBe(800);
    expect(r.distribution.p10).toBeLessThanOrEqual(r.distribution.p50);
    expect(r.distribution.p50).toBeLessThanOrEqual(r.distribution.p90);
    expect(r.distribution.min).toBeLessThanOrEqual(r.distribution.p10);
    expect(r.distribution.p90).toBeLessThanOrEqual(r.distribution.max);
    expect(Number.isFinite(r.distribution.mean)).toBe(true);
    expect(r.probabilityAboveBase).toBeGreaterThanOrEqual(0);
    expect(r.probabilityAboveBase).toBeLessThanOrEqual(1);
    expect(r.assumptions).toHaveLength(t.variables.length);
    expect(r.histogram.reduce((s, b) => s + b.count, 0)).toBe(800);
  });

  it("sıfır taban değerde bile sonlu sonuç verir", () => {
    const t = template();
    const r = runMonteCarlo(
      t,
      { delayMin: 0, connections: 0, rushBags: 0 },
      { samples: 200, seed: 1 }
    );
    expect(r.baseValue).toBe(0);
    expect(Number.isFinite(r.distribution.p90)).toBe(true);
    expect(r.probabilityAboveBase).toBeGreaterThanOrEqual(0);
  });

  it("örnek sayısı güvenli aralığa kırpılır", () => {
    const t = template();
    const r = runMonteCarlo(t, { delayMin: 30, connections: 2, rushBags: 10 }, { samples: 5 });
    expect(r.samples).toBe(200);
  });
});

describe("POST /api/scenarios — simülasyon", () => {
  let ceo: string;
  let guest: string;

  beforeAll(async () => {
    await migrate();
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)",
      [ORG, "Sim Org", "aviation"]
    );
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, role] of [
      ["sim-ceo", "ceo"],
      ["sim-guest", "guest"],
    ] as const) {
      await getDb().query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG, `${id}@sim.test`, id, role, pw]
      );
    }
    ceo = await createSession("sim-ceo", ORG);
    guest = await createSession("sim-guest", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("simulate=true dağılım döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    const res = await POST(
      postBody({
        sectorId: "aviation",
        templateId: "turnaround-delay",
        inputs: { delayMin: 30, connections: 2, rushBags: 10 },
        simulate: true,
        samples: 300,
        seed: 11,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs: unknown[];
      simulation: {
        samples: number;
        seed: number;
        distribution: { p10: number; p50: number; p90: number };
        assumptions: unknown[];
      } | null;
    };
    expect(body.runs).toHaveLength(3);
    expect(body.simulation?.samples).toBe(300);
    expect(body.simulation?.seed).toBe(11);
    expect(body.simulation?.distribution.p10).toBeLessThanOrEqual(
      body.simulation?.distribution.p90 ?? 0
    );
    expect(body.simulation?.assumptions).toHaveLength(3);
  });

  it("simulate yoksa simülasyon dönmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    const res = await POST(
      postBody({
        sectorId: "aviation",
        templateId: "turnaround-delay",
        inputs: { delayMin: 30, connections: 2, rushBags: 10 },
      })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { simulation: unknown }).simulation).toBeNull();
  });

  it("run_analysis izni olmayan oturum 403 alır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, guest);
    const res = await POST(
      postBody({
        sectorId: "aviation",
        templateId: "turnaround-delay",
        inputs: {},
        simulate: true,
      })
    );
    expect(res.status).toBe(403);
  });
});
