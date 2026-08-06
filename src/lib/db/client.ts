import { PGlite } from "@electric-sql/pglite";

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
}

export function getDb(): PGlite {
  if (!globalThis.__abysDb) {
    globalThis.__abysDb = new PGlite(DB_DIR);
  }
  return globalThis.__abysDb;
}

/** Migration'ları bir kez uygular; her API route'u await migrate() ile başlar. */
export async function migrate(): Promise<void> {
  const { MIGRATIONS } = await import("./migrations");
  if (!globalThis.__abysDbReady || globalThis.__abysDbMigratedCount !== MIGRATIONS.length) {
    globalThis.__abysDbMigratedCount = MIGRATIONS.length;
    globalThis.__abysDbReady = runMigrations();
  }
  return globalThis.__abysDbReady;
}

async function runMigrations(): Promise<void> {
  const db = getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id      INTEGER PRIMARY KEY,
      name    TEXT NOT NULL,
      applied TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { MIGRATIONS } = await import("./migrations");
  const done = await db.query<{ id: number }>("SELECT id FROM _migrations");
  const doneIds = new Set(done.rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (doneIds.has(m.id)) continue;
    await db.exec("BEGIN");
    try {
      await db.exec(m.sql);
      await db.query("INSERT INTO _migrations (id, name) VALUES ($1, $2)", [m.id, m.name]);
      await db.exec("COMMIT");
    } catch (err) {
      await db.exec("ROLLBACK");
      throw new Error(`Migration ${m.id} (${m.name}) başarısız: ${err instanceof Error ? err.message : err}`);
    }
  }
}
