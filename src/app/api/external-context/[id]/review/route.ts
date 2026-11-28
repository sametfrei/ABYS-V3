import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { reviewExternalContext } from "@/lib/db/repos/external-context";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "approve_external_context")) {
    return NextResponse.json({ error: permissionError("approve_external_context") }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    if (body.decision !== "accepted" && body.decision !== "rejected") {
      return NextResponse.json({ error: "decision must be accepted or rejected." }, { status: 400 });
    }
    const reviewed = await reviewExternalContext({
      orgId: session.orgId,
      observationId: id,
      reviewerId: session.userId,
      reviewerName: session.displayName,
      role: session.role,
      decision: body.decision,
      note: typeof body.note === "string" ? body.note : null,
    });
    return reviewed
      ? NextResponse.json({ reviewed: true })
      : NextResponse.json({ error: "Observation not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "External context review failed." }, { status: 422 });
  }
}
