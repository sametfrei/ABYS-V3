import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { getConnectorHealthSnapshot } from "@/lib/connectors/health";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/** GET — org kapsamlı konnektör zamanlama ve çalıştırma sağlığı. */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  return NextResponse.json(await getConnectorHealthSnapshot(session.orgId));
}
