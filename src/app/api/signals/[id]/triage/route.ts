import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { updateSignalStatus, type SignalTriageStatus } from "@/lib/db/repos/data";

const STATUSES: SignalTriageStatus[] = ["open", "handled", "snoozed", "escalated"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "triage_signals")) {
    return NextResponse.json({ error: permissionError("triage_signals") }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid signal status." }, { status: 400 });
  }
  const updated = await updateSignalStatus({
    orgId: session.orgId,
    signalId: id,
    status: body.status,
    actorId: session.userId,
    actorName: session.displayName,
  });
  return updated
    ? NextResponse.json({ updated: true, status: body.status })
    : NextResponse.json({ error: "Signal not found." }, { status: 404 });
}
