import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { PostgresDatabaseAdapter } from "./postgres-adapter";
import { MIGRATIONS } from "./migrations";

/**
 * ABYS kalıcılık katmanı — gömülü PostgreSQL (PGlite).
 *
 * Karar (DECISION_LOG 2026-07-17): sistem servisi kurmadan gerçek Postgres
 * SQL'i ile başla. PGlite dosya tabanlı kalıcıdır (.data/abys-db); sunucu
 * PostgreSQL'e geçiş yalnızca bu istemcinin değişmesini gerektirir — şema,
 * migration'lar ve repository SQL'i aynen taşınır.
 *
 * Tüm iş varlıkları org_id taşır; sorgular repository katmanında org-farkındalıklı
 * yazılır (tenant kimliği asla yalnızca frontend'den gelmez).
 */

const DB_DIR = process.env.ABYS_DB_DIR || ".data/abys-db";

declare global {
  // Next.js dev'de modül yeniden yüklenir; bağlantı global'de saklanır.
  var __abysDb: PGlite | undefined;
  var __abysDbReady: Promise<void> | undefined;
  // Dev'de HMR yeni migration ekleyebilir; uygulanan sayı takip edilir ki
  // önbelleklenmiş "hazır" sözü yeni migration'ları atlamasın.
  var __abysDbMigratedCount: number | undefined;
  var __abysDbPendingMigrations: PendingMigrationApproval[] | undefined;
}

export interface PendingMigrationApproval {
  id: number;
  name: string;
  approvalEnv: string;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function getDb(): PGlite {
  if (!globalThis.__abysDb) {
    const backend = process.env.ABYS_DB_BACKEND?.trim().toLowerCase();
    const connectionString = process.env.ABYS_DATABASE_URL || process.env.DATABASE_URL;
    if (backend === "postgres" || (!backend && connectionString)) {
      if (!connectionString) throw new Error("ABYS_DB_BACKEND=postgres requires ABYS_DATABASE_URL or DATABASE_URL.");
      const ssl = process.env.PGSSLMODE === "require"
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
        : undefined;
      const pool = new Pool({
        connectionString,
        max: Math.max(2, positiveInteger(process.env.ABYS_DB_POOL_MAX, 10, 50)),
        connectionTimeoutMillis: positiveInteger(process.env.ABYS_DB_CONNECT_TIMEOUT_MS, 5_000, 60_000),
        idleTimeoutMillis: positiveInteger(process.env.ABYS_DB_IDLE_TIMEOUT_MS, 30_000, 300_000),
        ...(ssl ? { ssl } : {}),
        application_name: "abys-app",
      });
      globalThis.__abysDb = new PostgresDatabaseAdapter(pool) as unknown as PGlite;
    } else {
      globalThis.__abysDb = new PGlite(DB_DIR);
    }
  }
  return globalThis.__abysDb;
}

/** Onay gerektiren migration'ların çalışma anında sessizce uygulanmasını engeller. */
export function migrationApprovalError(
  migration: { id: number; name: string; approvalEnv?: string },
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!migration.approvalEnv) return null;
  if (env[migration.approvalEnv] === "true") return null;
  return (
    `Migration ${migration.id} (${migration.name}) açık onay gerektiriyor. ` +
    `Uygulamak için ${migration.approvalEnv}=true ayarlanmalı; açık onay olmadan uygulanmadı.`
  );
}

export function getPendingMigrationApprovals(): PendingMigrationApproval[] {
  return [...(globalThis.__abysDbPendingMigrations ?? [])];
}

/** Migration'ları bir kez uygular; her API route'u await migrate() ile başlar. */
export async function migrate(): Promise<void> {
  // Statik import: dinamik import her istekte yeni bir modül çözümleme
  // promise'i üretiyordu; sıcak geliştirmede bu zincir birikim yapabiliyor.
  if (!globalThis.__abysDbReady || globalThis.__abysDbMigratedCount !== MIGRATIONS.length) {
    const ready = runMigrations();
    globalThis.__abysDbReady = ready;
    globalThis.__abysDbMigratedCount = MIGRATIONS.length;
    try {
      await ready;
    } catch (err) {
      // Başarısız promise global'de kalırsa sistem bir daha denenemez.
      // Yalnızca bu denemeye ait promise'i temizle (eşzamanlı yeni denemeyi ezme).
      if (globalThis.__abysDbReady === ready) {
        globalThis.__abysDbReady = undefined;
        globalThis.__abysDbMigratedCount = -1;
      }
      throw err;
    }
  }
  return globalThis.__abysDbReady;
}

async function runMigrations(): Promise<void> {
  const db = getDb();
  const run = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id      INTEGER PRIMARY KEY,
      name    TEXT NOT NULL,
      applied TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const done = await db.query<{ id: number }>("SELECT id FROM _migrations");
  const doneIds = new Set(done.rows.map((r) => r.id));
  const pending: PendingMigrationApproval[] = [];
  for (const m of MIGRATIONS) {
    if (doneIds.has(m.id)) continue;
    const approvalError = migrationApprovalError(m);
    if (approvalError && m.approvalEnv) {
      pending.push({ id: m.id, name: m.name, approvalEnv: m.approvalEnv });
      console.warn(approvalError);
      continue;
    }
    try {
      await db.transaction(async (tx) => {
        await tx.exec(m.sql);
        await tx.query("INSERT INTO _migrations (id, name) VALUES ($1, $2)", [m.id, m.name]);
      });
    } catch (err) {
      throw new Error(`Migration ${m.id} (${m.name}) başarısız: ${err instanceof Error ? err.message : err}`);
    }
  }
  globalThis.__abysDbPendingMigrations = pending;
  };
  const lockableDb = db as PGlite & { withMigrationLock?: <T>(callback: () => Promise<T>) => Promise<T> };
  if (lockableDb.withMigrationLock) await lockableDb.withMigrationLock(run);
  else await run();
}
