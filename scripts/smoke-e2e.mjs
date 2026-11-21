#!/usr/bin/env node
/**
 * ABYS uçtan uca duman testi — çalışan bir sunucuya karşı gerçek HTTP çağrıları.
 *
 * Kullanım:
 *   node scripts/smoke-e2e.mjs
 *   BASE_URL=http://127.0.0.1:3100 node scripts/smoke-e2e.mjs
 *
 * Yalnızca dokümante edilmiş TAIS demo hesabını kullanır; hiçbir veriyi
 * kalıcı olarak değiştirmez (parola değişikliği yalnızca YANLIŞ mevcut parola
 * ile denenir ve reddedilir). Sır basmaz. Başarısızlıkta exit code 1.
 */
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "ceo@tais.demo";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "abys-demo-2026";

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = "") {
  pass++;
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function bad(name, detail = "") {
  fail++;
  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML veya boş gövde
  }
  return { status: res.status, headers: res.headers, text, json };
}

function expectStatus(name, actual, expected) {
  if (actual === expected) ok(name, `HTTP ${actual}`);
  else bad(name, `beklenen ${expected}, gelen ${actual}`);
}

async function main() {
  console.log(`ABYS smoke: ${BASE}`);

  // 1) Genel sayfalar
  for (const [name, path] of [
    ["giriş sayfası", "/login"],
    ["ana sayfa", "/"],
    ["404 sayfası", "/bu-sayfa-yok"],
  ]) {
    const r = await req(path);
    expectStatus(name, r.status, path === "/bu-sayfa-yok" ? 404 : 200);
  }

  // 2) Sağlık
  const health = await req("/api/health");
  expectStatus("sağlık ucu", health.status, 200);
  if (health.json?.db === "up") ok("veritabanı bağlı"); else bad("veritabanı bağlı", String(health.json?.db));

  // 3) Kimlik
  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  expectStatus("demo girişi", login.status, 200);
  const setCookie = login.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/abys_session=([^;]+)/);
  if (!m) {
    bad("oturum çerezi");
    return;
  }
  ok("oturum çerezi");
  const cookie = `abys_session=${m[1]}`;

  const me = await req("/api/auth/me", { cookie });
  expectStatus("oturum bilgisi", me.status, 200);
  if (me.json?.user?.role === "ceo") ok("oturum rolü", "ceo"); else bad("oturum rolü", String(me.json?.user?.role));

  // 4) Yetkili akışlar
  const audit = await req("/api/audit?limit=5", { cookie });
  expectStatus("denetim listesi", audit.status, 200);
  if (Array.isArray(audit.json?.events)) ok("denetim olayları", `${audit.json.events.length} olay`); else bad("denetim olayları");

  const verify = await req("/api/audit?verify=1", { cookie });
  expectStatus("denetim zinciri doğrulama", verify.status, 200);
  if (verify.json?.verify?.valid === true) ok("denetim zinciri", "geçerli"); else bad("denetim zinciri", JSON.stringify(verify.json?.verify));

  const sessions = await req("/api/auth/sessions", { cookie });
  expectStatus("aktif oturum listesi", sessions.status, 200);
  if (Array.isArray(sessions.json?.sessions)) ok("oturum kayıtları", `${sessions.json.sessions.length} oturum`); else bad("oturum kayıtları");

  // 5) Yetki sınırı: ceo kullanıcı yönetemez
  const users = await req("/api/users", { cookie });
  expectStatus("ceo /api/users -> 403", users.status, 403);

  // 6) Parola değiştirme: yanlış mevcut parola reddedilir, veri değişmez
  const wrongPw = await req("/api/auth/password", {
    method: "POST",
    cookie,
    body: { currentPassword: "yanlis-parola", newPassword: "gecici-parola-123" },
  });
  expectStatus("yanlış mevcut parola -> 400", wrongPw.status, 400);

  // 7) Uygulama ekranları (oturumlu)
  for (const [name, path] of [
    ["yönetim merkezi", "/dashboard"],
    ["ayarlar", "/dashboard/settings"],
    ["denetim günlüğü", "/dashboard/audit"],
    ["karar merkezi", "/dashboard/decisions"],
    ["karar defteri", "/dashboard/decision-ledger"],
    ["tahmin", "/dashboard/forecast"],
    ["bağlantılar", "/dashboard/connectors"],
  ]) {
    const r = await req(path, { cookie });
    expectStatus(`${name} ekranı`, r.status, 200);
  }

  // 7b) Kalibrasyon uçları: kurum kapsamlı özet dönmeli
  const commandCenter = await req("/api/command-center", { cookie });
  expectStatus("komuta merkezi verisi", commandCenter.status, 200);
  const commandJson = commandCenter.json;
  if (commandJson && commandJson.calibration && Array.isArray(commandJson.calibration.buckets)) {
    ok("komuta merkezi kalibrasyonu", `${commandJson.calibration.buckets.length} güven kovası`);
  } else {
    bad("komuta merkezi kalibrasyonu", "summary.calibration eksik");
  }

  const cases = await req("/api/decision-cases", { cookie });
  expectStatus("vaka listesi", cases.status, 200);
  const casesJson = cases.json;
  if (casesJson && casesJson.calibration && Array.isArray(casesJson.calibration.buckets)) {
    ok("vaka listesi kalibrasyonu", `${casesJson.calibration.buckets.length} güven kovası`);
  } else {
    bad("vaka listesi kalibrasyonu", "calibration eksik");
  }

  const ledgerCsv = await req("/api/decision-ledger/export", { cookie });
  expectStatus("karar defteri CSV", ledgerCsv.status, 200);
  const csvType = ledgerCsv.headers?.get?.("content-type") ?? "";
  if (csvType.startsWith("text/csv") && String(ledgerCsv.text ?? "").startsWith("decision_id,")) {
    ok("karar defteri CSV başlığı", `${String(ledgerCsv.text).split("\r\n").length - 2} kayıt`);
  } else {
    bad("karar defteri CSV başlığı", `content-type=${csvType || "yok"}`);
  }

  const capture = await req("/api/forecast/snapshots/capture", { method: "POST", cookie });
  expectStatus("zamanlanmış tahmin yakalama", capture.status, 200);
  if (capture.json && typeof capture.json.captured === "number" && Array.isArray(capture.json.results)) {
    ok("yakalama özeti", `${capture.json.captured} yakalandı · ${capture.json.skipped} atlandı`);
  } else {
    bad("yakalama özeti", "captured/results eksik");
  }

  const snapshots = await req("/api/forecast/snapshots", { cookie });
  expectStatus("tahmin anlık görüntüleri", snapshots.status, 200);
  const snapshotsJson = snapshots.json;
  if (snapshotsJson && snapshotsJson.summary && Array.isArray(snapshotsJson.snapshots)) {
    ok("tahmin kalibrasyon özeti", `${snapshotsJson.summary.total} kayıt`);
  } else {
    bad("tahmin kalibrasyon özeti", "summary eksik");
  }

  const retention = await req("/api/forecast/snapshots/retention?maxAgeDays=365&maxPerLabel=60", { cookie });
  expectStatus("tahmin saklama planı", retention.status, 200);
  if (
    retention.json &&
    retention.json.dryRun === true &&
    Array.isArray(retention.json.archiveIds) &&
    typeof retention.json.archiveCount === "number"
  ) {
    ok(
      "saklama planı (salt okunur)",
      `${retention.json.archiveCount} arşiv adayı · politika ${retention.json.policy?.maxAgeDays}g/${retention.json.policy?.maxPerLabel}`
    );
  } else {
    bad("saklama planı (salt okunur)", "dryRun/archiveIds eksik");
  }

  const snapshotCsv = await req("/api/forecast/snapshots/export", { cookie });
  expectStatus("tahmin anlık görüntüsü CSV", snapshotCsv.status, 200);
  const snapshotCsvType = snapshotCsv.headers?.get?.("content-type") ?? "";
  if (snapshotCsvType.startsWith("text/csv") && String(snapshotCsv.text ?? "").startsWith("snapshot_id,")) {
    ok("tahmin CSV başlığı", String(snapshotCsv.text).split("\r\n").length - 2);
  } else {
    bad("tahmin CSV başlığı", `content-type=${snapshotCsvType || "yok"}`);
  }

  // 8) Oturum kapatma
  const logout = await req("/api/auth/logout", { method: "POST", cookie });
  if (logout.status === 200 || logout.status === 204) ok("oturum kapatma", `HTTP ${logout.status}`);
  else bad("oturum kapatma", `HTTP ${logout.status}`);
}

main()
  .catch((err) => {
    bad("smoke çalıştırma", err instanceof Error ? err.message : String(err));
  })
  .finally(() => {
    console.log(`\nSonuç: ${pass} geçti, ${fail} başarısız`);
    if (failures.length) {
      console.log("Başarısızlar:");
      for (const f of failures) console.log(` - ${f}`);
    }
    process.exit(fail === 0 ? 0 : 1);
  });
