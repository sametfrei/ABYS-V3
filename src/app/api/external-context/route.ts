import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, SESSION_COOKIE } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { ingestExternalContext, listExternalContext } from "@/lib/db/repos/external-context";

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  if (status && !["candidate", "accepted", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid review status." }, { status: 400 });
  }
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const observations = await listExternalContext(session.orgId, status, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ observations });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }
  try {
    const input = await req.json();
    const result = await ingestExternalContext({
      orgId: session.orgId,
      actorId: session.userId,
      actorName: session.displayName,
      role: session.role,
      input,
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "External context ingestion failed." }, { status: 422 });
  }
}
