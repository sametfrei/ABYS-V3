import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { localizedError } from "@/lib/api-i18n";
import { suggestCausalCandidates } from "@/lib/db/repos/causal";

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const caseId = req.nextUrl.searchParams.get("caseId");
  if (!caseId) return localizedError(req, "api.cases.caseIdRequired", 400);

  const candidates = await suggestCausalCandidates(session.orgId, caseId);
  return NextResponse.json({ candidates });
}
