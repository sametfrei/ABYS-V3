import type { ExecutionIntentRow } from "@/lib/db/repos/execution-intents";

export interface ExecutionPolicy {
  allowedTargets: ReadonlySet<string>;
  maxPayloadBytes: number;
  timeoutMs: number;
}

export interface ExecutionContext {
  orgId: string;
  intentId: string;
  idempotencyKey: string;
  actorId: string;
  actorName: string;
  signal: AbortSignal;
  now: () => Date;
}

export type ExecutionAdapterResult =
  | {
      ok: true;
      responseStatus?: number;
      reference?: string;
      detail?: string;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
      retryable?: boolean;
    };

export interface ExecutionAdapter {
  id: string;
  targetSystem: string;
  validate(intent: ExecutionIntentRow): string[];
  execute(intent: ExecutionIntentRow, context: ExecutionContext): Promise<ExecutionAdapterResult>;
}

export class ExecutionGatewayError extends Error {
  readonly code = "EXECUTION_GATEWAY_REJECTED";

  constructor(
    message: string,
    public readonly reason:
      | "not_found"
      | "not_approved"
      | "invalid_action_state"
      | "target_missing"
      | "target_not_allowed"
      | "payload_too_large"
      | "adapter_missing"
      | "adapter_invalid"
      | "adapter_failed"
      | "already_attempted"
      | "timeout"
  ) {
    super(message);
    this.name = "ExecutionGatewayError";
  }
}

function positiveInteger(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.round(parsed), max);
}

export function executionPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): ExecutionPolicy {
  const allowedTargets = new Set(
    (env.ABYS_EXECUTION_ALLOWED_TARGETS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return {
    allowedTargets,
    maxPayloadBytes: positiveInteger(env.ABYS_EXECUTION_MAX_PAYLOAD_BYTES, 64 * 1024, 512 * 1024),
    timeoutMs: positiveInteger(env.ABYS_EXECUTION_TIMEOUT_MS, 15_000, 60_000),
  };
}

export class ExecutionAdapterRegistry {
  private readonly adapters = new Map<string, ExecutionAdapter>();

  register(adapter: ExecutionAdapter): void {
    if (!adapter.id.trim() || !adapter.targetSystem.trim()) {
      throw new Error("Adaptör kimliği ve hedef sistemi zorunludur.");
    }
    if (this.adapters.has(adapter.targetSystem)) {
      throw new Error(`Hedef sistem için adaptör zaten kayıtlı: ${adapter.targetSystem}`);
    }
    this.adapters.set(adapter.targetSystem, adapter);
  }

  get(targetSystem: string): ExecutionAdapter | undefined {
    return this.adapters.get(targetSystem);
  }

  list(): ExecutionAdapter[] {
    return [...this.adapters.values()];
  }
}
