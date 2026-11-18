import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import {
  getOrganizationConsolidation,
  getTopOpenDecisions,
} from "@/lib/db/repos/organizations";

/**
 * GET /api/organizations/consolidation — holding/şirket/şube konsolide görünüm.
 * Kök oturumdan gelir; her kurum için açık risk, karar ve aksiyon sayıları.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
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
