import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-api-robustness-test-${process.pid}-${randomUUID()}`
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
const { POST: assessRisk } = await import("../src/app/api/assess-risk/route");
const { POST: scenarios } = await import("../src/app/api/scenarios/route");
const { POST: migrateLocal } = await import("../src/app/api/migrate-local/route");
const { POST: createKey } = await import("../src/app/api/integration/keys/route");
const { POST: briefing } = await import("../src/app/api/briefing/route");

const ORG = "org-api-robustness";

function post(route: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("API tip karışıklığı 500 yerine 400 döner", () => {
  let ceoSession: string;
  let dataAdminSession: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      ORG,
      "Robustness Org",
      "aviation",
    ]);
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, email, role] of [
      ["rob-ceo", "ceo@rob.test", "ceo"],
      ["rob-data", "data@rob.test", "data_admin"],
    ]) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG, email, id, role, pw]
      );
    }
    ceoSession = await createSession("rob-ceo", ORG);
    dataAdminSession = await createSession("rob-data", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("assess-risk: sayısal sectorId -> 400", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
    const res = await assessRisk(post("/api/assess-risk", { sectorId: 123, data: "x" }));
    expect(res.status).toBe(400);
  });

  it("briefing: oturumsuz ve demo kapalıyken 401", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    const res = await briefing(post("/api/briefing", { companyName: 123 }));
    expect(res.status).toBe(401);
  });

  it("scenarios: sayısal sectorId -> 400", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await scenarios(post("/api/scenarios", { sectorId: 123 }));
    expect(res.status).toBe(400);
  });

  it("migrate-local: sayısal sectorId -> 400", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
    const res = await migrateLocal(post("/api/migrate-local", { sectorId: 123 }));
    expect(res.status).toBe(400);
  });

  it("integration/keys: sayısal name -> 400", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
    const res = await createKey(post("/api/integration/keys", { name: 123 }));
    expect(res.status).toBe(400);
  });
});
