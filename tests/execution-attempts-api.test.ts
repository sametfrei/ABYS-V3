import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-execution-attempts-api-${process.pid}-${randomUUID()}`
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
const { GET } = await import(
  "../src/app/api/actions/execution-intents/[id]/attempts/route"
);
const { createAction } = await import("../src/lib/db/repos/actions");
const { executionPayloadHash, prepareExecutionIntent } = await import(
  "../src/lib/db/repos/execution-intents"
);

const ORG_A = "org-attempt-api-a";
const ORG_B = "org-attempt-api-b";
const ACTOR_ID = "attempt-api-ceo-a";
const ACTOR_NAME = "Attempt API CEO";

function getAttempt(intentId: string) {
  return GET(
    new NextRequest(
      `http://localhost/api/actions/execution-intents/${encodeURIComponent(intentId)}/attempts`
    ),
    { params: Promise.resolve({ id: intentId }) }
  );
}

describe("yürütme denemesi salt-okunur API", () => {
  let sessionA: string;
  let guestA: string;
  let emptyIntentId: string;
  let attemptedIntentId: string;
  let orgBIntentId: string;
  let actionA: string;
  let actionB: string;
  let decisionA: string;
  let decisionB: string;
  let attemptedIdempotencyKey: string;
  let attemptedPayloadHash: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    const password = hashPassword("mevcut-parola-123");
    for (const [orgId, name] of [
      [ORG_A, "Attempt API A"],
      [ORG_B, "Attempt API B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [
        orgId,
        name,
      ]);
    }
    for (const [userId, orgId, email, role] of [
      [ACTOR_ID, ORG_A, "ceo@attempt-api-a.test", "ceo"],
      ["attempt-api-ceo-b", ORG_B, "ceo@attempt-api-b.test", "ceo"],
      ["attempt-api-guest-a", ORG_A, "guest@attempt-api-a.test", "guest"],
    ] as const) {
      await db.query(
        `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, orgId, email, userId, role, password]
      );
    }
    for (const [caseId, orgId, title] of [
      ["attempt-api-case-a", ORG_A, "Attempt API case A"],
      ["attempt-api-case-b", ORG_B, "Attempt API case B"],
    ] as const) {
      await db.query(
        `INSERT INTO decision_cases
           (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
         VALUES ($1, $2, 'aviation', 'risk', 'high', 'decided', $3, 80, '{}'::jsonb)`,
        [caseId, orgId, title]
      );
    }
    await db.query(
      `INSERT INTO decision_records
         (id, org_id, case_id, sector_id, choice, decided_by, payload, state)
       VALUES
         ('attempt-api-decision-a', $1, 'attempt-api-case-a', 'aviation', 'accepted', $2, '{}'::jsonb, 'approved'),
         ('attempt-api-decision-b', $3, 'attempt-api-case-b', 'aviation', 'accepted', $4, '{}'::jsonb, 'approved')`,
      [ORG_A, ACTOR_ID, ORG_B, "attempt-api-ceo-b"]
    );
    decisionA = "attempt-api-decision-a";
    decisionB = "attempt-api-decision-b";
    actionA = await createAction({
      orgId: ORG_A,
      decisionId: decisionA,
      caseId: "attempt-api-case-a",
      title: "Attempt API action A",
      owner: ACTOR_NAME,
      actorId: ACTOR_ID,
      actorName: ACTOR_NAME,
    });
    actionB = await createAction({
      orgId: ORG_B,
      decisionId: decisionB,
      caseId: "attempt-api-case-b",
      title: "Attempt API action B",
      owner: "Attempt API CEO B",
      actorId: "attempt-api-ceo-b",
      actorName: "Attempt API CEO B",
    });

    const emptyIntent = await prepareExecutionIntent({
      orgId: ORG_A,
      actionId: actionA,
      idempotencyKey: "attempt-api-empty-intent",
      mode: "system",
      targetSystem: "test-erp",
      summary: "Henüz denenmemiş niyet",
      payload: { reference: "empty" },
      actorId: ACTOR_ID,
      actorName: ACTOR_NAME,
    });
    emptyIntentId = emptyIntent.intent.id;

    attemptedIdempotencyKey = "attempt-api-existing-attempt";
    attemptedPayloadHash = executionPayloadHash({ reference: "attempted" });
    const attemptedIntent = await prepareExecutionIntent({
      orgId: ORG_A,
      actionId: actionA,
      idempotencyKey: attemptedIdempotencyKey,
      mode: "system",
      targetSystem: "test-erp",
      summary: "Denemesi bulunan niyet",
      payload: { reference: "attempted" },
      actorId: ACTOR_ID,
      actorName: ACTOR_NAME,
    });
    attemptedIntentId = attemptedIntent.intent.id;
    await db.query(
      `INSERT INTO action_execution_attempts
         (id, org_id, intent_id, action_id, decision_id, adapter_id, target_system,
          idempotency_key, payload_hash, status, response_status, response_reference,
          error_code, error_message, actor_id, actor_name, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, 'fixture-adapter', 'test-erp', $6, $7,
               'failed', 422, 'provider-receipt-9', 'provider_rejected',
               'Sağlayıcı reddetti.', $8, $9,
               '2026-01-10T10:00:00.000Z', '2026-01-10T10:00:02.000Z')`,
      [
        "attempt-api-existing-row",
        ORG_A,
        attemptedIntentId,
        actionA,
        decisionA,
        attemptedIdempotencyKey,
        attemptedPayloadHash,
        ACTOR_ID,
        ACTOR_NAME,
      ]
    );

    const orgBIntent = await prepareExecutionIntent({
      orgId: ORG_B,
      actionId: actionB,
      idempotencyKey: "attempt-api-org-b-intent",
      mode: "system",
      targetSystem: "test-erp",
      summary: "B kurumu niyeti",
      payload: { reference: "org-b" },
      actorId: "attempt-api-ceo-b",
      actorName: "Attempt API CEO B",
    });
    orgBIntentId = orgBIntent.intent.id;

    sessionA = await createSession(ACTOR_ID, ORG_A);
    guestA = await createSession("attempt-api-guest-a", ORG_A);
  });

  beforeEach(() => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döndürür", async () => {
    const response = await getAttempt(emptyIntentId);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Oturum gerekli." });
  });

  it("view_decisions izni yoksa 403 döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    const response = await getAttempt(emptyIntentId);
    expect(response.status).toBe(403);
  });

  it("başka kurumun niyetini bulunamadı yanıtından ayırt etmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const foreign = await getAttempt(orgBIntentId);
    const missing = await getAttempt("attempt-api-does-not-exist");
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it("niyet varsa fakat deneme yoksa boş başarılı sonuç döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await getAttempt(emptyIntentId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attempt: null });
  });

  it("yalnızca kalıcı deneme durumunu, yanıtı, hatayı ve zaman damgalarını döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await getAttempt(attemptedIntentId);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { attempt: Record<string, unknown> };
    expect(Object.keys(body.attempt).sort()).toEqual([
      "error_code",
      "error_message",
      "finished_at",
      "response_reference",
      "response_status",
      "started_at",
      "status",
    ]);
    expect(body.attempt).toMatchObject({
      status: "failed",
      response_status: 422,
      response_reference: "provider-receipt-9",
      error_code: "provider_rejected",
      error_message: "Sağlayıcı reddetti.",
    });
    expect(new Date(body.attempt.started_at as string).toISOString()).toBe(
      "2026-01-10T10:00:00.000Z"
    );
    expect(new Date(body.attempt.finished_at as string).toISOString()).toBe(
      "2026-01-10T10:00:02.000Z"
    );
  });

  it("aşırı uzun niyet kimliğini 400 ile reddeder", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await getAttempt("x".repeat(301));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Geçersiz yürütme niyeti kimliği." });
  });
});
