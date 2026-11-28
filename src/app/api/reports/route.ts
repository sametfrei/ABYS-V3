import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { createSavedReport, listSavedReports } from "@/lib/db/repos/reports";

export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  return NextResponse.json({ reports: await listSavedReports(session.orgId) });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "manage_reports")) {
    return NextResponse.json({ error: permissionError("manage_reports") }, { status: 403 });
  }
  try {
    const body = await req.json();
    const id = await createSavedReport({
      orgId: session.orgId,
      actorId: session.userId,
      actorName: session.displayName,
      roleId: session.role,
      title: String(body.title ?? ""),
      reportType: String(body.reportType ?? "analysis"),
      content: String(body.content ?? ""),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save report." }, { status: 422 });
  }
}
