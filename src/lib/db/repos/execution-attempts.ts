import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import type { ExecutionAdapterResult } from "@/lib/execution/contracts";
import { recordAuditEventInTransaction } from "./audit";

export type ExecutionAttemptStatus = "in_progress" | "succeeded" | "failed";

export interface ExecutionAttemptRow {
  id: string;
  intent_id: string;
  action_id: string;
  decision_id: string;
  adapter_id: string;
  target_system: string;
  idempotency_key: string;
  payload_hash: string;
  status: ExecutionAttemptStatus;
  response_status: number | null;
  response_reference: string | null;
  error_code: string | null;
  error_message: string | null;
  actor_id: string;
  actor_name: string;
  started_at: string;
  finished_at: string | null;
}

export interface ExecutionAttemptView {
  status: ExecutionAttemptStatus;
  response_status: number | null;
  response_reference: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export type ExecutionAttemptLookup =
  | { intentExists: false; attempt: null }
  | { intentExists: true; attempt: ExecutionAttemptView | null };

const ATTEMPT_COLUMNS = `id, intent_id, action_id, decision_id, adapter_id, target_system,
  idempotency_key, payload_hash, status, response_status, response_reference,
  error_code, error_message, actor_id, actor_name, started_at, finished_at`;

export async function claimExecutionAttempt(params: {
  orgId: string;
  intentId: string;
  actionId: string;
  decisionId: string;
  adapterId: string;
  targetSystem: string;
  idempotencyKey: string;
  payloadHash: string;
  actorId: string;
  actorName: string;
}): Promise<{ attempt: ExecutionAttemptRow; claimed: boolean }> {
  await migrate();
  const db = getDb();
  const id = randomBytes(8).toString("hex");
  const inserted = await db.query<ExecutionAttemptRow>(
    `INSERT INTO action_execution_attempts
       (id, org_id, intent_id, action_id, decision_id, adapter_id, target_system,
        idempotency_key, payload_hash, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (org_id, intent_id) DO NOTHING
     RETURNING ${ATTEMPT_COLUMNS}`,
    [
      id,
      params.orgId,
      params.intentId,
      params.actionId,
      params.decisionId,
      params.adapterId,
      params.targetSystem,
      params.idempotencyKey,
      params.payloadHash,
      params.actorId,
      params.actorName,
    ]
  );
  if (inserted.rows[0]) return { attempt: inserted.rows[0], claimed: true };

  const existing = await db.query<ExecutionAttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM action_execution_attempts
      WHERE org_id = $1 AND intent_id = $2`,
    [params.orgId, params.intentId]
  );
  return { attempt: existing.rows[0], claimed: false };
}

export async function finishExecutionAttempt(params: {
  orgId: string;
  intentId: string;
  result: ExecutionAdapterResult;
  actorId: string;
  actorName: string;
}): Promise<ExecutionAttemptRow> {
  await migrate();
  return getDb().transaction(async (tx) => {
    const status = params.result.ok ? "succeeded" : "failed";
    const updated = await tx.query<ExecutionAttemptRow>(
      `UPDATE action_execution_attempts
          SET status = $3,
              response_status = $4,
              response_reference = $5,
              error_code = $6,
              error_message = $7,
              finished_at = now()
        WHERE org_id = $1 AND intent_id = $2 AND status = 'in_progress'
        RETURNING ${ATTEMPT_COLUMNS}`,
      [
        params.orgId,
        params.intentId,
        status,
        params.result.ok ? params.result.responseStatus ?? null : null,
        params.result.ok ? params.result.reference ?? null : null,
        params.result.ok ? null : params.result.errorCode,
        params.result.ok ? null : params.result.message,
      ]
    );
    const attempt = updated.rows[0];
    if (!attempt) throw new Error("Yürütme denemesi sonuçlandırılacak durumda değil.");

    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId,
      actor: params.actorName,
      type: params.result.ok ? "execution_succeeded" : "execution_failed",
      summary: params.result.ok
        ? `Dış yürütme tamamlandı: ${attempt.target_system}`
        : `Dış yürütme başarısız: ${attempt.target_system}`,
      detail: JSON.stringify({
        attemptId: attempt.id,
        intentId: attempt.intent_id,
        actionId: attempt.action_id,
        decisionId: attempt.decision_id,
        adapterId: attempt.adapter_id,
        targetSystem: attempt.target_system,
        responseStatus: attempt.response_status,
        responseReference: attempt.response_reference,
        errorCode: attempt.error_code,
        actorId: params.actorId,
      }),
    });
    return attempt;
  });
}

export async function getExecutionAttempt(params: {
  orgId: string;
  intentId: string;
}): Promise<ExecutionAttemptRow | null> {
  await migrate();
  const r = await getDb().query<ExecutionAttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM action_execution_attempts
      WHERE org_id = $1 AND intent_id = $2`,
    [params.orgId, params.intentId]
  );
  return r.rows[0] ?? null;
}

/**
 * Org kapsamlı salt-okunur görünüm: niyetin varlığı ile adaptör denemesinin
 * varlığını ayırır. Başka bir kurumun niyeti bu sorguda hiçbir zaman görünmez.
 */
export async function getExecutionAttemptForIntent(params: {
  orgId: string;
  intentId: string;
}): Promise<ExecutionAttemptLookup> {
  await migrate();
  const r = await getDb().query<{
    attempt_id: string | null;
    status: ExecutionAttemptStatus | null;
    response_status: number | null;
    response_reference: string | null;
    error_code: string | null;
    error_message: string | null;
    started_at: string | null;
    finished_at: string | null;
  }>(
    `SELECT a.id AS attempt_id, a.status, a.response_status, a.response_reference,
            a.error_code, a.error_message, a.started_at, a.finished_at
       FROM action_execution_intents i
       LEFT JOIN action_execution_attempts a
         ON a.org_id = i.org_id AND a.intent_id = i.id
      WHERE i.org_id = $1 AND i.id = $2`,
    [params.orgId, params.intentId]
  );
  const row = r.rows[0];
  if (!row) return { intentExists: false, attempt: null };
  if (!row.attempt_id || !row.status || !row.started_at) {
    return { intentExists: true, attempt: null };
  }
  return {
    intentExists: true,
    attempt: {
      status: row.status,
      response_status: row.response_status,
      response_reference: row.response_reference,
      error_code: row.error_code,
      error_message: row.error_message,
      started_at: row.started_at,
      finished_at: row.finished_at,
    },
  };
}
