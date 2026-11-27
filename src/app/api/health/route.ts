import { NextResponse } from "next/server";
import { getDb, getPendingMigrationApprovals, migrate } from "@/lib/db/client";

/**
 * Sağlık kontrolü — konteyner/orchestrator probe'ları için.
 * Veritabanına hafif bir sorgu atar; hata ayrıntısı dışarı sızdırılmaz.
 * DB erişilemezse 503 döner ki dağıtım hazır olmayan örneğe trafik göndermesin.
 *
 * `build.commit` derlenen commit SHA'sıdır: sunucunun gerçekten hangi sürümü
 * çalıştırdığı `curl .../api/health` ile kanıtlanır, tahmin edilmez.
 */
export async function GET() {
  try {
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
