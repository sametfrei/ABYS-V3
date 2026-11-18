import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-options-test-${process.pid}-${randomUUID()}`
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
const { POST } = await import("../src/app/api/decision-options/evaluate/route");
const { evaluateOptions, validateInputs } = await import("../src/lib/decision-options");

const CRITERIA = [
  { id: "cost", label: "Maliyet", direction: "minimize" as const, weight: 2 },
  { id: "risk", label: "Risk", direction: "minimize" as const, weight: 1 },
  { id: "growth", label: "Büyüme", direction: "maximize" as const, weight: 1 },
];

describe("Çok kriterli seçenek değerlendirmesi", () => {
  it("eksik skor ve tekrarlı kimlikleri reddeder", () => {
    const issues = validateInputs(CRITERIA, [
      { id: "a", label: "A", scores: { cost: 1, risk: 2 } },
      { id: "a", label: "A2", scores: { cost: 1, risk: 2, growth: 3 } },
    ]);
    expect(issues.some((i) => i.message.includes("Skor sayısal"))).toBe(true);
    expect(issues.some((i) => i.message.includes("tekrarlı"))).toBe(true);
  });

  it("minimize kriterinde düşük değeri üstün sayar", () => {
    const r = evaluateOptions(CRITERIA, [
      { id: "ucuz", label: "Ucuz", scores: { cost: 10, risk: 5, growth: 50 } },
      { id: "pahali", label: "Pahalı", scores: { cost: 20, risk: 5, growth: 50 } },
    ]);
    const cheap = r.options.find((o) => o.id === "ucuz")!;
    const pricey = r.options.find((o) => o.id === "pahali")!;
    expect(cheap.normalized.cost).toBeGreaterThan(pricey.normalized.cost);
    expect(cheap.weightedScore).toBeGreaterThan(pricey.weightedScore);
    expect(cheap.rank).toBe(1);
    expect(pricey.dominatedBy).toContain("ucuz");
  });

  it("Pareto sınırı ödünleşimleri korur, baskın seçeneği eler", () => {
    const r = evaluateOptions(CRITERIA, [
      { id: "dengeli", label: "Dengeli", scores: { cost: 10, risk: 10, growth: 60 } },
      { id: "riskli", label: "Riskli", scores: { cost: 20, risk: 20, growth: 90 } },
      { id: "kotu", label: "Kötü", scores: { cost: 30, risk: 30, growth: 40 } },
    ]);
    expect(r.frontier).toEqual(["dengeli", "riskli"]);
    expect(r.options.find((o) => o.id === "kotu")?.onParetoFrontier).toBe(false);
    expect(r.options.find((o) => o.id === "kotu")?.dominatedBy.length).toBe(2);
  });

  it("ağırlıklar normalize edilir ve skor 0–100 aralığındadır", () => {
    const r = evaluateOptions(CRITERIA, [
      { id: "a", label: "A", scores: { cost: 10, risk: 1, growth: 10 } },
      { id: "b", label: "B", scores: { cost: 20, risk: 2, growth: 20 } },
    ]);
    const sum = Object.values(r.normalizedWeights).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 5);
    for (const o of r.options) {
      expect(o.weightedScore).toBeGreaterThanOrEqual(0);
      expect(o.weightedScore).toBeLessThanOrEqual(100);
    }
  });

  it("fark olmayan kriter nötr kabul edilir", () => {
    const r = evaluateOptions(
      [{ id: "x", label: "X", direction: "maximize", weight: 1 }],
      [
        { id: "a", label: "A", scores: { x: 5 } },
        { id: "b", label: "B", scores: { x: 5 } },
      ]
    );
    expect(r.options.every((o) => o.normalized.x === 0.5)).toBe(true);
    expect(r.options.every((o) => o.onParetoFrontier)).toBe(true);
  });
});

const ORG = "org-opt";

describe("POST /api/decision-options/evaluate", () => {
  let ceo: string;
  let guest: string;

  beforeAll(async () => {
    await migrate();
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Opt', 'aviation')", [ORG]);
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, role] of [
      ["opt-ceo", "ceo"],
      ["opt-guest", "guest"],
    ] as const) {
      await getDb().query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG, `${id}@opt.test`, id, role, pw]
      );
    }
    ceo = await createSession("opt-ceo", ORG);
    guest = await createSession("opt-guest", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function req(body: unknown) {
    return POST(
      new Request("http://localhost/api/decision-options/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as unknown as Parameters<typeof POST>[0]
    );
  }

  const valid = {
    criteria: CRITERIA,
    options: [
      { id: "a", label: "A", scores: { cost: 10, risk: 1, growth: 10 } },
      { id: "b", label: "B", scores: { cost: 20, risk: 2, growth: 20 } },
    ],
  };

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await req(valid)).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guest);
    expect((await req(valid)).status).toBe(403);
  });

  it("geçerli girdi için sıralama ve Pareto sınırı döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    const res = await req(valid);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      options: { id: string; rank: number; onParetoFrontier: boolean }[];
      frontier: string[];
      provenance: { engine: string };
    };
    expect(body.options[0].id).toBe("a");
    expect(body.frontier).toEqual(["a", "b"]);
    expect(body.provenance.engine).toContain("decision-options.ts");
  });

  it("geçersiz gövde ve eksik skor 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceo);
    expect((await req({ criteria: [], options: [] })).status).toBe(400);
    const missing = {
      criteria: CRITERIA,
      options: [
        { id: "a", label: "A", scores: { cost: 1 } },
        { id: "b", label: "B", scores: { cost: 2, risk: 1, growth: 1 } },
      ],
    };
    expect((await req(missing)).status).toBe(400);
  });
});
