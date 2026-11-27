import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-users-api-test-${process.pid}-${randomUUID()}`
);

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
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
const { createSession, hashPassword, verifyPassword } = await import(
  "../src/lib/auth/core"
);
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const { GET: usersGET, POST: usersPOST } = await import("../src/app/api/users/route");
const { PATCH: userPATCH } = await import("../src/app/api/users/[id]/route");

function jsonRequest(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("kullanıcı yönetimi API'si", () => {
  const orgA = "orgA-users-test";
  const orgB = "orgB-users-test";
  let adminSession: string;
  let ceoSession: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgA,
      "A Org",
      "aviation",
    ]);
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgB,
      "B Org",
      "aviation",
    ]);

    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, email, role] of [
      ["user-admin", orgA, "admin@orgA.test", "sys_admin"],
      ["user-ceo", orgA, "ceo@orgA.test", "ceo"],
      ["user-target", orgA, "target@orgA.test", "analyst"],
      ["user-other", orgB, "other@orgB.test", "sys_admin"],
    ] as const) {

      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, id, role, pw]
      );
    }

    adminSession = await createSession("user-admin", orgA);
    ceoSession = await createSession("user-ceo", orgA);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    const res = await usersGET(new NextRequest("http://localhost/api/users"));
    expect(res.status).toBe(401);
  });

  it("manage_users izni olmayan rol 403 alır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await usersGET(new NextRequest("http://localhost/api/users"));
    expect(res.status).toBe(403);
  });

  it("GET yalnızca oturum org'unun kullanıcılarını döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const res = await usersGET(new NextRequest("http://localhost/api/users"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<{ email: string; orgId: string }> };
    expect(body.users.map((u) => u.email).sort()).toEqual([
      "admin@orgA.test",
      "ceo@orgA.test",
      "target@orgA.test",
    ]);
    expect(body.users.every((u) => u.orgId === orgA)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("son aktif sys_admin düşürülemez veya devre dışı bırakılamaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const demote = await userPATCH(
      jsonRequest("PATCH", "/api/users/user-admin", { role: "analyst" }),
      { params: Promise.resolve({ id: "user-admin" }) }
    );
    expect(demote.status).toBe(400);

    const disable = await userPATCH(
      jsonRequest("PATCH", "/api/users/user-admin", { status: "disabled" }),
      { params: Promise.resolve({ id: "user-admin" }) }
    );
    expect(disable.status).toBe(400);
  });

  it("yeni kullanıcı oluşturur, parolayı hash'ler ve hash'i döndürmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const res = await usersPOST(
      jsonRequest("POST", "/api/users", {
        email: "  Yeni.Kullanici@Orga.Test ",
        displayName: "Yeni Kullanıcı",
        role: "analyst",
        password: "guclu-parola-123",
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      user: { id: string; email: string; role: string; status: string };
    };
    expect(body.user.email).toBe("yeni.kullanici@orga.test");
    expect(body.user.role).toBe("analyst");
    expect(body.user.status).toBe("active");
    expect(JSON.stringify(body)).not.toContain("password");

    const r = await getDb().query<{ password_hash: string; org_id: string }>(
      "SELECT password_hash, org_id FROM users WHERE email = $1",
      ["yeni.kullanici@orga.test"]
    );
    expect(r.rows[0].org_id).toBe(orgA);
    expect(verifyPassword("guclu-parola-123", r.rows[0].password_hash)).toBe(true);
  });

  it("bilinmeyen rol ve kısa parola 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const badRole = await usersPOST(
      jsonRequest("POST", "/api/users", {
        email: "rol@orga.test",
        displayName: "Rol",
        role: "hacker",
        password: "guclu-parola-123",
      })
    );
    expect(badRole.status).toBe(400);

    const shortPw = await usersPOST(
      jsonRequest("POST", "/api/users", {
        email: "kisa@orga.test",
        displayName: "Kısa",
        role: "analyst",
        password: "kisa",
      })
    );
    expect(shortPw.status).toBe(400);
  });

  it("aynı e-posta tekrar oluşturulursa 409 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const res = await usersPOST(
      jsonRequest("POST", "/api/users", {
        email: "ceo@orga.test",
        displayName: "Kopya",
        role: "analyst",
        password: "guclu-parola-123",
      })
    );
    expect(res.status).toBe(409);
  });

  it("rol ve durum güncellenir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const roleRes = await userPATCH(
      jsonRequest("PATCH", "/api/users/user-target", { role: "risk_manager" }),
      { params: Promise.resolve({ id: "user-target" }) }
    );
    expect(roleRes.status).toBe(200);
    expect(((await roleRes.json()) as { user: { role: string } }).user.role).toBe("risk_manager");

    const statusRes = await userPATCH(
      jsonRequest("PATCH", "/api/users/user-target", { status: "disabled" }),
      { params: Promise.resolve({ id: "user-target" }) }
    );
    expect(statusRes.status).toBe(200);
    expect(((await statusRes.json()) as { user: { status: string } }).user.status).toBe(
      "disabled"
    );
  });

  it("yönetici parola sıfırlar; yeni parola geçerli olur ve audit'e parola yazılmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const newPassword = "yeni-sifre-parola-123";
    const res = await userPATCH(
      jsonRequest("PATCH", "/api/users/user-target", { password: newPassword }),
      { params: Promise.resolve({ id: "user-target" }) }
    );
    expect(res.status).toBe(200);

    const r = await getDb().query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      ["user-target"]
    );
    expect(verifyPassword(newPassword, r.rows[0].password_hash)).toBe(true);
    expect(verifyPassword("mevcut-parola-123", r.rows[0].password_hash)).toBe(false);

    const audit = await getDb().query<{ summary: string; detail: string | null }>(
      "SELECT summary, detail FROM audit_events WHERE org_id = $1 AND type = 'user_updated'",
      [orgA]
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit.rows)).not.toContain(newPassword);
  });

  it("kısa parola 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const res = await userPATCH(
      jsonRequest("PATCH", "/api/users/user-target", { password: "kisa" }),
      { params: Promise.resolve({ id: "user-target" }) }
    );
    expect(res.status).toBe(400);
  });

  it("başka org'un kullanıcısı güncellenemez (404)", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminSession);
    const res = await userPATCH(
      jsonRequest("PATCH", "/api/users/user-other", { role: "analyst" }),
      { params: Promise.resolve({ id: "user-other" }) }
    );
    expect(res.status).toBe(404);
  });
});
