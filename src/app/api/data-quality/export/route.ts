import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { listIssues, type QualityStatus } from "@/lib/db/repos/data-quality";
import { toDataQualityCsv } from "@/lib/data-quality-csv";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

/**
 * GET /api/data-quality/export — karantina kayıtlarını CSV olarak indirir.
 * Yalnızca `ingest_data` izni; kurum kapsamı oturumdan gelir. Payload alanı
 * dışa aktarılmaz. En fazla 500 kayıt dışa aktarılır.
 */
const MAX_EXPORT_ROWS = 500;

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const rawStatus = req.nextUrl.searchParams.get("status") ?? "pending";
  const status: QualityStatus | "all" =
    rawStatus === "all" || rawStatus === "resolved" || rawStatus === "discarded"
      ? rawStatus
      : "pending";

  const issues = await listIssues(session.orgId, status, MAX_EXPORT_ROWS);
  const csv = toDataQualityCsv(issues);
  const stamp = new Date().toISOString().slice(0, 10);

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "data_quality_exported",
    summary: `${issues.length} karantina kaydı CSV olarak dışa aktarıldı`,
    detail: `status=${status} limit=${MAX_EXPORT_ROWS}`,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="data-quality-${status}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
