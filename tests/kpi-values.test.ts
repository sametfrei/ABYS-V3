import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-values-test-${process.pid}-${randomUUID()}`
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
const kpiRoute = await import("../src/app/api/kpi-values/route");
const { GET: forecastGET } = await import("../src/app/api/forecast/route");

const ORG_A = "org-kv-a";
const ORG_B = "org-kv-b";

function kpiReq(method: string, body?: unknown, url = "http://localhost/api/kpi-values") {
  const req = new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(url);
  return req as unknown as Parameters<typeof kpiRoute.GET>[0];
}

describe("KPI değer girişi ve tahmin entegrasyonu", () => {
  let ceoA: string;
  let dataA: string;
  let guestA: string;
  let ceoB: string;
  let dataB: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A"],
      [ORG_B, "B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [id, name]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, role] of [
      ["kv-ceo-a", ORG_A, "ceo"],
      ["kv-data-a", ORG_A, "data_admin"],
      ["kv-guest-a", ORG_A, "guest"],
      ["kv-ceo-b", ORG_B, "ceo"],
      ["kv-data-b", ORG_B, "data_admin"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@kv.test`, id, role, pw]
      );
    }
    ceoA = await createSession("kv-ceo-a", ORG_A);
    dataA = await createSession("kv-data-a", ORG_A);
    guestA = await createSession("kv-guest-a", ORG_A);
    ceoB = await createSession("kv-ceo-b", ORG_B);
    dataB = await createSession("kv-data-b", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401, okuma/yazma izni ayrı uygulanır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await kpiRoute.GET(kpiReq("GET"))).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await kpiRoute.GET(kpiReq("GET"))).status).toBe(403);
    const post = await kpiRoute.POST(
      kpiReq("POST", { label: "Gelir", entries: [{ value: 1, observedAt: "2026-01-01T00:00:00Z" }] })
    );
    expect(post.status).toBe(403);
  });

  it("geçersiz tarih ve boş girdi 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, dataA);
    expect(
      (
        await kpiRoute.POST(
          kpiReq("POST", { label: "Gelir", entries: [{ value: 1, observedAt: "geçersiz" }] })
        )
      ).status
    ).toBe(400);
    expect((await kpiRoute.POST(kpiReq("POST", { label: "Gelir", entries: [] }))).status).toBe(400);
  });

  it("noktalar kaydedilir, sıralı okunur ve tahmin üretilir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, dataA);
    const entries = Array.from({ length: 8 }, (_, i) => ({
      value: 100 + i * 10,
      observedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      period: `2026-W${String(i + 1).padStart(2, "0")}`,
    }));
    const post = await kpiRoute.POST(kpiReq("POST", { label: "Haftalık gelir", entries }));
    const postText = await post.text();
    expect(post.status, postText).toBe(200);
    expect((JSON.parse(postText) as { written: number }).written).toBe(8);

    const get = await kpiRoute.GET(kpiReq("GET", undefined, "http://localhost/api/kpi-values?label=Haftal%C4%B1k%20gelir"));
    const body = (await get.json()) as { points: { value: number; observedAt: string; period: string | null }[] };
    expect(body.points.map((p) => p.value)).toEqual([100, 110, 120, 130, 140, 150, 160, 170]);
    expect(body.points.map((p) => p.period)).toEqual(entries.map((entry) => entry.period));
    expect(body.points[0].observedAt).toContain("2026-01-01");

    const forecast = await forecastGET({
      nextUrl: new URL("http://localhost/api/forecast?label=Haftal%C4%B1k%20gelir&horizon=2"),
    } as unknown as Parameters<typeof forecastGET>[0]);
    expect(forecast.status).toBe(200);
    const fbody = (await forecast.json()) as {
      insufficientData: boolean;
      forecast: { points: unknown[]; model: string } | null;
      history: { values: number[] };
    };
    expect(fbody.insufficientData).toBe(false);
    expect(fbody.history.values).toHaveLength(8);
    expect(fbody.forecast?.points).toHaveLength(2);
  });

  it("silme yalnızca kendi org'unun noktasını etkiler", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const get = await kpiRoute.GET(kpiReq("GET", undefined, "http://localhost/api/kpi-values?label=Haftal%C4%B1k%20gelir"));
    const body = (await get.json()) as { points: { id: string }[] };
    const target = body.points[0].id;

    nextHeaders.__setTestCookie(SESSION_COOKIE, dataB);
    const foreign = await kpiRoute.DELETE(kpiReq("DELETE", { id: target }));
    expect(foreign.status).toBe(404);

    nextHeaders.__setTestCookie(SESSION_COOKIE, dataA);
    const own = await kpiRoute.DELETE(kpiReq("DELETE", { id: target }));
    expect(own.status).toBe(200);

    const after = await kpiRoute.GET(kpiReq("GET", undefined, "http://localhost/api/kpi-values?label=Haftal%C4%B1k%20gelir"));
    expect(((await after.json()) as { points: unknown[] }).points).toHaveLength(7);
  });

  it("etiket özeti org izolasyonuna uyar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    const res = await kpiRoute.GET(kpiReq("GET"));
    const body = (await res.json()) as { labels: unknown[] };
    expect(body.labels).toHaveLength(0);
  });
});
