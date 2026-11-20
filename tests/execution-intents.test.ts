import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-execution-intents-${process.pid}-${randomUUID()}`
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
const { GET: listRoute, POST: prepareRoute, PATCH: approveRoute } = await import(
  "../src/app/api/actions/execution-intents/route"
);
const { createAction } = await import("../src/lib/db/repos/actions");
const { executionPayloadHash, listExecutionIntents } = await import(
  "../src/lib/db/repos/execution-intents"
);
const { verifyAuditChain } = await import("../src/lib/db/repos/audit");

const ORG_A = "org-intent-a";
const ORG_B = "org-intent-b";

function request(
  method: "POST" | "PATCH",
  body: Record<string, unknown>
): NextRequest {
  return new NextRequest("http://localhost/api/actions/execution-intents", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("idempotent yürütme hazırlığı", () => {
  let sessionA: string;
  let sessionB: string;
  let guestA: string;
  let actionA: string;
  let actionA2: string;
  let actionB: string;
  let intentId: string;
  const idempotencyKey = "intent-key-0001";

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    const password = hashPassword("mevcut-parola-123");
    for (const [orgId, name] of [
      [ORG_A, "Intent A"],
      [ORG_B, "Intent B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [
        orgId,
        name,
      ]);
    }
    for (const [userId, orgId, email] of [
      ["intent-ceo-a", ORG_A, "ceo@intent-a.test"],
      ["intent-ceo-b", ORG_B, "ceo@intent-b.test"],
      ["intent-guest-a", ORG_A, "guest@intent-a.test"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, orgId, email, userId, userId.startsWith("intent-guest") ? "guest" : "ceo", password]
      );
    }
    for (const [caseId, orgId] of [
      ["case-intent-a", ORG_A],
      ["case-intent-b", ORG_B],
    ] as const) {
      await db.query(
        `INSERT INTO decision_cases
           (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
         VALUES ($1, $2, 'aviation', 'risk', 'high', 'decided', 'Intent case', 80, '{}'::jsonb)`,
        [caseId, orgId]
      );
    }
    await db.query(
      `INSERT INTO decision_records
         (id, org_id, case_id, sector_id, choice, decided_by, payload, state)
       VALUES
         ('decision-intent-a', $1, 'case-intent-a', 'aviation', 'accepted', 'ceo-a', '{}'::jsonb, 'approved'),
         ('decision-intent-b', $2, 'case-intent-b', 'aviation', 'accepted', 'ceo-b', '{}'::jsonb, 'approved')`,
      [ORG_A, ORG_B]
    );
    actionA = await createAction({
      orgId: ORG_A,
      decisionId: "decision-intent-a",
      caseId: "case-intent-a",
      title: "Plan A",
      owner: "CEO A",
      actorId: "intent-ceo-a",
      actorName: "CEO A",
    });
    actionA2 = await createAction({
      orgId: ORG_A,
      decisionId: "decision-intent-a",
      caseId: "case-intent-a",
      title: "Plan A2",
      owner: "CEO A",
      actorId: "intent-ceo-a",
      actorName: "CEO A",
    });
    actionB = await createAction({
      orgId: ORG_B,
      decisionId: "decision-intent-b",
      caseId: "case-intent-b",
      title: "Plan B",
      owner: "CEO B",
      actorId: "intent-ceo-b",
      actorName: "CEO B",
    });
    sessionA = await createSession("intent-ceo-a", ORG_A);
    sessionB = await createSession("intent-ceo-b", ORG_B);
    guestA = await createSession("intent-guest-a", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("payload hash alan sırasından bağımsızdır", () => {
    expect(executionPayloadHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      executionPayloadHash({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect(
      (
        await listRoute(
          new NextRequest("http://localhost/api/actions/execution-intents", { method: "GET" })
        )
      ).status
    ).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect(
      (
        await listRoute(
          new NextRequest("http://localhost/api/actions/execution-intents", { method: "GET" })
        )
      ).status
    ).toBe(403);
  });

  it("aynı idempotency anahtarı aynı içerikle mevcut kaydı döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const first = await prepareRoute(
      request("POST", {
        actionId: actionA,
        idempotencyKey,
        mode: "manual",
        targetSystem: "ERP",
        summary: "Satın alma talebini hazırla",
        payload: { b: 2, a: 1 },
      })
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { intent: { id: string }; created: boolean };
    expect(firstBody.created).toBe(true);
    intentId = firstBody.intent.id;

    const second = await prepareRoute(
      request("POST", {
        actionId: actionA,
        idempotencyKey,
        mode: "manual",
        targetSystem: "ERP",
        summary: "Satın alma talebini hazırla",
        payload: { a: 1, b: 2 },
      })
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ created: false, intent: { id: intentId } });
  });

  it("aynı anahtar farklı aksiyon veya yük ile sessizce ezilmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await prepareRoute(
      request("POST", {
        actionId: actionA2,
        idempotencyKey,
        mode: "manual",
        summary: "Farklı plan",
        payload: {},
      })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "conflict" });
  });

  it("hazırlık insan tarafından onaylanır ve ikinci onay reddedilir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const approved = await approveRoute(request("PATCH", { intentId }));
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({
      intent: { status: "approved", approved_by_id: "intent-ceo-a", approved_by_name: "intent-ceo-a" },
    });
    const again = await approveRoute(request("PATCH", { intentId }));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ reason: "invalid_status" });
  });

  it("başka kurumun aksiyonuna hazırlık oluşturulamaz ve listelenemez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await prepareRoute(
      request("POST", {
        actionId: actionB,
        idempotencyKey: "intent-key-cross",
        mode: "manual",
        summary: "Yetkisiz plan",
      })
    );
    expect(response.status).toBe(404);

    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionB);
    const list = await listRoute(
      new NextRequest("http://localhost/api/actions/execution-intents", { method: "GET" })
    );
    expect(list.status).toBe(200);
    expect((await list.json()).intents).toEqual([]);
    expect(await listExecutionIntents({ orgId: ORG_A })).toHaveLength(1);
  });

  it("onaysız karar için yürütme hazırlığı reddedilir", async () => {
    const db = getDb();
    await db.query(
      "UPDATE decision_records SET state = 'awaiting_approval' WHERE id = 'decision-intent-a' AND org_id = $1",
      [ORG_A]
    );
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await prepareRoute(
      request("POST", {
        actionId: actionA,
        idempotencyKey: "intent-key-unapproved",
        mode: "manual",
        summary: "Onaysız plan",
      })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "invalid_action_state" });
  });

  it("hazırlık ve onay audit zincirine yazılır", async () => {
    const db = getDb();
    const types = await db.query<{ type: string }>(
      "SELECT type FROM audit_events WHERE org_id = $1 AND type LIKE 'execution_intent_%'",
      [ORG_A]
    );
    expect(types.rows.map((row) => row.type).sort()).toEqual([
      "execution_intent_approved",
      "execution_intent_prepared",
    ]);
    expect(await verifyAuditChain(ORG_A)).toMatchObject({ valid: true });
  });
});
