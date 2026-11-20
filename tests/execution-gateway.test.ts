import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-execution-gateway-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { createAction } = await import("../src/lib/db/repos/actions");
const { prepareExecutionIntent, approveExecutionIntent } = await import(
  "../src/lib/db/repos/execution-intents"
);
const { getExecutionAttempt } = await import("../src/lib/db/repos/execution-attempts");
const { verifyAuditChain } = await import("../src/lib/db/repos/audit");
const { executeApprovedIntent } = await import("../src/lib/execution/gateway");
const { ExecutionAdapterRegistry, ExecutionGatewayError, executionPolicyFromEnv } = await import(
  "../src/lib/execution/contracts"
);

const ORG_A = "org-gateway-a";
const ORG_B = "org-gateway-b";
const ACTOR_ID = "gateway-ceo";
const ACTOR_NAME = "Gateway CEO";
let sequence = 0;

async function createApprovedIntent(options?: {
  orgId?: string;
  targetSystem?: string;
  approve?: boolean;
  state?: "approved" | "awaiting_approval";
}): Promise<{ actionId: string; intentId: string }> {
  const orgId = options?.orgId ?? ORG_A;
  const n = ++sequence;
  const db = getDb();
  const caseId = `gateway-case-${n}`;
  const decisionId = `gateway-decision-${n}`;
  await db.query(
    `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
     VALUES ($1, $2, 'aviation', 'risk', 'high', 'decided', $3, 80, '{}'::jsonb)`,
    [caseId, orgId, `Gateway case ${n}`]
  );
  await db.query(
    `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload, state)
     VALUES ($1, $2, $3, 'aviation', 'accepted', $4, '{}'::jsonb, $5)`,
    [decisionId, orgId, caseId, ACTOR_NAME, options?.state ?? "approved"]
  );
  const actionId = await createAction({
    orgId,
    decisionId,
    caseId,
    title: `Gateway action ${n}`,
    owner: ACTOR_NAME,
    actorId: ACTOR_ID,
    actorName: ACTOR_NAME,
  });
  const prepared = await prepareExecutionIntent({
    orgId,
    actionId,
    idempotencyKey: `gateway-intent-${n}-${randomUUID()}`,
    mode: "system",
    targetSystem: options?.targetSystem ?? "test-erp",
    summary: `Gateway intent ${n}`,
    payload: { reference: n },
    actorId: ACTOR_ID,
    actorName: ACTOR_NAME,
  });
  if (options?.approve !== false) {
    await approveExecutionIntent({
      orgId,
      intentId: prepared.intent.id,
      actorId: ACTOR_ID,
      actorName: ACTOR_NAME,
    });
  }
  return { actionId, intentId: prepared.intent.id };
}

describe("güvenli yürütme adaptörü sözleşmesi", () => {
  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "Gateway A"],
      [ORG_B, "Gateway B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [
        id,
        name,
      ]);
    }
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("allowlist boşken hiçbir hedef yürütülemez", () => {
    const policy = executionPolicyFromEnv({} as NodeJS.ProcessEnv);
    expect(policy.allowedTargets.size).toBe(0);
    expect(policy.timeoutMs).toBe(15_000);
  });

  it("onaylı niyeti tek kez adaptöre gönderir ve sonucu audit ile kaydeder", async () => {
    const { intentId } = await createApprovedIntent();
    let calls = 0;
    const registry = new ExecutionAdapterRegistry();
    registry.register({
      id: "test-erp-adapter",
      targetSystem: "test-erp",
      validate: () => [],
      execute: async (_intent, context) => {
        calls++;
        expect(context.idempotencyKey).toContain("gateway-intent-");
        return { ok: true, responseStatus: 202, reference: "provider-42" };
      },
    });

    const first = await executeApprovedIntent(
      { orgId: ORG_A, intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
      {
        registry,
        policy: {
          allowedTargets: new Set(["test-erp"]),
          maxPayloadBytes: 4096,
          timeoutMs: 500,
        },
      }
    );
    expect(first.attempt.status).toBe("succeeded");
    expect(first.attempt.response_reference).toBe("provider-42");
    expect(calls).toBe(1);

    await expect(
      executeApprovedIntent(
        { orgId: ORG_A, intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
        {
          registry,
          policy: {
            allowedTargets: new Set(["test-erp"]),
            maxPayloadBytes: 4096,
            timeoutMs: 500,
          },
        }
      )
    ).rejects.toMatchObject({ reason: "already_attempted" });
    expect(calls).toBe(1);

    const audit = await getDb().query<{ type: string }>(
      "SELECT type FROM audit_events WHERE org_id = $1 AND type = 'execution_succeeded'",
      [ORG_A]
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("onaysız niyet, allowlist dışı hedef ve eksik adaptör reddedilir", async () => {
    const unapproved = await createApprovedIntent({ approve: false });
    const registry = new ExecutionAdapterRegistry();
    registry.register({
      id: "test-erp-adapter",
      targetSystem: "test-erp",
      validate: () => [],
      execute: async () => ({ ok: true }),
    });
    const basePolicy = {
      allowedTargets: new Set(["test-erp"]),
      maxPayloadBytes: 4096,
      timeoutMs: 500,
    };
    await expect(
      executeApprovedIntent(
        { orgId: ORG_A, intentId: unapproved.intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
        { registry, policy: basePolicy }
      )
    ).rejects.toMatchObject({ reason: "not_approved" });

    const allowedMismatch = await createApprovedIntent({ targetSystem: "outside-erp" });
    await expect(
      executeApprovedIntent(
        { orgId: ORG_A, intentId: allowedMismatch.intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
        { registry, policy: basePolicy }
      )
    ).rejects.toMatchObject({ reason: "target_not_allowed" });

    const noAdapter = await createApprovedIntent({ targetSystem: "other-erp" });
    await expect(
      executeApprovedIntent(
        { orgId: ORG_A, intentId: noAdapter.intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
        {
          registry,
          policy: { ...basePolicy, allowedTargets: new Set(["test-erp", "other-erp"]) },
        }
      )
    ).rejects.toMatchObject({ reason: "adapter_missing" });
  });

  it("adaptör hatası ve zaman aşımı başarısız deneme olarak kaydedilir", async () => {
    const failed = await createApprovedIntent();
    const failingRegistry = new ExecutionAdapterRegistry();
    failingRegistry.register({
      id: "test-erp-adapter",
      targetSystem: "test-erp",
      validate: () => [],
      execute: async () => ({ ok: false, errorCode: "provider_rejected", message: "Sağlayıcı reddetti." }),
    });
    const policy = {
      allowedTargets: new Set(["test-erp"]),
      maxPayloadBytes: 4096,
      timeoutMs: 500,
    };
    await expect(
      executeApprovedIntent(
        { orgId: ORG_A, intentId: failed.intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
        { registry: failingRegistry, policy }
      )
    ).rejects.toBeInstanceOf(ExecutionGatewayError);
    expect(await getExecutionAttempt({ orgId: ORG_A, intentId: failed.intentId })).toMatchObject({
      status: "failed",
      error_code: "provider_rejected",
    });

    const timedOut = await createApprovedIntent();
    const slowRegistry = new ExecutionAdapterRegistry();
    slowRegistry.register({
      id: "test-erp-adapter",
      targetSystem: "test-erp",
      validate: () => [],
      execute: (_intent, context) =>
        new Promise((resolve) => {
          const timer = setTimeout(
            () => resolve({ ok: true, reference: "too-late" }),
            5_000
          );
          context.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve({ ok: false, errorCode: "aborted", message: "aborted" });
          });
        }),
    });
    await expect(
      executeApprovedIntent(
        { orgId: ORG_A, intentId: timedOut.intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
        { registry: slowRegistry, policy: { ...policy, timeoutMs: 20 } }
      )
    ).rejects.toMatchObject({ reason: "timeout" });
    expect(await getExecutionAttempt({ orgId: ORG_A, intentId: timedOut.intentId })).toMatchObject({
      status: "failed",
      error_code: "timeout",
    });
  });

  it("tenant dışından niyet görünmez ve audit zinciri bozulmaz", async () => {
    const { intentId } = await createApprovedIntent();
    const registry = new ExecutionAdapterRegistry();
    registry.register({
      id: "test-erp-adapter",
      targetSystem: "test-erp",
      validate: () => [],
      execute: async () => ({ ok: true }),
    });
    await expect(
      executeApprovedIntent(
        { orgId: ORG_B, intentId, actorId: ACTOR_ID, actorName: ACTOR_NAME },
        {
          registry,
          policy: { allowedTargets: new Set(["test-erp"]), maxPayloadBytes: 4096, timeoutMs: 500 },
        }
      )
    ).rejects.toMatchObject({ reason: "not_found" });

    expect(await verifyAuditChain(ORG_A)).toMatchObject({ valid: true });
  });
});
