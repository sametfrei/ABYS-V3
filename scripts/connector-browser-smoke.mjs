#!/usr/bin/env node
/**
 * Gerçek tarayıcı E2E: konnektör oluşturma, bağlantı testi, senkron,
 * run geçmişi ve eşleme sürümü onayı.
 *
 * Ön koşul: yalnızca ayrı/atılabilir test DB üzerinde TAIS demo bootstrap
 * ve data_admin demo rolü. Ardından:
 *   BASE_URL=http://127.0.0.1:3230 SMOKE_EMAIL=veri.yoneticisi@tais.demo npm run smoke:connectors-browser
 *
 * Dış sistem olarak yalnızca JSONPlaceholder'ın herkese açık, sahte test
 * verisi kullanılır. İstekler GET'tir; hiçbir üretim ERP'sine bağlanmaz.
 * Test veritabanında bir demo konnektörü ve 10 örnek müşteri kaydı oluşturur.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3230").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "veri.yoneticisi@tais.demo";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "abys-demo-2026";
const CEO_EMAIL = process.env.SMOKE_CEO_EMAIL ?? "ceo@tais.demo";
const CHANNEL = process.env.PW_CHANNEL ?? "chrome";

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({ locale: "tr-TR" });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const pageErrors = [];
let externalObservationId = null;
let externalCaseId = null;
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  const login = await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.equal(login?.status(), 200, "login page should load");
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 60_000 }
  );
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 60_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  console.log("✓ data_admin demo oturumu açıldı");

  const cleanedSchedules = await page.evaluate(async () => {
    const response = await fetch("/api/connectors", { cache: "no-store" });
    if (!response.ok) throw new Error(`Connector cleanup list failed: HTTP ${response.status}`);
    const body = await response.json();
    const pending = (body.configs ?? []).filter((config) =>
      config.name.startsWith("ABYS_BROWSER_SMOKE_") && config.scheduleIntervalMinutes !== null
    );
    for (const config of pending) {
      const update = await fetch(`/api/connectors/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleIntervalMinutes: null }),
      });
      if (!update.ok) throw new Error(`Could not disable previous smoke schedule: HTTP ${update.status}`);
    }
    return pending.length;
  });
  if (cleanedSchedules > 0) console.log(`✓ önceki testten kalan ${cleanedSchedules} geçici zamanlama kapatıldı`);

  await context.addCookies([{ name: "abys_lang", value: "tr", url: BASE }]);
  const response = await page.goto(`${BASE}/dashboard/connectors`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.equal(response?.status(), 200, "connector page should load");
  await page.getByRole("heading", { name: /Sistemleriniz|Your systems/i }).waitFor();

  await page.getByRole("button", { name: /Genel REST \/ OData/ }).click();
  const name = `ABYS_BROWSER_SMOKE_${Date.now()}`;
  await page.getByPlaceholder("Bağlantı adı").fill(name);
  await page.getByPlaceholder("https://api.sirket.com").fill("https://jsonplaceholder.typicode.com");
  await page.getByPlaceholder("/v1/customers").fill("/users");
  await page.getByPlaceholder("Kayıt yolu (data)").fill("");
  await page.locator("textarea").first().fill(JSON.stringify({
    name: "name",
    email: "email",
  }, null, 2));
  await page.getByRole("button", { name: "Bağlantıyı kaydet" }).click();
  await page.getByRole("status").filter({ hasText: "Konnektör tanımlandı" }).waitFor();
  console.log("✓ konnektör UI üzerinden oluşturuldu");

  const connectorCard = page.locator("li").filter({ hasText: name }).first();
  await connectorCard.waitFor();

  await connectorCard.getByRole("button", { name: "Bağlantıyı test et" }).click();
  const probe = connectorCard.getByText(/Bağlantı başarılı/);
  await probe.waitFor();
  assert.match(await probe.innerText(), /10 kayıt/, "probe should inspect the 10 public fixture records");
  console.log("✓ bağlantı testi 10 örnek kayıt buldu");

  await connectorCard.getByRole("button", { name: "Senkronize et" }).click();
  const syncStatus = page.getByRole("status").filter({ hasText: "Senkron tamam" });
  await syncStatus.waitFor();
  assert.match(await syncStatus.innerText(), /10 okundu/, "sync should read all fixture records");
  console.log("✓ manuel senkron 10 örnek kaydı içeri aktardı");

  await connectorCard.getByRole("button", { name: "Geçmiş" }).click();
  const history = connectorCard.locator("ul li").filter({ hasText: "Manuel" }).first();
  await history.waitFor();
  const historyText = await history.innerText();
  assert.match(historyText, /Başarılı/, "run history should show a successful run");
  assert.match(historyText, /10 yazıldı \/ 10 okundu/, "run history should show read/write totals");
  console.log("✓ run geçmişi başarılı çalıştırmayı ve sayaçları gösterdi");

  const scheduleInput = connectorCard.locator('input[id^="connector-schedule-"]');
  await scheduleInput.fill("5");
  await connectorCard.getByRole("button", { name: "Aralığı kaydet" }).click();
  await page.getByRole("status").filter({ hasText: "Konnektör zamanlaması 5 dk olarak ayarlandı" }).waitFor();
  assert.match(await connectorCard.innerText(), /5 dk aralık/, "saved schedule should be visible on the connector card");
  console.log("✓ zamanlanmış senkron aralığı 5 dakika olarak kaydedildi");
  await connectorCard.getByRole("button", { name: "Kapat" }).click();
  await page.getByRole("status").filter({ hasText: "Konnektör zamanlaması kapatıldı" }).waitFor();
  assert.match(await connectorCard.innerText(), /Kapalı/, "the test schedule should be disabled again");
  console.log("✓ test zamanlaması kapatıldı; arka planda planlı çalışma bırakılmadı");

  await connectorCard.getByRole("button", { name: "Eşleme onayı" }).click();
  const mappingEditor = page.locator('textarea[id^="connector-mapping-"]');
  await mappingEditor.waitFor();
  await mappingEditor.fill(JSON.stringify({
    name: "name",
    email: "email",
    phone: "phone",
  }, null, 2));
  await connectorCard.getByRole("button", { name: "Yeni sürümü onayla" }).click();
  await page.getByRole("status").filter({ hasText: /Eşleme v2 olarak onaylandı/ }).waitFor();
  console.log("✓ eşleme UI üzerinden v2 olarak onaylandı");

  const updatedCard = page.locator("li").filter({ hasText: name }).first();
  const cardText = await updatedCard.innerText();
  assert.match(cardText, /v2/, "connector card should display configuration v2");
  await updatedCard.getByRole("button", { name: "Eşleme onayı" }).click();
  await page.getByText("Onaylı eşleme v2").waitFor();
  console.log("✓ onaylı v2 sürümü yeniden okunabildi");

  await page.goto(`${BASE}/dashboard/discovery`, { waitUntil: "domcontentloaded" });
  await page.getByText("ALTIN KAYIT GÜVEN SIRASI", { exact: true }).waitFor();
  const sourceApi = await page.evaluate(async () => { const response = await fetch("/api/connectors", { cache: "no-store" }); const body = await response.json(); return { status: response.status, count: body.configs?.length ?? 0 }; });
  assert.equal(sourceApi.status, 200, "connector source API should load for the tenant");
  assert.ok(sourceApi.count >= 1, "the test tenant should contain the connector created above");
  await page.waitForFunction(() => { const section = [...document.querySelectorAll("p")].find((item) => item.textContent?.includes("ALTIN KAYIT GÜVEN SIRASI"))?.parentElement?.parentElement?.parentElement; return !!section && section.querySelectorAll('input[type="number"]').length > 0; }, undefined, { timeout: 30_000 });
  const policySection = page.locator("div.rounded-xl").filter({
    has: page.getByText("ALTIN KAYIT GÜVEN SIRASI", { exact: true }),
  }).first();
  const entityPicker = page.getByRole("combobox", { name: "Altın kayıt varlık türü" });
  await entityPicker.selectOption("customer");
  const priorityInputs = policySection.locator('input[type="number"]');
  const sourceCount = await priorityInputs.count();
  assert.ok(sourceCount >= 1, "the test tenant should have at least one customer source");
  for (let index = 0; index < sourceCount; index += 1) {
    await priorityInputs.nth(index).fill(String(index + 1));
  }
  await policySection.getByRole("button", { name: "Güven sırasını onayla" }).click();
  await page.getByRole("status").filter({ hasText: "customer için kaynak güven sırası kaydedildi" }).waitFor();
  console.log(`✓ altın kayıt güven sırası ${sourceCount} kaynak için onaylandı`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("ALTIN KAYIT GÜVEN SIRASI", { exact: true }).waitFor();
  await page.getByText(/son güncelleme/).first().waitFor();
  console.log("✓ altın kayıt güven sırası yeniden açılışta yüklendi");

  const kpiName = `ABYS_BROWSER_KPI_${Date.now()}`;
  const createdKpi = await page.evaluate(async (name) => {
    const response = await fetch("/api/kpi-definitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, formulaText: "approved_test_value / planned_test_value", unit: "percent", target: 95, warnThreshold: 90, criticalThreshold: 80 }),
    });
    return { status: response.status, body: await response.json() };
  }, kpiName);
  assert.equal(createdKpi.status, 200, "data_admin should create a KPI definition");
  await page.goto(`${BASE}/dashboard/kpi`, { waitUntil: "domcontentloaded" });
  const dataAdminKpiRow = page.locator("div.border-t").filter({ hasText: kpiName }).first();
  await dataAdminKpiRow.waitFor();
  await dataAdminKpiRow.getByRole("button", { name: "Yapısal doğrula" }).click();
  await page.waitForFunction((name) => {
    const row = [...document.querySelectorAll("div.border-t")].find((element) => element.textContent?.includes(name));
    return !!row && row.textContent?.includes("validated") && !!row.querySelector("button");
  }, kpiName);
  console.log("✓ data_admin KPI tanımını yapısal olarak doğruladı");

  const externalContextCreated = await page.evaluate(async () => {
    const casesResponse = await fetch("/api/decision-cases", { cache: "no-store" });
    const casesBody = await casesResponse.json();
    const targetCase = casesBody.cases?.[0];
    if (!targetCase?.id) return { status: casesResponse.status, error: "No decision case available" };
    const now = new Date().toISOString();
    const response = await fetch("/api/external-context", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: { provider: "abys-browser-smoke", category: "weather", name: "Synthetic external context", sourceUri: "https://example.com/abys-smoke", licenseId: "SYNTHETIC-TEST", licenseUrl: "https://example.com/license", attributionText: "Synthetic browser fixture; no external provider data.", accessMode: "manual" },
        observation: { externalId: `browser-${Date.now()}`, topic: "precipitation", geography: "Ankara, Türkiye", summary: "Synthetic rainfall context for end-to-end verification.", publishedAt: now, observedAt: now, relevanceScore: 0.9, confidence: 0.85, sourceUri: "https://example.com/abys-smoke/observation", payload: { synthetic: true } },
      }),
    });
    const body = await response.json();
    return { status: response.status, id: body.id, caseId: targetCase.id };
  });
  assert.equal(externalContextCreated.status, 201, "data_admin should ingest licensed external context");
  externalObservationId = externalContextCreated.id;
  externalCaseId = externalContextCreated.caseId;
  console.log("✓ dış bağlam lisans/atıf ve yayın-gözlem zamanlarıyla alındı; iç KPI tablosuna yazılmadı");

  const triageAndReport = await page.evaluate(async () => {
    const signalResponse = await fetch("/api/signals", { cache: "no-store" });
    const signalBody = await signalResponse.json();
    const signal = signalBody.signals?.[0];
    if (!signal?.id) return { error: "No signal available", signalStatus: signalResponse.status };
    const triage = await fetch(`/api/signals/${signal.id}/triage`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "escalated" }),
    });
    const note = await fetch(`/api/signals/${signal.id}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Browser smoke: escalation owner is tracking this signal." }),
    });
    const notes = await fetch(`/api/signals/${signal.id}/notes`, { cache: "no-store" }).then((response) => response.json());
    const report = await fetch("/api/reports", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Browser smoke report", reportType: "e2e", content: "Synthetic report; safe to delete." }),
    });
    const reportBody = await report.json();
    const reportId = reportBody.id;
    const listed = await fetch("/api/reports", { cache: "no-store" }).then((response) => response.json());
    const deleted = reportId ? await fetch(`/api/reports/${reportId}`, { method: "DELETE" }) : null;
    const afterDelete = await fetch("/api/reports", { cache: "no-store" }).then((response) => response.json());
    return {
      triageStatus: triage.status,
      noteStatus: note.status,
      notePresent: notes.notes?.some((item) => item.note.includes("Browser smoke")) ?? false,
      reportStatus: report.status,
      reportListed: listed.reports?.some((item) => item.id === reportId) ?? false,
      deleteStatus: deleted?.status ?? 0,
      reportAbsentAfterDelete: !(afterDelete.reports ?? []).some((item) => item.id === reportId),
    };
  });
  assert.equal(triageAndReport.triageStatus, 200, "signal triage should persist");
  assert.equal(triageAndReport.noteStatus, 201, "war-room note should persist");
  assert.equal(triageAndReport.notePresent, true, "war-room note should be readable");
  assert.equal(triageAndReport.reportStatus, 201, "analysis report should be saved");
  assert.equal(triageAndReport.reportListed, true, "saved report should be listed");
  assert.equal(triageAndReport.deleteStatus, 200, "saved report should be soft-deleted");
  assert.equal(triageAndReport.reportAbsentAfterDelete, true, "soft-deleted report should disappear from active list");
  console.log("✓ sinyal triyajı, war-room notu ve tenant raporu kaydet/listele/soft-delete uçtan uca geçti");

  const dataAdminApproval = await page.evaluate(async (id) => {
    const response = await fetch(`/api/kpi-definitions/${id}/approve`, { method: "POST" });
    return response.status;
  }, createdKpi.body.id);
  assert.equal(dataAdminApproval, 403, "data_admin must not approve KPI definitions");
  console.log("✓ data_admin doğrulama yaptı; insan onay yetkisi olmadığı için 403 aldı");

  await Promise.all([
    page.waitForURL("**/login", { timeout: 30_000 }),
    page.getByRole("button", { name: "Çıkış yap" }).click(),
  ]);
  await page.fill("#email", CEO_EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  const externalReview = await page.evaluate(async ({ observationId, caseId }) => {
    const review = await fetch(`/api/external-context/${observationId}/review`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "accepted", note: "Synthetic license and scope reviewed." }),
    });
    if (!review.ok) return { reviewStatus: review.status };
    const link = await fetch(`/api/decision-cases/${caseId}/external-context`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ observationId, reason: "Browser smoke: accepted external context evidence." }),
    });
    const briefResponse = await fetch(`/api/decision-cases/${caseId}/intelligence`, { cache: "no-store" });
    const briefBody = await briefResponse.json();
    return { reviewStatus: review.status, linkStatus: link.status, briefStatus: briefResponse.status, evidence: briefBody.brief?.evidence ?? [] };
  }, { observationId: externalObservationId, caseId: externalCaseId });
  assert.equal(externalReview.reviewStatus, 200, "CEO should review external context");
  assert.equal(externalReview.linkStatus, 200, "CEO should link accepted context to the case");
  assert.ok(externalReview.evidence.some((item) => item.source === "external_context" && item.summary.includes("SYNTHETIC-TEST")), "accepted linked external context should enter the decision brief with license provenance");
  console.log("✓ CEO dış gözlemi kabul edip vakaya bağladı; DecisionBrief lisans/atıf/zaman kanıtını içeriyor");

  await page.goto(`${BASE}/dashboard/connectors`, { waitUntil: "domcontentloaded" });
  const connectorCountBefore = await page.evaluate(async () => {
    const response = await fetch("/api/connectors", { cache: "no-store" });
    const body = await response.json();
    return { status: response.status, count: body.configs?.length ?? 0 };
  });
  assert.equal(connectorCountBefore.status, 200, "CEO may inspect connector configurations");
  await page.getByRole("button", { name: /Genel REST \/ OData/ }).click();
  await page.getByPlaceholder("Bağlantı adı").fill(`ABYS_BROWSER_RBAC_DENIED_${Date.now()}`);
  await page.getByPlaceholder("https://api.sirket.com").fill("https://api.example.com");
  await page.getByPlaceholder("/v1/customers").fill("/v1/customers");
  await page.getByRole("button", { name: "Bağlantıyı kaydet" }).click();
  await page.getByRole("alert").filter({ hasText: /yetkiniz yok/i }).waitFor();
  const connectorCountAfter = await page.evaluate(async () => {
    const response = await fetch("/api/connectors", { cache: "no-store" });
    const body = await response.json();
    return body.configs?.length ?? 0;
  });
  assert.equal(connectorCountAfter, connectorCountBefore.count, "CEO must not create a connector without ingest_data");
  console.log("✓ CEO rolünde konnektör yazma isteği reddedildi; kayıt sayısı değişmedi");

  await page.goto(`${BASE}/dashboard/kpi`, { waitUntil: "domcontentloaded" });
  const kpiRow = page.locator("div.border-t").filter({ hasText: kpiName }).first();
  await kpiRow.waitFor();
  await kpiRow.getByRole("button", { name: "İncele ve onayla" }).click();
  await page.waitForFunction((name) => {
    const row = [...document.querySelectorAll("div.border-t")].find((element) => element.textContent?.includes(name));
    return !!row && row.textContent?.includes("approved") && !row.querySelector("button");
  }, kpiName);
  console.log("✓ CEO KPI tanımını arayüzden onayladı; onaylı durum görüntülendi");

  const leftoverSchedules = await page.evaluate(async () => {
    const response = await fetch("/api/connectors", { cache: "no-store" });
    const body = await response.json();
    return (body.configs ?? []).filter((config) =>
      config.name.startsWith("ABYS_BROWSER_SMOKE_") && config.scheduleIntervalMinutes !== null
    ).length;
  });
  assert.equal(leftoverSchedules, 0, "the smoke test must not leave any active test schedule");

  const workspaceRoutes = [
    "/dashboard",
    "/dashboard/decisions",
    "/dashboard/alerts",
    "/dashboard/analysis",
    "/dashboard/reports",
    "/dashboard/settings",
    "/dashboard/scenarios",
    "/dashboard/integrations",
  ];
  for (const route of workspaceRoutes) {
    const routeResponse = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    assert.ok(routeResponse && routeResponse.status() < 400, `${route} should load without an HTTP error`);
    if (route === "/dashboard/integrations") {
      assert.match(page.url(), /\/dashboard\/connectors$/, "legacy integrations should redirect to the tenant connector registry");
    }
  }
  console.log("✓ dashboard, karar, uyarı, analiz, rapor, ayarlar ve senaryo sayfaları açıldı; eski entegrasyon rotası konnektörlere yönlendi");

  assert.deepEqual(pageErrors, [], "browser should not emit uncaught page errors");
  console.log("Sonuç: konnektör, zamanlama, eşleme, altın kayıt, KPI onay, dış bağlam, sinyal triyajı, rapor kalıcılığı, RBAC ve workspace sayfa akışları geçti; etkin test zamanlaması bırakılmadı.");
} catch (error) {
  await page.screenshot({ path: ".data-connector-browser-failure.png", fullPage: true }).catch(() => {});
  console.error("Connector browser smoke başarısız:", error);
  console.error("URL:", page.url());
  console.error("Sayfa metni:", (await page.locator("body").innerText().catch(() => "")).slice(-2200));
  console.error("Sayfa hataları:", pageErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
