import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession } from "@/lib/auth/core";
import { SESSION_COOKIE } from "../login/route";

export async function POST() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (sid) await destroySession(sid);
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
