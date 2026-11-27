import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-decision-signals-${process.pid}-${randomUUID()}`
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
const { GET, POST } = await import("../src/app/api/decision-cases/[id]/signals/route");
const { verifyAuditChain } = await import("../src/lib/db/repos/audit");

const ORG_A = "org-signal-a";
const ORG_B = "org-signal-b";
const CASE_A = "case-signal-a";
const CASE_B = "case-signal-b";

describe("vaka-sinyal kanıt bağlantısı", () => {
  let ceoA: string;
  let guestA: string;
  let ceoB: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, name] of [
      [ORG_A, "Signal A"],
      [ORG_B, "Signal B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [
        id,
        name,
      ]);
    }
    for (const [id, org, role] of [
      ["signal-ceo-a", ORG_A, "ceo"],
      ["signal-guest-a", ORG_A, "guest"],
      ["signal-ceo-b", ORG_B, "ceo"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@signal.test`, id, role, pw]
      );
    }
    for (const [caseId, org] of [
      [CASE_A, ORG_A],
      [CASE_B, ORG_B],
    ]) {
      await db.query(
        `INSERT INTO decision_cases
           (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
         VALUES ($1, $2, 'aviation', 'risk', 'high', 'open', 'Signal case', 80, '{}'::jsonb)`,
        [caseId, org]
      );
    }
    await db.query(
      `INSERT INTO signals (id, org_id, sector_id, category_id, severity, title, payload)
       VALUES
         ('signal-a', $1, 'aviation', 'risk', 'critical', 'A sinyali', '{}'::jsonb),
         ('signal-b', $2, 'aviation', 'risk', 'critical', 'B sinyali', '{}'::jsonb)`,
      [ORG_A, ORG_B]
    );
    ceoA = await createSession("signal-ceo-a", ORG_A);
    guestA = await createSession("signal-guest-a", ORG_A);
    ceoB = await createSession("signal-ceo-b", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function getReq(caseId = CASE_A) {
    return GET(new Request("http://localhost"), { params: Promise.resolve({ id: caseId }) });
  }

  function postReq(body: Record<string, unknown>, caseId = CASE_A) {
    return POST(
      new NextRequest("http://localhost/api/decision-cases/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
  }

  it("oturum ve izin sınırlarını uygular", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await getReq()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await getReq()).status).toBe(403);
    expect((await postReq({ signalId: "signal-a", reason: "Aynı risk" })).status).toBe(403);
  });

  it("sinyali idempotent biçimde vakaya bağlar ve audit yazar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const first = await postReq({ signalId: "signal-a", reason: "Aynı tahsilat gecikmesi" });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { created: boolean; link: { signal_id: string } };
    expect(firstBody).toMatchObject({ created: true, link: { signal_id: "signal-a" } });

    const second = await postReq({ signalId: "signal-a", reason: "Tekrar deneme" });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ created: false, link: { signal_id: "signal-a" } });

    const list = await getReq();
    expect(list.status).toBe(200);
    expect((await list.json()).signals).toHaveLength(1);

    const audits = await getDb().query<{ type: string; detail: string }>(
      "SELECT type, detail FROM audit_events WHERE org_id = $1 AND type = 'decision_signal_linked'",
      [ORG_A]
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0].detail).toContain("Aynı tahsilat gecikmesi");
  });

  it("başka kurumun vakasına veya sinyaline bağ kuramaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    expect((await postReq({ signalId: "signal-b", reason: "Yetkisiz sinyal" })).status).toBe(404);
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    expect((await getReq(CASE_A)).status).toBe(200);
    expect((await (await getReq(CASE_A)).json()).signals).toEqual([]);
    expect((await postReq({ signalId: "signal-b", reason: "Yanlış vaka" }, CASE_A)).status).toBe(404);
  });

  it("audit zinciri bağlantı sonrası geçerlidir", async () => {
    expect(await verifyAuditChain(ORG_A)).toMatchObject({ valid: true });
  });
});
