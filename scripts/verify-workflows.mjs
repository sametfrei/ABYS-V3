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

async function loginOn(target, email = EMAIL, password = PASSWORD) {
  await target.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await target.waitForFunction(
    () => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 60_000 }
  );
  await target.fill("#email", email);
  await target.fill("#password", password);
  await Promise.all([
    target.waitForURL("**/dashboard", { timeout: 90_000 }),
    target.click('button[type="submit"]'),
  ]);
}

async function login(email = EMAIL, password = PASSWORD) {
  await loginOn(page, email, password);
}

async function apiJson(requestPage, method, url, data) {
  const response = await requestPage.request.fetch(`${BASE}${url}`, {
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
  const list = await apiJson(page, "GET", "/api/actions");
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

    const afterStart = await apiJson(page, "GET", "/api/actions");
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
      const afterDone = await apiJson(page, "GET", "/api/actions");
      const done = (afterDone.body?.actions ?? []).find((a) => a.id === target.id);
      if (done?.status === "done") ok("aksiyon durumu kalıcı: done");
      else bad("aksiyon durumu kalıcı", `beklenen done, gelen ${done?.status}`);
      if (done?.decision_state === "outcome_review") ok("karar durumu outcome_review'a geçti");
      else bad("karar durumu", `beklenen outcome_review, gelen ${done?.decision_state}`);

      const events = await apiJson(page, "GET", `/api/actions?eventsFor=${encodeURIComponent(target.id)}`);
      const transitions = (events.body?.events ?? []).map(
        (e) => `${e.from_status ?? e.fromStatus}->${e.to_status ?? e.toStatus}`
      );
      if (transitions.includes("open->in_progress") && transitions.includes("in_progress->done")) {
        ok("aksiyon olay izi", transitions.join(", "));
      } else {
        bad("aksiyon olay izi", JSON.stringify(transitions));
      }

      const audit = await apiJson(page, "GET", "/api/audit?limit=40");
      const entries = audit.body?.events ?? audit.body?.entries ?? audit.body?.rows ?? [];
      const hit = entries.find(
        (e) => e.type === "action_transition" && String(e.detail ?? "").includes(target.id)
      );
      if (hit) ok("denetim kanıtı: action_transition");
      else bad("denetim kanıtı", "action_transition kaydı bulunamadı");
      const verify = await apiJson(page, "GET", "/api/audit?verify=1");
      if (verify.body?.verify?.valid === true)
        ok("denetim zinciri geçerli", `${verify.body.verify.checked} kayıt`);
      else bad("denetim zinciri", JSON.stringify(verify.body));
    }
  }

  // ---- Negatif: açık aksiyon doğrudan tamamlanamaz ----
  const relist = await apiJson(page, "GET", "/api/actions");
  const stillOpen = (relist.body?.actions ?? []).find((a) => a.status === "open");
  if (!stillOpen) {
    ok("negatif geçiş", "açık aksiyon kalmadı (atlandı)");
  } else {
    const forced = await apiJson(page, "PATCH", "/api/actions", { actionId: stillOpen.id, status: "done" });
    const after = await apiJson(page, "GET", "/api/actions");
    const current = (after.body?.actions ?? []).find((a) => a.id === stillOpen.id);
    if (forced.status === 409 && current?.status === "open") {
      ok("açık aksiyon doğrudan tamamlanamadı", `HTTP ${forced.status}`);
    } else {
      bad("negatif geçiş", `HTTP ${forced.status}, durum ${current?.status}`);
    }
  }

  // ---- Ana karar kartı: yürütme durumu ve ölçülen sonuç ----
  {
    const summaryBefore = await apiJson(page, "GET", "/api/tais/executive-summary");
    const main = summaryBefore.body?.main ?? null;
    if (!main) {
      bad("ana karar kartı", "ana karar bulunamadı");
    } else {
      if (main.execution && main.execution.total > 0) {
        ok("ana kart yürütme durumu", `${main.execution.done}/${main.execution.total} tamamlandı`);
      } else {
        bad("ana kart yürütme durumu", JSON.stringify(main.execution));
      }
      let latest = main.latestOutcome ?? null;
      if (!latest) {
        const recorded = await apiJson(page, "POST", "/api/outcomes", {
          decisionId: main.decisionId,
          result: "improved",
          note: "E2E: karar sonrası SLA riskleri azaldı.",
          lesson: "Ekip yeniden dağıtımı SLA risklerini azaltıyor.",
          actualImpact: { value: 12500, currency: "AZN" },
        });
        if (recorded.status !== 200) bad("sonuç kaydı", `HTTP ${recorded.status}`);
        const summaryAfter = await apiJson(page, "GET", "/api/tais/executive-summary");
        latest = summaryAfter.body?.main?.latestOutcome ?? null;
      }
      if (latest?.result && latest.recordedAt) {
        ok("ana kart ölçülen sonucu gösteriyor", latest.result);
      } else {
        bad("ana kart ölçülen sonuç", JSON.stringify(latest));
      }
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2_500);
      const bodyText = await page.locator("body").innerText();
      const hasExecLine = /Yürütme: \d+\/\d+ aksiyon tamamland/.test(bodyText);
      const hasOutcomeLine = /Ölçülen sonuç:/.test(bodyText);
      if (hasExecLine && hasOutcomeLine) ok("kart metni kullanıcıya yansıdı");
      else bad("kart metni", `yürütme=${hasExecLine} sonuç=${hasOutcomeLine}`);
    }
  }

  // ---- Konnektör yaşam döngüsü: oluştur → senkronize et → geçmiş → eşleme onayı ----
  const ADMIN_EMAIL = process.env.SMOKE_DATA_EMAIL ?? "veri.yoneticisi@tais.demo";
  const ADMIN_PASSWORD = process.env.SMOKE_DATA_PASSWORD ?? PASSWORD;
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "tr-TR",
  });
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (error) => pageErrors.push(`admin: ${error.message}`));

  let adminReady = false;
  try {
    await loginOn(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    adminReady = true;
    ok("veri yöneticisi girişi", adminPage.url().replace(BASE, ""));
  } catch (error) {
    bad("konnektör akışı", `veri yöneticisi girişi başarısız: ${error instanceof Error ? error.message : String(error)}`);
  }

  let connectorConfig = null;
  let firstRun = null;
  if (adminReady) {
    const connectorName = `E2E REST ${Date.now()}`;
    try {
      await adminPage.goto(`${BASE}/dashboard/connectors`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await adminPage.getByRole("button", { name: "Genel REST / OData" }).click({ timeout: 30_000 });
      await adminPage.getByPlaceholder("Bağlantı adı").fill(connectorName);
      await adminPage.getByPlaceholder("https://api.sirket.com").fill("https://jsonplaceholder.typicode.com");
      await adminPage.getByPlaceholder("/v1/customers").fill("/users");
      await adminPage.getByPlaceholder("Kayıt yolu (data)").fill("");
      await adminPage.locator("select").filter({ has: adminPage.getByRole("option", { name: "Tek sayfa" }) }).selectOption("none");
      await adminPage.getByRole("button", { name: "Bağlantıyı kaydet" }).click({ timeout: 30_000 });
      await adminPage.getByText("Konnektör tanımlandı.").first().waitFor({ timeout: 60_000 });
      ok("konnektör oluşturma kullanıcıya yansıdı");

      const created = await apiJson(adminPage, "GET", "/api/connectors");
      connectorConfig = (created.body?.configs ?? []).find((c) => c.name === connectorName) ?? null;
      if (connectorConfig) {
        const cfg = connectorConfig.config ?? {};
        if (cfg.baseUrl === "https://jsonplaceholder.typicode.com" && cfg.path === "/users" && cfg.pagination?.type === "none") {
          ok("konnektör yapılandırması kalıcı", `${cfg.entity} ${cfg.baseUrl}${cfg.path}`);
        } else {
          bad("konnektör yapılandırması", JSON.stringify({ baseUrl: cfg.baseUrl, path: cfg.path, pagination: cfg.pagination }));
        }
      } else {
        bad("konnektör kalıcılığı", "oluşturulan konnektör API'de bulunamadı");
      }

      if (connectorConfig) {
        const row = adminPage.locator("li").filter({ hasText: connectorName }).first();
        await row.getByRole("button", { name: "Senkronize et" }).click({ timeout: 30_000 });
        await adminPage.getByText(/Senkron tamam/).first().waitFor({ timeout: 120_000 });
        ok("senkron tetiklendi ve özet gösterildi");

        const runs = await apiJson(adminPage, "GET", `/api/connectors/${connectorConfig.id}/runs`);
        const latestRun = (runs.body?.runs ?? [])[0] ?? null;
        if (latestRun?.status === "success" && latestRun.readCount > 0 && latestRun.writtenCount > 0) {
          ok("senkron kaydı kalıcı", `okunan=${latestRun.readCount} yazılan=${latestRun.writtenCount}`);
        } else {
          bad("senkron kaydı", JSON.stringify({ status: latestRun?.status, readCount: latestRun?.readCount, writtenCount: latestRun?.writtenCount, error: latestRun?.error }));
        }
        const recordCounts = runs.body?.records ?? [];
        const totalRecords = recordCounts.reduce((sum, item) => sum + item.count, 0);
        if (totalRecords > 0) ok("kanonik kayıt kalıcı", `${totalRecords} kayıt (${recordCounts.map((r) => `${r.entity}=${r.count}`).join(", ")})`);
        else bad("kanonik kayıt", "senkron sonrası kayıt sayısı 0");
        firstRun = latestRun;

        await row.getByRole("button", { name: "Geçmiş" }).click({ timeout: 30_000 });
        await adminPage.getByText(/başarılı|Başarılı/).first().waitFor({ timeout: 60_000 }).catch(() => {});
        ok("geçmiş paneli açıldı");

        await row.getByRole("button", { name: "Eşleme onayı" }).click({ timeout: 30_000 });
        const mappingTextarea = adminPage.locator(`#connector-mapping-${connectorConfig.id}`);
        await mappingTextarea.waitFor({ timeout: 60_000 });
        const before = await apiJson(adminPage, "GET", `/api/connectors/${connectorConfig.id}/mapping`);
        const beforeVersion = before.body?.currentVersion ?? null;
        const editedMap = { ...(before.body?.currentFieldMap ?? {}), username: "username" };
        await mappingTextarea.fill(JSON.stringify(editedMap, null, 2));
        await row.getByRole("button", { name: "Yeni sürümü onayla" }).click({ timeout: 30_000 });
        await adminPage.getByText(/Eşleme v\d+ olarak onaylandı/).first().waitFor({ timeout: 60_000 });
        const after = await apiJson(adminPage, "GET", `/api/connectors/${connectorConfig.id}/mapping`);
        if (beforeVersion !== null && after.body?.currentVersion === beforeVersion + 1) {
          ok("eşleme onayı yeni sürüm oluşturdu", `v${beforeVersion} → v${after.body.currentVersion}`);
        } else {
          bad("eşleme sürümü", JSON.stringify({ beforeVersion, after: after.body?.currentVersion }));
        }
        if (after.body?.currentFieldMap?.username === "username") ok("düzenlenen alan eşlemesi kalıcı");
        else bad("alan eşlemesi kalıcılığı", JSON.stringify(after.body?.currentFieldMap ?? null));

        const versions = after.body?.versions ?? [];
        if (versions.length >= 2) ok("eşleme sürüm geçmişi", `${versions.length} sürüm`);
        else bad("eşleme sürüm geçmişi", `${versions.length} sürüm`);

        const runsBeforeTest =
          (await apiJson(adminPage, "GET", `/api/connectors/${connectorConfig.id}/runs`)).body?.runs?.length ?? 0;
        await row.getByRole("button", { name: "Bağlantıyı test et" }).click({ timeout: 30_000 });
        await adminPage.getByText(/Bağlantı başarılı ·/).first().waitFor({ timeout: 120_000 });
        ok("bağlantı testi kullanıcıya yansıdı");
        const runsAfterTest =
          (await apiJson(adminPage, "GET", `/api/connectors/${connectorConfig.id}/runs`)).body?.runs?.length ?? 0;
        if (runsAfterTest === runsBeforeTest) ok("bağlantı testi yan etkisiz (senkron kaydı oluşmadı)");
        else bad("bağlantı testi yan etkisi", `${runsBeforeTest} → ${runsAfterTest}`);
      }
    } catch (error) {
      bad("konnektör akışı", error instanceof Error ? error.message : String(error));
      await adminPage
        .screenshot({ path: path.join(process.cwd(), ".data", "browser-smoke", "connector-failure.png"), fullPage: true })
        .catch(() => {});
    }
  }
  await adminContext.close();

  // ---- Denetim kanıtı (CEO görünümü: veri yöneticisinin işlemleri org denetiminde) ----
  if (connectorConfig) {
    try {
      const audit = await apiJson(page, "GET", "/api/audit?limit=80");
      const entries = audit.body?.events ?? audit.body?.entries ?? audit.body?.rows ?? [];
      const configEvent = entries.find((e) => e.type === "connector_config_created" && String(e.detail ?? "") === connectorConfig.id);
      if (configEvent) ok("denetim kanıtı: connector_config_created");
      else bad("denetim kanıtı", "connector_config_created bulunamadı");

      const syncEvent = entries.find(
        (e) => (e.type === "connector_sync_completed" || e.type === "connector_sync_failed") && e.detail === firstRun?.id
      );
      if (syncEvent?.type === "connector_sync_completed") ok("denetim kanıtı: connector_sync_completed");
      else bad("denetim kanıtı", `sync olayı: ${syncEvent?.type ?? "yok"}`);

      const mappingEvent = entries.find((e) => {
        if (e.type !== "connector_mapping_approved") return false;
        try {
          return JSON.parse(String(e.detail ?? "{}")).configId === connectorConfig.id;
        } catch {
          return false;
        }
      });
      if (mappingEvent) ok("denetim kanıtı: connector_mapping_approved");
      else bad("denetim kanıtı", "connector_mapping_approved bulunamadı");

      const testEvent = entries.find(
        (e) => e.type === "connector_connection_tested" && String(e.detail ?? "") === connectorConfig.id
      );
      if (testEvent) ok("denetim kanıtı: connector_connection_tested");
      else bad("denetim kanıtı", "connector_connection_tested bulunamadı");

      const verify = await apiJson(page, "GET", "/api/audit?verify=1");
      if (verify.body?.verify?.valid === true) ok("denetim zinciri geçerli (konnektör sonrası)", `${verify.body.verify.checked} kayıt`);
      else bad("denetim zinciri (konnektör sonrası)", JSON.stringify(verify.body));
    } catch (error) {
      bad("denetim kanıtı", error instanceof Error ? error.message : String(error));
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
