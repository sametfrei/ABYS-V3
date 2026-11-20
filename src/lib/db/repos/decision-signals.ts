import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import { recordAuditEventInTransaction } from "./audit";

export interface CaseSignalRow {
  id: string;
  signal_id: string;
  severity: string;
  title: string;
  status: string;
  link_reason: string;
  linked_by_name: string;
  created_at: string;
}

const CASE_SIGNAL_SELECT = `
  SELECT l.id, l.signal_id, s.severity, s.title, s.status,
         l.link_reason, l.linked_by_name, l.created_at
    FROM decision_case_signals l
    JOIN signals s ON s.id = l.signal_id AND s.org_id = l.org_id`;

export async function listCaseSignals(orgId: string, caseId: string): Promise<CaseSignalRow[]> {
  await migrate();
  const r = await getDb().query<CaseSignalRow>(
    `${CASE_SIGNAL_SELECT}
      WHERE l.org_id = $1 AND l.case_id = $2
      ORDER BY l.created_at DESC, l.id DESC`,
    [orgId, caseId]
  );
  return r.rows;
}

export async function linkCaseSignal(params: {
  orgId: string;
  caseId: string;
  signalId: string;
  reason: string;
  actorId: string;
  actorName: string;
}): Promise<{ link: CaseSignalRow; created: boolean }> {
  await migrate();
  const reason = params.reason.trim();
  if (!reason) throw new Error("Sinyal bağlantı gerekçesi zorunludur.");

  return getDb().transaction(async (tx) => {
    const target = await tx.query<{ case_id: string; signal_id: string }>(
      `SELECT c.id AS case_id, s.id AS signal_id
         FROM decision_cases c
         JOIN signals s ON s.id = $3 AND s.org_id = c.org_id
        WHERE c.id = $1 AND c.org_id = $2`,
      [params.caseId, params.orgId, params.signalId]
    );
    if (!target.rows[0]) throw new Error("Vaka veya sinyal bulunamadı.");

    const id = randomBytes(8).toString("hex");
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO decision_case_signals
         (id, org_id, case_id, signal_id, link_reason, linked_by_id, linked_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (org_id, case_id, signal_id) DO NOTHING
       RETURNING id`,
      [id, params.orgId, params.caseId, params.signalId, reason, params.actorId, params.actorName]
    );

    if (!inserted.rows[0]) {
      const existing = await tx.query<CaseSignalRow>(
        `${CASE_SIGNAL_SELECT}
          WHERE l.org_id = $1 AND l.case_id = $2 AND l.signal_id = $3`,
        [params.orgId, params.caseId, params.signalId]
      );
      return { link: existing.rows[0], created: false };
    }

    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId,
      actor: params.actorName,
      type: "decision_signal_linked",
      summary: `Sinyal vaka kanıtına bağlandı: ${params.signalId}`,
      detail: JSON.stringify({
        caseId: params.caseId,
        signalId: params.signalId,
        linkId: id,
        reason,
        actorId: params.actorId,
      }),
    });
    const created = await tx.query<CaseSignalRow>(`${CASE_SIGNAL_SELECT} WHERE l.id = $1 AND l.org_id = $2`, [
      id,
      params.orgId,
    ]);
    return { link: created.rows[0], created: true };
  });
}
