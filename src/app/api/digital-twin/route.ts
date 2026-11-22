import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { getEnterpriseState } from "@/lib/db/repos/enterprise-state";
import { localizedError, requestLocale } from "@/lib/api-i18n";
import { t } from "@/lib/i18n";

/** GET — kanonik iş verisinden mevcut veya `asOf` zaman noktalı durum projeksiyonu. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const rawAsOf = req.nextUrl.searchParams.get("asOf");
  if (rawAsOf) {
    const parsed = new Date(rawAsOf);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: t(requestLocale(req), "api.twin.invalidAsOf") },
        { status: 400 }
      );
    }
    return NextResponse.json(await getEnterpriseState(session.orgId, { asOf: parsed }));
  }
  return NextResponse.json(await getEnterpriseState(session.orgId));
}
