import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { listForecastSnapshots } from "@/lib/db/repos/forecast-snapshots";
import { toSnapshotCsv } from "@/lib/forecast-snapshot-csv";
import { localizedError } from "@/lib/api-i18n";

/**
 * GET /api/forecast/snapshots/export — kalibrasyon kayıtlarını CSV indirir.
 * Salt okunur ve kurum kapsamlıdır; isteğe bağlı `label` filtresi destekler.
 */
const MAX_EXPORT_ROWS = 200;

export async function GET(req: Request) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const url = new URL(req.url);
  const label = url.searchParams.get("label")?.trim() || undefined;

  const records = await listForecastSnapshots({
    orgId: session.orgId,
    label,
    limit: MAX_EXPORT_ROWS,
  });
  const csv = toSnapshotCsv(records);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="forecast-snapshots-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
