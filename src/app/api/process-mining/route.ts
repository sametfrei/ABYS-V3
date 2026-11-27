import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { getProcessEvents } from "@/lib/db/repos/process-events";
import { mineProcess } from "@/lib/process-mining";
import { localizedError } from "@/lib/api-i18n";

/**
 * GET /api/process-mining — entegrasyon olay günlüğünden gözlenen süreç akışı.
 * org_id oturumdan gelir. Hedef süreç modeli olmadığı için "sapma" değil,
 * geçiş hacmi, süreler ve darboğazlar raporlanır.
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return localizedError(req, "api.auth.sessionRequired", 401);
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const rawDays = Number(req.nextUrl.searchParams.get("days") ?? "90");
  const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, Math.round(rawDays))) : 90;

  const scan = await getProcessEvents(session.orgId, days);
  const result = mineProcess(
    scan.rows.map((row) => ({ subject: row.subject ?? "", type: row.type, at: Date.parse(row.at) }))
  );

  return NextResponse.json({
    ...result,
    window: { days, since: scan.since },
    coverage: {
      read: scan.totalRows,
      used: scan.rows.length,
      withoutSubject: scan.withoutSubject,
    },
    provenance: {
      engine: "process-mining.ts (transition counts, median/P90)",
      source: "integration_events",
      note: "Olay günlüğü ham verisi korunur; metrikler deterministik olarak türetilir.",
    },
  });
}
