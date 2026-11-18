import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession, hashPassword, type SessionInfo } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { parseBody } from "@/lib/validation";
import { roleSchema } from "@/lib/data/route-schemas";
import { passwordSchema } from "@/lib/password-policy";
import { createUser, findUserByEmail, listUsers } from "@/lib/db/repos/users";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/**
 * Kurum kullanıcıları — yalnızca `manage_users` izni (sys_admin).
 * `org_id` her zaman oturumdan gelir; istek gövdesinden asla kabul edilmez.
 */

const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "e-posta gerekli")
    .max(254, "e-posta en fazla 254 karakter olmalı")
    .email("geçerli bir e-posta girin"),
  displayName: z
    .string()
    .trim()
    .min(1, "görünen ad gerekli")
    .max(100, "görünen ad en fazla 100 karakter olmalı"),
  role: roleSchema,
  password: passwordSchema,
});

async function requireManageUsers(): Promise<
  { ok: true; session: SessionInfo } | { ok: false; response: NextResponse }
> {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }) };
  }
  if (!hasPermission(session.role, "manage_users")) {
    return {
      ok: false,
      response: NextResponse.json({ error: permissionError("manage_users") }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

/** GET /api/users — kurumun kullanıcıları (parola hash'i asla dönmez). */
export async function GET() {
  const auth = await requireManageUsers();
  if (!auth.ok) return auth.response;

  const users = await listUsers(auth.session.orgId);
  return NextResponse.json({ users });
}

/** POST /api/users — yeni kullanıcı oluşturur; parola scrypt ile hash'lenir. */
export async function POST(req: NextRequest) {
  const auth = await requireManageUsers();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, createUserSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const email = body.email.toLowerCase();

  // E-posta şema düzeyinde global UNIQUE; çakışmayı 409 ile bildir.
  const existing = await findUserByEmail(auth.session.orgId, email);
  if (existing) {
    return NextResponse.json({ error: "Bu e-posta ile bir kullanıcı zaten var." }, { status: 409 });
  }

  let user: Awaited<ReturnType<typeof createUser>>;
  try {
    user = await createUser({
      orgId: auth.session.orgId,
      email,
      displayName: body.displayName,
      role: body.role,
      passwordHash: hashPassword(body.password),
    });
  } catch (err) {
    // users.email şema düzeyinde global UNIQUE; başka bir org'da da olsa
    // çakışmayı 500 yerine 409 olarak bildir (ayrıntı sızdırmadan).
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Bu e-posta ile bir kullanıcı zaten var." },
        { status: 409 }
      );
    }
    throw err;
  }

  await recordAuditEvent({
    orgId: auth.session.orgId,
    actor: auth.session.displayName,
    type: "user_created",
    summary: `Kullanıcı oluşturuldu: ${user.email} (${user.role})`,
    detail: user.id,
  });

  return NextResponse.json({ user }, { status: 201 });
}
