import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getDb, migrate } from "@/lib/db/client";

/**
 * API anahtarı katmanı — makine-makine erişim (portal → ABYS).
 *
 * Güvenlik ilkeleri:
 *  - Anahtar SHA-256 hash'i saklanır; düz metin yalnızca üretim anında bir kez
 *    döner (parola gibi — kaybolursa yenisi üretilir, geri getirilemez).
 *  - Kapsam (scope) bazlı yetki: events:write, read:advisors, read:all.
 *  - İptal edilebilir (revoked_at); iptal sonrası anahtar çalışmaz.
 *  - Her kullanım last_used_at ile izlenir.
 *  - org_id anahtardan türetilir — istekten ASLA alınmaz (tenant izolasyonu).
 */

export type Scope = "events:write" | "read:advisors" | "read:all";

const PREFIX = "abys_";

function hashKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export async function createApiKey(params: {
  orgId: string;
  name: string;
  scopes: Scope[];
  createdBy: string;
}): Promise<{ id: string; plainKey: string; prefix: string }> {
  await migrate();
  const secret = randomBytes(24).toString("base64url");
  const plainKey = `${PREFIX}${secret}`;
  const id = randomBytes(8).toString("hex");
  const prefix = plainKey.slice(0, 12);

  await getDb().query(
    `INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, scopes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, params.orgId, params.name, hashKey(plainKey), prefix, params.scopes, params.createdBy]
  );
  return { id, plainKey, prefix };
}

export interface KeyContext {
  keyId: string;
  orgId: string;
  scopes: string[];
  name: string;
}

/**
 * Authorization: Bearer <key> başlığını doğrular.
 * Dönerse istek o kurum adına ve o kapsamlarla işlem yapabilir.
 */
export async function authenticateApiKey(req: Request): Promise<KeyContext | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const plain = header.slice(7).trim();
  if (!plain.startsWith(PREFIX)) return null;

  await migrate();
  const db = getDb();
  const candidate = hashKey(plain);
  const r = await db.query<{ id: string; org_id: string; scopes: string[]; name: string; key_hash: string }>(
    "SELECT id, org_id, scopes, name, key_hash FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
    [candidate]
  );
  const row = r.rows[0];
  if (!row) return null;

  // Zamanlama güvenli doğrulama (hash eşleşmesi zaten indeksten geldi ama
  // sabit-zaman karşılaştırma alışkanlığı korunur)
  const a = Buffer.from(row.key_hash, "utf8");
  const b = Buffer.from(candidate, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  await db.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [row.id]);
  return { keyId: row.id, orgId: row.org_id, scopes: row.scopes, name: row.name };
}

export function hasScope(ctx: KeyContext, scope: Scope): boolean {
  return ctx.scopes.includes(scope) || ctx.scopes.includes("read:all") && scope.startsWith("read:");
}

export async function listApiKeys(orgId: string) {
  await migrate();
  const r = await getDb().query(
    `SELECT id, name, key_prefix, scopes, last_used_at, revoked_at, created_by, created_at
     FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return r.rows;
}

export async function revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
  await migrate();
  const r = await getDb().query(
    "UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL",
    [keyId, orgId]
  );
  return (r.affectedRows ?? 0) > 0;
}
