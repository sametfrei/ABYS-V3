import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

/**
 * Sağlık kontrolü — konteyner/orchestrator probe'ları için.
 * Veritabanına hafif bir sorgu atar; hata ayrıntısı dışarı sızdırılmaz.
 * DB erişilemezse 503 döner ki dağıtım hazır olmayan örneğe trafik göndermesin.
 */
export async function GET() {
  try {
    await getDb().query("SELECT 1");
    return NextResponse.json({ ok: true, service: "abys", db: "up" });
  } catch {
    return NextResponse.json(
      { ok: false, service: "abys", db: "down" },
      { status: 503 }
    );
  }
}
