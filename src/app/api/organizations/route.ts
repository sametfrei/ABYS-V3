import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { listOrganizationSubtree } from "@/lib/db/repos/organizations";
import { migrationRequiredPayload, pendingMigration } from "@/lib/db/migration-guard";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/**
 * GET /api/organizations — oturum org'unun hiyerarşik alt ağacı.
 * Kök HER ZAMAN oturumdan alınır; istemci başka bir kök seçemez.
 * Bu, holding yapısında bir şirket/şube kullanıcısının yalnızca kendi
 * alt ağacını görmesini sağlar.
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

  const orgs = await listOrganizationSubtree(session.orgId);
  return NextResponse.json({ rootOrgId: session.orgId, organizations: orgs });
}
