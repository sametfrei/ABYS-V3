import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { parseBody } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

/**
 * GET    /api/auth/sessions — oturum sahibinin AKTİF oturumları.
 * DELETE /api/auth/sessions — bir oturumu veya diğer tüm oturumları iptal eder.
 *
 * Yalnızca oturum sahibinin kendi kayıtları görünür/işlenir; org_id ve
 * user_id oturumdan gelir. Session id'leri bearer değerdir ama yalnızca
 * sahibine döner; başka kullanıcının oturumu iptal edilemez.
 */

const revokeSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    allOthers: z.boolean().optional(),
  })
  .refine((v) => (v.id !== undefined) !== (v.allOthers === true), {
    message: "id veya allOthers alanlarından tam olarak biri gerekli",
  });

async function currentSession(): Promise<
  | { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; sessionId: string }
  | null
> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  const session = await getSession(sessionId);
  if (!session || !sessionId) return null;
  return { session, sessionId };
}

export async function GET(req: NextRequest) {
  const auth = await currentSession();
  if (!auth) {
    return localizedError(req, "api.auth.sessionRequired", 401);
  }

  const r = await getDb().query<{
    id: string;
    created_at: Date | string;
    expires_at: Date | string;
    last_seen_at: Date | string;
    user_agent: string | null;
  }>(
    `SELECT id, created_at, expires_at, last_seen_at, user_agent FROM sessions
     WHERE user_id = $1 AND org_id = $2 AND expires_at > $3
     ORDER BY created_at DESC`,
    [auth.session.userId, auth.session.orgId, new Date().toISOString()]
  );

  return NextResponse.json({
    sessions: r.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
      lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : row.last_seen_at,
      userAgent: row.user_agent,
      current: row.id === auth.sessionId,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await currentSession();
  if (!auth) {
    return localizedError(req, "api.auth.sessionRequired", 401);
  }

  const parsed = await parseBody(req, revokeSchema);
  if (!parsed.ok) return parsed.response;
  const { id, allOthers } = parsed.data;

  if (allOthers) {
    const r = await getDb().query<{ id: string }>(
      `DELETE FROM sessions
       WHERE user_id = $1 AND org_id = $2 AND id <> $3
       RETURNING id`,
      [auth.session.userId, auth.session.orgId, auth.sessionId]
    );
    if (r.rows.length > 0) {
      await recordAuditEvent({
        orgId: auth.session.orgId,
        actor: auth.session.displayName,
        type: "sessions_revoked",
        summary: `${auth.session.displayName} diğer ${r.rows.length} oturumu kapattı`,
      });
    }
    return NextResponse.json({ revoked: r.rows.length });
  }

  const r = await getDb().query<{ id: string }>(
    `DELETE FROM sessions WHERE id = $1 AND user_id = $2 AND org_id = $3 RETURNING id`,
    [id, auth.session.userId, auth.session.orgId]
  );
  if (r.rows.length === 0) {
    return localizedError(req, "api.auth.sessionNotFound", 404);
  }

  await recordAuditEvent({
    orgId: auth.session.orgId,
    actor: auth.session.displayName,
    type: "session_revoked",
    summary: `${auth.session.displayName} bir oturumu kapattı`,
  });
  return NextResponse.json({ revoked: 1 });
}
