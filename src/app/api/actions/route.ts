import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import { listActions, updateAction } from "@/lib/db/repos/actions";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const patchSchema = z.object({
  actionId: z.string().min(1).max(300),
  status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
  progressNote: z.string().trim().max(20000).optional(),
});

/** Kurumun aksiyonları. Görüntüleme view_decisions izniyle. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const actions = await listActions(session.orgId, status);
  return NextResponse.json({ actions });
}

/** Aksiyon ilerleme/durum güncelleme — record_decision izni (yürütme sorumlusu). */
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

  const ok = await updateAction({
    orgId: session.orgId,
    actionId: body.actionId,
    status: body.status,
    progressNote: body.progressNote,
  });
  if (!ok) return NextResponse.json({ error: "Aksiyon bulunamadı." }, { status: 404 });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "action_updated",
    summary: `Aksiyon güncellendi: ${body.status ?? "not"}`,
    detail: body.actionId,
  });
  return NextResponse.json({ ok: true });
}
