import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  poolOptions: null as Record<string, unknown> | null,
  pglitePath: null as string | null,
  poolClosed: false,
}));

vi.mock("pg", () => ({
  Pool: class FakePool {
    constructor(options: Record<string, unknown>) { state.poolOptions = options; }
    async query() { return { rows: [{ ok: true }], rowCount: 1, fields: [], command: "SELECT" }; }
    async connect() {
      return {
        async query() { return { rows: [], rowCount: 0, fields: [], command: "SELECT" }; },
        release() {},
      };
    }
    async end() { state.poolClosed = true; }
  },
}));

vi.mock("@electric-sql/pglite", () => ({
  PGlite: class FakePGlite {
    constructor(path: string) { state.pglitePath = path; }
    async query() { return { rows: [], affectedRows: 0, fields: [] }; }
    async exec() { return []; }
    async transaction(callback: (tx: unknown) => Promise<unknown>) {
      return callback({ query: this.query.bind(this), exec: this.exec.bind(this) });
    }
    async close() {}
  },
}));

const { getDb } = await import("../src/lib/db/client");

afterEach(() => {
  globalThis.__abysDb = undefined;
  delete process.env.ABYS_DB_BACKEND;
  delete process.env.ABYS_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.PGSSLMODE;
  delete process.env.PGSSL_REJECT_UNAUTHORIZED;
  state.poolOptions = null;
  state.pglitePath = null;
  state.poolClosed = false;
});

describe("database backend selection", () => {
  it("selects PostgreSQL when ABYS_DATABASE_URL is configured", async () => {
    process.env.ABYS_DATABASE_URL = "postgresql://abys:test@localhost:5432/abys";
    process.env.PGSSLMODE = "require";
    process.env.ABYS_DB_POOL_MAX = "8";
    const db = getDb();
    expect(db.constructor.name).toBe("PostgresDatabaseAdapter");
    expect(state.poolOptions).toMatchObject({
      connectionString: process.env.ABYS_DATABASE_URL,
      max: 8,
      ssl: { rejectUnauthorized: true },
      application_name: "abys-app",
    });
    await db.close();
    expect(state.poolClosed).toBe(true);
  });

  it("prefers explicit PGlite mode even when DATABASE_URL exists", () => {
    process.env.ABYS_DB_BACKEND = "pglite";
    process.env.DATABASE_URL = "postgresql://ignored";
    process.env.ABYS_DB_DIR = ".data/abys-db";
    const db = getDb();
    expect(db.constructor.name).toBe("FakePGlite");
    expect(state.pglitePath).toBe(".data/abys-db");
    expect(state.poolOptions).toBeNull();
  });

  it("fails closed when PostgreSQL mode has no connection URL", () => {
    process.env.ABYS_DB_BACKEND = "postgres";
    expect(() => getDb()).toThrow(/requires ABYS_DATABASE_URL or DATABASE_URL/i);
  });
});
