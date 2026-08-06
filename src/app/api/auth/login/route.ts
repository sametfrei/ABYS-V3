import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";
import { authCookieIsSecure, verifyPassword, createSession } from "@/lib/auth/core";
import { recordAuditEvent } from "@/lib/db/repos/audit";

export const SESSION_COOKIE = "abys_session";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim() ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "E-posta ve parola gerekli." }, { status: 400 });
  }

  await ensureSeeded();
  const db = getDb();
  const r = await db.query<{
    id: string;
    org_id: string;
    password_hash: string;
    role: string;
    display_name: string;
  }>("SELECT id, org_id, password_hash, role, display_name FROM users WHERE email = $1 AND status = 'active'", [email]);
  const user = r.rows[0];

  // Zamanlama sızıntısını azalt: kullanıcı yoksa da sahte doğrulama yap.
  const ok = user ? verifyPassword(password, user.password_hash) : verifyPassword(password, "00:00");
  if (!user || !ok) {
    return NextResponse.json({ error: "E-posta ya da parola hatalı." }, { status: 401 });
  }

  const sessionId = await createSession(user.id, user.org_id);
  await recordAuditEvent({
    orgId: user.org_id,
    actor: user.display_name,
    type: "login",
    summary: `${email} giriş yaptı`,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: authCookieIsSecure(),
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return NextResponse.json({
    user: { displayName: user.display_name, role: user.role, email },
  });
}
