import { timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getPendingMigrationApprovals, migrate } from "@/lib/db/client";
import { MIGRATIONS } from "@/lib/db/migrations";

function smokeDatabaseIdentity(req?: NextRequest) {
  const configuredToken = process.env.ABYS_SMOKE_DB_TOKEN;
  const suppliedToken = req?.headers.get("x-abys-smoke-db-token");
  if (!configuredToken || !suppliedToken) return undefined;
  const expected = Buffer.from(configuredToken);
  const received = Buffer.from(suppliedToken);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return undefined;

  const backend = process.env.ABYS_DB_BACKEND?.trim().toLowerCase();
  const hasConnectionString = Boolean(process.env.ABYS_DATABASE_URL || process.env.DATABASE_URL);
  if (backend === "postgres" || (!backend && hasConnectionString)) {
    return { disposable: false, backend: "postgres", dir: null };
  }

  try {
    const configuredDir = process.env.ABYS_DB_DIR || ".data/abys-db";
    if (!isAbsolute(configuredDir)) return { disposable: false, backend: "pglite", dir: null };
    const actualDir = realpathSync(/*turbopackIgnore: true*/ configuredDir);
    const tempRoot = realpathSync(/*turbopackIgnore: true*/ "/private/tmp");
    const disposable = dirname(actualDir) === tempRoot && basename(actualDir).startsWith("abys-");
    return { disposable, backend: "pglite", dir: actualDir };
  } catch {
    return { disposable: false, backend: "pglite", dir: null };
  }
}

/**
 * Sağlık kontrolü — konteyner/orchestrator probe'ları için.
 * Veritabanına hafif bir sorgu atar; hata ayrıntısı dışarı sızdırılmaz.
 * DB erişilemezse 503 döner ki dağıtım hazır olmayan örneğe trafik göndermesin.
 *
 * `build.commit` derlenen commit SHA'sıdır: sunucunun gerçekten hangi sürümü
 * çalıştırdığı `curl .../api/health` ile kanıtlanır, tahmin edilmez.
 */
export async function GET(req?: NextRequest) {
  try {
    const smokeDatabase = smokeDatabaseIdentity(req);
    if (req?.headers.has("x-abys-smoke-db-token") && !smokeDatabase) {
      return NextResponse.json({ ok: false, error: "smoke_database_identity_unavailable" }, { status: 403 });
    }
    if (smokeDatabase && !smokeDatabase.disposable) {
      return NextResponse.json({ ok: false, error: "smoke_database_not_disposable", smokeDatabase }, { status: 409 });
    }
    if (smokeDatabase) {
      // Smoke önizlemesi migration çalıştırmaz: önce mevcut şema defterini salt okunur doğrula.
      // Bekleyen normal migration varsa test başlamadan reddet; yalnızca açık onaylı 18 bekleyebilir.
      const appliedRows = await getDb().query<{ id: number }>("SELECT id FROM _migrations");
      const appliedIds = new Set(appliedRows.rows.map((row) => Number(row.id)));
      const missingMigrationIds = MIGRATIONS
        .filter((migration) => !migration.approvalEnv && !appliedIds.has(migration.id))
        .map((migration) => migration.id);
      const pendingApprovals = MIGRATIONS
        .filter((migration) => migration.approvalEnv && !appliedIds.has(migration.id));
      const pendingMigrationIds = pendingApprovals.map((migration) => migration.id);
      const enabledApprovalMigrationIds = MIGRATIONS
        .filter((migration) => migration.approvalEnv && process.env[migration.approvalEnv] === "true")
        .map((migration) => migration.id);
      const migration18ApprovalEnabled = process.env.ABYS_MIGRATION_18_APPROVED === "true";
      Object.assign(smokeDatabase, {
        missingMigrationIds,
        pendingMigrationIds,
        enabledApprovalMigrationIds,
        migration18ApprovalEnabled,
      });
      if (missingMigrationIds.length > 0) {
        return NextResponse.json({ ok: false, error: "smoke_database_schema_not_prepared", smokeDatabase }, { status: 409 });
      }
      if (enabledApprovalMigrationIds.length > 0 || migration18ApprovalEnabled) {
        return NextResponse.json({ ok: false, error: "smoke_migration_approval_must_be_disabled", smokeDatabase }, { status: 409 });
      }
      // Smoke health path is strictly read-only: it never calls migrate().
      await getDb().query("SELECT 1");
      const memory = process.memoryUsage();
      return NextResponse.json({
        ok: true,
        service: "abys",
        db: "up",
        schemaReady: pendingApprovals.length === 0,
        pendingMigrations: pendingApprovals.map(({ id, name, approvalEnv }) => ({ id, name, approvalEnv })),
        build: {
          commit: process.env.BUILD_SHA || "unknown",
          builtAt: process.env.BUILD_TIME || "unknown",
        },
        smokeDatabase,
        ...(process.env.NODE_ENV !== "production"
          ? {
              memory: {
                rss: memory.rss,
                heapUsed: memory.heapUsed,
                heapTotal: memory.heapTotal,
                external: memory.external,
                at: new Date().toISOString(),
              },
            }
          : {}),
      });
    }
    await migrate();
    await getDb().query("SELECT 1");
    const pendingMigrations = getPendingMigrationApprovals();
    const memory = process.memoryUsage();
    return NextResponse.json({
      ok: true,
      service: "abys",
      db: "up",
      schemaReady: pendingMigrations.length === 0,
      pendingMigrations,
      build: {
        commit: process.env.BUILD_SHA || "unknown",
        builtAt: process.env.BUILD_TIME || "unknown",
      },
      ...(smokeDatabase ? { smokeDatabase } : {}),
      // Geliştirme/tanılama görünürlüğü: bellek artışını ölçmeden "düzeldi"
      // denemez. Üretimde bu alan dönmez.
      ...(process.env.NODE_ENV !== "production"
        ? {
            memory: {
              rss: memory.rss,
              heapUsed: memory.heapUsed,
              heapTotal: memory.heapTotal,
              external: memory.external,
              at: new Date().toISOString(),
            },
          }
        : {}),
    });
  } catch {
    return NextResponse.json(
      { ok: false, service: "abys", db: "down" },
      { status: 503 }
    );
  }
}
