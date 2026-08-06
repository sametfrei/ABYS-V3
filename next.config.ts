import type { NextConfig } from "next";

/**
 * `output: "standalone"` .next/standalone/server.js üretir ve bu mod
 * `next start` ile KULLANILAMAZ — Next.js resmi belgesi (config/output):
 * standalone çıktısında `next start` yerine `node .next/standalone/server.js`
 * çalıştırılır.
 *
 * Bu ayar koşulsuz açıkken `npm start` ve eval koşucusu (evals/run-overnight.ps1,
 * `npx next start -p 3001` kullanır) bozuldu: sunucu ayağa kalkıp kısa süre
 * sonra düşüyor, 2026-07-20 karşılaştırma evalinde 11 senaryonun 5'i hiç
 * koşamadan skor 90/176'ya indi (ölçüm geçersiz oldu).
 *
 * Çözüm: standalone YALNIZCA Docker imajı derlenirken açılır. Dockerfile
 * `BUILD_STANDALONE=1` verir; yerel geliştirme, `npm start` ve eval koşusu
 * normal `next start` yolunu kullanmaya devam eder.
 */
const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
