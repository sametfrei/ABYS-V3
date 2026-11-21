import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb, migrate } from "@/lib/db/client";
import { authCookieIsSecure, verifyPassword, createSession } from "@/lib/auth/core";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { checkLoginRate, recordLoginFailure, resetLoginRate } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validation";

export const SESSION_COOKIE = "abys_session";

// Sayı/nesne gibi yanlış tipli alanlar TypeError -> 500 yerine 400 üretir.
const loginBodySchema = z.object({
  email: z.string().max(254, "e-posta en fazla 254 karakter olmalı").optional(),
  password: z.string().max(200, "parola en fazla 200 karakter olmalı").optional(),
});

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, loginBodySchema);
  if (!parsed.ok) return parsed.response;

  const email = parsed.data.email?.trim().toLowerCase();
  // Parola KIRPILMAZ: politika boşlukları parolanın parçası sayar; trim
  // edilirse baş/son boşluklu parolalar hiç giriş yapamaz hale gelir.
  const password = parsed.data.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "E-posta ve parola gerekli." }, { status: 400 });
  }

  // Kaba kuvvet koruması: başarısız denemeler e-posta+IP ve IP bazında sınırlanır.
  const rate = checkLoginRate(req, email);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message ?? "Çok fazla giriş denemesi." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec ?? 60) },
      }
    );
  }

  await migrate();
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
    recordLoginFailure(req, email);
    return NextResponse.json({ error: "E-posta ya da parola hatalı." }, { status: 401 });
  }

  resetLoginRate(req, email);
  const sessionId = await createSession(user.id, user.org_id, req.headers.get("user-agent"));
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
