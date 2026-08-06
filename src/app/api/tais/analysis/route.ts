import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { loadTaisKpiInputs, computeTaisKpis } from "@/lib/demo/tais/kpi";
import { loadTaisRiskInputs } from "@/lib/demo/tais/risks";
import { TAIS_REFERENCE_NOW } from "@/lib/demo/tais/seed";
import { TAIS_CATEGORIES } from "@/lib/demo/tais/data";
import {
  TAIS_EXEC_RANGES,
  filterExecutiveInputs,
  type TaisExecRange,
} from "@/lib/demo/tais/executive-summary";

/**
 * TAIS demo verisi için hizmet türü / ekip / lokasyon kırılımları (Analiz
 * ekranı). Aynı `computeTaisKpis` motorunu kullanır (bkz. /api/tais/
 * executive-summary) — sayılar tüm ekranlarda tutarlıdır. Org'da TAIS verisi
 * yoksa 404 döner.
 */
export async function GET(req: NextRequest) {
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

  const [kpiInputsFull, riskInputs] = await Promise.all([
    loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW),
    loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW),
  ]);
  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: TaisExecRange | null =
    rangeParam && (TAIS_EXEC_RANGES as readonly string[]).includes(rangeParam)
      ? (rangeParam as TaisExecRange)
      : null;
  const kpiInputs = range
    ? filterExecutiveInputs(kpiInputsFull, riskInputs, {
        range,
        category: null,
        customerId: null,
        locationId: null,
      }).kpiInputs
    : kpiInputsFull;
  const kpis = computeTaisKpis(kpiInputs);

  const categoryLabelById = new Map(TAIS_CATEGORIES.map((c) => [c.id, c.label]));
  const locationNameById = new Map(riskInputs.locations.map((l) => [l.id, l.name]));
  const customerNameById = new Map(riskInputs.customers.map((c) => [c.id, c.name]));
  const referenceTime = new Date(TAIS_REFERENCE_NOW).getTime();
  const upcomingRenewals = kpiInputs.contracts
    .filter((c) => {
      const days = (new Date(c.renewalDate).getTime() - referenceTime) / (24 * 60 * 60 * 1000);
      return c.status === "active" && days >= 0 && days <= 30;
    })
    .sort((a, b) => new Date(a.renewalDate).getTime() - new Date(b.renewalDate).getTime())
    .map((c) => ({
      customerName: customerNameById.get(c.customerId) ?? c.customerId,
      categoryLabel: categoryLabelById.get(c.category) ?? c.category,
      renewalDate: c.renewalDate,
      valueAzn: c.valueAzn,
    }));

  return NextResponse.json({
    dataMode: "Bitrix24 uyumlu demo verisi",
    referenceNow: TAIS_REFERENCE_NOW,
    range,
    operations: {
      ...kpis.operations,
      tasksByCategory: kpis.operations.tasksByCategory.map((row) => ({
        ...row,
        categoryLabel: categoryLabelById.get(row.category) ?? row.category,
      })),
      openWorkByLocation: kpis.operations.openWorkByLocation.map((row) => ({
        ...row,
        locationName: locationNameById.get(row.locationId) ?? row.locationId,
      })),
    },
    commercial: kpis.commercial,
    management: kpis.management,
    upcomingRenewals,
    quality: {
      openComplaintCount: kpis.operations.openComplaintCount,
      openQualityIssueCount: kpis.operations.openQualityIssueCount,
      recurringComplaintCustomerCount: kpis.operations.recurringComplaintCustomers.length,
    },
  });
}
