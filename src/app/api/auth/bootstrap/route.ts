import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getPendingMigrationApprovals, migrate } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/core";
import { passwordSchema } from "@/lib/password-policy";
import { SECTORS, type SectorId } from "@/lib/sectors";
import { parseBody } from "@/lib/validation";
import {
  checkLoginRate,
  recordLoginFailure,
  resetLoginRate,
} from "@/lib/rate-limit";

const RATE_KEY = "__initial_admin_bootstrap__";
const SECTOR_IDS = SECTORS.map((sector) => sector.id) as [SectorId, ...SectorId[]];
const schema = z.object({
  token: z.string().min(32).max(128),
  organizationName: z.string().trim().min(2).max(150),
  sectorId: z.enum(SECTOR_IDS),
  adminDisplayName: z.string().trim().min(2).max(100),
  adminEmail: z.string().trim().min(3).max(254).email(),
  password: passwordSchema,
  passwordConfirmation: z.string().min(1).max(200),
}).refine((value) => value.password === value.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "Parolalar eşleşmiyor.",
});

function configuredToken(): string | null {
  const token = process.env.ABYS_BOOTSTRAP_TOKEN;
  return token && Buffer.byteLength(token, "utf8") >= 32 ? token : null;
}

function tokenMatches(candidate: string, expected: string): boolean {
  const received = Buffer.from(candidate, "utf8");
  const stored = Buffer.from(expected, "utf8");
  return received.length === stored.length && timingSafeEqual(received, stored);
}

async function setupIsAvailable(): Promise<boolean> {
  if (!configuredToken()) return false;
  await migrate();
  if (getPendingMigrationApprovals().length > 0) return false;

  const db = getDb();
  const guard = await db.query<{ completed_at: string | Date | null }>(
    "SELECT completed_at FROM initial_admin_bootstrap WHERE id = 1"
  );
  if (!guard.rows[0] || guard.rows[0].completed_at !== null) return false;

  const counts = await db.query<{ organizations: number; users: number }>(`
    SELECT
      (SELECT count(*)::int FROM organizations) AS organizations,
      (SELECT count(*)::int FROM users) AS users
  `);
  return Number(counts.rows[0]?.organizations ?? 0) === 0
    && Number(counts.rows[0]?.users ?? 0) === 0;
}

/** GET /api/auth/bootstrap — yalnızca ilk kurulumun açık olup olmadığını söyler. */
export async function GET() {
  try {
    return NextResponse.json({ available: await setupIsAvailable() });
  } catch {
    return NextResponse.json(
      { available: false, error: "İlk kurulum şu anda kullanılamıyor." },
      { status: 503 }
    );
  }
}

/** POST /api/auth/bootstrap — token korumalı, tek seferlik kurum + sys_admin oluşturur. */
export async function POST(req: NextRequest) {
  const rate = checkLoginRate(req, RATE_KEY);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Çok fazla kurulum denemesi. Daha sonra tekrar deneyin." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } }
    );
  }

  const expectedToken = configuredToken();
  if (!expectedToken) {
    return NextResponse.json({ error: "İlk kurulum kapalı." }, { status: 404 });
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!tokenMatches(body.token, expectedToken)) {
    recordLoginFailure(req, RATE_KEY);
    return NextResponse.json({ error: "Kurulum doğrulanamadı." }, { status: 404 });
  }

  try {
    await migrate();
    if (getPendingMigrationApprovals().length > 0) {
      return NextResponse.json(
        { error: "Veritabanı migration onayı bekliyor." },
        { status: 503 }
      );
    }

    const db = getDb();
    const organizationId = randomBytes(16).toString("hex");
    const userId = randomBytes(16).toString("hex");
    const auditId = randomBytes(16).toString("hex");
    const email = body.adminEmail.toLowerCase();
    const passwordHash = hashPassword(body.password);

    await db.transaction(async (tx) => {
      const claim = await tx.query<{ id: number }>(
        `UPDATE initial_admin_bootstrap
            SET claimed_at = now()
          WHERE id = 1 AND claimed_at IS NULL AND completed_at IS NULL
          RETURNING id`
      );
      if (claim.rows.length !== 1) {
        throw Object.assign(new Error("Kurulum daha önce tamamlanmış."), {
          code: "ABYS_BOOTSTRAP_CLOSED",
        });
      }

      const counts = await tx.query<{ organizations: number; users: number }>(`
        SELECT
          (SELECT count(*)::int FROM organizations) AS organizations,
          (SELECT count(*)::int FROM users) AS users
      `);
      if (
        Number(counts.rows[0]?.organizations ?? 0) !== 0
        || Number(counts.rows[0]?.users ?? 0) !== 0
      ) {
        throw Object.assign(new Error("Veritabanı boş değil."), {
          code: "ABYS_BOOTSTRAP_NOT_EMPTY",
        });
      }

      await tx.query(
        "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)",
        [organizationId, body.organizationName, body.sectorId]
      );
      await tx.query(
        `INSERT INTO users (id, org_id, email, display_name, role, password_hash, status)
         VALUES ($1, $2, $3, $4, 'sys_admin', $5, 'active')`,
        [userId, organizationId, email, body.adminDisplayName, passwordHash]
      );
      await tx.query(
        `INSERT INTO audit_events (id, org_id, actor, type, summary, detail)
         VALUES ($1, $2, $3, 'initial_admin_bootstrap', 'İlk kurum ve sistem yöneticisi oluşturuldu.', $4)`,
        [auditId, organizationId, body.adminDisplayName, userId]
      );
      const completion = await tx.query<{ id: number }>(
        `UPDATE initial_admin_bootstrap
            SET completed_at = now(), organization_id = $1, user_id = $2
          WHERE id = 1 AND claimed_at IS NOT NULL AND completed_at IS NULL
          RETURNING id`,
        [organizationId, userId]
      );
      if (completion.rows.length !== 1) {
        throw Object.assign(new Error("Kurulum kilidi tamamlanamadı."), {
          code: "ABYS_BOOTSTRAP_CLOSED",
        });
      }
    });

    resetLoginRate(req, RATE_KEY);
    return NextResponse.json(
      { ok: true, organization: body.organizationName, adminEmail: email, role: "sys_admin" },
      { status: 201 }
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ABYS_BOOTSTRAP_CLOSED" || code === "ABYS_BOOTSTRAP_NOT_EMPTY") {
      return NextResponse.json({ error: "İlk kurulum zaten kapalı." }, { status: 409 });
    }
    if (code === "23505") {
      return NextResponse.json({ error: "Bu e-posta adresi zaten kayıtlı." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "İlk kurulum tamamlanamadı. Sunucu kayıtlarını kontrol edin." },
      { status: 503 }
    );
  }
}
