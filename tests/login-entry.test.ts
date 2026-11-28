import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-login-entry-${process.pid}-${randomUUID()}`
);
process.env.AUTH_COOKIE_SECURE = "false";

const store = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => store.set(name, value),
    delete: (name: string) => store.delete(name),
  }),
}));

class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super(`redirect:${path}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new RedirectSignal(target);
  },
}));

vi.mock("../src/app/login/LoginForm", () => ({
  LoginForm: () => null,
}));

vi.mock("../src/app/dashboard/dashboard-shell", () => ({
  DashboardShell: () => null,
}));

const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession, hashPassword, SESSION_COOKIE } = await import(
  "../src/lib/auth/core"
);
const { requireSession } = await import("../src/lib/auth/guard");
const { default: Home } = await import("../src/app/page");
const { default: LoginPage } = await import("../src/app/login/page");
const { default: DashboardLayout } = await import("../src/app/dashboard/layout");

const ORG = "org-login-entry";
let validSession = "";
let expiredSession = "";

beforeAll(async () => {
  await migrate();
  const db = getDb();
  await db.query(
    "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')",
    [ORG, "Login Entry Org"]
  );
  await db.query(
    "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      "login-entry-ceo",
      ORG,
      "ceo@login-entry.test",
      "Entry CEO",
      "ceo",
      hashPassword("entry-test-password"),
    ]
  );
  validSession = await createSession("login-entry-ceo", ORG);
  expiredSession = await createSession("login-entry-ceo", ORG);
  await db.query(
    "UPDATE sessions SET expires_at = '2000-01-01T00:00:00Z' WHERE id = $1",
    [expiredSession]
  );
});

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  await getDb().close();
});

describe("sunucu taraflı giriş kapısı", () => {
  it("genel giriş ekranında TAIS demo kimliğini veya demo kartı çevirilerini içermez", () => {
    const loginForm = readFileSync("src/app/login/LoginForm.tsx", "utf8");
    expect(loginForm).not.toContain("ceo@tais.demo");
    expect(loginForm).not.toContain("login.demoTitle");
    expect(loginForm).not.toContain("login.demoHint");
  });

  it("oturumsuz korumalı erişimi login'e yönlendirir", async () => {
    await expect(requireSession()).rejects.toMatchObject({ path: "/login" });
  });

  it("geçersiz çerezi login'e yönlendirir", async () => {
    store.set(SESSION_COOKIE, "gecersiz-oturum");
    await expect(requireSession()).rejects.toMatchObject({ path: "/login" });
  });

  it("süresi dolmuş oturumu login'e yönlendirir", async () => {
    store.set(SESSION_COOKIE, expiredSession);
    await expect(requireSession()).rejects.toMatchObject({ path: "/login" });
  });

  it("geçerli oturumda korumalı sayfayı açar", async () => {
    store.set(SESSION_COOKIE, validSession);
    await expect(requireSession()).resolves.toMatchObject({
      orgId: ORG,
      role: "ceo",
      displayName: "Entry CEO",
    });
  });

  it("kök adres oturumsuz kullanıcıyı login'e yönlendirir", async () => {
    await expect(Home()).rejects.toMatchObject({ path: "/login" });
  });

  it("kök adres oturumlu kullanıcıyı dashboard'a yönlendirir", async () => {
    store.set(SESSION_COOKIE, validSession);
    await expect(Home()).rejects.toMatchObject({ path: "/dashboard" });
  });

  it("login sayfası oturumlu kullanıcıyı dashboard'a yönlendirir", async () => {
    store.set(SESSION_COOKIE, validSession);
    await expect(
      LoginPage({ searchParams: Promise.resolve({}) })
    ).rejects.toMatchObject({ path: "/dashboard" });
  });

  it("login sayfası oturumsuz kullanıcıya formu render eder", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(page).toBeTruthy();
  });

  it("dashboard layout oturumsuz isteği login'e yönlendirir", async () => {
    await expect(
      DashboardLayout({ children: null })
    ).rejects.toMatchObject({ path: "/login" });
  });

  it("dashboard layout geçerli oturumla shell'i render eder", async () => {
    store.set(SESSION_COOKIE, validSession);
    await expect(DashboardLayout({ children: null })).resolves.toBeTruthy();
  });
});
