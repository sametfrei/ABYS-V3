import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { SESSION_COOKIE } from "../login/route";

/** Aktif oturum bilgisi — UI bunun üzerinden kim olduğunu öğrenir. */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      displayName: session.displayName,
      role: session.role,
      orgId: session.orgId,
      orgCode: session.orgCode,
      orgName: session.orgName,
      sectorId: session.sectorId,
    },
  });
}
