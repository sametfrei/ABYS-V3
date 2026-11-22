#!/usr/bin/env node
/**
 * Gerçek tarayıcı duman testi (isteğe bağlı, varsayılan süitin parçası değil).
 *
 * Kullanım:
 *   npm run smoke:browser
 *   BASE_URL=http://127.0.0.1:3100 PW_CHANNEL=chrome npm run smoke:browser
 *
 * Playwright, kurulu Google Chrome'u (`channel: chrome`) kullanır; ayrı
 * tarayıcı indirmesi gerektirmez. Ekran görüntüleri `.data/browser-smoke/`
 * altına yazılır (git dışıdır). Sır basmaz; yalnızca demo hesabı kullanır.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "ceo@tais.demo";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "abys-demo-2026";
const CHANNEL = process.env.PW_CHANNEL ?? "chrome";
const SHOTS = path.join(process.cwd(), ".data", "browser-smoke");

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = "") {
  pass += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function bad(name, detail = "") {
  fail += 1;
  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const { chromium } = await import("playwright");
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "tr-TR",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

function slug(route) {
  return route === "/dashboard" ? "dashboard" : route.replace(/^\/dashboard\//, "").replaceAll("/", "-");
}

async function visit(route, label) {
  const before = pageErrors.length;
  const response = await page.goto(`${BASE}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (document.body.innerText ?? "").trim().length > 100,
    undefined,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(250);
  const status = response?.status() ?? 0;
  if (status === 200) ok(`${label} HTTP 200`);
  else bad(`${label} HTTP`, String(status));

  const heading =
    (await page.locator("h1").count()) > 0
      ? (await page.locator("h1").first().innerText()).trim()
      : (await page.locator("p.tracking-widest").first().innerText().catch(() => "")).trim();
  if (heading.length > 1) ok(`${label} başlık`, heading.slice(0, 60));
  else ok(`${label} içerik yüklendi`, "özel başlıksız ekran");

  const body = await page.locator("body").innerText();
  if (/Application error|Internal Server Error|Unhandled Runtime Error/i.test(body)) {
    bad(`${label} çalışma hatası`, "hata metni görünür");
  } else {
    ok(`${label} hata metni yok`);
  }
  if (pageErrors.length > before) {
    bad(`${label} yakalanmamış hata`, pageErrors[pageErrors.length - 1]);
  }

  await page.screenshot({ path: path.join(SHOTS, `${slug(route)}.png`), fullPage: true });
  return body;
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);
  ok("tarayıcı girişi", page.url().replace(BASE, ""));

  await visit("/dashboard", "komuta merkezi");
  const actionsBody = await visit("/dashboard/actions", "aksiyon merkezi");
  await visit("/dashboard/decision-ledger", "karar defteri");
  await visit("/dashboard/forecast", "tahmin");
  await visit("/dashboard/connectors", "bağlantılar");
  await visit("/dashboard/data-quality", "veri kalitesi");

  await page.goto(`${BASE}/dashboard/actions`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(800);
  const filterGroup = page.getByRole("group", { name: "Aksiyon filtresi" });
  if ((await filterGroup.count()) > 0) {
    const overdue = filterGroup.getByRole("button", { name: /Geciken/ });
    if ((await overdue.count()) > 0) {
      await overdue.click();
      if ((await overdue.getAttribute("aria-pressed")) === "true") ok("geciken filtresi");
      else bad("geciken filtresi", "aria-pressed güncellenmedi");
    } else {
      bad("geciken filtresi", "düğme yok");
    }
  } else if (actionsBody.includes("Henüz aksiyon yok")) {
    ok("geciken filtresi", "demo verisinde aksiyon yok");
  } else {
    bad("geciken filtresi", "filtre grubu yok");
  }

  await context.addCookies([{ name: "abys_lang", value: "en", url: BASE }]);
  await page.goto(`${BASE}/dashboard/actions`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("h1", { timeout: 15_000 });
  const englishHeading = (await page.locator("h1").first().innerText()).trim();
  if (/Execution/i.test(englishHeading)) ok("TR/EN geçişi", englishHeading.slice(0, 50));
  else bad("TR/EN geçişi", englishHeading.slice(0, 60));
  await page.screenshot({ path: path.join(SHOTS, "actions-en.png"), fullPage: true });
} catch (error) {
  bad("tarayıcı akışı", error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

console.log(`\nSonuç: ${pass} geçti, ${fail} başarısız`);
console.log(`Ekran görüntüleri: ${SHOTS}`);
if (fail > 0) {
  console.log("Başarısızlar:");
  for (const failure of failures) console.log(` - ${failure}`);
  process.exit(1);
}
