import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-dq-score-${process.pid}-${randomUUID()}`
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
const { GET: scoreRoute } = await import("../src/app/api/data-quality/score/route");

const ORG = "org-dq-score";
const ORG_EMPTY = "org-dq-score-empty";

let session = "";
let emptySession = "";

function get(query = ""): Request {
  return new Request(`http://localhost/api/data-quality/score${query}`);
}

describe("veri kalitesi skoru API", () => {
  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const id of [ORG, ORG_EMPTY]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        id,
        "aviation",
      ]);
    }
    for (const [id, org] of [
      ["dq-user", ORG],
      ["dq-empty", ORG_EMPTY],
    ]) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@test.local`, id, "ceo", hashPassword("mevcut-parola-123")]
      );
    }
    await db.query(
      "INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by) VALUES ($1, $2, $3, $4, $5, $6)",
      ["ds-dq", ORG, "aviation", "test.csv", "kpi", "tester"]
    );
    const rows: Array<[string, string, string]> = [
      ["dq-1", "100", "2026-11-20T00:00:00Z"],
      ["dq-2", "101", "2026-11-19T00:00:00Z"],
      ["dq-3", "n/a", "2026-11-18T00:00:00Z"],
      ["dq-4", "", "2026-11-17T00:00:00Z"],
      ["dq-5", "100", "2026-11-20T00:00:00Z"],
      ["dq-6", "50", "2025-01-01T00:00:00Z"],
    ];
    for (const [id, value, createdAt] of rows) {
      await db.query(
        "INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG, "ds-dq", "Ciro", value, createdAt]
      );
    }
    session = await createSession("dq-user", ORG);
    emptySession = await createSession("dq-empty", ORG_EMPTY);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await scoreRoute(get())).status).toBe(401);
  });

  it("kayıtlı satırlardan dört boyutlu skor üretir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const res = await scoreRoute(get("?maxAgeDays=30"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      overall: number | null;
      worst: string | null;
      maxAgeDays: number;
      dimensions: Array<{ dimension: string; score: number | null; sample: number }>;
    };
    expect(body.total).toBe(6);
    expect(body.maxAgeDays).toBe(30);
    const byDim = Object.fromEntries(body.dimensions.map((d) => [d.dimension, d]));
    expect(byDim.completeness.score).toBeCloseTo(5 / 6, 4);
    expect(byDim.validity.score).toBeCloseTo(4 / 5, 4);
    expect(byDim.uniqueness.score).toBeCloseTo(4 / 5, 4);
    expect(byDim.freshness.score).toBeCloseTo(5 / 6, 4);
    expect(typeof body.overall).toBe("number");
    expect(body.worst).toBe("validity");
  });

  it("geçersiz maxAgeDays 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    for (const bad of ["abc", "0", "-1", "1.5", "4000"]) {
      expect((await scoreRoute(get(`?maxAgeDays=${encodeURIComponent(bad)}`))).status).toBe(400);
    }
  });

  it("boş kurumda skor null döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, emptySession);
    const body = (await (await scoreRoute(get())).json()) as { total: number; overall: number | null };
    expect(body.total).toBe(0);
    expect(body.overall).toBeNull();
  });
});
