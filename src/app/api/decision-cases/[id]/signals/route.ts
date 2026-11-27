import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { linkCaseSignal, listCaseSignals } from "@/lib/db/repos/decision-signals";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { localizedError } from "@/lib/api-i18n";

const linkSchema = z.object({
  signalId: z.string().min(1).max(300),
  reason: z.string().trim().min(3).max(500),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(_req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const { id } = await params;
  const signals = await listCaseSignals(session.orgId, id);
  return NextResponse.json({ signals });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }
  const parsed = await parseBody(req, linkSchema, { maxBytes: 8 * 1024 });
  if (!parsed.ok) return parsed.response;
  const { id } = await params;
  try {
    const result = await linkCaseSignal({
      orgId: session.orgId,
      caseId: id,
      signalId: parsed.data.signalId,
      reason: parsed.data.reason,
      actorId: session.userId,
      actorName: session.displayName,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "Vaka veya sinyal bulunamadı.") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
