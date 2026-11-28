import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { deleteSavedReport } from "@/lib/db/repos/reports";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "manage_reports")) {
    return NextResponse.json({ error: permissionError("manage_reports") }, { status: 403 });
  }
  const { id } = await params;
  const deleted = await deleteSavedReport({
    orgId: session.orgId, reportId: id, actorId: session.userId, actorName: session.displayName,
  });
  return deleted
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Report not found." }, { status: 404 });
}
