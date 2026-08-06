import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";

/**
 * Yönetim Komuta Merkezi veri omurgası (Faz 4).
 * Yöneticinin ~30 saniyede kurumu kavraması için tüm özet TEK sorgu setinde,
 * org-izolasyonlu döner. Her sayı kaynağına (vaka/sinyal/aksiyon/sonuç)
 * izlenebilir; UI kanıta tıkla-gör için bu id'leri kullanır.
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
  const org = session.orgId;

  // Dikkat bekleyen kararlar (açık vakalar, en yüksek kritiklik/güven önce)
  const decisions = await db.query<{
    id: string;
    title: string;
    severity: string;
    confidence: number;
    payload: {
      businessImpact?: string;
      confidenceRationale?: string;
      counterfactual?: { projectedImpact?: string; timeHorizon?: string };
      evidence?: { fact: string; reliability: string }[];
      options?: { title: string; rank: number; feasible: boolean }[];
      recommendedOptionRank?: number;
    };
    created_at: string;
  }>(
    `SELECT id, title, severity, confidence, payload, created_at FROM decision_cases
     WHERE org_id = $1 AND status = 'open'
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END,
              confidence DESC
     LIMIT 5`,
    [org]
  );

  // En kritik açık vakadan yapılandırılmış yönetici brifingi (deterministik,
  // izlenebilir — hepsi kayıttaki gerçek alanlardan; uydurma yok).
  const top = decisions.rows[0];
  const recommended = top?.payload?.options?.find((o) => o.rank === top.payload.recommendedOptionRank && o.feasible)
    ?? top?.payload?.options?.find((o) => o.feasible);
  const brief = top
    ? {
        caseId: top.id,
        currentCondition: top.title,
        businessImpact: top.payload?.businessImpact ?? "",
        nextDevelopment: top.payload?.counterfactual
          ? `${top.payload.counterfactual.projectedImpact ?? ""}${top.payload.counterfactual.timeHorizon ? ` (${top.payload.counterfactual.timeHorizon})` : ""}`.trim()
          : "",
        recommendedAction: recommended?.title ?? "",
        confidence: top.confidence,
        confidenceRationale: top.payload?.confidenceRationale ?? "",
        topEvidence: (top.payload?.evidence ?? []).slice(0, 3),
      }
    : null;

  // Sinyaller — kritiklik dağılımı + en önemli birkaçı
  const signalCounts = await db.query<{ severity: string; n: number }>(
    `SELECT severity, count(*)::int AS n FROM signals WHERE org_id = $1 AND status = 'open' GROUP BY severity`,
    [org]
  );
  const topSignals = await db.query<{ id: string; title: string; severity: string; created_at: string }>(
    `SELECT id, title, severity, created_at FROM signals WHERE org_id = $1 AND status = 'open'
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END, created_at DESC
     LIMIT 5`,
    [org]
  );

  // Aksiyonlar — açık/yürütülen sayıları + geciken (vadesi geçmiş) ilkler
  const actionCounts = await db.query<{ status: string; n: number }>(
    `SELECT status, count(*)::int AS n FROM actions WHERE org_id = $1 GROUP BY status`,
    [org]
  );
  const openActions = await db.query<{ id: string; title: string; owner: string; status: string; due_at: string | null }>(
    `SELECT id, title, owner, status, due_at FROM actions WHERE org_id = $1 AND status IN ('open','in_progress')
     ORDER BY (due_at IS NULL), due_at ASC LIMIT 5`,
    [org]
  );

  // Son ölçülen sonuçlar (aksiyonlarımız işe yarıyor mu?)
  const outcomes = await db.query<{ result: string; note: string; lesson: string | null; created_at: string }>(
    `SELECT result, note, lesson, created_at FROM outcomes WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [org]
  );

  // Son denetim olayları (tazelenme/faaliyet göstergesi)
  const lastAudit = await db.query<{ created_at: string }>(
    `SELECT created_at FROM audit_events WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [org]
  );

  const countMap = (rows: { [k: string]: string | number }[], key: string) =>
    Object.fromEntries(rows.map((r) => [r[key], Number(r.n)]));

  return NextResponse.json({
    org: { id: org, viewer: session.displayName, role: session.role },
    brief,
    decisions: decisions.rows.map(({ payload, ...rest }) => { void payload; return rest; }),
    signals: { bySeverity: countMap(signalCounts.rows, "severity"), top: topSignals.rows },
    actions: { byStatus: countMap(actionCounts.rows, "status"), open: openActions.rows },
    outcomes: outcomes.rows,
    lastActivityAt: lastAudit.rows[0]?.created_at ?? null,
  });
}
