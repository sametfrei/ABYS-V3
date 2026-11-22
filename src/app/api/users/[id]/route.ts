import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession, hashPassword, type SessionInfo } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { parseBody } from "@/lib/validation";
import { roleSchema } from "@/lib/data/route-schemas";
import {
  countActiveSysAdmins,
  getUser,
  setUserPassword,
  updateUser,
} from "@/lib/db/repos/users";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

/**
 * Tek kullanıcı güncelleme — yalnızca `manage_users` (sys_admin).
 * Rol ve durum değiştirilebilir; parola bu uçtan değiştirilmez.
 * Son aktif sys_admin'in düşürülmesi/devre dışı bırakılması engellenir
 * (yönetim kilitlenmesini önler).
 */

const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    status: z.enum(["active", "disabled"], "durum active veya disabled olmalı").optional(),
    // Yönetici geçici parola sıfırlayabilir; parola audit'e asla yazılmaz.
    password: z
      .string()
      .min(12, "parola en az 12 karakter olmalı")
      .max(200, "parola en fazla 200 karakter olmalı")
      .optional(),
  })
  .refine(
    (v) => v.role !== undefined || v.status !== undefined || v.password !== undefined,
    { message: "en az bir alan (role, status veya password) gerekli" }
  );

async function requireManageUsers(req?: NextRequest): Promise<
  { ok: true; session: SessionInfo } | { ok: false; response: NextResponse }
> {
  const localeRequest = req ?? new NextRequest("http://localhost/api/users");
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return {
      ok: false,
      response: localizedError(localeRequest, "api.auth.sessionRequired", 401),
    };
  }
  if (!hasPermission(session.role, "manage_users")) {
    return {
      ok: false,
      response: NextResponse.json({ error: permissionError("manage_users") }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

/** PATCH /api/users/[id] — rol ve/veya durum güncellemesi. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireManageUsers(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const target = await getUser(auth.session.orgId, id);
  if (!target) {
    return localizedError(req, "api.auth.userNotFound", 404);
  }

  const parsed = await parseBody(req, updateUserSchema);
  if (!parsed.ok) return parsed.response;
  const { role, status, password } = parsed.data;

  const losesAdmin =
    target.role === "sys_admin" &&
    target.status === "active" &&
    ((role !== undefined && role !== "sys_admin") || status === "disabled");
  if (losesAdmin) {
    const activeAdmins = await countActiveSysAdmins(auth.session.orgId);
    if (activeAdmins <= 1) {
      return localizedError(req, "api.users.lastAdminProtected", 400);
    }
  }

  let updated = target;
  if (role !== undefined || status !== undefined) {
    const result = await updateUser({ orgId: auth.session.orgId, id, role, status });
    if (!result) {
      return localizedError(req, "api.auth.userNotFound", 404);
    }
    updated = result;
  }

  if (password !== undefined) {
    const result = await setUserPassword({
      orgId: auth.session.orgId,
      id,
      passwordHash: hashPassword(password),
    });
    if (!result) {
      return localizedError(req, "api.auth.userNotFound", 404);
    }
    updated = result;
  }

  const changes = [
    role !== undefined && role !== target.role ? `rol: ${target.role} → ${role}` : null,
    status !== undefined && status !== target.status ? `durum: ${target.status} → ${status}` : null,
    // Parola değeri asla audit'e yazılmaz.
    password !== undefined ? "parola sıfırlandı" : null,
  ].filter(Boolean);

  await recordAuditEvent({
    orgId: auth.session.orgId,
    actor: auth.session.displayName,
    type: "user_updated",
    summary: `Kullanıcı güncellendi: ${updated.email}${changes.length ? ` (${changes.join(", ")})` : ""}`,
    detail: updated.id,
  });

  return NextResponse.json({ user: updated });
}
