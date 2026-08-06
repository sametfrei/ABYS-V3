import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { loadTaisKpiInputs, computeTaisKpis } from "@/lib/demo/tais/kpi";
import { loadTaisRiskInputs, computeTaisRisks } from "@/lib/demo/tais/risks";
import { TAIS_REFERENCE_NOW } from "@/lib/demo/tais/seed";
import { TAIS_CATEGORIES, type TaisCategoryId } from "@/lib/demo/tais/data";
import type { AiDecisionCase } from "@/lib/ai/provider";
import {
  TAIS_EXEC_RANGES,
  RANGE_LABEL,
  filterExecutiveInputs,
  computeServiceAreaStatuses,
  selectTopRisks,
  pickMainDecision,
  selectTopActions,
  buildExecutiveBrief,
  healthLevel,
  type TaisExecRange,
  type TaisExecFilters,
  type TaisDecisionMeta,
  type TaisActionRow,
} from "@/lib/demo/tais/executive-summary";

/**
 * TAIS "30 saniyelik yönetici ekranı" veri ucu. Yalnızca TAIS demo verisi
 * bulunan kurumlarda anlamlıdır — org'da hiç TAIS satırı yoksa 404 döner
 * (UI bunu "bu ekran uygulanamaz" olarak yorumlar, bkz. CommandCenter deseni).
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

  const url = new URL(req.url);
  const rangeParam = url.searchParams.get("range");
  const range: TaisExecRange = (TAIS_EXEC_RANGES as readonly string[]).includes(rangeParam ?? "")
    ? (rangeParam as TaisExecRange)
    : "today";
  const categoryParam = url.searchParams.get("serviceType");
  const category: TaisCategoryId | null =
    categoryParam && TAIS_CATEGORIES.some((c) => c.id === categoryParam) ? (categoryParam as TaisCategoryId) : null;
  const customerId = url.searchParams.get("customer") || null;
  const locationId = url.searchParams.get("location") || null;
  const filters: TaisExecFilters = { range, category, customerId, locationId };

  const [kpiInputsFull, riskInputsFull] = await Promise.all([
    loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW),
    loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW),
  ]);

  const { kpiInputs, riskInputs } = filterExecutiveInputs(kpiInputsFull, riskInputsFull, filters);
  const kpis = computeTaisKpis(kpiInputs);
  const risks = computeTaisRisks(riskInputs);
  const topRisks = selectTopRisks(risks, 3);
  const serviceAreas = computeServiceAreaStatuses(kpiInputsFull, riskInputsFull, { range, customerId, locationId });
  const filteredRiskIds = new Set(risks.map((r) => r.id));

  // TAIS'in sabit 6 kararı (bkz. src/lib/demo/tais/decisions.ts) + bağlı risk id'leri
  const caseRows = await db.query<{
    id: string;
    payload: AiDecisionCase;
  }>(
    `SELECT id, payload FROM decision_cases
     WHERE org_id = $1 AND category_id LIKE 'tais-decision:%'
     ORDER BY created_at ASC`,
    [orgId]
  );
  const decisionMeta: TaisDecisionMeta[] = [];
  for (const c of caseRows.rows) {
    const rec = await db.query<{ id: string; state: string; payload: { riskIds?: string[] } }>(
      `SELECT id, state, payload FROM decision_records
       WHERE org_id = $1 AND case_id = $2 ORDER BY created_at ASC LIMIT 1`,
      [orgId, c.id]
    );
    const r = rec.rows[0];
    if (!r) continue;
    decisionMeta.push({
      caseId: c.id,
      decisionId: r.id,
      state: r.state ?? "approved",
      riskIds: r.payload?.riskIds ?? [],
      case: c.payload,
    });
  }
  const main = pickMainDecision(decisionMeta, filteredRiskIds);

  const actionRows = await db.query<{
    id: string;
    decision_id: string;
    case_id: string;
    title: string;
    owner: string;
    due_at: string | null;
    status: string;
    related_risk_id: string | null;
  }>(
    `SELECT id, decision_id, case_id, title, owner, due_at, status, related_risk_id FROM actions
     WHERE org_id = $1 AND status IN ('open', 'in_progress')
     ORDER BY (due_at IS NULL), due_at ASC`,
    [orgId]
  );
  const actionRowsMapped: TaisActionRow[] = actionRows.rows.map((a) => ({
    id: a.id,
    decisionId: a.decision_id,
    caseId: a.case_id,
    title: a.title,
    owner: a.owner,
    dueAt: a.due_at,
    status: a.status,
    relatedRiskId: a.related_risk_id,
  }));
  const topActions = selectTopActions(actionRowsMapped, filteredRiskIds, main?.decisionId ?? null, 3);

  const brief = buildExecutiveBrief({
    range,
    kpis,
    topRisks,
    main,
    actionCount: topActions.length,
    totalRiskCount: risks.length,
    criticalRiskCount: risks.filter((risk) => risk.severity === "critical").length,
    warningRiskCount: risks.filter((risk) => risk.severity === "warning").length,
  });

  const lastAudit = await db.query<{ created_at: string }>(
    "SELECT created_at FROM audit_events WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1",
    [orgId]
  );

  return NextResponse.json({
    dataMode: "Bitrix24 uyumlu demo verisi",
    referenceNow: TAIS_REFERENCE_NOW,
    lastUpdatedAt: lastAudit.rows[0]?.created_at ?? null,
    periodLabel: RANGE_LABEL[range],
    healthLevel: healthLevel(kpis.management.operationsHealthScore),
    filters,
    kpis,
    topRisks,
    totalRiskCount: risks.length,
    criticalRiskCount: risks.filter((risk) => risk.severity === "critical").length,
    serviceAreas,
    main,
    topActions,
    brief,
    dimensions: {
      customers: riskInputsFull.customers.map((c) => ({ id: c.id, name: c.name })),
      locations: riskInputsFull.locations.map((l) => ({ id: l.id, name: l.name, category: l.category, customerId: l.customerId })),
    },
  });
}
