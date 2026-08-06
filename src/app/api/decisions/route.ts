import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import { recordDecision, updateDecisionState, DECISION_STATES } from "@/lib/db/repos/decisions";
import { createAction } from "@/lib/db/repos/actions";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const postSchema = z.object({
  caseId: z.string().min(1).max(300),
  sectorId: z.string().min(1).max(300),
  choice: z.enum(["accepted", "rejected", "modified"]),
  reason: z.string().max(20000).optional(),
  chosenAction: z.string().max(300).optional(),
});

const patchSchema = z.object({
  decisionId: z.string().min(1).max(300),
  state: z.enum(DECISION_STATES),
});

/**
 * İnsan kararının kaydı (kabul/ret/değiştir) — record_decision izni gerekir.
 * Maddi kararlar daima insan onaylıdır; AI bu ucu çağıramaz.
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

  // Vaka bu kuruma mı ait? (org daima oturumdan — başka kurumun vakası 404)
  const db = getDb();
  const owns = await db.query<{ sector_id: string }>(
    "SELECT sector_id FROM decision_cases WHERE id = $1 AND org_id = $2",
    [body.caseId, session.orgId]
  );
  if (owns.rows.length === 0) {
    return NextResponse.json({ error: "Vaka bulunamadı." }, { status: 404 });
  }

  const recordId = await recordDecision({
    orgId: session.orgId,
    caseId: body.caseId,
    sectorId: owns.rows[0].sector_id,
    choice: body.choice,
    decidedBy: session.displayName,
    payload: { reason: body.reason ?? "", chosenAction: body.chosenAction ?? "" },
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "decision_made",
    summary: `Karar verildi: ${body.choice}`,
    detail: body.caseId,
  });

  // Kabul/değiştir kararı hesap verebilir bir aksiyon doğurur (döngü:
  // Karar -> Aksiyon). Reddedilen kararlar aksiyon üretmez.
  let actionId: string | null = null;
  if (body.choice === "accepted" || body.choice === "modified") {
    const title = body.chosenAction?.trim() || "Onaylanan kararın uygulanması";
    actionId = await createAction({
      orgId: session.orgId,
      decisionId: recordId,
      caseId: body.caseId,
      title,
      owner: session.displayName,
    });
    await recordAuditEvent({
      orgId: session.orgId,
      actor: session.displayName,
      type: "action_created",
      summary: `Aksiyon oluşturuldu: ${title}`,
      detail: actionId,
    });
  }

  return NextResponse.json({ recordId, actionId });
}

/** Karar kaydının yaşam döngüsü durumunu günceller (draft → ... → closed). */
export async function PATCH(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updated = await updateDecisionState(session.orgId, body.decisionId, body.state);
  if (!updated) {
    return NextResponse.json({ error: "Karar kaydı bulunamadı." }, { status: 404 });
  }

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "decision_state_updated",
    summary: `Karar durumu güncellendi: ${body.state}`,
    detail: body.decisionId,
  });

  return NextResponse.json({ ok: true });
}
