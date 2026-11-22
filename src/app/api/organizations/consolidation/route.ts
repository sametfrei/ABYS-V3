import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import {
  getOrganizationConsolidation,
  getTopOpenDecisions,
} from "@/lib/db/repos/organizations";
import { migrationRequiredPayload, pendingMigration } from "@/lib/db/migration-guard";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/**
 * GET /api/organizations/consolidation — holding/şirket/şube konsolide görünüm.
 * Kök oturumdan gelir; her kurum için açık risk, karar ve aksiyon sayıları.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const requiredMigration = pendingMigration(18);
  if (requiredMigration) {
    return NextResponse.json(migrationRequiredPayload(requiredMigration), { status: 503 });
  }

  const [organizations, topDecisions] = await Promise.all([
    getOrganizationConsolidation(session.orgId),
    getTopOpenDecisions(session.orgId, 3),
  ]);
  const totals = organizations.reduce(
    (acc, org) => ({
      openSignals: acc.openSignals + org.openSignals,
      openDecisions: acc.openDecisions + org.openDecisions,
      openActions: acc.openActions + org.openActions,
      overdueActions: acc.overdueActions + org.overdueActions,
    }),
    { openSignals: 0, openDecisions: 0, openActions: 0, overdueActions: 0 }
  );

  return NextResponse.json({
    rootOrgId: session.orgId,
    organizations,
    totals,
    topDecisions,
  });
}
