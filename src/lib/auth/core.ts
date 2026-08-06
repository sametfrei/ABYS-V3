import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getDb, migrate } from "@/lib/db/client";

/**
 * Kimlik doğrulama çekirdeği (Faz 2).
 * - Parolalar scrypt ile hash'lenir (salt'lı, timing-safe karşılaştırma).
 * - Oturumlar sunucu tarafında sessions tablosunda; çerezde yalnızca opak id.
 * - Tenant kuralı: org_id her zaman OTURUMDAN türetilir, istekten alınmaz.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 saat

/**
 * Local desktop runtime is served over loopback HTTP, so its session cookie
 * must not be marked Secure. Hosted deployments keep the secure default
 * unless AUTH_COOKIE_SECURE is set explicitly.
 */
export function authCookieIsSecure(
  env: Partial<Pick<NodeJS.ProcessEnv, "AUTH_COOKIE_SECURE" | "NODE_ENV">> = process.env
): boolean {
  const configured = env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return env.NODE_ENV === "production";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export interface SessionInfo {
  userId: string;
  orgId: string;
  orgCode: string | null;
  orgName: string;
  sectorId: string;
  role: string;
  displayName: string;
}

export async function createSession(userId: string, orgId: string): Promise<string> {
  await migrate();
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await getDb().query(
    "INSERT INTO sessions (id, user_id, org_id, expires_at) VALUES ($1, $2, $3, $4)",
    [id, userId, orgId, expires]
  );
  return id;
}

/** Geçerli oturumu döner; süresi dolmuşsa null (ve kaydı temizler). */
export async function getSession(sessionId: string | undefined): Promise<SessionInfo | null> {
  if (!sessionId) return null;
  await migrate();
  const db = getDb();
  const r = await db.query<{
    user_id: string;
    org_id: string;
    org_code: string | null;
    org_name: string;
    sector_id: string;
    role: string;
    display_name: string;
    expires_at: string;
  }>(
    `SELECT s.user_id, s.org_id, u.role, u.display_name, s.expires_at,
            o.code AS org_code, o.name AS org_name, o.sector_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = s.org_id
     WHERE s.id = $1 AND u.status = 'active'`,
    [sessionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    return null;
  }
  return {
    userId: row.user_id,
    orgId: row.org_id,
    orgCode: row.org_code,
    orgName: row.org_name,
    sectorId: row.sector_id,
    role: row.role,
    displayName: row.display_name,
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await migrate();
  await getDb().query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}
