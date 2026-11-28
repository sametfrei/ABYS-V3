import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { approveDefinition } from "@/lib/db/repos/kpi-registry";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "approve_kpi_definition")) return NextResponse.json({ error: permissionError("approve_kpi_definition") }, { status: 403 });
  const { id } = await params;
  try {
    const approved = await approveDefinition({ orgId: session.orgId, id, userId: session.userId, displayName: session.displayName, role: session.role });
    return approved ? NextResponse.json({ approved: true }) : NextResponse.json({ error: "Definition not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approval failed." }, { status: 409 });
  }
}
