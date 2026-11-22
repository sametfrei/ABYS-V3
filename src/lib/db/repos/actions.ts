import { randomBytes } from "crypto";
import type { Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import { recordAuditEventInTransaction } from "./audit";
import type { RealizedEconomicImpact } from "@/lib/decision-economics";

/**
 * Yürütme repository'si: aksiyonlar (karar kökenli), değişmez yürütme
 * olayları ve sonuçlar (ders). Tüm sorgular org-farkındalıklıdır. Aksiyon
 * her zaman bir karara ve vakaya bağlıdır; serbest durum ataması yapılmaz.
 */

export const ACTION_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ActionStatus, readonly ActionStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

const STATUS_LABEL: Record<ActionStatus, string> = {
  open: "açık",
  in_progress: "yürütülüyor",
  done: "tamamlandı",
  cancelled: "iptal",
};

export class ActionTransitionError extends Error {
  readonly code = "ACTION_TRANSITION_REJECTED";

  constructor(
    message: string,
    public readonly reason: "not_found" | "invalid_transition" | "decision_not_approved",
    public readonly currentStatus?: string,
    public readonly decisionState?: string
  ) {
    super(message);
    this.name = "ActionTransitionError";
  }
}

export interface ActionRow {
  id: string;
  decision_id: string;
  case_id: string;
  title: string;
  owner: string;
  due_at: string | null;
  status: ActionStatus;
  progress_note: string | null;
  /** Bu aksiyonun dayandigi risk kaydinin kimligi (varsa) — bkz. migration 17. */
  related_risk_id: string | null;
  decision_state: string;
  /** Karar kaydında beyan edilen beklenen ekonomik etki (varsa). */
  expected_impact: {
    value: number;
    currency: string;
    basis: string | null;
  } | null;
  /** Karar için en son kaydedilen gerçekleşen sonuç (varsa). */
  latest_outcome: {
    result: "improved" | "unchanged" | "worsened";
    note: string;
    lesson: string | null;
    recorded_by: string;
    recorded_at: string;
    actual_impact: {
      value: number;
      currency: string;
      measurement_start: string | null;
      measurement_end: string | null;
      evidence: string | null;
    } | null;
  } | null;
  event_count: number;
  last_event_at: string | null;
  last_event_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionEventRow {
  id: string;
  action_id: string;
  decision_id: string;
  from_status: string | null;
  to_status: string;
  progress_note: string | null;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

interface ActionDbRow
  extends Omit<ActionRow, "event_count" | "expected_impact" | "latest_outcome"> {
  event_count: number | string;
  expected_value: number | string | null;
  value_currency: string | null;
  value_basis: string | null;
  outcome_result: string | null;
  outcome_note: string | null;
  outcome_lesson: string | null;
  outcome_recorded_by: string | null;
  outcome_recorded_at: string | Date | null;
  outcome_actual_value: number | string | null;
  outcome_actual_currency: string | null;
  outcome_measurement_start: string | Date | null;
  outcome_measurement_end: string | Date | null;
  outcome_evidence: string | null;
}

type AuditWriter = (
  tx: Transaction,
  params: {
    orgId: string;
    actor: string;
    type: string;
    summary: string;
    detail?: string | null;
  }
) => Promise<string>;

export interface OutcomeHistoryRow {
  id: string;
  result: "improved" | "unchanged" | "worsened";
  note: string;
  lesson: string | null;
  recorded_by: string;
  recorded_at: string;
  actual_impact: {
    value: number;
    currency: string;
    measurement_start: string | null;
    measurement_end: string | null;
    evidence: string | null;
  } | null;
}

interface OutcomeHistoryDbRow {
  id: string;
  result: string;
  note: string;
  lesson: string | null;
  recorded_by: string;
  recorded_at: string | Date;
  actual_value: number | string | null;
  value_currency: string | null;
  measurement_start: string | Date | null;
  measurement_end: string | Date | null;
  evidence: string | null;
}

function asStatus(value: string): ActionStatus | null {
  return ACTION_STATUSES.includes(value as ActionStatus) ? (value as ActionStatus) : null;
}

function asIso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function insertActionEvent(
  tx: Transaction,
  params: {
    orgId: string;
    actionId: string;
    decisionId: string;
    fromStatus: string | null;
    toStatus: string;
    progressNote: string | null;
    actorId: string;
    actorName: string;
  }
): Promise<string> {
  const id = randomBytes(8).toString("hex");
  await tx.query(
    `INSERT INTO action_events
       (id, org_id, action_id, decision_id, from_status, to_status,
        progress_note, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      params.orgId,
      params.actionId,
      params.decisionId,
      params.fromStatus,
      params.toStatus,
      params.progressNote,
      params.actorId,
      params.actorName,
    ]
  );
  return id;
}

export interface CreateActionParams {
  orgId: string;
  decisionId: string;
  caseId: string;
  title: string;
  owner: string;
  dueAt?: string | null;
  /** İzlenebilirlik: aksiyonun dayandığı risk kaydının kimliği (örn. TaisRisk.id). */
  relatedRiskId?: string | null;
  /** Oturumdan gelen değişmez kullanıcı kimliği; görünen ad snapshot'ı ayrı tutulur. */
  actorId?: string;
  actorName?: string;
}

export async function createActionInTransaction(
  tx: Transaction,
  params: CreateActionParams
): Promise<string> {
  const id = randomBytes(8).toString("hex");
  const parent = await tx.query<{ state: string }>(
    "SELECT state FROM decision_records WHERE id = $1 AND org_id = $2",
    [params.decisionId, params.orgId]
  );
  if (!parent.rows[0]) {
    throw new ActionTransitionError(
      "Aksiyonun bağlanacağı karar kaydı bulunamadı.",
      "not_found"
    );
  }
  await tx.query(
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
  await insertActionEvent(tx, {
    orgId: params.orgId,
    actionId: id,
    decisionId: params.decisionId,
    fromStatus: null,
    toStatus: "open",
    progressNote: null,
    actorId: params.actorId ?? params.owner,
    actorName: params.actorName ?? params.owner,
  });
  return id;
}

export async function createAction(params: CreateActionParams): Promise<string> {
  await migrate();
  return getDb().transaction((tx) => createActionInTransaction(tx, params));
}

export async function listActions(
  orgId: string,
  status?: string,
  limit?: number
): Promise<ActionRow[]> {
  await migrate();
  const params: unknown[] = [orgId];
  let where = "WHERE a.org_id = $1";
  if (status) {
    params.push(status);
    where += ` AND a.status = $${params.length}`;
  }
  let limitClause = "";
  if (typeof limit === "number" && Number.isInteger(limit) && limit >= 1) {
    params.push(Math.min(limit, 2000));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await getDb().query<ActionDbRow>(
    `SELECT a.id, a.decision_id, a.case_id, a.title, a.owner, a.due_at,
            a.status, a.progress_note, a.related_risk_id, a.created_at, a.updated_at,
            d.state AS decision_state,
            d.expected_value, d.value_currency, d.value_basis,
            o.result AS outcome_result, o.note AS outcome_note, o.lesson AS outcome_lesson,
            o.recorded_by AS outcome_recorded_by, o.recorded_at AS outcome_recorded_at,
            o.actual_value AS outcome_actual_value, o.actual_currency AS outcome_actual_currency,
            o.measurement_start AS outcome_measurement_start,
            o.measurement_end AS outcome_measurement_end, o.evidence AS outcome_evidence,
            COALESCE(ec.event_count, 0)::int AS event_count,
            le.created_at AS last_event_at, le.actor_name AS last_event_by
       FROM actions a
       JOIN decision_records d ON d.id = a.decision_id AND d.org_id = a.org_id
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS event_count
           FROM action_events e
          WHERE e.org_id = a.org_id AND e.action_id = a.id
       ) ec ON true
       LEFT JOIN LATERAL (
         SELECT result, note, lesson, recorded_by, created_at AS recorded_at,
                actual_value, value_currency AS actual_currency,
                measurement_start, measurement_end, evidence
           FROM outcomes
          WHERE org_id = a.org_id AND decision_id = a.decision_id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
       ) o ON true
       LEFT JOIN LATERAL (
         SELECT e.created_at, e.actor_name
           FROM action_events e
          WHERE e.org_id = a.org_id AND e.action_id = a.id
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT 1
       ) le ON true
      ${where}
      ORDER BY a.created_at DESC${limitClause}`,
    params
  );
  return r.rows.map((row) => {
    const {
      expected_value: rawExpected,
      value_currency,
      value_basis,
      outcome_result,
      outcome_note,
      outcome_lesson,
      outcome_recorded_by,
      outcome_recorded_at,
      outcome_actual_value,
      outcome_actual_currency,
      outcome_measurement_start,
      outcome_measurement_end,
      outcome_evidence,
      ...action
    } = row;
    const expectedValue = rawExpected === null ? null : Number(rawExpected);
    const outcomeValue =
      outcome_actual_value === null ? null : Number(outcome_actual_value);
    const outcomeRecordedAt = asIso(outcome_recorded_at);
    const result =
      outcome_result === "improved" ||
      outcome_result === "unchanged" ||
      outcome_result === "worsened"
        ? outcome_result
        : null;
    return {
      ...action,
      status: asStatus(row.status) ?? "open",
      expected_impact:
        expectedValue !== null && Number.isFinite(expectedValue) && value_currency
          ? {
              value: expectedValue,
              currency: value_currency,
              basis: value_basis,
            }
          : null,
      latest_outcome:
        result && outcome_note !== null && outcome_recorded_by !== null && outcomeRecordedAt !== null
          ? {
              result,
              note: outcome_note,
              lesson: outcome_lesson,
              recorded_by: outcome_recorded_by,
              recorded_at: outcomeRecordedAt,
              actual_impact:
                outcomeValue !== null &&
                Number.isFinite(outcomeValue) &&
                outcome_actual_currency
                  ? {
                      value: outcomeValue,
                      currency: outcome_actual_currency,
                      measurement_start: asIso(outcome_measurement_start),
                      measurement_end: asIso(outcome_measurement_end),
                      evidence: outcome_evidence,
                    }
                  : null,
            }
          : null,
      event_count: Number(row.event_count),
      decision_state: row.decision_state,
    };
  });
}

export async function listActionEvents(
  orgId: string,
  actionId: string,
  limit = 100
): Promise<ActionEventRow[]> {
  await migrate();
  const r = await getDb().query<ActionEventRow>(
    `SELECT id, action_id, decision_id, from_status, to_status,
            progress_note, actor_id, actor_name, created_at
       FROM action_events
      WHERE org_id = $1 AND action_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [orgId, actionId, limit]
  );
  return r.rows;
}

/**
 * Aksiyon geçişini doğrular, günceller, değişmez olayı ve denetim kaydını
 * aynı transaction'da yazar. İstenen durum aynıysa yalnızca not olayı eklenir.
 */
export async function transitionAction(params: {
  orgId: string;
  actionId: string;
  status?: ActionStatus;
  progressNote?: string;
  actorId: string;
  actorName: string;
  auditWriter?: AuditWriter;
}): Promise<{ changed: boolean; status: ActionStatus; eventId: string | null }> {
  await migrate();
  const note = params.progressNote?.trim() || null;
  if (params.status && !ACTION_STATUSES.includes(params.status)) {
    throw new ActionTransitionError("Geçersiz aksiyon durumu.", "invalid_transition");
  }
  if (!params.status && note === null) {
    throw new ActionTransitionError("Güncellenecek durum veya ilerleme notu gerekli.", "invalid_transition");
  }

  const writeAudit = params.auditWriter ?? recordAuditEventInTransaction;
  return getDb().transaction(async (tx) => {
    const found = await tx.query<{
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
    const current = found.rows[0];
    if (!current) {
      throw new ActionTransitionError("Aksiyon bulunamadı.", "not_found");
    }
    const fromStatus = asStatus(current.status);
    if (!fromStatus) {
      throw new ActionTransitionError(
        "Aksiyonun mevcut durumu geçersiz; otomatik düzeltme yapılmadı.",
        "invalid_transition",
        current.status,
        current.decision_state
      );
    }

    const toStatus = params.status ?? fromStatus;
    if (toStatus !== fromStatus && !ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
      throw new ActionTransitionError(
        `Aksiyon '${STATUS_LABEL[fromStatus]}' durumundan '${STATUS_LABEL[toStatus]}' durumuna geçemez.`,
        "invalid_transition",
        fromStatus,
        current.decision_state
      );
    }

    if (
      toStatus === "in_progress" &&
      fromStatus === "open" &&
      current.decision_state !== "approved" &&
      current.decision_state !== "in_execution"
    ) {
      throw new ActionTransitionError(
        `Karar '${current.decision_state}' durumunda; yürütme için insan onayı gerekli.`,
        "decision_not_approved",
        fromStatus,
        current.decision_state
      );
    }

    if (toStatus === fromStatus && note === null) {
      return { changed: false, status: toStatus, eventId: null };
    }

    if (toStatus !== fromStatus || note !== null) {
      await tx.query(
        `UPDATE actions
            SET status = $3,
                progress_note = COALESCE($4, progress_note),
                updated_at = now()
          WHERE id = $1 AND org_id = $2`,
        [params.actionId, params.orgId, toStatus, note]
      );
    }

    let decisionUpdated = false;
    if (toStatus !== fromStatus && toStatus === "in_progress") {
      const d = await tx.query(
        `UPDATE decision_records
            SET state = 'in_execution'
          WHERE id = $1 AND org_id = $2 AND state IN ('approved', 'in_execution')`,
        [current.decision_id, params.orgId]
      );
      decisionUpdated = (d.affectedRows ?? 0) > 0;
      if (!decisionUpdated) {
        throw new ActionTransitionError(
          "Karar durumu yürütme başlatmaya uygun değil.",
          "decision_not_approved",
          fromStatus,
          current.decision_state
        );
      }
    } else if (toStatus !== fromStatus && toStatus === "done") {
      const d = await tx.query(
        `UPDATE decision_records
            SET state = 'outcome_review'
          WHERE id = $1 AND org_id = $2`,
        [current.decision_id, params.orgId]
      );
      decisionUpdated = (d.affectedRows ?? 0) > 0;
    }

    const eventId = await insertActionEvent(tx, {
      orgId: params.orgId,
      actionId: params.actionId,
      decisionId: current.decision_id,
      fromStatus,
      toStatus,
      progressNote: note,
      actorId: params.actorId,
      actorName: params.actorName,
    });
    await writeAudit(tx, {
      orgId: params.orgId,
      actor: params.actorName,
      type: "action_transition",
      summary:
        toStatus === fromStatus
          ? "Aksiyon ilerleme notu güncellendi"
          : `Aksiyon durumu: ${STATUS_LABEL[fromStatus]} → ${STATUS_LABEL[toStatus]}`,
      detail: JSON.stringify({
        actionId: params.actionId,
        decisionId: current.decision_id,
        fromStatus,
        toStatus,
        eventId,
        decisionUpdated,
        actorId: params.actorId,
      }),
    });

    return { changed: true, status: toStatus, eventId };
  });
}

/** Geriye uyumlu yardımcı: ayrıntılı geçiş sonucunu boolean'a indirger. */
export async function updateAction(params: {
  orgId: string;
  actionId: string;
  status?: ActionStatus;
  progressNote?: string;
  actorId?: string;
  actorName?: string;
}): Promise<boolean> {
  try {
    await transitionAction({
      orgId: params.orgId,
      actionId: params.actionId,
      status: params.status,
      progressNote: params.progressNote,
      actorId: params.actorId ?? "system",
      actorName: params.actorName ?? "Sistem",
    });
    return true;
  } catch (err) {
    if (err instanceof ActionTransitionError) return false;
    throw err;
  }
}

export async function recordOutcome(params: {
  orgId: string;
  decisionId: string;
  result: "improved" | "unchanged" | "worsened";
  note: string;
  lesson?: string;
  recordedBy: string;
  actualImpact?: RealizedEconomicImpact | null;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  const actual = params.actualImpact ?? null;
  return getDb().transaction(async (tx) => {
    await tx.query(
      `INSERT INTO outcomes
         (id, org_id, decision_id, result, note, lesson, recorded_by,
          actual_value, value_currency, measurement_start, measurement_end, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        params.orgId,
        params.decisionId,
        params.result,
        params.note,
        params.lesson ?? null,
        params.recordedBy,
        actual?.value ?? null,
        actual?.currency ?? null,
        actual?.measurementStart ?? null,
        actual?.measurementEnd ?? null,
        actual?.evidence ?? null,
      ]
    );
    const updated = await tx.query(
      `UPDATE decision_records SET outcome = $3 WHERE id = $1 AND org_id = $2`,
      [
        params.decisionId,
        params.orgId,
        JSON.stringify({
          result: params.result,
          note: params.note,
          lesson: params.lesson ?? "",
          actualImpact: actual,
        }),
      ]
    );
    if ((updated.affectedRows ?? 0) !== 1) {
      throw new Error("Sonuç bağlanacak karar kaydı bulunamadı.");
    }
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId,
      actor: params.recordedBy,
      type: "outcome_recorded",
      summary: `Sonuç kaydedildi: ${params.result}`,
      detail: params.decisionId,
    });
    return id;
  });
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

/**
 * Kurumsal karar hafızası: tek bir kararın tüm ölçüm geçmişi, yeniden eskiye.
 * org_id zorunludur; başka kurumun kararı bu sorguyla okunamaz.
 */
export async function listOutcomesForDecision(
  orgId: string,
  decisionId: string,
  limit = 20
): Promise<OutcomeHistoryRow[]> {
  await migrate();
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
  const r = await getDb().query<OutcomeHistoryDbRow>(
    `SELECT id, result, note, lesson, recorded_by, created_at AS recorded_at,
            actual_value, value_currency, measurement_start, measurement_end, evidence
       FROM outcomes
      WHERE org_id = $1 AND decision_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [orgId, decisionId, safeLimit]
  );
  return r.rows.flatMap((row) => {
    const recordedAt = asIso(row.recorded_at);
    if (
      (row.result !== "improved" && row.result !== "unchanged" && row.result !== "worsened") ||
      recordedAt === null
    ) {
      return [];
    }
    const actualValue = row.actual_value === null ? null : Number(row.actual_value);
    return [
      {
        id: row.id,
        result: row.result,
        note: row.note,
        lesson: row.lesson,
        recorded_by: row.recorded_by,
        recorded_at: recordedAt,
        actual_impact:
          actualValue !== null && Number.isFinite(actualValue) && row.value_currency
            ? {
                value: actualValue,
                currency: row.value_currency,
                measurement_start: asIso(row.measurement_start),
                measurement_end: asIso(row.measurement_end),
                evidence: row.evidence,
              }
            : null,
      },
    ];
  });
}
