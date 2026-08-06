/**
 * TAIS demo icin sifir ortam kurulum komutu.
 *
 * Kullanim:
 *   npm run demo:tais:bootstrap
 *
 * Ne yapar: migration'lari uygular, TAIS IKF MMC kurumunu (yoksa) olusturur,
 * demo yonetici hesabini (varsayilan ceo@tais.demo — TAIS_DEMO_ADMIN_EMAIL/
 * TAIS_DEMO_ADMIN_PASSWORD ile gecersiz kilinabilir) kurar, deterministik
 * operasyon verisini ve karar+aksiyon zincirini yazar. Tekrar tekrar guvenle
 * calistirilabilir (idempotent) — mevcut veriye dokunmaz, yalnizca eksikse
 * tamamlar. Uretim ortaminda ALLOW_TAIS_DEMO_BOOTSTRAP=true olmadan calismaz.
 *
 * Bkz. src/lib/demo/tais/bootstrap.ts (asil mantik burada, test edilebilir).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

loadLocalEnv();

async function main() {
  const { bootstrapTaisDemo } = await import("../src/lib/demo/tais/bootstrap");
  const result = await bootstrapTaisDemo();

  console.log("TAIS demo bootstrap tamamlandi.");
  console.log(`  Kurum kodu     : (organizations.id) ${result.orgId}`);
  console.log(`  Giris e-postasi: ${result.adminEmail}`);
  console.log(
    `  Parola         : TAIS_DEMO_ADMIN_PASSWORD env degiskeninde belirttiyseniz o, aksi halde repodaki demo parola politikasi (README) gecerlidir — burada gosterilmez.`
  );
  console.log(
    `  Temel veri     : ${result.baseDataAlreadySeeded ? "zaten mevcuttu (dokunulmadi)" : "yeni olusturuldu"}`
  );
  console.log(
    `  Karar+aksiyon  : ${result.decisionsAlreadySeeded ? "zaten mevcuttu (dokunulmadi)" : "yeni olusturuldu"} (${result.decisionCount} karar, ${result.actionCount} aksiyon)`
  );
  console.log("  Kayit sayilari :");
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`    ${table.padEnd(16)} ${count}`);
  }
}

main()
  .then(async () => {
    const { getDb } = await import("../src/lib/db/client");
    await getDb().close();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("TAIS demo bootstrap BASARISIZ:", err instanceof Error ? err.message : err);
    try {
      const { getDb } = await import("../src/lib/db/client");
      await getDb().close();
    } catch {
      // kapanis hatasi asil hatayi gizlemesin
    }
    process.exit(1);
  });
