import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-login-bootstrap-${process.pid}-${randomUUID()}`
);
process.env.AUTH_COOKIE_SECURE = "false";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { POST } = await import("../src/app/api/auth/login/route");
const { getDb } = await import("../src/lib/db/client");

afterAll(async () => {
  await getDb().close();
});

describe("taze kurulum login başlangıcı", () => {
  it("demo hesabı oluşturmadan şemayı hazırlar ve kimlik doğrulama hatası döndürür", async () => {
    const response = await POST(
      new NextRequest("http://127.0.0.1/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "yok@example.test", password: "gecersiz-parola" }),
      })
    );
    expect(response.status).toBe(401);

    const state = await getDb().query<{
      users: number;
      latest_migration: number;
      migration_18: number;
    }>(
      `SELECT (SELECT count(*)::int FROM users) AS users,
              (SELECT max(id)::int FROM _migrations) AS latest_migration,
              (SELECT count(*)::int FROM _migrations WHERE id = 18) AS migration_18`
    );
    expect(state.rows[0].users).toBe(0);
    expect(state.rows[0].migration_18).toBe(0);
    expect(state.rows[0].latest_migration).toBeGreaterThan(23);
  });
});
