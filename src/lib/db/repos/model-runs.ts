import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";

/**
 * Model çalışma kaydı (master plan md.19): her AI koşusunun izi.
 * Hangi sağlayıcı/model, hangi politika altında, ne kadar sürede, çıktı
 * geçerli mi. İzlenebilirlik ("hangi motor üretti") ve benchmark için.
 */
export async function logModelRun(params: {
  orgId: string;
  taskType: string;
  provider: string;
  model?: string;
  policy?: string;
  latencyMs: number;
  outputValid: boolean;
  resultCount?: number;
  actor?: string;
}): Promise<void> {
  await migrate();
  await getDb().query(
    `INSERT INTO model_runs (id, org_id, task_type, provider, model, policy, latency_ms, output_valid, result_count, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      randomBytes(8).toString("hex"),
      params.orgId,
      params.taskType,
      params.provider,
      params.model ?? null,
      params.policy ?? null,
      params.latencyMs,
      params.outputValid,
      params.resultCount ?? null,
      params.actor ?? null,
    ]
  );
}

export async function listModelRuns(orgId: string, limit = 50) {
  await migrate();
  const r = await getDb().query(
    `SELECT task_type, provider, model, policy, latency_ms, output_valid, result_count, created_at
     FROM model_runs WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [orgId, limit]
  );
  return r.rows;
}
