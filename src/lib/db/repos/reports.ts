import { randomBytes } from "node:crypto";
import { migrate, getDb } from "../client";
import { recordAuditEventInTransaction } from "./audit";

export interface SavedReportRecord {
  id: string;
  title: string;
  reportType: string;
  roleId: string;
  content: string;
  createdAt: string | Date;
  createdByName: string;
}

export async function listSavedReports(orgId: string, limit = 50): Promise<SavedReportRecord[]> {
  await migrate();
  const result = await getDb().query<SavedReportRecord>(
    `SELECT id,title,report_type AS "reportType",role_id AS "roleId",content,
            created_at AS "createdAt",created_by_name AS "createdByName"
       FROM saved_reports WHERE org_id=$1 AND deleted_at IS NULL
      ORDER BY created_at DESC,id DESC LIMIT $2`,
    [orgId, Math.max(1, Math.min(100, limit))]
  );
  return result.rows;
}

export async function createSavedReport(params: {
  orgId: string; actorId: string; actorName: string; roleId: string;
  title: string; reportType: string; content: string;
}): Promise<string> {
  await migrate();
  const title = params.title.trim();
  const content = params.content.trim();
  const reportType = params.reportType.trim();
  if (!title || title.length > 200) throw new Error("Report title must be between 1 and 200 characters.");
  if (!content || content.length > 20_000) throw new Error("Report content must be between 1 and 20000 characters.");
  if (!reportType || reportType.length > 80) throw new Error("Report type must be between 1 and 80 characters.");
  return getDb().transaction(async (tx) => {
    const id = randomBytes(12).toString("hex");
    await tx.query(
      `INSERT INTO saved_reports (id,org_id,title,report_type,role_id,content,created_by_id,created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, params.orgId, title, reportType, params.roleId, content, params.actorId, params.actorName]
    );
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.actorName, type: "report_saved",
      summary: `Decision report saved: ${title}`,
      detail: JSON.stringify({ reportId: id, reportType, roleId: params.roleId }),
    });
    return id;
  });
}

export async function deleteSavedReport(params: {
  orgId: string; reportId: string; actorId: string; actorName: string;
}): Promise<boolean> {
  await migrate();
  return getDb().transaction(async (tx) => {
    const existing = await tx.query<{ id: string; title: string }>(
      "SELECT id,title FROM saved_reports WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",
      [params.orgId, params.reportId]
    );
    if (!existing.rows[0]) return false;
    await tx.query(
      "UPDATE saved_reports SET deleted_at=now(),deleted_by_id=$3 WHERE org_id=$1 AND id=$2",
      [params.orgId, params.reportId, params.actorId]
    );
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.actorName, type: "report_deleted",
      summary: `Decision report deleted: ${existing.rows[0].title}`,
      detail: JSON.stringify({ reportId: params.reportId }),
    });
    return true;
  });
}
