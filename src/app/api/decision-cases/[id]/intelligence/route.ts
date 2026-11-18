import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { getDb, migrate } from "@/lib/db/client";
import { getKpiSeries } from "@/lib/db/repos/forecast";
import { forecastSeries } from "@/lib/forecasting";
import { detectAnomalies } from "@/lib/anomaly";
import { buildDecisionBrief, type BriefCase } from "@/lib/decision-brief";
import type { AiDecisionCase } from "@/lib/ai/provider";

interface CaseRow {
  id: string;
  title: string;
  severity: string;
  confidence: number;
  payload: AiDecisionCase & { metricLabel?: string };
}

/**
 * GET /api/decision-cases/[id]/intelligence — vaka için çok kaynaklı,
 * izlenebilir karar brifingi. Girdiler org kapsamlı okunur; sayılar mevcut
 * deterministik motorlardan gelir. Tahmin yalnızca vaka payload'ında açıkça
 * `metricLabel` varsa üretilir (yanlış metrik eşlemesi yapılmaz).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const { id } = await params;
  await migrate();
  const db = getDb();

  const caseResult = await db.query<CaseRow>(
    `SELECT id, title, severity, confidence, payload FROM decision_cases
      WHERE org_id = $1 AND id = $2`,
    [session.orgId, id]
  );
  const row = caseResult.rows[0];
  if (!row) return NextResponse.json({ error: "Vaka bulunamadı." }, { status: 404 });

  const payload = row.payload;
  const metricLabel = typeof payload.metricLabel === "string" ? payload.metricLabel : null;

  const [signalsResult, causalResult, outcomesResult] = await Promise.all([
    db.query<{ severity: string; title: string }>(
      `SELECT severity, title FROM signals WHERE org_id = $1 AND status = 'open'
        ORDER BY created_at DESC LIMIT 10`,
      [session.orgId]
    ),
    db.query<{ from_label: string; to_label: string; relation_status: string; confidence: number }>(
      `SELECT from_label, to_label, relation_status, confidence FROM causal_links
        WHERE org_id = $1 AND case_id = $2 ORDER BY created_at DESC LIMIT 10`,
      [session.orgId, id]
    ),
    db.query<{ result: string; lesson: string | null }>(
      `SELECT result, lesson FROM outcomes WHERE org_id = $1
        ORDER BY created_at DESC LIMIT 5`,
      [session.orgId]
    ),
  ]);

  let forecast: Parameters<typeof buildDecisionBrief>[0]["forecast"] = null;
  let anomalies: ReturnType<typeof detectAnomalies> = [];
  if (metricLabel) {
    const series = await getKpiSeries(session.orgId, metricLabel);
    const result = forecastSeries(series.values, 1);
    if (result) {
      const point = result.points[0];
      forecast = {
        label: metricLabel,
        model: result.model,
        evidence: result.evidence,
        p10: point.p10,
        p50: point.value,
        p90: point.p90,
        horizon: result.horizon,
        unit: "",
      };
    }
    anomalies = detectAnomalies(series.values, { timestamps: series.timestamps, maxResults: 3 });
  }

  const briefCase: BriefCase = {
    title: row.title,
    severity: row.severity,
    confidence: Number(row.confidence),
    businessImpact: payload.businessImpact ?? "",
    confidenceRationale: payload.confidenceRationale ?? "",
    evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
    assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
    options: Array.isArray(payload.options)
      ? payload.options.map((o) => {
          const raw = o as unknown as Record<string, unknown>;
          return {
            label: String(raw.title ?? raw.label ?? "Seçenek"),
            description: typeof raw.detail === "string" ? raw.detail : typeof raw.description === "string" ? raw.description : undefined,
            projection:
              typeof raw.expectedOutcome === "string"
                ? raw.expectedOutcome
                : typeof raw.projection === "string"
                  ? raw.projection
                  : undefined,
            impact: typeof raw.tradeoffs === "string" ? raw.tradeoffs : typeof raw.impact === "string" ? raw.impact : undefined,
            risk: typeof raw.feasibilityNote === "string" ? raw.feasibilityNote : undefined,
          };
        })
      : [],
    recommendedOptionRank: Number(payload.recommendedOptionRank ?? 1),
  };

  const brief = buildDecisionBrief({
    case: briefCase,
    signals: signalsResult.rows,
    forecast,
    anomalies,
    causal: causalResult.rows.map((l) => ({
      fromLabel: l.from_label,
      toLabel: l.to_label,
      relationStatus: l.relation_status,
      confidence: Number(l.confidence),
    })),
    outcomes: outcomesResult.rows,
  });

  return NextResponse.json({
    caseId: id,
    brief,
    sources: {
      metricLabel,
      forecastUsed: forecast !== null,
      anomalyCount: anomalies.length,
      causalCount: causalResult.rows.length,
      outcomeCount: outcomesResult.rows.length,
      openSignalCount: signalsResult.rows.length,
    },
    provenance: {
      engine: "decision-brief.ts (deterministik kanıt birleşimi)",
      note: "Sayılar tahmin/anomali motorlarından gelir; LLM sayı üretmez.",
    },
  });
}
