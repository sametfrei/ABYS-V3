import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { linkExternalContextToCase, listLinkedExternalContext } from "@/lib/db/repos/external-context";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const { id } = await params;
  return NextResponse.json({ observations: await listLinkedExternalContext(session.orgId, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const linked = await linkExternalContextToCase({
      orgId: session.orgId,
      caseId: id,
      observationId: String(body.observationId ?? ""),
      actorId: session.userId,
      actorName: session.displayName,
      role: session.role,
      reason: String(body.reason ?? ""),
    });
    return linked
      ? NextResponse.json({ linked: true })
      : NextResponse.json({ error: "Only an accepted observation can be linked to a case." }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "External context link failed." }, { status: 422 });
  }
}
