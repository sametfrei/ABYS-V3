import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "@/lib/auth/core";
import {
  KpiOutcomeError,
  previewKpiOutcome,
  recordVerifiedKpiOutcome,
} from "@/lib/db/repos/kpi-outcomes";

const postSchema = z.object({
  decisionId: z.string().min(1).max(300),
  note: z.string().trim().max(20000).optional(),
  lesson: z.string().trim().max(20000).optional(),
  measurementEnd: z.string().datetime().optional(),
});

/**
 * KPI ile gerçekleşen sonuç ölçümü.
 *
 * GET  ?decisionId=  → kayıt yazmadan önizleme (hangi KPI, hangi iki gözlem,
 *                      hangi sonuç). Eksik veri 200 + status=insufficient
 *                      olarak açıkça döner; sahte değer üretilmez.
 * POST               → aynı deterministik ölçümü sonuç + kanıt olarak yazar.
 *                      Karar başına tek doğrulanmış ölçüm; ikincisi 409.
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const decisionId = req.nextUrl.searchParams.get("decisionId")?.trim() ?? "";
  if (!decisionId || decisionId.length > 300) {
    return NextResponse.json({ error: "Geçerli bir karar kimliği gerekli." }, { status: 400 });
  }

  const result = await previewKpiOutcome({ orgId: session.orgId, decisionId });
  if (result.status === "insufficient" && result.reason === "not_found") {
    return NextResponse.json({ error: result.detail }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await recordVerifiedKpiOutcome({
      orgId: session.orgId,
      decisionId: parsed.data.decisionId,
      note: parsed.data.note,
      lesson: parsed.data.lesson,
      measurementEnd: parsed.data.measurementEnd ?? null,
      recordedBy: session.displayName,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof KpiOutcomeError) {
      if (err.reason === "not_found") {
        return NextResponse.json({ error: err.message, reason: err.reason }, { status: 404 });
      }
      if (err.reason === "already_measured") {
        return NextResponse.json(
          { error: err.message, reason: err.reason, outcomeId: err.outcomeId },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 422 });
    }
    throw err;
  }
}
