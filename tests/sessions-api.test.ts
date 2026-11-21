import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-sessions-api-test-${process.pid}-${randomUUID()}`
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
const { createSession, getSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET: listSessions, DELETE: revokeSession } = await import(
  "../src/app/api/auth/sessions/route"
);

const ORG = "org-sessions";
const OTHER_ORG = "org-sessions-other";

function delReq(body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest("http://localhost/api/auth/sessions", {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });
}

describe("oturum yönetimi API'si", () => {
  let current: string;
  let otherA: string;
  let otherB: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG, "Oturum Org"],
      [OTHER_ORG, "Diğer Oturum Org"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        name,
        "aviation",
      ]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, email] of [
      ["sess-user-a", ORG, "a@sessions.test"],
      ["sess-user-b", ORG, "b@sessions.test"],
      ["sess-user-c", OTHER_ORG, "c@sessions.test"],
    ]) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, id, "ceo", pw]
      );
    }

    current = await createSession(
      "sess-user-a",
      ORG,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    );
    otherA = await createSession("sess-user-a", ORG);
    otherB = await createSession("sess-user-b", ORG);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await listSessions()).status).toBe(401);
  });

  it("yalnızca kullanıcının kendi aktif oturumlarını listeler", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, current);
    const res = await listSessions();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessions: Array<{ id: string; current: boolean; createdAt: string; expiresAt: string }>;
    };
    const ids = body.sessions.map((s) => s.id).sort();
    expect(ids).toEqual([current, otherA].sort());
    expect(body.sessions.find((s) => s.id === current)?.current).toBe(true);
    expect(body.sessions.find((s) => s.id === otherA)?.current).toBe(false);
    // Başka kullanıcının oturumu listing'de yok.
    expect(ids).not.toContain(otherB);
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("cihaz bilgisi ve son görülme yalnızca oturum sahibine döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, current);
    const body = (await (await listSessions()).json()) as {
      sessions: Array<{ id: string; userAgent: string | null; lastSeenAt: string }>;
    };
    const mine = body.sessions.find((s) => s.id === current);
    expect(mine?.userAgent).toContain("Macintosh");
    expect(typeof mine?.lastSeenAt).toBe("string");
    // Diğer kullanıcının satırı hâlâ listede değil.
    expect(body.sessions.some((s) => s.id === otherB)).toBe(false);
  });

  it("son görülme beş dakikadan eskiyse güncellenir", async () => {
    const db = getDb();
    await db.query(
      "UPDATE sessions SET last_seen_at = now() - interval '1 hour' WHERE id = $1",
      [current]
    );
    expect(await getSession(current)).not.toBeNull();
    const r = await db.query<{ last_seen_at: Date | string }>(
      "SELECT last_seen_at FROM sessions WHERE id = $1",
      [current]
    );
    const value = r.rows[0]?.last_seen_at;
    const seenAt = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    expect(Date.now() - seenAt).toBeLessThan(60_000);
  });

  it("başka kullanıcının oturumu iptal edilemez (404)", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, current);
    const res = await revokeSession(delReq({ id: otherB }));
    expect(res.status).toBe(404);
    expect(await getSession(otherB)).not.toBeNull();
  });

  it("tek oturum iptal edilir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, current);
    const res = await revokeSession(delReq({ id: otherA }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { revoked: number }).revoked).toBe(1);
    expect(await getSession(otherA)).toBeNull();
    expect(await getSession(current)).not.toBeNull();
  });

  it("diğer tüm oturumlar iptal edilir, mevcut oturum sürer", async () => {
    const extra1 = await createSession("sess-user-a", ORG);
    const extra2 = await createSession("sess-user-a", ORG);
    nextHeaders.__setTestCookie(SESSION_COOKIE, current);
    const res = await revokeSession(delReq({ allOthers: true }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { revoked: number }).revoked).toBe(2);
    expect(await getSession(extra1)).toBeNull();
    expect(await getSession(extra2)).toBeNull();
    expect(await getSession(current)).not.toBeNull();
  });

  it("geçersiz gövde 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, current);
    expect((await revokeSession(delReq({}))).status).toBe(400);
    expect((await revokeSession(delReq({ id: current, allOthers: true }))).status).toBe(400);
  });
});
