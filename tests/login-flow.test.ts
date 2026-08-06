import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-login-flow-test-${process.pid}-${randomUUID()}`
);
process.env.AUTH_COOKIE_SECURE = "false";
process.env.TAIS_DEMO_ADMIN_EMAIL = "ceo@tais.demo";
process.env.TAIS_DEMO_ADMIN_PASSWORD = "abys-demo-2026";

const cookieWrites: Array<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieWrites.push({ name, value, options });
    },
  }),
}));

const { POST, SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { getDb, migrate } = await import("../src/lib/db/client");
const {
  authCookieIsSecure,
  verifyPassword,
} = await import("../src/lib/auth/core");
const {
  getLoginErrorMessage,
  LOGIN_INVALID_ERROR,
  LOGIN_SERVER_ERROR,
} = await import("../src/lib/auth/login-messages");

function loginRequest(email: string, password: string) {
  return new NextRequest("http://127.0.0.1/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await getDb().close();
});

describe("TAIS demo login flow", () => {
  it("invalid credentials return a visible Turkish authentication error", async () => {
    const response = await POST(loginRequest("ceo@tais.demo", "yanlis-parola"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: LOGIN_INVALID_ERROR });
    expect(getLoginErrorMessage(401, { error: LOGIN_INVALID_ERROR })).toBe(
      LOGIN_INVALID_ERROR
    );
  });

  it("valid credentials tolerate email casing and surrounding whitespace", async () => {
    const response = await POST(
      loginRequest("  CEO@TAIS.DEMO  ", "  abys-demo-2026  ")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: {
        email: "ceo@tais.demo",
        role: "ceo",
      },
    });
    expect(cookieWrites.at(-1)).toMatchObject({
      name: SESSION_COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      },
    });
  });

  it("existing TAIS user is synchronized to the documented password", async () => {
    const user = await getDb().query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      ["ceo@tais.demo"]
    );
    expect(user.rows).toHaveLength(1);
    expect(verifyPassword("abys-demo-2026", user.rows[0]!.password_hash)).toBe(true);
  });

  it("cookie security and client errors distinguish desktop/network/server cases", () => {
    expect(authCookieIsSecure({ NODE_ENV: "production", AUTH_COOKIE_SECURE: "false" })).toBe(
      false
    );
    expect(authCookieIsSecure({ NODE_ENV: "production", AUTH_COOKIE_SECURE: "true" })).toBe(
      true
    );
    expect(getLoginErrorMessage(500, null)).toBe(LOGIN_SERVER_ERROR);
  });
});
