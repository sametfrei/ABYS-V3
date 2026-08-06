import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";

/**
 * Yürütme repository'si: aksiyonlar (karar kökenli) ve sonuçlar (ders).
 * Tüm sorgular org-farkındalıklı. Aksiyon her zaman bir karara ve vakaya
 * bağlıdır — köken zinciri korunur.
 */

export interface ActionRow {
  id: string;
  decision_id: string;
  case_id: string;
  title: string;
  owner: string;
  due_at: string | null;
  status: string;
  progress_note: string | null;
  /** Bu aksiyonun dayandigi risk kaydinin kimligi (varsa) — bkz. migration 17. */
  related_risk_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function createAction(params: {
  orgId: string;
  decisionId: string;
  caseId: string;
  title: string;
  owner: string;
  dueAt?: string | null;
  /** İzlenebilirlik: aksiyonun dayandığı risk kaydının kimliği (örn. TaisRisk.id). */
  relatedRiskId?: string | null;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  await getDb().query(
    `INSERT INTO actions (id, org_id, decision_id, case_id, title, owner, due_at, related_risk_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      params.orgId,
      params.decisionId,
      params.caseId,
      params.title,
      params.owner,
      params.dueAt ?? null,
      params.relatedRiskId ?? null,
    ]
  );
  return id;
}

export async function listActions(orgId: string, status?: string): Promise<ActionRow[]> {
  await migrate();
  const r = await getDb().query<ActionRow>(
    `SELECT id, decision_id, case_id, title, owner, due_at, status, progress_note, related_risk_id, created_at, updated_at
     FROM actions WHERE org_id = $1 ${status ? "AND status = $2" : ""}
     ORDER BY created_at DESC`,
    status ? [orgId, status] : [orgId]
  );
  return r.rows;
}

/** İlerleme/durum günceller; org sahipliği garanti (başka kurumun aksiyonu 0 satır). */
export async function updateAction(params: {
  orgId: string;
  actionId: string;
  status?: string;
  progressNote?: string;
}): Promise<boolean> {
  await migrate();
  const r = await getDb().query(
    `UPDATE actions SET
       status = COALESCE($3, status),
       progress_note = COALESCE($4, progress_note),
       updated_at = now()
     WHERE id = $1 AND org_id = $2`,
    [params.actionId, params.orgId, params.status ?? null, params.progressNote ?? null]
  );
  return (r.affectedRows ?? 0) > 0;
}

export async function recordOutcome(params: {
  orgId: string;
  decisionId: string;
  result: "improved" | "unchanged" | "worsened";
  note: string;
  lesson?: string;
  recordedBy: string;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  await getDb().query(
    `INSERT INTO outcomes (id, org_id, decision_id, result, note, lesson, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, params.orgId, params.decisionId, params.result, params.note, params.lesson ?? null, params.recordedBy]
  );
  // Karar kaydının outcome özetini de günceller (hafıza beslemesi için).
  await getDb().query(
    `UPDATE decision_records SET outcome = $3 WHERE id = $1 AND org_id = $2`,
    [params.decisionId, params.orgId, JSON.stringify({ result: params.result, note: params.note, lesson: params.lesson ?? "" })]
  );
  return id;
}

/** Kurumsal hafıza beslemesi: sonucu kaydedilmiş kararlardan çıkarılan dersler. */
export async function listLessons(orgId: string, limit = 20): Promise<{ result: string; note: string; lesson: string | null; created_at: string }[]> {
  await migrate();
  const r = await getDb().query<{ result: string; note: string; lesson: string | null; created_at: string }>(
    `SELECT result, note, lesson, created_at FROM outcomes
     WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [orgId, limit]
  );
  return r.rows;
}
