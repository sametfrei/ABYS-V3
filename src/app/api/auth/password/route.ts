import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth/core";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { parseBody } from "@/lib/validation";
import { passwordSchema } from "@/lib/password-policy";
import { setUserPassword } from "@/lib/db/repos/users";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import {
  checkPasswordRate,
  recordPasswordFailure,
  resetPasswordRate,
} from "@/lib/rate-limit";
import { localizedError } from "@/lib/api-i18n";

/**
 * POST /api/auth/password — oturum sahibinin kendi parolasını değiştirmesi.
 * Mevcut parola doğrulanır; yeni parola ortak politikaya tabidir ve mevcut
 * parolayla aynı olamaz. Parola hiçbir yanıtta/logda/audit kaydında yer almaz.
 */

const changePasswordSchema = z.object({
  currentPassword: z.string().max(200, "mevcut parola en fazla 200 karakter olmalı"),
  newPassword: passwordSchema,
});

export async function POST(req: NextRequest) {
  const store = await cookies();
  const currentSessionId = store.get(SESSION_COOKIE)?.value;
  const session = await getSession(currentSessionId);
  if (!session) {
    return localizedError(req, "api.auth.sessionRequired", 401);
  }

  // Mevcut parola denemelerini sınırla (oturum çalınmış olsa bile kaba kuvvet).
  const rate = checkPasswordRate(session.userId);
  if (!rate.allowed) {
    return localizedError(
      req,
      "api.auth.tooManyPasswordAttempts",
      429,
      { headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } }
    );
  }

  const parsed = await parseBody(req, changePasswordSchema);
  if (!parsed.ok) return parsed.response;
  const { currentPassword, newPassword } = parsed.data;

  const r = await getDb().query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1 AND org_id = $2 AND status = 'active'",
    [session.userId, session.orgId]
  );
  const stored = r.rows[0];
  if (!stored || !verifyPassword(currentPassword, stored.password_hash)) {
    recordPasswordFailure(session.userId);
    return localizedError(req, "api.auth.currentPasswordInvalid", 400);
  }
  resetPasswordRate(session.userId);

  if (currentPassword === newPassword) {
    return localizedError(req, "api.auth.passwordSame", 400);
  }

  const updated = await setUserPassword({
    orgId: session.orgId,
    id: session.userId,
    passwordHash: hashPassword(newPassword),
  });
  if (!updated) {
    return localizedError(req, "api.auth.userNotFound", 404);
  }

  // Parola değişince kullanıcının DİĞER oturumlarını iptal et; çalınmış bir
  // oturum parola değişikliğinden sonra geçerli kalmasın. Mevcut oturum sürer.
  await getDb().query(
    "DELETE FROM sessions WHERE user_id = $1 AND org_id = $2 AND id <> $3",
    [session.userId, session.orgId, currentSessionId]
  );

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "password_changed",
    summary: `${session.displayName} kendi parolasını değiştirdi`,
  });

  return NextResponse.json({ ok: true });
}
