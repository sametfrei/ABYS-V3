import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { verifyAuditChain } from "@/lib/db/repos/audit";

/**
 * Kurumun denetim günlüğü — view_audit izni gerekir (denetçi, yönetim).
 * ?verify=1 ile hash zincirinin kurcalanmadığını doğrular (aynı izin).
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_audit")) {
    return NextResponse.json({ error: permissionError("view_audit") }, { status: 403 });
  }

  if (req.nextUrl.searchParams.get("verify") === "1") {
    const result = await verifyAuditChain(session.orgId);
    return NextResponse.json({ verify: result });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100), 500);
  await migrate();
  const r = await getDb().query<{
    id: string;
    actor: string;
    type: string;
    summary: string;
    detail: string | null;
    created_at: string;
  }>(
    `SELECT id, actor, type, summary, detail, created_at FROM audit_events
     WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [session.orgId, limit]
  );
  return NextResponse.json({ events: r.rows });
}
