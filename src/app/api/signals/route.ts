import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { listSignals } from "@/lib/db/repos/data";

/** Kurumun kayıtlı risk sinyalleri (veri soyu referanslı). */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const sectorId = req.nextUrl.searchParams.get("sectorId") ?? undefined;
  const signals = await listSignals(session.orgId, sectorId);
  return NextResponse.json({ signals });
}
