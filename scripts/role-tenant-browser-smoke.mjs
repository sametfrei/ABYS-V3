#!/usr/bin/env node
/**
 * Gereksinim: yalnızca atılabilir yerel test DB'si ve loopback preview.
 * Sentetik kullanıcı/rapor/connector/audit kayıtları DB'de özellikle bırakılır; script DB'yi silmez veya sıfırlamaz.
 * Her koşu için yeni bir /private/tmp/abys-* veritabanı oluştur; paylaşılan/gerçek DB'lerde çalıştırma.
 * Örnek: BASE_URL=http://127.0.0.1:3235 SMOKE_DB_DIR=/private/tmp/abys-role-test \
 *   SMOKE_DB_TOKEN='<secret>' SMOKE_SYSADMIN_A_EMAIL=admin-a@abys.test \
 *   SMOKE_SYSADMIN_B_EMAIL=admin-b@abys.test SMOKE_PASSWORD='<secret>' node scripts/role-tenant-browser-smoke.mjs
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const required = ["BASE_URL", "SMOKE_DB_DIR", "SMOKE_DB_TOKEN", "SMOKE_SYSADMIN_A_EMAIL", "SMOKE_SYSADMIN_B_EMAIL", "SMOKE_PASSWORD"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required; no default target or credentials are allowed`);
}

const parsedBase = new URL(process.env.BASE_URL);
const loopbackHosts = new Set(["127.0.0.1", "localhost"]);
if (!['http:', 'https:'].includes(parsedBase.protocol) || !loopbackHosts.has(parsedBase.hostname)) {
  throw new Error("BASE_URL must use http(s) and an explicit 127.0.0.1 or localhost host");
}
if (parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash || !["", "/"].includes(parsedBase.pathname)) {
  throw new Error("BASE_URL must not contain credentials, a path, query parameters, or a fragment");
}
if (!parsedBase.port || ["3100", "3101", "3200"].includes(parsedBase.port)) {
  throw new Error("BASE_URL must use an explicit temporary preview port, never 3100, 3101, or 3200");
}
const BASE = parsedBase.origin;
const expectedDbDir = realpathSync(process.env.SMOKE_DB_DIR);
const tempRoot = realpathSync("/private/tmp");
assert.equal(path.dirname(expectedDbDir), tempRoot, "SMOKE_DB_DIR must be a direct child of /private/tmp");
assert.ok(path.basename(expectedDbDir).startsWith("abys-"), "SMOKE_DB_DIR must have an abys- disposable test directory name");
const CHANNEL = process.env.PW_CHANNEL || "chrome";
const PASSWORD = process.env.SMOKE_PASSWORD;
const ORGS = [
  { name: "Org A", email: process.env.SMOKE_SYSADMIN_A_EMAIL },
  { name: "Org B", email: process.env.SMOKE_SYSADMIN_B_EMAIL },
];
const ROLES = ["board", "ceo", "clevel", "dept_manager", "risk_manager", "analyst", "auditor", "data_admin", "sys_admin"];

// Bağımsız beklenen erişim tablosu; permissions.ts/testinden elle çapraz kontrol edilmiştir.
const EXPECTED = {
  board:        { manageReports: false, runAnalysis: false, viewAudit: true, manageUsers: false, ingestData: false },
  ceo:          { manageReports: true,  runAnalysis: true,  viewAudit: true, manageUsers: false, ingestData: false },
  clevel:       { manageReports: true,  runAnalysis: true,  viewAudit: true, manageUsers: false, ingestData: false },
  dept_manager: { manageReports: true,  runAnalysis: true,  viewAudit: false,manageUsers: false, ingestData: false },
  risk_manager: { manageReports: true,  runAnalysis: true,  viewAudit: true, manageUsers: false, ingestData: false },
  analyst:      { manageReports: true,  runAnalysis: true,  viewAudit: false,manageUsers: false, ingestData: false },
  auditor:      { manageReports: false, runAnalysis: false, viewAudit: true, manageUsers: false, ingestData: false },
  data_admin:   { manageReports: true,  runAnalysis: false, viewAudit: false,manageUsers: false, ingestData: true  },
  sys_admin:    { manageReports: true,  runAnalysis: false, viewAudit: true, manageUsers: true,  ingestData: false },
};
const totals = { passed: 0, failed: 0 };
const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const orgMarker = (org) => `TB136_${org.name.replaceAll(" ", "_")}_${runId}`;
const roleEmail = (org, role) => `${orgMarker(org).toLowerCase()}.${role}@abys.test`;
const syntheticPassword = `Abys!${randomBytes(18).toString("base64url")}9z`;

function log(org, role, endpoint, expected, actual) {
  console.log(`${org} ${role} ${endpoint} expected=${expected} actual=${actual}`);
}

async function checkStatus(org, role, endpoint, response, expected) {
  const actual = response.status();
  log(org, role, endpoint, expected, actual);
  assert.equal(actual, expected, `${org}/${role} ${endpoint}: expected ${expected}, got ${actual}`);
  totals.passed += 1;
}

async function json(response) {
  return response.json().catch(() => ({}));
}

function assertNoPasswordHash(value, label) {
  const serialized = JSON.stringify(value).toLowerCase();
  assert.ok(!serialized.includes("password_hash") && !serialized.includes("passwordhash"), `${label} exposed password hash`);
}

const browser = await chromium.launch({ channel: CHANNEL, headless: true });
const context = await browser.newContext({ locale: "tr-TR" });
let page = null;
const pageErrors = [];
const httpErrors = [];
const externalAttempts = [];
let phase = "bootstrap";
await context.route("**/*", async (route) => {
  const target = new URL(route.request().url());
  if (target.origin !== BASE) {
    externalAttempts.push(target.origin);
    await route.abort();
    return;
  }
  await route.continue();
});

async function request(path, options = {}) {
  const response = await context.request.fetch(`${BASE}${path}`, { ...options, timeout: 30_000, maxRedirects: 0 });
  assert.equal(new URL(response.url()).origin, BASE, "API request escaped loopback origin");
  return response;
}

async function openPage() {
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === BASE && response.status() >= 400) {
      httpErrors.push(`${response.status()} ${url.pathname} phase=${phase} page=${page.url()}`);
    }
  });
}

async function login(org, role, email) {
  // Dispose the previous page before invalidating its session so pending UI fetches cannot race the next login.
  if (page) await page.close();
  await request("/api/auth/logout", { method: "POST" });
  await openPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(role === "sys_admin" && email === org.email ? PASSWORD : syntheticPassword);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState("networkidle");
  phase = `authenticated:${org.name}:${role}`;
  const authMeStatus = await page.evaluate(async () => (await fetch("/api/auth/me", { cache: "no-store" })).status);
  assert.equal(authMeStatus, 200, `${org.name}/${role} browser session cookie was not accepted by /api/auth/me`);
}

async function verifyIsolation(org, role) {
  const own = orgMarker(org);
  const foreign = orgMarker(ORGS.find((candidate) => candidate !== org));
  const connectors = await request("/api/connectors");
  await checkStatus(org.name, role, "GET /api/connectors", connectors, 200);
  const connectorBody = await json(connectors);
  assertNoPasswordHash(connectorBody, `${org.name} connectors`);
  assert.ok((connectorBody.configs ?? []).some((item) => item.name === own), `${org.name} connector marker missing`);
  assert.ok(!(connectorBody.configs ?? []).some((item) => item.name === foreign), `${org.name} saw foreign connector marker`);

  const reports = await request("/api/reports");
  await checkStatus(org.name, role, "GET /api/reports", reports, 200);
  const reportBody = await json(reports);
  assertNoPasswordHash(reportBody, `${org.name} reports`);
  assert.ok((reportBody.reports ?? []).some((item) => item.title === own), `${org.name} report marker missing`);
  assert.ok(!(reportBody.reports ?? []).some((item) => item.title === foreign), `${org.name} saw foreign report marker`);
}

try {
  // Mutasyonlardan önce sunucu tarafı DB kimliğini doğrula; yalnızca private/tmp altında gerçek yolu doğrulanmış PGlite kabul edilir.
  const healthResponse = await context.request.get(`${BASE}/api/health`, {
    headers: { "x-abys-smoke-db-token": process.env.SMOKE_DB_TOKEN },
    timeout: 30_000,
    maxRedirects: 0,
  });
  assert.equal(healthResponse.status(), 200, "loopback preview did not prove a disposable PGlite database");
  const healthBody = await json(healthResponse);
  assert.deepEqual(healthBody.smokeDatabase, {
    disposable: true,
    backend: "pglite",
    dir: expectedDbDir,
    missingMigrationIds: [],
    pendingMigrationIds: [18],
    enabledApprovalMigrationIds: [],
    migration18ApprovalEnabled: false,
  }, "preview database identity/schema does not match the prepared disposable DB");
  assert.deepEqual((healthBody.pendingMigrations ?? []).map((item) => item.id), [18], "Migration 18 must remain pending and unapproved");
  totals.passed += 1;
  console.log("Disposable DB identity + migration gate preflight passed");

  // Login ekranının dil değişimini kimlik doğrulamadan önce sınar.
  await openPage();
  phase = "login-locale";
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const loginText = await page.locator("body").innerText();
  assert.ok(!loginText.includes("ceo@tais.demo") && !loginText.includes("Demo erişimi") && !loginText.includes("Demo access"), "general ABYS login must not advertise TAIS demo identity");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).waitFor();
  await page.getByRole("button", { name: "TR", exact: true }).click();
  await page.getByLabel("E-posta", { exact: true }).waitFor();
  totals.passed += 1;
  console.log("Login locale: TR -> EN -> TR passed");

  for (const org of ORGS) {
    await login(org, "sys_admin", org.email);
    const marker = orgMarker(org);
    const savedReport = await request("/api/reports", {
      method: "POST", data: { title: marker, reportType: "analysis", content: marker },
    });
    await checkStatus(org.name, "sys_admin", "POST /api/reports seed marker", savedReport, 201);

    for (const role of ROLES.filter((item) => item !== "sys_admin")) {
      const email = roleEmail(org, role);
      const response = await request("/api/users", {
        method: "POST", data: { email, displayName: `${marker}_${role}`, role, password: syntheticPassword },
      });
      await checkStatus(org.name, "sys_admin", `POST /api/users create ${role}`, response, 201);
      const body = await json(response);
      assertNoPasswordHash(body, `${org.name} created user`);
    }
    const dataAdminEmail = roleEmail(org, "data_admin");
    await login(org, "data_admin", dataAdminEmail);
    const connectorBody = {
      connectorId: "rest-generic",
      name: marker,
      config: {
        kind: "rest", baseUrl: "https://example.invalid", path: "/users", method: "GET",
        authType: "none", entity: "customer", idField: "id", updatedAtField: "updated_at",
        recordsPath: "data", fieldMap: { name: "name", email: "email" }, pagination: { type: "none" },
      },
    };
    const createConnector = await request("/api/connectors", { method: "POST", data: connectorBody });
    // POST /api/connectors returns HTTP 200 on success (route + integration test contract).
    await checkStatus(org.name, "data_admin", "POST /api/connectors seed marker", createConnector, 200);
    const createdConnector = await json(createConnector);
    assert.ok(createdConnector.id, `${org.name} connector creation did not return id`);

    await login(org, "sys_admin", org.email);
    const list = await request("/api/users");
    await checkStatus(org.name, "sys_admin", "GET /api/users", list, 200);
    const userList = await json(list);
    assertNoPasswordHash(userList, `${org.name} user list`);
    for (const seededRole of ROLES.filter((item) => item !== "sys_admin")) {
      assert.ok((userList.users ?? []).some((user) => user.email === roleEmail(org, seededRole)), `${org.name} ${seededRole} user missing`);
      assert.ok(!(userList.users ?? []).some((user) => user.email === roleEmail(ORGS.find((candidate) => candidate !== org), seededRole)), `${org.name} saw foreign ${seededRole} user`);
    }
    assert.ok(!(userList.users ?? []).some((user) => user.email === ORGS.find((candidate) => candidate !== org).email), `${org.name} saw foreign sys_admin`);
  }

  for (const org of ORGS) {
    for (const role of ROLES) {
      const email = role === "sys_admin"
        ? org.email
        : roleEmail(org, role);
      await login(org, role, email);
      await verifyIsolation(org, role);

      const access = EXPECTED[role];
      const connector = await request("/api/connectors", {
        method: "POST", data: {
          connectorId: "rest-generic", name: `${orgMarker(org)}_${role}_probe`,
          config: { kind: "rest", baseUrl: "https://example.invalid", path: "/users", authType: "none", entity: "customer", idField: "id", fieldMap: { name: "name" }, pagination: { type: "none" } },
        },
      });
      await checkStatus(org.name, role, "POST /api/connectors", connector, access.ingestData ? 200 : 403);

      const report = await request("/api/reports", {
        method: "POST", data: { title: `${orgMarker(org)}_${role}_report`, reportType: "analysis", content: "synthetic smoke marker" },
      });
      await checkStatus(org.name, role, "POST /api/reports", report, access.manageReports ? 201 : 403);

      if (access.runAnalysis) {
        const preview = await request("/api/anomalies");
        await checkStatus(org.name, role, "GET /api/anomalies preflight", preview, 200);
        const previewBody = await json(preview);
        assert.equal(previewBody.scannedLabels, 0, `${org.name}/${role} found KPI labels in disposable test DB`);
        assert.equal(previewBody.scannedSeries, 0, `${org.name}/${role} found KPI series in disposable test DB`);
        assert.equal(previewBody.results?.length ?? 0, 0, `${org.name}/${role} found anomaly preview records in disposable test DB`);
      }
      const analysis = await request("/api/anomalies", { method: "POST" });
      await checkStatus(org.name, role, "POST /api/anomalies", analysis, access.runAnalysis ? 200 : 403);
      if (access.runAnalysis) {
        const analysisBody = await json(analysis);
        assert.equal(analysisBody.scannedSeries, 0, `${org.name}/${role} expected empty seeded KPI series`);
        assert.equal(analysisBody.generated, 0, `${org.name}/${role} analysis unexpectedly generated signals`);
        assert.equal(analysisBody.signals?.length ?? 0, 0, `${org.name}/${role} analysis returned unexpected signals`);
        assert.equal(analysisBody.decisionCases?.generated ?? 0, 0, `${org.name}/${role} analysis unexpectedly generated decision cases`);
      }

      const audit = await request("/api/audit?limit=100");
      await checkStatus(org.name, role, "GET /api/audit", audit, access.viewAudit ? 200 : 403);
      if (access.viewAudit) {
        const body = await json(audit);
        assertNoPasswordHash(body, `${org.name} audit`);
        const summaries = (body.events ?? []).map((event) => `${event.actor} ${event.summary} ${event.detail ?? ""}`).join("\n");
        assert.ok(summaries.includes(orgMarker(org)), `${org.name} audit marker missing`);
        assert.ok(!summaries.includes(orgMarker(ORGS.find((candidate) => candidate !== org))), `${org.name} saw foreign audit marker`);
      }

      const usersGet = await request("/api/users");
      await checkStatus(org.name, role, "GET /api/users", usersGet, access.manageUsers ? 200 : 403);
      if (access.manageUsers) {
        const usersBody = await json(usersGet);
        assertNoPasswordHash(usersBody, `${org.name} users`);
        const foreignOrg = ORGS.find((candidate) => candidate !== org);
        assert.ok(!(usersBody.users ?? []).some((user) => user.email === foreignOrg.email), `${org.name} saw foreign sys_admin`);
        for (const foreignRole of ROLES.filter((candidate) => candidate !== "sys_admin")) {
          assert.ok(!(usersBody.users ?? []).some((user) => user.email === roleEmail(foreignOrg, foreignRole)), `${org.name} saw foreign ${foreignRole}`);
        }
      }
      const usersPost = await request("/api/users", {
        method: "POST", data: { email: `forbidden.${role}.${runId}.${org.name === "Org A" ? "a" : "b"}@abys.test`, displayName: "Synthetic forbidden probe", role: "analyst", password: syntheticPassword },
      });
      await checkStatus(org.name, role, "POST /api/users", usersPost, access.manageUsers ? 201 : 403);
      if (access.manageUsers) assertNoPasswordHash(await json(usersPost), `${org.name} created user`);

    }
  }

  for (const org of ORGS) {
    const admin = org.email;
    await login(org, "sys_admin", admin);
    for (const route of ["/dashboard", "/dashboard/connectors", "/dashboard/reports", "/dashboard/audit", "/dashboard/analysis"]) {
      phase = `dashboard:${org.name}:${route}`;
      const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      const status = response?.status() ?? 0;
      log(org.name, "sys_admin", `PAGE ${route}`, "2xx", status);
      assert.ok(status >= 200 && status < 400, `${org.name} ${route} returned HTTP ${status}`);
      totals.passed += 1;
    }
  }
  assert.deepEqual(httpErrors, [], `browser observed HTTP errors: ${httpErrors.join(", ")}`);
  assert.deepEqual(pageErrors, [], `uncaught browser errors: ${pageErrors.join(" | ")}`);
  assert.deepEqual(externalAttempts, [], `browser attempted external requests: ${externalAttempts.join(", ")}`);
  console.log(`TOTAL passed=${totals.passed} failed=${totals.failed}`);
} catch (error) {
  totals.failed += 1;
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log(`TOTAL passed=${totals.passed} failed=${totals.failed}`);
  process.exitCode = 1;
} finally {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {
    // Hata durumunda geçerli olmayan oturum için logout başarısız olabilir.
  }
  await context.close();
  await browser.close();
}
