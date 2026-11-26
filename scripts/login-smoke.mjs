#!/usr/bin/env node
/**
 * Login deneyimi duman testi — çalışan preview sunucusuna karşı gerçek tarayıcı.
 *
 * Kullanım:
 *   npm run smoke:login
 *   BASE_URL=http://127.0.0.1:3100 npm run smoke:login
 *
 * Yalnızca dokümante TAIS demo hesabını kullanır. Şifre, çerez veya login
 * yanıtı çıktıya basılmaz. Varsayılan olarak yalnızca loopback hostlarına
 * (127.0.0.1, localhost, ::1) ve http:/https: protokollerine bağlanır.
 * Uzak host için HTTPS, SMOKE_ALLOW_REMOTE=1 ve açık SMOKE_PASSWORD zorunludur;
 * uzak hostta `.env.example` demo parolası okunmaz. Yerel modda parola
 * verilmezse `.env.example` demo değeri kullanılır.
 *
 * SMOKE_VALIDATE_ONLY=1 yalnızca URL/parola politikasını doğrular ve ağa
 * çıkmadan çıkar; güvenlik kontrollerinde kullanılır.
 */
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const rawBase = process.env.BASE_URL?.trim() || "http://127.0.0.1:3100";
let baseUrl;
try {
  baseUrl = new URL(rawBase);
} catch {
  console.error("BASE_URL geçerli bir URL değil.");
  process.exit(1);
}

function isLocalHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
  console.error("Güvenlik: BASE_URL yalnızca http: veya https: protokolünü kullanabilir.");
  process.exit(1);
}
if (baseUrl.username || baseUrl.password) {
  console.error("Güvenlik: BASE_URL içinde kullanıcı adı veya parola bulunamaz.");
  process.exit(1);
}
if (baseUrl.search || baseUrl.hash) {
  console.error("Güvenlik: BASE_URL query veya hash bileşeni içeremez.");
  process.exit(1);
}

const isRemote = !isLocalHost(baseUrl.hostname);
const remoteExplicitlyAllowed = process.env.SMOKE_ALLOW_REMOTE === "1";

if (isRemote) {
  if (!remoteExplicitlyAllowed) {
    console.error(
      "Güvenlik: BASE_URL yalnızca 127.0.0.1, localhost veya ::1 olabilir. " +
        "Uzak test için SMOKE_ALLOW_REMOTE=1 ve açık SMOKE_PASSWORD gerekir."
    );
    process.exit(1);
  }
  if (baseUrl.protocol !== "https:") {
    console.error("Güvenlik: Uzak host yalnızca HTTPS ile kullanılabilir.");
    process.exit(1);
  }
}

const explicitPassword = process.env.SMOKE_PASSWORD;
const hasExplicitPassword =
  typeof explicitPassword === "string" && explicitPassword.length > 0;
const PASSWORD = hasExplicitPassword
  ? explicitPassword
  : isRemote
    ? undefined
    : fs
        .readFileSync(".env.example", "utf8")
        .match(/^TAIS_DEMO_ADMIN_PASSWORD=([^\s#]+)/m)?.[1];

if (!PASSWORD) {
  console.error(
    isRemote
      ? "Uzak host için SMOKE_PASSWORD açıkça verilmelidir; .env.example demo parolası kullanılmaz."
      : "Demo parola kaynağı bulunamadı."
  );
  process.exit(1);
}

if (process.env.SMOKE_VALIDATE_ONLY === "1") {
  console.log("validation=ok");
  process.exit(0);
}

const BASE = baseUrl.toString().replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "ceo@tais.demo";
const CHANNEL = process.env.PW_CHANNEL ?? "chrome";
const SHOTS = path.join(process.cwd(), ".data", "browser-smoke");

let pass = 0;
let fail = 0;

function ok(name, detail = "") {
  pass += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function bad(name, detail = "") {
  fail += 1;
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const { chromium } = await import("playwright");
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  locale: "tr-TR",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function waitForForm() {
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 60_000 }
  );
}

try {
  // 1) Oturumsuz kök adres login'e yönlenmeli.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL("**/login", { timeout: 60_000 });
  await waitForForm();
  if (await page.locator("#email").isVisible()) ok("kök adres oturumsuz login'e yönlendi");
  else bad("kök adres login formu görünür değil");

  // 2) Form alanları ve erişilebilir kontroller.
  const hasEmail = await page.locator("#email").count();
  const hasPassword = await page.locator("#password").count();
  const submit = page.getByRole("button", { name: /giriş yap/i });
  if (hasEmail === 1 && hasPassword === 1 && (await submit.count()) === 1) {
    ok("login formu alanları hazır");
  } else {
    bad("login formu alanları eksik");
  }

  // 3) Şifre göster/gizle.
  await page.fill("#password", "gecici-deger");
  await page.getByRole("button", { name: /parolayı göster/i }).click();
  if ((await page.locator("#password").getAttribute("type")) === "text") {
    ok("şifre göster");
  } else {
    bad("şifre göster çalışmadı");
  }
  await page.getByRole("button", { name: /parolayı gizle/i }).click();
  if ((await page.locator("#password").getAttribute("type")) === "password") {
    ok("şifre gizle");
  } else {
    bad("şifre gizle çalışmadı");
  }

  // 4) Hatalı kimlik bilgisi görünür hata üretmeli.
  await page.fill("#email", EMAIL);
  await page.fill("#password", "yanlis-parola");
  await submit.click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#login-error");
      return !!el && (el.textContent ?? "").trim().length > 0;
    },
    undefined,
    { timeout: 15_000 }
  );
  const alertText = (await page.locator("#login-error").innerText()).trim();
  if (alertText.length > 0) ok("hatalı şifre görünür hata", alertText.slice(0, 60));
  else bad("hatalı şifre hatası görünmüyor");

  // 5) Geçerli demo hesabıyla giriş.
  await page.fill("#password", PASSWORD);
  await submit.click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  await page.waitForFunction(
    () => (document.body.innerText ?? "").trim().length > 100,
    undefined,
    { timeout: 60_000 }
  );
  ok("geçerli giriş dashboard'a yönlendi");

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  ok("oturumlu kök adres dashboard'a yönlendi");

  // 6) Sayfa yenilenince oturum korunmalı.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  ok("yenilemede oturum korundu");

  // 7) Oturumlu kullanıcı login'e giderse dashboard'a dönmeli.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  ok("oturumlu kullanıcı login'den dashboard'a yönlendi");

  await page.screenshot({
    path: path.join(SHOTS, "login-authenticated-dashboard.png"),
    fullPage: true,
  });

  // 8) Logout oturumu bitirip login'e dönmeli.
  await page.getByRole("button", { name: /çıkış yap/i }).click();
  await page.waitForURL("**/login", { timeout: 60_000 });
  await waitForForm();
  ok("logout login'e döndü");

  // 9) Logout sonrası dashboard korumalı kalmalı.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL("**/login", { timeout: 60_000 });
  await waitForForm();
  ok("oturumsuz dashboard login'e yönlendi");

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForForm();
  await page.screenshot({
    path: path.join(SHOTS, "login-entry.png"),
    fullPage: true,
  });
  ok("login ekran görüntüsü", path.join(SHOTS, "login-entry.png"));

  // 10) Mobil görünüm.
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await mobilePage.waitForSelector("#email", { timeout: 60_000 });
  if (
    (await mobilePage.locator("#email").isVisible()) &&
    (await mobilePage.getByRole("button", { name: /giriş yap/i }).isVisible())
  ) {
    ok("mobil login formu görünür");
  } else {
    bad("mobil login formu görünür değil");
  }
  await mobilePage.screenshot({
    path: path.join(SHOTS, "login-mobile.png"),
    fullPage: true,
  });
  await mobileContext.close();

  // 11) İngilizce dil desteği.
  const englishContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "en-US",
  });
  await englishContext.addCookies([{ name: "abys_lang", value: "en", url: BASE }]);
  const englishPage = await englishContext.newPage();
  await englishPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await englishPage.waitForSelector("#email", { timeout: 60_000 });
  const englishBody = await englishPage.locator("body").innerText();
  const showPasswordLabel = await englishPage
    .getByRole("button", { name: /show password/i })
    .count();
  if (/Enterprise/i.test(englishBody) && showPasswordLabel === 1) {
    ok("İngilizce login metinleri");
  } else {
    bad("İngilizce login metinleri eksik");
  }
  await englishPage.screenshot({
    path: path.join(SHOTS, "login-en.png"),
    fullPage: true,
  });
  await englishContext.close();
} catch (error) {
  bad("login duman testi", error instanceof Error ? error.message : String(error));
} finally {
  if (pageErrors.length > 0) {
    bad("yakalanmamış sayfa hatası", pageErrors.slice(0, 2).join(" | "));
  }
  await browser.close();
  console.log(`\nlogin smoke: ${pass} geçti, ${fail} başarısız`);
  process.exit(fail === 0 ? 0 : 1);
}
