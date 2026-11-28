import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.ABYS_DB_DIR = path.join(os.tmpdir(), "abys-saved-reports-" + process.pid + "-" + randomUUID());

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
    __setCookie: (name: string, value: string | undefined) => {
      if (value === undefined) store.delete(name);
      else store.set(name, value);
    },
  };
});

const nextHeaders = (await import("next/headers")) as unknown as {
  __setCookie: (name: string, value: string | undefined) => void;
};
const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession, hashPassword, SESSION_COOKIE } = await import("../src/lib/auth/core");
const { GET: list, POST: create } = await import("../src/app/api/reports/route");
const { DELETE: remove } = await import("../src/app/api/reports/[id]/route");

const ORG_A = "reports-tenant-a";
const ORG_B = "reports-tenant-b";

describe("tenant-scoped saved reports", () => {
  let analyst: string;
  let board: string;
  let otherTenant: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id,name,sector_id) VALUES ($1,'Reports A','other'),($2,'Reports B','other')", [ORG_A, ORG_B]);
    const passwordHash = hashPassword("reports-test-password");
    for (const [id, org, role] of [
      ["reports-analyst", ORG_A, "analyst"],
      ["reports-board", ORG_A, "board"],
      ["reports-other", ORG_B, "analyst"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id,org_id,email,display_name,role,password_hash) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, org, id + "@test.local", id, role, passwordHash]
      );
    }
    analyst = await createSession("reports-analyst", ORG_A);
    board = await createSession("reports-board", ORG_A);
    otherTenant = await createSession("reports-other", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("creates, lists, authorizes and soft-deletes reports without crossing tenants", async () => {
    nextHeaders.__setCookie(SESSION_COOKIE, analyst);
    const created = await create(new NextRequest("http://localhost/api/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Monthly KPI review", reportType: "analysis", content: "Revenue +12%; margin -2pp." }),
    }));
    expect(created.status).toBe(201);
    const { id } = await created.json() as { id: string };

    const listed = await list();
    expect((await listed.json() as { reports: { id: string; roleId: string }[] }).reports).toMatchObject([
      { id, roleId: "analyst" },
    ]);

    nextHeaders.__setCookie(SESSION_COOKIE, board);
    const denied = await create(new NextRequest("http://localhost/api/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Not allowed", content: "No write access." }),
    }));
    expect(denied.status).toBe(403);

    nextHeaders.__setCookie(SESSION_COOKIE, otherTenant);
    const otherList = await list();
    expect((await otherList.json() as { reports: unknown[] }).reports).toEqual([]);

    nextHeaders.__setCookie(SESSION_COOKIE, analyst);
    const deleted = await remove(new NextRequest("http://localhost/api/reports/" + id, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
    expect(deleted.status).toBe(200);
    const afterDelete = await list();
    expect((await afterDelete.json() as { reports: unknown[] }).reports).toEqual([]);
    const persisted = await getDb().query<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM saved_reports WHERE org_id=$1 AND id=$2",
      [ORG_A, id]
    );
    expect(persisted.rows[0]?.deleted_at).not.toBeNull();
  });
});
