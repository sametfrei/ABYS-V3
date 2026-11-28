import { createHash, randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import { recordAuditEventInTransaction } from "./audit";

/**
 * Yürütme niyeti, dış sistemde henüz hiçbir yan etki üretmeden hazırlanan
 * insan onaylı kayıttır. Bu modül adapter çağırmaz; yalnızca güvenli,
 * izlenebilir ve idempotent bir hazırlık sözleşmesi sunar.
 */

export const EXECUTION_INTENT_MODES = ["manual", "system"] as const;
export type ExecutionIntentMode = (typeof EXECUTION_INTENT_MODES)[number];
export const EXECUTION_INTENT_STATUSES = ["prepared", "approved", "cancelled"] as const;
export type ExecutionIntentStatus = (typeof EXECUTION_INTENT_STATUSES)[number];

export class ExecutionIntentError extends Error {
  readonly code = "EXECUTION_INTENT_REJECTED";

  constructor(
    message: string,
    public readonly reason:
      | "not_found"
      | "conflict"
      | "invalid_action_state"
      | "invalid_status"
  ) {
    super(message);
    this.name = "ExecutionIntentError";
  }
}

export interface ExecutionIntentRow {
  id: string;
  action_id: string;
  decision_id: string;
  idempotency_key: string;
  mode: ExecutionIntentMode;
  target_system: string | null;
  summary: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  status: ExecutionIntentStatus;
  prepared_by_id: string;
  prepared_by_name: string;
  approved_by_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stableValue((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

export function executionPayloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(payload)))
    .digest("hex");
}

function mapIntent(row: ExecutionIntentRow): ExecutionIntentRow {
  return {
    ...row,
    payload: row.payload ?? {},
    approved_at: row.approved_at ?? null,
    updated_at: row.updated_at,
  };
}

export async function prepareExecutionIntent(params: {
  orgId: string;
  actionId: string;
  idempotencyKey: string;
  mode: ExecutionIntentMode;
  targetSystem?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
  actorId: string;
  actorName: string;
}): Promise<{ intent: ExecutionIntentRow; created: boolean }> {
  await migrate();
  const payload = params.payload ?? {};
  const payloadHash = executionPayloadHash(payload);
  const summary = params.summary.trim();
  const targetSystem = params.targetSystem?.trim() || null;
  if (!summary) {
    throw new ExecutionIntentError("Yürütme özeti gerekli.", "invalid_action_state");
  }

  return getDb().transaction(async (tx) => {
    const existing = await tx.query<ExecutionIntentRow>(
      `SELECT id, action_id, decision_id, idempotency_key, mode, target_system,
              summary, payload, payload_hash, status, prepared_by_id, prepared_by_name,
              approved_by_id, approved_by_name, approved_at, created_at, updated_at
         FROM action_execution_intents
        WHERE org_id = $1 AND idempotency_key = $2`,
      [params.orgId, params.idempotencyKey]
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (
        row.action_id !== params.actionId ||
        row.mode !== params.mode ||
        row.target_system !== targetSystem ||
        row.summary !== summary ||
        row.payload_hash !== payloadHash
      ) {
        throw new ExecutionIntentError(
          "Bu idempotency anahtarı farklı bir aksiyon veya yürütme içeriğiyle daha önce kullanıldı.",
          "conflict"
        );
      }
      return { intent: mapIntent(row), created: false };
    }

    const action = await tx.query<{
      id: string;
      decision_id: string;
      status: string;
      decision_state: string;
    }>(
      `SELECT a.id, a.decision_id, a.status, d.state AS decision_state
         FROM actions a
         JOIN decision_records d ON d.id = a.decision_id AND d.org_id = a.org_id
        WHERE a.id = $1 AND a.org_id = $2
        FOR UPDATE OF a`,
      [params.actionId, params.orgId]
    );
    const row = action.rows[0];
    if (!row) {
      throw new ExecutionIntentError("Aksiyon bulunamadı.", "not_found");
    }
    if (row.status !== "open" && row.status !== "in_progress") {
      throw new ExecutionIntentError(
        "Yalnızca açık veya yürütülen bir aksiyon için hazırlık yapılabilir.",
        "invalid_action_state"
      );
    }
    if (row.decision_state !== "approved" && row.decision_state !== "in_execution") {
      throw new ExecutionIntentError(
        "Karar onaylanmadan yürütme hazırlığı oluşturulamaz.",
        "invalid_action_state"
      );
    }

    const id = randomBytes(8).toString("hex");
    const inserted = await tx.query<ExecutionIntentRow>(
      `INSERT INTO action_execution_intents
         (id, org_id, action_id, decision_id, idempotency_key, mode, target_system,
          summary, payload, payload_hash, prepared_by_id, prepared_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
       RETURNING id, action_id, decision_id, idempotency_key, mode, target_system,
                 summary, payload, payload_hash, status, prepared_by_id, prepared_by_name,
                 approved_by_id, approved_by_name, approved_at, created_at, updated_at`,
      [
        id,
        params.orgId,
        params.actionId,
        row.decision_id,
        params.idempotencyKey,
        params.mode,
        targetSystem,
        summary,
        JSON.stringify(payload),
        payloadHash,
        params.actorId,
        params.actorName,
      ]
    );
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId,
      actor: params.actorName,
      type: "execution_intent_prepared",
      summary: `Yürütme hazırlığı oluşturuldu: ${summary}`,
      detail: JSON.stringify({
        intentId: id,
        actionId: params.actionId,
        decisionId: row.decision_id,
        mode: params.mode,
        targetSystem,
        payloadHash,
        actorId: params.actorId,
      }),
    });
    return { intent: mapIntent(inserted.rows[0]), created: true };
  });
}

export async function approveExecutionIntent(params: {
  orgId: string;
  intentId: string;
  actorId: string;
  actorName: string;
}): Promise<ExecutionIntentRow> {
  await migrate();
  return getDb().transaction(async (tx) => {
    const found = await tx.query<ExecutionIntentRow>(
      `SELECT i.id, i.action_id, i.decision_id, i.idempotency_key, i.mode,
              i.target_system, i.summary, i.payload, i.payload_hash, i.status,
              i.prepared_by_id, i.prepared_by_name, i.approved_by_id,
              i.approved_by_name, i.approved_at, i.created_at, i.updated_at
         FROM action_execution_intents i
         JOIN actions a ON a.id = i.action_id AND a.org_id = i.org_id
         JOIN decision_records d ON d.id = a.decision_id AND d.org_id = a.org_id
        WHERE i.id = $1 AND i.org_id = $2
        FOR UPDATE OF i`,
      [params.intentId, params.orgId]
    );
    const intent = found.rows[0];
    if (!intent) {
      throw new ExecutionIntentError("Yürütme hazırlığı bulunamadı.", "not_found");
    }
    if (intent.status !== "prepared") {
      throw new ExecutionIntentError(
        "Yalnızca hazırlanmış bir niyet onaylanabilir.",
        "invalid_status"
      );
    }
    const updated = await tx.query<ExecutionIntentRow>(
      `UPDATE action_execution_intents
          SET status = 'approved', approved_by_id = $3, approved_by_name = $4,
              approved_at = now(), updated_at = now()
        WHERE id = $1 AND org_id = $2 AND status = 'prepared'
        RETURNING id, action_id, decision_id, idempotency_key, mode, target_system,
                  summary, payload, payload_hash, status, prepared_by_id, prepared_by_name,
                  approved_by_id, approved_by_name, approved_at, created_at, updated_at`,
      [params.intentId, params.orgId, params.actorId, params.actorName]
    );
    if (!updated.rows[0]) {
      throw new ExecutionIntentError(
        "Yürütme hazırlığı bu sırada değişti; güncel kaydı yeniden yükleyin.",
        "conflict"
      );
    }
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId,
      actor: params.actorName,
      type: "execution_intent_approved",
      summary: `Yürütme hazırlığı onaylandı: ${intent.summary}`,
      detail: JSON.stringify({
        intentId: intent.id,
        actionId: intent.action_id,
        decisionId: intent.decision_id,
        payloadHash: intent.payload_hash,
        actorId: params.actorId,
      }),
    });
    return mapIntent(updated.rows[0]);
  });
}

export async function listExecutionIntents(params: {
  orgId: string;
  actionId?: string;
  limit?: number;
}): Promise<ExecutionIntentRow[]> {
  await migrate();
  const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
  const r = await getDb().query<ExecutionIntentRow>(
    `SELECT id, action_id, decision_id, idempotency_key, mode, target_system,
            summary, payload, payload_hash, status, prepared_by_id, prepared_by_name,
            approved_by_id, approved_by_name, approved_at, created_at, updated_at
       FROM action_execution_intents
      WHERE org_id = $1 ${params.actionId ? "AND action_id = $2" : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.actionId ? 3 : 2}`,
    params.actionId ? [params.orgId, params.actionId, limit] : [params.orgId, limit]
  );
  return r.rows.map(mapIntent);
}
