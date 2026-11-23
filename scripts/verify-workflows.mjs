#!/usr/bin/env node
/**
 * Gerçek tarayıcı iş akışı doğrulaması (yazma akışları).
 *
 * Kullanım:
 *   BASE_URL=http://127.0.0.1:3103 npm run verify:workflows
 *
 * Her adım HTTP 200 ile yetinmez: kalıcı durumu (API yeniden okuma) ve
 * kullanıcının gördüğü sonucu (DOM) birlikte doğrular; denetim kanıtı ve
 * aksiyon olay izini kontrol eder. Yalnızca demo ortamında çalıştırılmalıdır.
 */
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3103").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "ceo@tais.demo";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "abys-demo-2026";
const CHANNEL = process.env.PW_CHANNEL ?? "chrome";

let pass = 0;
const failures = [];
function ok(name, detail = "") {
  pass += 1;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function bad(name, detail = "") {
  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "tr-TR" });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function login(email = EMAIL, password = PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 60_000 }
  );
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function apiJson(method, url, data) {
  const response = await page.request.fetch(`${BASE}${url}`, {
    method,
    data,
    headers: data ? { "content-type": "application/json" } : undefined,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status(), body };
}

try {
  await login();
  ok("giriş", page.url().replace(BASE, ""));

  // ---- Aksiyon durum geçişleri (açık → in_progress → done) ----
  const list = await apiJson("GET", "/api/actions");
  const openBefore = (list.body?.actions ?? []).filter((a) => a.status === "open");
  if (openBefore.length === 0) {
    bad("aksiyon geçişi", "açık aksiyon bulunamadı");
  } else {
    await page.goto(`${BASE}/dashboard/actions`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const startButton = page.getByRole("button", { name: "Yürütmeye al" }).first();
    await startButton.waitFor({ timeout: 60_000 });
    const beforeIds = new Map(openBefore.map((a) => [a.id, a.status]));
    await startButton.click();
    await page.getByRole("button", { name: "Tamamlandı işaretle" }).first().waitFor({ timeout: 30_000 });
    ok("aksiyon başlatma kullanıcıya yansıdı");

    const afterStart = await apiJson("GET", "/api/actions");
    const started = (afterStart.body?.actions ?? []).filter(
      (a) => beforeIds.get(a.id) === "open" && a.status === "in_progress"
    );
    if (started.length === 1) {
      ok("aksiyon durumu kalıcı: in_progress");
    } else {
      bad("aksiyon durumu kalıcı", `${started.length} aksiyon in_progress oldu`);
    }
    const target = started[0] ?? null;
    if (!target) {
      bad("aksiyon geçişi", "hedef aksiyon belirlenemedi");
    } else {
      await page.getByRole("button", { name: "Tamamlandı işaretle" }).first().click();
      await page.waitForTimeout(2_500);
      const afterDone = await apiJson("GET", "/api/actions");
      const done = (afterDone.body?.actions ?? []).find((a) => a.id === target.id);
      if (done?.status === "done") ok("aksiyon durumu kalıcı: done");
      else bad("aksiyon durumu kalıcı", `beklenen done, gelen ${done?.status}`);
      if (done?.decision_state === "outcome_review") ok("karar durumu outcome_review'a geçti");
      else bad("karar durumu", `beklenen outcome_review, gelen ${done?.decision_state}`);

      const events = await apiJson("GET", `/api/actions?eventsFor=${encodeURIComponent(target.id)}`);
      const transitions = (events.body?.events ?? []).map(
        (e) => `${e.from_status ?? e.fromStatus}->${e.to_status ?? e.toStatus}`
      );
      if (transitions.includes("open->in_progress") && transitions.includes("in_progress->done")) {
        ok("aksiyon olay izi", transitions.join(", "));
      } else {
        bad("aksiyon olay izi", JSON.stringify(transitions));
      }

      const audit = await apiJson("GET", "/api/audit?limit=40");
      const entries = audit.body?.events ?? audit.body?.entries ?? audit.body?.rows ?? [];
      const hit = entries.find(
        (e) => e.type === "action_transition" && String(e.detail ?? "").includes(target.id)
      );
      if (hit) ok("denetim kanıtı: action_transition");
      else bad("denetim kanıtı", "action_transition kaydı bulunamadı");
      const verify = await apiJson("GET", "/api/audit?verify=1");
      if (verify.body?.verify?.valid === true)
        ok("denetim zinciri geçerli", `${verify.body.verify.checked} kayıt`);
      else bad("denetim zinciri", JSON.stringify(verify.body));
    }
  }

  // ---- Negatif: açık aksiyon doğrudan tamamlanamaz ----
  const relist = await apiJson("GET", "/api/actions");
  const stillOpen = (relist.body?.actions ?? []).find((a) => a.status === "open");
  if (!stillOpen) {
    ok("negatif geçiş", "açık aksiyon kalmadı (atlandı)");
  } else {
    const forced = await apiJson("PATCH", "/api/actions", { actionId: stillOpen.id, status: "done" });
    const after = await apiJson("GET", "/api/actions");
    const current = (after.body?.actions ?? []).find((a) => a.id === stillOpen.id);
    if (forced.status === 409 && current?.status === "open") {
      ok("açık aksiyon doğrudan tamamlanamadı", `HTTP ${forced.status}`);
    } else {
      bad("negatif geçiş", `HTTP ${forced.status}, durum ${current?.status}`);
    }
  }

  if (pageErrors.length === 0) ok("yakalanmamış tarayıcı hatası yok");
  else bad("tarayıcı hatası", pageErrors.slice(0, 2).join(" | "));
} catch (error) {
  bad("iş akışı", error instanceof Error ? error.message : String(error));
  await page
    .screenshot({ path: path.join(process.cwd(), ".data", "browser-smoke", "workflow-failure.png"), fullPage: true })
    .catch(() => {});
} finally {
  await browser.close();
}

console.log(`\nSonuç: ${pass} geçti, ${failures.length} başarısız`);
if (failures.length > 0) {
  console.log("Başarısızlar:");
  for (const failure of failures) console.log(` - ${failure}`);
  process.exit(1);
}
