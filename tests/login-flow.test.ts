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
// IP bazlı testler güvenilen proxy modunu varsayar; XFF yok sayma testi
// bu değişkeni geçici olarak kaldırır.
process.env.ABYS_TRUST_PROXY = "1";

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
const { checkLoginRate, recordLoginFailure, resetRateLimits } = await import(
  "../src/lib/rate-limit"
);

function loginRequest(email: string, password: string, ip = "203.0.113.10") {
  return new NextRequest("http://127.0.0.1/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
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
      loginRequest("  CEO@TAIS.DEMO  ", "abys-demo-2026")
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

  it("parola kırpılmaz: baş/son boşluklu deneme reddedilir", async () => {
    resetRateLimits();
    const response = await POST(
      loginRequest("ceo@tais.demo", "  abys-demo-2026  ", "203.0.113.77")
    );
    expect(response.status).toBe(401);
  });

  it("yanlış tipli e-posta/parola 500 değil 400 döner", async () => {
    resetRateLimits();
    const res = await POST(
      new NextRequest("http://127.0.0.1/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.99" },
        body: JSON.stringify({ email: 123, password: { nested: true } }),
      })
    );
    expect(res.status).toBe(400);
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

describe("login rate limiting (kaba kuvvet koruması)", () => {
  it("beş başarısız denemeden sonra aynı e-posta+IP için 429 + Retry-After döner", async () => {
    resetRateLimits();
    for (let i = 0; i < 5; i++) {
      const response = await POST(
        loginRequest("ceo@tais.demo", "yanlis-parola", "198.51.100.11")
      );
      expect(response.status).toBe(401);
    }

    const blocked = await POST(
      loginRequest("ceo@tais.demo", "yanlis-parola", "198.51.100.11")
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await blocked.json()).error).toContain("Çok fazla");
  });

  it("aynı IP'den farklı e-posta, IP tavanına kadar engellenmez", async () => {
    resetRateLimits();
    for (let i = 0; i < 5; i++) {
      await POST(loginRequest("ceo@tais.demo", "yanlis", "198.51.100.12"));
    }
    expect(
      (await POST(loginRequest("ceo@tais.demo", "yanlis", "198.51.100.12"))).status
    ).toBe(429);

    const other = await POST(loginRequest("baska@tais.demo", "yanlis", "198.51.100.12"));
    expect(other.status).toBe(401);
  });

  it("başarılı giriş e-posta+IP sayacını sıfırlar", async () => {
    resetRateLimits();
    for (let i = 0; i < 4; i++) {
      await POST(loginRequest("ceo@tais.demo", "yanlis", "198.51.100.13"));
    }

    const ok = await POST(
      loginRequest("ceo@tais.demo", "abys-demo-2026", "198.51.100.13")
    );
    expect(ok.status).toBe(200);

    const after = await POST(loginRequest("ceo@tais.demo", "yanlis", "198.51.100.13"));
    expect(after.status).toBe(401);
  });

  it("IP başına 20 başarısız denemeden sonra farklı e-postalar da engellenir", () => {
    resetRateLimits();
    const req = new Request("http://127.0.0.1/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.14" },
    });

    for (let i = 0; i < 20; i++) {
      const email = `user${i % 4}@example.test`;
      expect(checkLoginRate(req, email).allowed).toBe(true);
      recordLoginFailure(req, email);
    }

    expect(checkLoginRate(req, "new@example.test").allowed).toBe(false);
  });
});

describe("login rate limiting — X-Forwarded-For güveni (H1)", () => {
  const savedTrustProxy = process.env.ABYS_TRUST_PROXY;

  function reqWithIp(ip: string) {
    return new Request("http://127.0.0.1/api/auth/login", {
      headers: { "x-forwarded-for": ip },
    });
  }

  afterAll(() => {
    if (savedTrustProxy === undefined) delete process.env.ABYS_TRUST_PROXY;
    else process.env.ABYS_TRUST_PROXY = savedTrustProxy;
  });

  it("güvenilen proxy kapalıyken değişen XFF hesap kilidini atlatamaz", () => {
    resetRateLimits();
    delete process.env.ABYS_TRUST_PROXY;
    try {
      for (let i = 0; i < 5; i++) {
        const req = reqWithIp(`10.0.0.${i}`);
        expect(checkLoginRate(req, "kurban@example.test").allowed).toBe(true);
        recordLoginFailure(req, "kurban@example.test");
      }
      // Saldırgan yeni bir XFF uydursa bile e-posta kilidi devrede.
      expect(checkLoginRate(reqWithIp("10.9.9.9"), "kurban@example.test").allowed).toBe(false);
    } finally {
      process.env.ABYS_TRUST_PROXY = "1";
    }
  });

  it("güvenilir modda proxy'nin eklediği son hop kullanılır (ilk hop spoof edilemez)", () => {
    resetRateLimits();
    process.env.ABYS_TRUST_PROXY = "1";
    const spoofedFirstHop = reqWithIp("1.2.3.4, 203.0.113.50");
    for (let i = 0; i < 20; i++) {
      const email = `user${i % 4}@example.test`;
      expect(checkLoginRate(spoofedFirstHop, email).allowed).toBe(true);
      recordLoginFailure(spoofedFirstHop, email);
    }
    // Son hop (203.0.113.50) tavanı doldurdu; ilk hop değişse de engellenir.
    expect(checkLoginRate(reqWithIp("9.9.9.9, 203.0.113.50"), "new@example.test").allowed).toBe(
      false
    );
  });
});
