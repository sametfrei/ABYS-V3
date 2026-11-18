import { randomBytes } from "crypto";
import type { Role } from "@/lib/auth/permissions";
import { getDb, migrate } from "../client";

/**
 * Kullanıcı repository'si — org-kapsamlı kullanıcı yönetimi.
 *
 * Kurallar:
 * - Her sorgu org_id ile kapsanır; org_id çağıran route'un oturumundan gelir,
 *   hiçbir zaman istek gövdesinden okunmaz.
 * - password_hash hiçbir zaman dışa döndürülmez (UserRow'da alan yoktur).
 * - Denetim yazımı bu katmanda YAPILMAZ; route recordAuditEvent çağırır.
 * - SQL parametrelidir.
 */

export interface UserRow {
  id: string;
  orgId: string;
  email: string;
  displayName: string;
  role: Role;
  status: "active" | "disabled";
  createdAt: string;
}

interface UserDbRow {
  id: string;
  org_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  created_at: string | Date;
}

const USER_COLUMNS =
  "id, org_id, email, display_name, role, status, created_at";

/** PGlite timestamptz'ı Date ya da string döndürebilir; API sözleşmesi string. */
function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapUser(row: UserDbRow): UserRow {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as Role,
    status: row.status === "disabled" ? "disabled" : "active",
    createdAt: toIsoString(row.created_at),
  };
}

/** E-posta normalizasyonu: baştaki/sondaki boşluk atılır, küçük harfe çevrilir. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listUsers(orgId: string): Promise<UserRow[]> {
  await migrate();
  const r = await getDb().query<UserDbRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE org_id = $1 ORDER BY email`,
    [orgId]
  );
  return r.rows.map(mapUser);
}

export async function getUser(orgId: string, id: string): Promise<UserRow | null> {
  await migrate();
  const r = await getDb().query<UserDbRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  );
  return r.rows[0] ? mapUser(r.rows[0]) : null;
}

export async function findUserByEmail(orgId: string, email: string): Promise<UserRow | null> {
  await migrate();
  const r = await getDb().query<UserDbRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE org_id = $1 AND lower(email) = $2`,
    [orgId, normalizeEmail(email)]
  );
  return r.rows[0] ? mapUser(r.rows[0]) : null;
}

export async function createUser(params: {
  orgId: string;
  email: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  status?: "active" | "disabled";
}): Promise<UserRow> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  const r = await getDb().query<UserDbRow>(
    `INSERT INTO users (id, org_id, email, display_name, role, password_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${USER_COLUMNS}`,
    [
      id,
      params.orgId,
      normalizeEmail(params.email),
      params.displayName,
      params.role,
      params.passwordHash,
      params.status ?? "active",
    ]
  );
  return mapUser(r.rows[0]);
}

export async function updateUser(params: {
  orgId: string;
  id: string;
  role?: Role;
  status?: "active" | "disabled";
}): Promise<UserRow | null> {
  await migrate();
  const sets: string[] = [];
  const values: unknown[] = [params.orgId, params.id];

  if (params.role !== undefined) {
    values.push(params.role);
    sets.push(`role = $${values.length}`);
  }
  if (params.status !== undefined) {
    values.push(params.status);
    sets.push(`status = $${values.length}`);
  }

  // Boş güncelleme: mevcut kaydı (varsa) döndür.
  if (sets.length === 0) {
    return getUser(params.orgId, params.id);
  }

  const r = await getDb().query<UserDbRow>(
    `UPDATE users SET ${sets.join(", ")}
     WHERE org_id = $1 AND id = $2
     RETURNING ${USER_COLUMNS}`,
    values
  );
  return r.rows[0] ? mapUser(r.rows[0]) : null;
}

/**
 * Parola hash'ini org-kapsamlı günceller. Kayıt yoksa veya başka org'a
 * aitse null döner. password_hash dışa dönmez (USER_COLUMNS).
 */
export async function setUserPassword(params: {
  orgId: string;
  id: string;
  passwordHash: string;
}): Promise<UserRow | null> {
  await migrate();
  const r = await getDb().query<UserDbRow>(
    `UPDATE users SET password_hash = $3
     WHERE org_id = $1 AND id = $2
     RETURNING ${USER_COLUMNS}`,
    [params.orgId, params.id, params.passwordHash]
  );
  return r.rows[0] ? mapUser(r.rows[0]) : null;
}

/** Org'da rolü sys_admin ve durumu active olan kullanıcı sayısı. */
export async function countActiveSysAdmins(orgId: string): Promise<number> {
  await migrate();
  const r = await getDb().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM users
     WHERE org_id = $1 AND role = 'sys_admin' AND status = 'active'`,
    [orgId]
  );
  return Number(r.rows[0]?.count ?? 0);
}
