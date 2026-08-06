import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import { recordOutcome, listLessons } from "@/lib/db/repos/actions";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const postSchema = z.object({
  decisionId: z.string().min(1).max(300),
  result: z.enum(["improved", "unchanged", "worsened"]),
  note: z.string().trim().min(1).max(20000),
  lesson: z.string().trim().max(20000).optional(),
});

/** Kurumsal dersler (sonucu kaydedilmiş kararlardan) — hafıza görünümü. */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const lessons = await listLessons(session.orgId);
  return NextResponse.json({ lessons });
}

/**
 * Gerçekleşen sonucu kaydeder (döngünün kapanışı: Aksiyon -> Sonuç -> Ders).
 * record_decision izni gerekir; karar bu kuruma ait olmalı.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const db = getDb();
  const owns = await db.query(
    "SELECT 1 FROM decision_records WHERE id = $1 AND org_id = $2",
    [body.decisionId, session.orgId]
  );
  if (owns.rows.length === 0) {
    return NextResponse.json({ error: "Karar kaydı bulunamadı." }, { status: 404 });
  }

  const outcomeId = await recordOutcome({
    orgId: session.orgId,
    decisionId: body.decisionId,
    result: body.result,
    note: body.note.trim(),
    lesson: body.lesson?.trim(),
    recordedBy: session.displayName,
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "outcome_recorded",
    summary: `Sonuç kaydedildi: ${body.result}`,
    detail: body.decisionId,
  });

  return NextResponse.json({ outcomeId });
}
