import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { loadTaisRiskInputs, computeTaisRisks } from "@/lib/demo/tais/risks";
import { TAIS_REFERENCE_NOW } from "@/lib/demo/tais/seed";

/**
 * TAIS risk motorunun ürettiği TÜM riskler (12 kural, kanıt kayıtlarıyla).
 * Yalnızca TAIS demo verisi bulunan kurumlarda anlamlıdır — org'da hiç TAIS
 * satırı yoksa 404 döner (bkz. /api/tais/executive-summary ile aynı desen).
 * Bu uç, mevcut `signals` tablosunun (bkz. /api/signals) yerine geçmez —
 * TAIS'e özgü, DB'ye yazılmayan, istek anında hesaplanan risk listesidir.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  await migrate();
  const db = getDb();
  const orgId = session.orgId;

  const customerCountRow = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM tais_customers WHERE org_id = $1",
    [orgId]
  );
  if ((customerCountRow.rows[0]?.n ?? 0) === 0) {
    return NextResponse.json({ error: "Bu kurumda TAIS demo verisi bulunamadı." }, { status: 404 });
  }

  const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
  const risks = computeTaisRisks(inputs);

  return NextResponse.json({
    dataMode: "Bitrix24 uyumlu demo verisi",
    referenceNow: TAIS_REFERENCE_NOW,
    risks,
  });
}
