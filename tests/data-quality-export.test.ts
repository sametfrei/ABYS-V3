import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-data-quality-export-${process.pid}-${randomUUID()}`
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
const { GET: exportIssues } = await import("../src/app/api/data-quality/export/route");
const { quarantineIssue } = await import("../src/lib/db/repos/data-quality");
const { DATA_QUALITY_CSV_HEADER } = await import("../src/lib/data-quality-csv");

const ORG_A = "org-dq-export-a";
const ORG_B = "org-dq-export-b";

function get(query = "", cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost/api/data-quality/export${query}`, { headers });
}

describe("veri kalitesi CSV dışa aktarımı", () => {
  let dataAdminA: string;
  let ceoA: string;
  let dataAdminB: string;
  let issueA: string;
  let issueB: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "DQ Export A"],
      [ORG_B, "DQ Export B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        name,
        "aviation",
      ]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, role] of [
      ["dq-export-admin-a", ORG_A, "data_admin"],
      ["dq-export-ceo-a", ORG_A, "ceo"],
      ["dq-export-admin-b", ORG_B, "data_admin"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@test.local`, id, role, pw]
      );
    }

    const a = await quarantineIssue({
      orgId: ORG_A,
      source: "bitrix24",
      entity: "customer",
      sourceRef: "A-1",
      code: "CONTRACT_INVALID",
      reason: 'Eksik "ad" alanı, virgül ve satır\nsonu',
      payload: { secret: "should-not-export" },
    });
    const b = await quarantineIssue({
      orgId: ORG_B,
      source: "bitrix24",
      entity: "customer",
      sourceRef: "B-1",
      reason: "Diğer kurum kaydı",
    });
    issueA = a.id;
    issueB = b.id;

    dataAdminA = await createSession("dq-export-admin-a", ORG_A);
    ceoA = await createSession("dq-export-ceo-a", ORG_A);
    dataAdminB = await createSession("dq-export-admin-b", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    expect((await exportIssues(get())).status).toBe(401);
  });

  it("ingest_data izni olmayan rol 403 alır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await exportIssues(get());
    expect(res.status).toBe(403);
    await res.text();
  });

  it("yalnızca kendi kurumunun kaydını, kaçışlı CSV olarak döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminA);
    const res = await exportIssues(get("?status=all"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv.split("\r\n")[0]).toBe(DATA_QUALITY_CSV_HEADER.join(","));
    expect(csv).toContain(issueA);
    expect(csv).not.toContain(issueB);
    expect(csv).not.toContain("should-not-export");
    expect(csv).toContain('"Eksik ""ad"" alanı, virgül ve satır\nsonu"');
  });

  it("kurum kapsamı başka kurumun dışa aktarımında da korunur", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminB);
    const res = await exportIssues(get("?status=all"));
    const csv = await res.text();
    expect(csv).toContain(issueB);
    expect(csv).not.toContain(issueA);
  });
});
