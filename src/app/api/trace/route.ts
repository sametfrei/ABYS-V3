import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";

/**
 * İzlenebilirlik ucu (master plan md.8/18): bir karar vakasının TÜM köken
 * zinciri. Yönetici bir iddiaya tıkladığında ne gördüğü:
 *  - vakayı üreten model koşusu (hangi sağlayıcı/model, hangi politika, süre)
 *  - kanıt kayıtları (güvenilirlik etiketleriyle)
 *  - güven skoru + gerekçesi (doğrulayıcı notu dahil)
 *  - vakadan doğan kararlar ve o kararlardan doğan aksiyonlar/sonuçlar
 *  - ilgili denetim olayları
 * Hepsi org-izolasyonlu; başka kurumun vakası 404.
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const caseId = req.nextUrl.searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ error: "caseId gerekli." }, { status: 400 });

  await migrate();
  const db = getDb();
  const org = session.orgId;

  const caseRow = await db.query<{
    id: string;
    sector_id: string;
    severity: string;
    title: string;
    confidence: number;
    status: string;
    payload: {
      evidence?: { source: string; fact: string; reliability: string }[];
      confidenceRationale?: string;
      assumptions?: string[];
      historicalComparison?: string;
    };
    created_at: string;
  }>(
    `SELECT id, sector_id, severity, title, confidence, status, payload, created_at
     FROM decision_cases WHERE id = $1 AND org_id = $2`,
    [caseId, org]
  );
  const c = caseRow.rows[0];
  if (!c) return NextResponse.json({ error: "Vaka bulunamadı." }, { status: 404 });

  // Vakayı üreten model koşusu: aynı kurumda, vakadan hemen önceki analiz koşusu.
  const run = await db.query<{
    provider: string;
    model: string | null;
    policy: string | null;
    latency_ms: number;
    output_valid: boolean;
    created_at: string;
  }>(
    `SELECT provider, model, policy, latency_ms, output_valid, created_at FROM model_runs
     WHERE org_id = $1 AND task_type = 'decision_cases' AND created_at >= $2::timestamptz - interval '5 minutes'
     ORDER BY created_at ASC LIMIT 1`,
    [org, c.created_at]
  );

  // Vakadan doğan kararlar + her kararın aksiyonları ve sonucu
  const decisions = await db.query<{
    id: string;
    choice: string;
    decided_by: string;
    payload: { reason?: string; chosenAction?: string };
    outcome: { result?: string; note?: string; lesson?: string } | null;
    created_at: string;
  }>(
    `SELECT id, choice, decided_by, payload, outcome, created_at FROM decision_records
     WHERE case_id = $1 AND org_id = $2 ORDER BY created_at DESC`,
    [caseId, org]
  );

  const actions = await db.query<{
    id: string;
    decision_id: string;
    title: string;
    owner: string;
    status: string;
    progress_note: string | null;
  }>(
    `SELECT id, decision_id, title, owner, status, progress_note FROM actions
     WHERE case_id = $1 AND org_id = $2 ORDER BY created_at DESC`,
    [caseId, org]
  );

  // Bu vakaya değen denetim olayları (detail alanında id geçenler)
  const audit = await db.query<{ type: string; actor: string; summary: string; created_at: string }>(
    `SELECT type, actor, summary, created_at FROM audit_events
     WHERE org_id = $1 AND (detail = $2 OR detail = ANY($3::text[]))
     ORDER BY created_at DESC LIMIT 20`,
    [org, caseId, decisions.rows.map((d) => d.id)]
  );

  return NextResponse.json({
    case: {
      id: c.id,
      title: c.title,
      severity: c.severity,
      status: c.status,
      confidence: c.confidence,
      confidenceRationale: c.payload?.confidenceRationale ?? "",
      assumptions: c.payload?.assumptions ?? [],
      historicalComparison: c.payload?.historicalComparison ?? "",
      evidence: c.payload?.evidence ?? [],
      createdAt: c.created_at,
    },
    producedBy: run.rows[0] ?? null,
    decisions: decisions.rows,
    actions: actions.rows,
    audit: audit.rows,
  });
}
