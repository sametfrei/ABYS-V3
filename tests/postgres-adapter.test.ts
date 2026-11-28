import { describe, expect, it, vi } from "vitest";
import { PostgresDatabaseAdapter } from "../src/lib/db/postgres-adapter";

function result(rows: Record<string, unknown>[] = [], rowCount: number | null = rows.length) {
  return {
    rows,
    rowCount,
    fields: [],
    command: "SELECT",
    oid: 0,
  };
}

function fakePool() {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      calls.push(`client:${sql}`);
      return result([{ ok: true }], sql === "UPDATE demo SET value=1" ? 1 : 0);
    }),
    release: vi.fn(() => calls.push("release")),
  };
  const pool = {
    query: vi.fn(async (sql: string) => {
      calls.push(`pool:${sql}`);
      return result([{ value: 42 }], 1);
    }),
    connect: vi.fn(async () => client),
    end: vi.fn(async () => { calls.push("end"); }),
  };
  return { pool, client, calls };
}

describe("PostgresDatabaseAdapter", () => {
  it("normalizes pg query results to the PGlite repository contract", async () => {
    const { pool } = fakePool();
    const db = new PostgresDatabaseAdapter(pool as never);
    const response = await db.query<{ value: number }>("SELECT 42 AS value");
    expect(response.rows).toEqual([{ value: 42 }]);
    expect(response.affectedRows).toBe(1);
    expect(response.fields).toEqual([]);
    expect(pool.query).toHaveBeenCalledWith("SELECT 42 AS value", undefined);
  });

  it("executes migrations through the pool query interface", async () => {
    const { pool } = fakePool();
    const db = new PostgresDatabaseAdapter(pool as never);
    await db.exec("CREATE TABLE a(id int); CREATE TABLE b(id int);");
    expect(pool.query).toHaveBeenCalledWith("CREATE TABLE a(id int); CREATE TABLE b(id int);");
  });

  it("pins every transaction statement to one client and commits", async () => {
    const { pool, client, calls } = fakePool();
    const db = new PostgresDatabaseAdapter(pool as never);
    const value = await db.transaction(async (tx) => {
      await tx.query("UPDATE demo SET value=1");
      await tx.query("SELECT value FROM demo");
      return "committed";
    });
    expect(value).toBe("committed");
    expect(calls).toEqual([
      "client:BEGIN",
      "client:UPDATE demo SET value=1",
      "client:SELECT value FROM demo",
      "client:COMMIT",
      "release",
    ]);
    expect(pool.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back on callback failure and always releases the client", async () => {
    const { pool, calls, client } = fakePool();
    const db = new PostgresDatabaseAdapter(pool as never);
    await expect(db.transaction(async (tx) => {
      await tx.query("UPDATE demo SET value=1");
      throw new Error("forced failure");
    })).rejects.toThrow("forced failure");
    expect(calls).toEqual([
      "client:BEGIN",
      "client:UPDATE demo SET value=1",
      "client:ROLLBACK",
      "release",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("holds a session advisory lock on one dedicated connection during migrations", async () => {
    const { pool, calls, client } = fakePool();
    const db = new PostgresDatabaseAdapter(pool as never);
    await db.withMigrationLock(async () => { calls.push("migration-work"); });
    expect(calls).toEqual([
      "client:SELECT pg_advisory_lock(194827361, 42)",
      "migration-work",
      "client:SELECT pg_advisory_unlock(194827361, 42)",
      "release",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("closes the connection pool", async () => {
    const { pool } = fakePool();
    const db = new PostgresDatabaseAdapter(pool as never);
    await db.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
