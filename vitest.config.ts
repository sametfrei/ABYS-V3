import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Test dosyaları SIRAYLA koşar. Gerekçe: DB testleri (tenant-isolation,
    // api-auth, audit-chain, kpi, document-access) her biri kendi PGlite
    // örneğini açar; PGlite gömülü bir WASM Postgres'tir ve bellek olarak
    // ağırdır. Paralel fork'larda birlikte koşunca worker'lar "Worker exited
    // unexpectedly" ile düşüyordu — özellikle makine build gibi başka bir iş
    // yaparken. Bu kararsızlık kuyruk otomasyonunun kalite kapısını da
    // (npm test geçmeli) yanlış yere bloke ediyordu.
    // Bedeli birkaç saniye; karşılığı tekrarlanabilir sonuç.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
