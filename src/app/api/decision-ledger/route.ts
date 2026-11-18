import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { getLedgerEntries, getLedgerSummary } from "@/lib/db/repos/decision-ledger";

/**
 * GET /api/decision-ledger — karar geçmişi ve kaydedilmiş sonuçlar.
 * org_id oturumdan gelir; kayıtlar yalnızca kendi kurumundan okunur.
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

  const [summary, entries] = await Promise.all([
    getLedgerSummary(session.orgId),
    getLedgerEntries(session.orgId),
  ]);

  return NextResponse.json({ summary, entries });
}
