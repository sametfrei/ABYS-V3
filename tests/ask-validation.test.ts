import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-ask-validation-test-${process.pid}-${randomUUID()}`
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
const { POST: ask } = await import("../src/app/api/ask/route");

const ORG = "org-ask-validation";

function req(body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest("http://localhost/api/ask", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/ask girdi doğrulaması", () => {
  let session: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      ORG,
      "Ask Test Org",
      "aviation",
    ]);
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["ask-user", ORG, "ask@test.local", "Ask Kullanıcı", "ceo", hashPassword("parola-123456")]
    );
    session = await createSession("ask-user", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await ask(req({ question: "risk var mı?" }))).status).toBe(401);
  });

  it("sayısal question 500 değil 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    expect((await ask(req({ question: 123 }))).status).toBe(400);
  });

  it("boş/boşluk soru 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const res = await ask(req({ question: "   " }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Soru");
  });

  it("2000 karakterden uzun soru 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    expect((await ask(req({ question: "x".repeat(2001) }))).status).toBe(400);
  });
});
