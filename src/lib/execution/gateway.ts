import { getDb, migrate } from "@/lib/db/client";
import type { ExecutionIntentRow } from "@/lib/db/repos/execution-intents";
import {
  claimExecutionAttempt,
  finishExecutionAttempt,
  type ExecutionAttemptRow,
} from "@/lib/db/repos/execution-attempts";
import {
  ExecutionGatewayError,
  type ExecutionAdapter,
  type ExecutionAdapterRegistry,
  type ExecutionAdapterResult,
  type ExecutionPolicy,
} from "./contracts";

interface ExecutableIntentRow extends ExecutionIntentRow {
  action_status: string;
  decision_state: string;
}

export interface ExecuteApprovedIntentParams {
  orgId: string;
  intentId: string;
  actorId: string;
  actorName: string;
}

export interface ExecuteApprovedIntentDependencies {
  registry: ExecutionAdapterRegistry;
  policy: ExecutionPolicy;
  now?: () => Date;
}

export interface ExecuteApprovedIntentResult {
  intent: ExecutionIntentRow;
  attempt: ExecutionAttemptRow;
  created: boolean;
}

async function loadExecutableIntent(orgId: string, intentId: string): Promise<ExecutableIntentRow> {
  await migrate();
  const r = await getDb().query<ExecutableIntentRow>(
    `SELECT i.id, i.action_id, i.decision_id, i.idempotency_key, i.mode,
            i.target_system, i.summary, i.payload, i.payload_hash, i.status,
            i.prepared_by_id, i.prepared_by_name, i.approved_by_id,
            i.approved_by_name, i.approved_at, i.created_at, i.updated_at,
            a.status AS action_status, d.state AS decision_state
       FROM action_execution_intents i
       JOIN actions a ON a.id = i.action_id AND a.org_id = i.org_id
       JOIN decision_records d ON d.id = i.decision_id AND d.org_id = i.org_id
      WHERE i.org_id = $1 AND i.id = $2`,
    [orgId, intentId]
  );
  const row = r.rows[0];
  if (!row) throw new ExecutionGatewayError("Yürütme hazırlığı bulunamadı.", "not_found");
  return row;
}

function validateExecutableIntent(
  intent: ExecutableIntentRow,
  policy: ExecutionPolicy,
  adapter: ExecutionAdapter | undefined
): void {
  if (intent.status !== "approved") {
    throw new ExecutionGatewayError("Yalnızca onaylı yürütme hazırlığı çalıştırılabilir.", "not_approved");
  }
  if (intent.action_status !== "open" && intent.action_status !== "in_progress") {
    throw new ExecutionGatewayError("Aksiyon yürütmeye uygun durumda değil.", "invalid_action_state");
  }
  if (intent.decision_state !== "approved" && intent.decision_state !== "in_execution") {
    throw new ExecutionGatewayError("Karar yürütme için onaylı değil.", "invalid_action_state");
  }
  if (!intent.target_system) {
    throw new ExecutionGatewayError("Yürütme hazırlığında hedef sistem yok.", "target_missing");
  }
  if (!policy.allowedTargets.has(intent.target_system)) {
    throw new ExecutionGatewayError(
      `Hedef sistem yürütme allowlist'inde değil: ${intent.target_system}`,
      "target_not_allowed"
    );
  }
  const payloadBytes = Buffer.byteLength(JSON.stringify(intent.payload), "utf8");
  if (payloadBytes > policy.maxPayloadBytes) {
    throw new ExecutionGatewayError("Yürütme yükü izin verilen boyutu aşıyor.", "payload_too_large");
  }
  if (!adapter) {
    throw new ExecutionGatewayError(
      `Hedef sistem için kayıtlı adaptör yok: ${intent.target_system}`,
      "adapter_missing"
    );
  }
  const adapterErrors = adapter.validate(intent);
  if (adapterErrors.length > 0) {
    throw new ExecutionGatewayError(`Adaptör doğrulaması başarısız: ${adapterErrors.join("; ")}`, "adapter_invalid");
  }
}

function timeoutResult(timeoutMs: number): ExecutionAdapterResult {
  return {
    ok: false,
    errorCode: "timeout",
    message: `Dış adaptör ${timeoutMs} ms içinde yanıt vermedi.`,
    retryable: true,
  };
}

async function runAdapter(
  adapter: ExecutionAdapter,
  intent: ExecutableIntentRow,
  params: ExecuteApprovedIntentParams,
  timeoutMs: number,
  now: () => Date
): Promise<ExecutionAdapterResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ExecutionAdapterResult>((resolve) => {
    timer = setTimeout(() => {
      resolve(timeoutResult(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      adapter.execute(intent, {
        orgId: params.orgId,
        intentId: intent.id,
        idempotencyKey: intent.idempotency_key,
        actorId: params.actorId,
        actorName: params.actorName,
        signal: controller.signal,
        now,
      }),
      timeout,
    ]);
  } catch (err) {
    return {
      ok: false,
      errorCode: "adapter_error",
      message: err instanceof Error ? err.message : "Dış adaptör bilinmeyen hata verdi.",
      retryable: true,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executeApprovedIntent(
  params: ExecuteApprovedIntentParams,
  deps: ExecuteApprovedIntentDependencies
): Promise<ExecuteApprovedIntentResult> {
  const intent = await loadExecutableIntent(params.orgId, params.intentId);
  const adapter = intent.target_system ? deps.registry.get(intent.target_system) : undefined;
  validateExecutableIntent(intent, deps.policy, adapter);

  const claimed = await claimExecutionAttempt({
    orgId: params.orgId,
    intentId: intent.id,
    actionId: intent.action_id,
    decisionId: intent.decision_id,
    adapterId: adapter!.id,
    targetSystem: intent.target_system!,
    idempotencyKey: intent.idempotency_key,
    payloadHash: intent.payload_hash,
    actorId: params.actorId,
    actorName: params.actorName,
  });
  if (!claimed.claimed) {
    throw new ExecutionGatewayError(
      `Bu yürütme hazırlığı için daha önce deneme yapıldı (${claimed.attempt.status}).`,
      "already_attempted"
    );
  }

  const result = await runAdapter(
    adapter!,
    intent,
    params,
    deps.policy.timeoutMs,
    deps.now ?? (() => new Date())
  );
  const attempt = await finishExecutionAttempt({
    orgId: params.orgId,
    intentId: intent.id,
    result,
    actorId: params.actorId,
    actorName: params.actorName,
  });

  if (!result.ok) {
    throw new ExecutionGatewayError(result.message, result.errorCode === "timeout" ? "timeout" : "adapter_failed");
  }

  const storedIntent = Object.fromEntries(
    Object.entries(intent).filter(([key]) => key !== "action_status" && key !== "decision_state")
  ) as unknown as ExecutionIntentRow;
  return { intent: storedIntent, attempt, created: true };
}
