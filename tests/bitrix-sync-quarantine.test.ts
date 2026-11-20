import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-bitrix-quarantine-test-${process.pid}-${randomUUID()}`
);
process.env.BITRIX24_MODE = "live";

vi.mock("../src/lib/integrations/bitrix24/sync", () => ({
  runDemoSync: () => ({
    runId: "demo",
    mode: "demo",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "ok",
    importedCounts: {},
    errors: [],
    cursor: {},
    canonicalRecords: [],
  }),
  runLiveSync: async () => ({
    runId: "live-1",
    mode: "live",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "error",
    importedCounts: { companies: 2 },
    errors: [
      { entity: "contacts", message: "eşleme hatası: zorunlu alan yok" },
      { entity: "deals", message: "HTTP 500" },
    ],
    cursor: {},
    canonicalRecords: [],
  }),
}));

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
const { POST: syncRoute } = await import(
  "../src/app/api/integrations/bitrix24/sync/route"
);

const ORG = "org-bitrix-quarantine";

describe("Bitrix24 senkron hataları karantinaya yazılır", () => {
  let session: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      ORG,
      "Bitrix Org",
      "aviation",
    ]);
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["bitrix-user", ORG, "sync@bitrix.test", "Sync", "data_admin", hashPassword("parola-123456")]
    );
    session = await createSession("bitrix-user", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("her senkron hatası için karantina kaydı oluşur", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const res = await syncRoute();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { quarantined: number; errors: unknown[] };
    expect(body.errors.length).toBe(2);
    expect(body.quarantined).toBe(2);

    const rows = await getDb().query<{ source: string; entity: string; reason: string; status: string }>(
      "SELECT source, entity, reason, status FROM data_quality_issues WHERE org_id = $1 ORDER BY entity",
      [ORG]
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ source: "bitrix24", entity: "contacts", status: "pending" });
    expect(rows.rows[1]).toMatchObject({ source: "bitrix24", entity: "deals", status: "pending" });
    expect(rows.rows[0].reason).toContain("eşleme hatası");
  });
});
