import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { parseAuditLimit } from "@/lib/data/route-schemas";
import { toAuditCsv, type AuditCsvRow } from "@/lib/audit-csv";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

/**
 * GET /api/audit/export — denetim günlüğünü CSV indirir (view_audit).
 * Salt okunur, kurum kapsamlı; `limit` en fazla 500 (audit ile aynı sınır).
 * Dışa aktarımın kendisi de denetim zincirine yazılır.
 */
export async function GET(req: Request) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_audit")) {
    return NextResponse.json({ error: permissionError("view_audit") }, { status: 403 });
  }

  const parsed = parseAuditLimit(new URL(req.url).searchParams.get("limit"));
  if (!parsed.ok) {
    return NextResponse.json({ error: `Geçersiz limit: ${parsed.error}` }, { status: 400 });
  }

  await migrate();
  const result = await getDb().query<Omit<AuditCsvRow, "created_at"> & { created_at: string | Date }>(
    `SELECT id, created_at, actor, type, summary, detail, prev_hash, entry_hash
       FROM audit_events
      WHERE org_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [session.orgId, parsed.limit]
  );
  const rows = result.rows.map((row) => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
  const csv = toAuditCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "audit_log_exported",
    summary: `${rows.length} denetim kaydı CSV olarak dışa aktarıldı`,
    detail: `limit=${parsed.limit}`,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
