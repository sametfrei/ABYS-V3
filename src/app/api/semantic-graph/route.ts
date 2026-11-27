import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { getSemanticGraph } from "@/lib/db/repos/semantic-graph";
import { localizedError } from "@/lib/api-i18n";

/** GET /api/semantic-graph — kanonik kayıtlardan org-kapsamlı grafik projeksiyonu. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? "2000");
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(10_000, Math.round(rawLimit)))
    : 2_000;
  return NextResponse.json(await getSemanticGraph(session.orgId, limit));
}
