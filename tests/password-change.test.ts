import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-password-change-test-${process.pid}-${randomUUID()}`
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
const { createSession, getSession, hashPassword, verifyPassword } = await import(
  "../src/lib/auth/core"
);
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const { POST: changePassword } = await import("../src/app/api/auth/password/route");
const { resetRateLimits } = await import("../src/lib/rate-limit");

const ORIGINAL = "mevcut-guvenli-parola";
const NEW_PASSWORD = "yeni-guvenli-parola-42";

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/auth/password (self-service parola değiştirme)", () => {
  const org = "org-password-change";
  let session: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      org,
      "Parola Test Org",
      "aviation",
    ]);
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["pw-user", org, "pw@test.local", "PW Kullanıcı", "ceo", hashPassword(ORIGINAL)]
    );
    session = await createSession("pw-user", org);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    const res = await changePassword(req({ currentPassword: ORIGINAL, newPassword: NEW_PASSWORD }));
    expect(res.status).toBe(401);
  });

  it("mevcut parola yanlışsa 400 döner ve parola değişmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const res = await changePassword(req({ currentPassword: "yanlis-parola", newPassword: NEW_PASSWORD }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Mevcut parola");

    const r = await getDb().query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      ["pw-user"]
    );
    expect(verifyPassword(ORIGINAL, r.rows[0].password_hash)).toBe(true);
  });

  it("kısa yeni parola 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const res = await changePassword(req({ currentPassword: ORIGINAL, newPassword: "kisa" }));
    expect(res.status).toBe(400);
  });

  it("yeni parola mevcutla aynıysa 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const res = await changePassword(req({ currentPassword: ORIGINAL, newPassword: ORIGINAL }));
    expect(res.status).toBe(400);
  });

  it("beş hatalı mevcut parola denemesinden sonra 429 + Retry-After döner", async () => {
    resetRateLimits();
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    for (let i = 0; i < 5; i++) {
      const r = await changePassword(
        req({ currentPassword: "yanlis-parola", newPassword: NEW_PASSWORD })
      );
      expect(r.status).toBe(400);
    }
    const blocked = await changePassword(
      req({ currentPassword: "yanlis-parola", newPassword: NEW_PASSWORD })
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    resetRateLimits();
  });

  it("geçerli değişiklikte parola güncellenir, diğer oturumlar iptal edilir, audit'e parola yazılmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const otherSession = await createSession("pw-user", org);
    const res = await changePassword(
      req({ currentPassword: ORIGINAL, newPassword: NEW_PASSWORD })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const r = await getDb().query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      ["pw-user"]
    );
    expect(verifyPassword(NEW_PASSWORD, r.rows[0].password_hash)).toBe(true);
    expect(verifyPassword(ORIGINAL, r.rows[0].password_hash)).toBe(false);

    const audit = await getDb().query<{ summary: string; detail: string | null }>(
      "SELECT summary, detail FROM audit_events WHERE org_id = $1 AND type = 'password_changed'",
      [org]
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit.rows)).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(audit.rows)).not.toContain(ORIGINAL);

    // Parola değişimi diğer oturumları düşürür; mevcut oturum sürer.
    expect(await getSession(otherSession)).toBeNull();
    expect(await getSession(session)).not.toBeNull();
  });

  it("boşluklu parola kırpılmadan saklanır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const spaced = " bosluklu-parola-123 ";
    const res = await changePassword(
      req({ currentPassword: NEW_PASSWORD, newPassword: spaced })
    );
    expect(res.status).toBe(200);

    const r = await getDb().query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      ["pw-user"]
    );
    expect(verifyPassword(spaced, r.rows[0].password_hash)).toBe(true);
    expect(verifyPassword(spaced.trim(), r.rows[0].password_hash)).toBe(false);
  });
});
