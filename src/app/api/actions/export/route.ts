import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { ACTION_STATUSES, listActions } from "@/lib/db/repos/actions";
import { toActionsCsv } from "@/lib/actions-csv";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

/**
 * GET /api/actions/export — kurumun aksiyonlarını CSV olarak indirir.
 * Görüntüleme `view_decisions` izniyle; kurum kapsamı oturumdan gelir.
 * En fazla 500 satır dışa aktarılır. Geçersiz status 400 döner.
 */
const MAX_EXPORT_ROWS = 500;

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  if (status !== undefined && !(ACTION_STATUSES as readonly string[]).includes(status)) {
    return localizedError(req, "api.actions.invalidStatus", 400);
  }

  const actions = await listActions(session.orgId, status, MAX_EXPORT_ROWS);
  const csv = toActionsCsv(actions);
  const stamp = new Date().toISOString().slice(0, 10);

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "actions_exported",
    summary: `${actions.length} aksiyon CSV olarak dışa aktarıldı`,
    detail: `status=${status ?? "all"} limit=${MAX_EXPORT_ROWS}`,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="actions-${status ?? "all"}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
