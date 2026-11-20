import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import {
  ACTION_STATUSES,
  ActionTransitionError,
  listActionEvents,
  listActions,
  transitionAction,
} from "@/lib/db/repos/actions";

const patchSchema = z
  .object({
    actionId: z.string().min(1).max(300),
    status: z.enum(ACTION_STATUSES).optional(),
    progressNote: z.string().trim().max(20000).optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.status && !body.progressNote) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Durum veya ilerleme notu gerekli.",
      });
    }
  });

/** Kurumun aksiyonları. Görüntüleme view_decisions izniyle. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const eventsFor = req.nextUrl.searchParams.get("eventsFor");
  if (eventsFor) {
    if (eventsFor.length > 300) {
      return NextResponse.json({ error: "Geçersiz aksiyon kimliği." }, { status: 400 });
    }
    const events = await listActionEvents(session.orgId, eventsFor);
    return NextResponse.json({ events });
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

  try {
    const transition = await transitionAction({
      orgId: session.orgId,
      actionId: body.actionId,
      status: body.status,
      progressNote: body.progressNote,
      actorId: session.userId,
      actorName: session.displayName,
    });
    return NextResponse.json({ ok: true, ...transition });
  } catch (err) {
    if (err instanceof ActionTransitionError) {
      const status =
        err.reason === "not_found"
          ? 404
          : err.reason === "decision_not_approved"
            ? 409
            : 409;
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          reason: err.reason,
          currentStatus: err.currentStatus ?? null,
          decisionState: err.decisionState ?? null,
        },
        { status }
      );
    }
    throw err;
  }
}
