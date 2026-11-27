import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { verifyAuditChain } from "@/lib/db/repos/audit";
import { parseAuditLimit } from "@/lib/data/route-schemas";
import { localizedError } from "@/lib/api-i18n";

/**
 * Kurumun denetim günlüğü — view_audit izni gerekir (denetçi, yönetim).
 * ?verify=1 ile hash zincirinin kurcalanmadığını doğrular (aynı izin).
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_audit")) {
    return NextResponse.json({ error: permissionError("view_audit") }, { status: 403 });
  }

  if (req.nextUrl.searchParams.get("verify") === "1") {
    const result = await verifyAuditChain(session.orgId);
    return NextResponse.json({ verify: result });
  }

  const parsedLimit = parseAuditLimit(req.nextUrl.searchParams.get("limit"));
  if (!parsedLimit.ok) {
    return NextResponse.json({ error: `Geçersiz limit: ${parsedLimit.error}` }, { status: 400 });
  }
  const limit = parsedLimit.limit;
  await migrate();
  const r = await getDb().query<{
    id: string;
    actor: string;
    type: string;
    summary: string;
    detail: string | null;
    created_at: string;
    prev_hash: string | null;
    entry_hash: string | null;
  }>(
    `SELECT id, actor, type, summary, detail, created_at, prev_hash, entry_hash FROM audit_events
     WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [session.orgId, limit]
  );
  return NextResponse.json({ events: r.rows });
}
