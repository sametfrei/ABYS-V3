import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-org-migration-guard-${process.pid}-${randomUUID()}`
);
delete process.env.ABYS_MIGRATION_18_APPROVED;

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
const { GET: organizationsGET } = await import("../src/app/api/organizations/route");
const { GET: consolidationGET } = await import(
  "../src/app/api/organizations/consolidation/route"
);

const ORG = "org-migration-guard";

beforeAll(async () => {
  await migrate();
  await getDb().query(
    "INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Guard Org', 'other')",
    [ORG]
  );
  await getDb().query(
    "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, 'Guard CEO', 'ceo', $4)",
    ["guard-ceo", ORG, "guard@example.test", hashPassword("mevcut-parola-123")]
  );
  nextHeaders.__setTestCookie(SESSION_COOKIE, await createSession("guard-ceo", ORG));
});

afterAll(async () => {
  nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  await getDb().close();
});

describe("migration 18 onay kapısı", () => {
  it("hiyerarşi uçları ham SQL hatası yerine açık 503 ve yapılandırılmış kod döndürür", async () => {
    for (const handler of [organizationsGET, consolidationGET]) {
      const res = await handler();
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        code: "MIGRATION_APPROVAL_REQUIRED",
        migration: { id: 18, approvalEnv: "ABYS_MIGRATION_18_APPROVED" },
      });
    }
  });

  it("migration 21 onay bekleyen 18'den bağımsız uygulanır", async () => {
    const applied = await getDb().query<{ id: number }>("SELECT id FROM _migrations ORDER BY id");
    const ids = applied.rows.map((row) => row.id);
    expect(ids).not.toContain(18);
    expect(ids).toContain(20);
    expect(ids).toContain(21);
    expect(ids).toContain(22);
    const table = await getDb().query<{ name: string | null }>(
      "SELECT to_regclass('public.business_profiles') AS name"
    );
    expect(table.rows[0].name).toBe("business_profiles");
  });
});
