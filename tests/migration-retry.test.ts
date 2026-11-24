import { describe, expect, it, vi } from "vitest";

/**
 * PGlite başlatma hatası global "ready" promise'ini kalıcı olarak zehirlememeli.
 * Eşzamanlı ilk istekler de migration'ı birden fazla kez başlatmamalı.
 */
const state = vi.hoisted(() => ({
  failNext: true,
  runs: 0,
}));

vi.mock("@electric-sql/pglite", () => ({
  PGlite: class FakePGlite {
    async exec(sql: string): Promise<void> {
      if (sql.includes("CREATE TABLE IF NOT EXISTS _migrations")) state.runs += 1;
      if (state.failNext) {
        state.failNext = false;
        throw new Error("migration boom");
      }
    }

    async query<T>(): Promise<{ rows: T[] }> {
      return { rows: [] };
    }

    async close(): Promise<void> {}
  },
}));

const { migrate } = await import("../src/lib/db/client");

describe("migration başlatma dayanıklılığı", () => {
  it("başarısız denemeden sonra yeniden denenebilir", async () => {
    await expect(migrate()).rejects.toThrow("migration boom");
    const runsAfterFailure = state.runs;
    await expect(migrate()).resolves.toBeUndefined();
    expect(state.runs).toBe(runsAfterFailure + 1);
  });

  it("eşzamanlı ilk istekler tek migration çalıştırır", async () => {
    // İkinci senaryo için global hazır durumunu sıfırla (uygulama kodu değil,
    // test izolasyonu). Aynı anda üç istek geldiğinde tek run beklenir.
    globalThis.__abysDbReady = undefined;
    globalThis.__abysDbMigratedCount = undefined;
    const before = state.runs;
    await Promise.all([migrate(), migrate(), migrate()]);
    expect(state.runs).toBe(before + 1);
  });
});
