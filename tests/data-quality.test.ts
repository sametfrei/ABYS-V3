import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-data-quality-test-${process.pid}-${randomUUID()}`
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
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET: dqGet, POST: dqPost, PATCH: dqPatch } = await import(
  "../src/app/api/data-quality/route"
);

const ORG_A = "org-dq-a";
const ORG_B = "org-dq-b";

function req(method: string, url: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("veri kalitesi karantinası API'si", () => {
  let adminA: string;
  let adminB: string;
  let ceoA: string;
  let issueId: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A Org"],
      [ORG_B, "B Org"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        name,
        "aviation",
      ]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, email, role] of [
      ["dq-admin-a", ORG_A, "admin@dq-a.test", "data_admin"],
      ["dq-admin-b", ORG_B, "admin@dq-b.test", "data_admin"],
      ["dq-ceo-a", ORG_A, "ceo@dq-a.test", "ceo"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, id, role, pw]
      );
    }
    adminA = await createSession("dq-admin-a", ORG_A);
    adminB = await createSession("dq-admin-b", ORG_B);
    ceoA = await createSession("dq-ceo-a", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await dqGet(req("GET", "/api/data-quality"))).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    expect((await dqGet(req("GET", "/api/data-quality"))).status).toBe(403);
  });

  it("yanlış tipli alan 400, aşırı payload 400", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    expect(
      (await dqPost(req("POST", "/api/data-quality", { source: 123, entity: "x", reason: "r" })))
        .status
    ).toBe(400);

    expect(
      (
        await dqPost(
          req("POST", "/api/data-quality", {
            source: "bitrix24",
            entity: "companies",
            reason: "r",
            payload: { blob: "x".repeat(9000) },
          })
        )
      ).status
    ).toBe(400);
  });

  it("karantina kaydı oluşturur ve listeler", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const created = await dqPost(
      req("POST", "/api/data-quality", {
        source: "bitrix24",
        entity: "companies",
        sourceRef: "crm-42",
        reason: "zorunlu alan eksik",
        payload: { district: null },
      })
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      issue: { id: string; status: string; sourceRef: string; payload: unknown };
    };
    issueId = body.issue.id;
    expect(body.issue.status).toBe("pending");
    expect(body.issue.sourceRef).toBe("crm-42");
    expect(body.issue.payload).toEqual({ district: null });

    const list = await dqGet(req("GET", "/api/data-quality?status=pending"));
    const data = (await list.json()) as { issues: Array<{ id: string }> };
    expect(data.issues.map((i) => i.id)).toContain(issueId);
  });

  it("limit doğrulanır ve sessiz kırpma bildirilir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    for (const bad of ["abc", "0", "-2", "501", "1.5"]) {
      expect((await dqGet(req("GET", `/api/data-quality?limit=${encodeURIComponent(bad)}`))).status).toBe(400);
    }
    const one = (await (
      await dqGet(req("GET", "/api/data-quality?status=pending&limit=1"))
    ).json()) as { issues: Array<{ id: string }>; limit: number; truncated: boolean };
    expect(one.limit).toBe(1);
    expect(one.issues).toHaveLength(1);
    expect(one.truncated).toBe(true);

    const all = (await (
      await dqGet(req("GET", "/api/data-quality?status=pending&limit=500"))
    ).json()) as { truncated: boolean };
    expect(all.truncated).toBe(false);
  });

  it("başka org karantina kaydını göremez ve çözemez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminB);
    const list = (await (await dqGet(req("GET", "/api/data-quality?status=all"))).json()) as {
      issues: Array<{ id: string }>;
    };
    expect(list.issues.map((i) => i.id)).not.toContain(issueId);

    const res = await dqPatch(
      req("PATCH", "/api/data-quality", { id: issueId, resolution: "resolved" })
    );
    expect(res.status).toBe(404);
  });

  it("kayıt çözülür ve pending listesinden çıkar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const res = await dqPatch(
      req("PATCH", "/api/data-quality", { id: issueId, resolution: "resolved" })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { issue: { status: string } }).issue.status).toBe("resolved");

    const pending = (await (await dqGet(req("GET", "/api/data-quality?status=pending"))).json()) as {
      issues: Array<{ id: string }>;
    };
    expect(pending.issues.map((i) => i.id)).not.toContain(issueId);
  });
});
