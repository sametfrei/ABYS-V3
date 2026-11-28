import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { addSignalNote, listSignalNotes } from "@/lib/db/repos/data";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const { id } = await params;
  return NextResponse.json({ notes: await listSignalNotes(session.orgId, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "triage_signals")) {
    return NextResponse.json({ error: permissionError("triage_signals") }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const noteId = await addSignalNote({
      orgId: session.orgId,
      signalId: id,
      authorId: session.userId,
      authorName: session.displayName,
      note: String(body.note ?? ""),
    });
    return noteId
      ? NextResponse.json({ noteId }, { status: 201 })
      : NextResponse.json({ error: "Signal not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add signal note." }, { status: 422 });
  }
}
