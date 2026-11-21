import { execSync } from "node:child_process";
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
/**
 * Sürüm parmak izi — hangi commit'in derlendiğini tahmin etmeden kanıtlamak için.
 * Imaj derlemesinde `.git` kopyalanmadığı için BUILD_SHA build-arg ile verilir;
 * yerel derlemede git'ten okunur. `/api/health` bu değeri döndürür.
 */
function resolveBuildSha(): string {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA;
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const buildSha = resolveBuildSha();
const buildTime = process.env.BUILD_TIME || new Date().toISOString();

const nextConfig: NextConfig = {
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["@electric-sql/pglite"],
  env: { BUILD_SHA: buildSha, BUILD_TIME: buildTime },
  // Güvenli varsayılan başlıklar. CSP bilinçli olarak eklenmedi: Next.js
  // inline runtime script'leriyle çakışmadan ayrı bir nonce stratejisi gerekir.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
