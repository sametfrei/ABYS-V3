import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-audit-export-${process.pid}-${randomUUID()}`
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
const { hasPermission } = await import("../src/lib/auth/permissions");
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const { GET: exportAudit } = await import("../src/app/api/audit/export/route");
const { recordAuditEvent } = await import("../src/lib/db/repos/audit");

const ORG_A = "org-audit-export-a";
const ORG_B = "org-audit-export-b";

const HEADER = "id,created_at,actor,type,summary,detail,prev_hash,entry_hash";

let auditorA = "";
let analystA = "";
let auditorB = "";

function get(url = "http://localhost/api/audit/export"): Request {
  return new Request(url);
}

describe("denetim günlüğü CSV dışa aktarımı", () => {
  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "Audit Export A"],
      [ORG_B, "Audit Export B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        name,
        "aviation",
      ]);
    }
    for (const [id, org, email, display, role] of [
      ["auditor-a", ORG_A, "auditor-a@test.local", "Denetçi A", "auditor"],
      ["analyst-a", ORG_A, "analyst-a@test.local", "Analist A", "analyst"],
      ["auditor-b", ORG_B, "auditor-b@test.local", "Denetçi B", "auditor"],
    ]) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, display, role, hashPassword("mevcut-parola-123")]
      );
    }
    auditorA = await createSession("auditor-a", ORG_A);
    analystA = await createSession("analyst-a", ORG_A);
    auditorB = await createSession("auditor-b", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("izni olmayan rol (analyst) 403 alır", async () => {
    expect(hasPermission("analyst", "view_audit")).toBe(false);
    nextHeaders.__setTestCookie(SESSION_COOKIE, analystA);
    expect((await exportAudit(get())).status).toBe(403);
  });

  it("oturum yoksa 401 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await exportAudit(get())).status).toBe(401);
  });

  it("geçersiz limit 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, auditorA);
    for (const bad of ["abc", "0", "-1", "1.5", "501"]) {
      const res = await exportAudit(get(`http://localhost/api/audit/export?limit=${encodeURIComponent(bad)}`));
      expect(res.status).toBe(400);
    }
  });

  it("hash sütunlarıyla CSV döner ve dışa aktarımı denetler", async () => {
    await recordAuditEvent({
      orgId: ORG_A,
      actor: "Sistem",
      type: "seed_event",
      summary: "Deneme",
      detail: "detay",
    });
    nextHeaders.__setTestCookie(SESSION_COOKIE, auditorA);
    const res = await exportAudit(get("http://localhost/api/audit/export?limit=10"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    const body = await res.text();
    const lines = body.split("\r\n");
    expect(lines[0]).toBe(HEADER);
    expect(body.endsWith("\r\n")).toBe(true);
    expect(body).toContain("seed_event");

    const exported = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = $2",
      [ORG_A, "audit_log_exported"]
    );
    expect(exported.rows).toHaveLength(1);
  });

  it("başka kurumun kayıtları görünmez", async () => {
    await recordAuditEvent({
      orgId: ORG_B,
      actor: "Sistem B",
      type: "foreign_event",
      summary: "Gizli",
      detail: null,
    });
    nextHeaders.__setTestCookie(SESSION_COOKIE, auditorA);
    const bodyA = await (await exportAudit(get("http://localhost/api/audit/export?limit=50"))).text();
    expect(bodyA).not.toContain("foreign_event");

    nextHeaders.__setTestCookie(SESSION_COOKIE, auditorB);
    const bodyB = await (await exportAudit(get("http://localhost/api/audit/export?limit=50"))).text();
    expect(bodyB).toContain("foreign_event");
    expect(bodyB).not.toContain("seed_event");
  });
});
