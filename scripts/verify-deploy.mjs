#!/usr/bin/env node
/**
 * Dağıtım kapısı — çalışan bir örneğin hangi commit'i sunduğunu kanıtlar.
 *
 * Kullanım:
 *   node scripts/verify-deploy.mjs --base=https://host [--expect=<sha|origin>]
 *   DEPLOY_BASE_URL=https://host DEPLOY_EXPECT_SHA=<sha> node scripts/verify-deploy.mjs
 *
 * Çıkış kodları:
 *   0 sağlıklı (ve --expect verildiyse commit eşleşiyor)
 *   1 commit uyuşmuyor
 *   2 sağlık ucu hatalı / erişilemiyor / ayrıştırılamıyor
 *   3 kullanım hatası (--base yok ya da geçersiz --expect)
 *
 * Sır basmaz: yalnızca sağlık yanıtının kamuya açık alanlarını raporlar.
 */
import { execFileSync } from "node:child_process";

const USER_AGENT = "abys-verify-deploy";
const TIMEOUT_MS = 10_000;

function usage(message) {
  console.error(`Hata: ${message}`);
  console.error(
    "Kullanım: node scripts/verify-deploy.mjs --base=https://host [--expect=<sha|origin>]"
  );
  process.exit(3);
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) usage(`bilinmeyen argüman: ${arg}`);
    const eq = arg.indexOf("=");
    if (eq === -1) usage(`değer eksik: ${arg}`);
    out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const base = (args.base ?? process.env.DEPLOY_BASE_URL ?? "").trim().replace(/\/+$/, "");
if (!base) usage("--base zorunlu (ya da DEPLOY_BASE_URL)");
try {
  const parsed = new URL(base);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("protokol");
} catch {
  usage(`geçersiz --base: ${base}`);
}

const expectArg = (args.expect ?? process.env.DEPLOY_EXPECT_SHA ?? "").trim();
let expected = null;
if (expectArg) {
  if (expectArg === "origin") {
    try {
      expected = execFileSync("git", ["rev-parse", "origin/main"], {
        encoding: "utf8",
      }).trim();
    } catch (err) {
      console.error(
        `Hata: origin/main çözümlenemedi: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(2);
    }
  } else if (/^[0-9a-f]{7,40}$/i.test(expectArg)) {
    expected = expectArg.toLowerCase();
  } else {
    usage(`--expect 7+ karakterlik SHA ya da 'origin' olmalı: ${expectArg}`);
  }
}

function matches(actual, wanted) {
  if (!actual || actual === "unknown") return false;
  const a = String(actual).toLowerCase();
  return a === wanted || a.startsWith(wanted);
}

let res;
try {
  res = await fetch(`${base}/api/health`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "manual",
  });
} catch (err) {
  console.error(`base: ${base}`);
  console.error(`erişim: BAŞARISIZ — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

const text = await res.text();
let body = null;
try {
  body = JSON.parse(text);
} catch {
  // Aşağıda ayrıştırma hatası olarak raporlanır.
}

console.log(`base: ${base}`);
console.log(`http: ${res.status}`);

if (!body || typeof body !== "object") {
  console.log("gövde: AYRIŞTIRILAMADI (JSON değil)");
  process.exit(2);
}

const build = body.build ?? {};
console.log(`build.commit: ${build.commit ?? "yok"}`);
console.log(`build.builtAt: ${build.builtAt ?? "yok"}`);
console.log(`db: ${body.db ?? "yok"}`);
console.log(`schemaReady: ${body.schemaReady ?? "yok"}`);

if (expected) {
  console.log(`beklenen: ${expected}`);
  const match = matches(build.commit, expected);
  console.log(`commit eşleşmesi: ${match ? "EŞLEŞTİ" : "EŞLEŞMEDİ"}`);
}

if (res.status !== 200 || body.ok !== true) {
  console.log("sonuç: SAĞLIKSIZ");
  process.exit(2);
}

if (expected && !matches(build.commit, expected)) {
  console.log("sonuç: COMMIT UYUŞMUYOR");
  process.exit(1);
}

console.log("sonuç: SAĞLIKLI");
process.exit(0);
