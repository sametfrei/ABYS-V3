import { randomBytes } from "crypto";
import { getDb, migrate } from "@/lib/db/client";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { hashPassword } from "@/lib/auth/core";
import { createRng, rngInt, rngPick, rngShuffle, daysFromReference, type Rng } from "./rng";
import {
  TAIS_CATEGORIES,
  TAIS_TEAMS,
  BAKU_DISTRICTS,
  TAIS_CUSTOMER_NAMES,
  TAIS_EMPLOYEE_NAMES,
  EMPLOYEE_ROLES,
  TAIS_LEAD_SOURCES,
  TAIS_ACTIVITY_TYPES,
  type TaisCategoryId,
} from "./data";
import {
  TAIS_ORG_CODE,
  TAIS_ORG_NAME,
  TAIS_SECTOR_ID,
  TAIS_SEED,
  TAIS_REFERENCE_NOW,
  TAIS_DEMO_EMAIL,
  TAIS_DEMO_PASSWORD,
  TAIS_DECISION_MARKER_PREFIX,
} from "./constants";
import { seedTaisDecisions } from "./decisions";

/** Geriye donuk uyumluluk: bu sabitler daha once burada tanimliydi, diger dosyalar hala "./seed" uzerinden import ediyor. */
export {
  TAIS_ORG_CODE,
  TAIS_ORG_NAME,
  TAIS_SECTOR_ID,
  TAIS_SEED,
  TAIS_REFERENCE_NOW,
  TAIS_DEMO_EMAIL,
  TAIS_DEMO_PASSWORD,
};

/**
 * TAIS IKF MMC demosu icin deterministik sentetik veri uretici.
 *
 * Neden var: TAIS_DEMO_SCOPE.md'de tanimlanan 30 saniyelik yonetici ekrani
 * ve KPI/risk/karar zinciri, gercek Bitrix24 erisimi olmadan tutarli bir
 * hikaye anlatabilmek icin sabit, tekrar uretilebilir veriye ihtiyac duyar.
 *
 * Determinizm sozlesmesi: Math.random KULLANILMAZ; tum "rastgele" secimler
 * createRng(TAIS_SEED) ile tohumlanmis mulberry32 uretecinden gelir ve tum
 * tarihler TAIS_REFERENCE_NOW referans anina gore hesaplanir. Bu sayede ayni
 * kosum her zaman ayni miktarlarda/oranlarda/senaryo-tetikleyici kayitlarda
 * karar kilar (satir kimlikleri crypto.randomBytes ile uretilir — bu, mevcut
 * repository desenidir ve kimliklerin kendisi degil ISERIK deterministiktir).
 */

function newId(): string {
  return randomBytes(8).toString("hex");
}

interface TeamRuntime {
  key: string;
  id: string;
  name: string;
  category: TaisCategoryId;
  capacity: number;
}

interface CustomerRuntime {
  id: string;
  index: number;
  name: string;
  district: string;
}

interface LocationRuntime {
  id: string;
  customerId: string;
  category: TaisCategoryId;
  name: string;
  district: string;
}

const ACTIVITY_SUBJECTS: Record<(typeof TAIS_ACTIVITY_TYPES)[number], string[]> = {
  call: ["Sozlesme yenileme gorusmesi", "Hizmet memnuniyeti aramasi", "Acik talep takip aramasi"],
  email: ["Aylik operasyon raporu gonderimi", "Sozlesme yenileme hatirlatmasi", "Teklif gonderimi"],
  meeting: ["Saha ziyareti ve degerlendirme", "Ceyreklik is gorusmesi", "Yenileme muzakere toplantisi"],
  follow_up: ["Acik talep sonrasi takip", "Sikayet sonrasi takip", "Teklif sonrasi takip"],
};

async function bulkInsert(
  db: ReturnType<typeof getDb>,
  table: string,
  columns: string[],
  rows: unknown[][]
): Promise<void> {
  if (rows.length === 0) return;
  const CHUNK = 200;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((_, j) => `$${values.length + j + 1}`).join(", ");
      values.push(...row);
      return `(${placeholders})`;
    });
    await db.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`,
      values
    );
  }
}

/** Mevcut kurumu koduyla bulur (idempotency kontrolu icin). */
async function findTaisOrg(): Promise<string | null> {
  const r = await getDb().query<{ id: string }>("SELECT id FROM organizations WHERE code = $1", [
    TAIS_ORG_CODE,
  ]);
  return r.rows[0]?.id ?? null;
}

async function taisCustomerCount(orgId: string): Promise<number> {
  const r = await getDb().query<{ n: number }>(
    "SELECT count(*)::int AS n FROM tais_customers WHERE org_id = $1",
    [orgId]
  );
  return r.rows[0]?.n ?? 0;
}

/**
 * TAIS demo kurumuna giris yapabilecek tek hesabi olusturur (idempotent —
 * e-posta zaten varsa deterministik demo kimlik bilgileriyle günceller).
 * "Onayla/Ertele" gibi karar durumu
 * degisikliklerinin `record_decision` izni gerektirmesi nedeniyle rol "ceo"
 * secildi (bkz. src/lib/auth/permissions.ts).
 */
async function ensureTaisDemoUser(
  orgId: string,
  email: string = TAIS_DEMO_EMAIL,
  password: string = TAIS_DEMO_PASSWORD
): Promise<void> {
  const db = getDb();
  const existing = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  const passwordHash = hashPassword(password);
  if (existing.rows[0]) {
    await db.query(
      `UPDATE users
       SET org_id = $1, display_name = $2, role = $3, password_hash = $4, status = 'active'
       WHERE id = $5`,
      [orgId, "TAIS Genel Müdür", "ceo", passwordHash, existing.rows[0].id]
    );
    return;
  }
  await db.query(
    "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
    [newId(), orgId, email, "TAIS Genel Müdür", "ceo", passwordHash]
  );
}

/**
 * Ana senaryoyu doguran sentetik veriyi org_id altina yazar. Yalnizca
 * seedTaisDemo/resetTaisDemo tarafindan cagrilir; bos bir org_id uzerinde
 * calisir (onceki veri wipeTaisDemoData ile temizlenmis olmali).
 */
async function insertTaisDemoData(orgId: string): Promise<void> {
  const db = getDb();
  const rng: Rng = createRng(TAIS_SEED);

  // --- Ekipler ---
  const teams: TeamRuntime[] = TAIS_TEAMS.map((t) => ({ ...t, id: newId() }));
  await bulkInsert(
    db,
    "tais_teams",
    ["id", "org_id", "name", "category", "capacity"],
    teams.map((t) => [t.id, orgId, t.name, t.category, t.capacity])
  );

  // --- Calisanlar (5/ekip, sira ile) ---
  const employeesByTeam = new Map<string, string[]>();
  const employeeRows: unknown[][] = [];
  let nameIdx = 0;
  for (const team of teams) {
    const ids: string[] = [];
    for (let k = 0; k < 5; k++) {
      const empId = newId();
      ids.push(empId);
      const name = TAIS_EMPLOYEE_NAMES[nameIdx % TAIS_EMPLOYEE_NAMES.length];
      nameIdx++;
      const role = rngPick(rng, EMPLOYEE_ROLES);
      employeeRows.push([empId, orgId, team.id, name, role]);
    }
    employeesByTeam.set(team.key, ids);
  }
  await bulkInsert(db, "tais_employees", ["id", "org_id", "team_id", "name", "role"], employeeRows);

  // --- Musteriler (25) ---
  const customers: CustomerRuntime[] = TAIS_CUSTOMER_NAMES.map((name, index) => ({
    id: newId(),
    index,
    name,
    district: rngPick(rng, BAKU_DISTRICTS),
  }));
  await bulkInsert(
    db,
    "tais_customers",
    ["id", "org_id", "name", "district", "bitrix_company_id"],
    customers.map((c) => [c.id, orgId, c.name, c.district, `BX-COMP-${1000 + c.index}`])
  );

  // Her musterinin hizmet aldigi kategoriler (ilk 20 musteri 2, son 5 musteri 1 kategori
  // -> tam 45 sozlesme; ilk 6 musteri, 6 kategorinin tamaminin en az bir kez
  // gorulmesini garanti eder ki lokasyon/gorev uretimi kategori basina bos kalmasin).
  const categoryPool = TAIS_CATEGORIES.map((c) => c.id);
  const customerCategories: TaisCategoryId[][] = customers.map((c) => {
    const count = c.index < 20 ? 2 : 1;
    const picks = rngShuffle(rng, categoryPool).slice(0, count);
    if (c.index < categoryPool.length && !picks.includes(categoryPool[c.index])) {
      picks[0] = categoryPool[c.index];
    }
    return picks;
  });

  // --- Lokasyonlar (70: ilk 20 musteri 3, son 5 musteri 2) ---
  const locations: LocationRuntime[] = [];
  for (const customer of customers) {
    const count = customer.index < 20 ? 3 : 2;
    for (let n = 1; n <= count; n++) {
      const category = rngPick(rng, customerCategories[customer.index]);
      locations.push({
        id: newId(),
        customerId: customer.id,
        category,
        name: `${customer.name} - Lokasyon ${n}`,
        district: customer.district,
      });
    }
  }
  await bulkInsert(
    db,
    "tais_locations",
    ["id", "org_id", "customer_id", "name", "district", "category"],
    locations.map((l) => [l.id, orgId, l.customerId, l.name, l.district, l.category])
  );
  const locationsByCategory = new Map<TaisCategoryId, LocationRuntime[]>();
  for (const loc of locations) {
    const arr = locationsByCategory.get(loc.category) ?? [];
    arr.push(loc);
    locationsByCategory.set(loc.category, arr);
  }

  // --- Sozlesmeler (45 = customerCategories toplami) ---
  // Senaryo: 4 musterinin yenileme tarihi yaklasiyor (10/14/18/21 gun sonra).
  const renewalSoonCustomerIndexes = [2, 7, 13, 19];
  const renewalSoonDays: Record<number, number> = { 2: 10, 7: 14, 13: 18, 19: 21 };
  const contractRows: unknown[][] = [];
  for (const customer of customers) {
    const cats = customerCategories[customer.index];
    cats.forEach((category, catIdx) => {
      const contractId = newId();
      const startDaysAgo = rngInt(rng, 60, 400);
      let renewalDays = rngInt(rng, 30, 300);
      if (catIdx === 0 && renewalSoonCustomerIndexes.includes(customer.index)) {
        renewalDays = renewalSoonDays[customer.index];
      }
      contractRows.push([
        contractId,
        orgId,
        customer.id,
        category,
        "active",
        rngInt(rng, 8000, 120000),
        daysFromReference(TAIS_REFERENCE_NOW, -startDaysAgo),
        daysFromReference(TAIS_REFERENCE_NOW, renewalDays),
      ]);
    });
  }
  await bulkInsert(
    db,
    "tais_contracts",
    ["id", "org_id", "customer_id", "category", "status", "value_azn", "start_date", "renewal_date"],
    contractRows
  );

  // --- Gorevler (250) ---
  const categoryLabel = new Map(TAIS_CATEGORIES.map((c) => [c.id, c.label]));
  const taskRows: unknown[][] = [];

  function pushTask(params: {
    team: TeamRuntime;
    location: LocationRuntime;
    employeeId: string | null;
    status: string;
    dueOffsetDays: number;
    completedOffsetDays?: number | null;
  }) {
    taskRows.push([
      newId(),
      orgId,
      params.team.category,
      params.team.id,
      params.location.id,
      params.location.customerId,
      params.employeeId,
      `${params.location.name} - ${categoryLabel.get(params.team.category)} hizmeti`,
      params.status,
      daysFromReference(TAIS_REFERENCE_NOW, params.dueOffsetDays),
      params.completedOffsetDays == null ? null : daysFromReference(TAIS_REFERENCE_NOW, params.completedOffsetDays),
    ]);
  }

  const teamByKey = new Map(teams.map((t) => [t.key, t]));
  const cleaningB = teamByKey.get("cleaning-b")!;
  const pestControl = teamByKey.get("pest-control")!;

  // Senaryo 1: Cleaning Team B'de kapasite yoğunluğu -> 3 görev SLA riski (12/24/36 saat icinde)
  const cleaningBLocations = locationsByCategory.get("cleaning") ?? [];
  [0.3, 0.75, 1.2].forEach((dueDays, i) => {
    pushTask({
      team: cleaningB,
      location: cleaningBLocations[i % cleaningBLocations.length],
      employeeId: employeesByTeam.get("cleaning-b")![i % 5],
      status: "open",
      dueOffsetDays: dueDays,
    });
  });

  // Senaryo 2: 2 pest-control gorevi gecikmis (2 ve 4 gun once son tarih gecti, hala acik)
  const pestLocations = locationsByCategory.get("pest_control") ?? [];
  [2, 4].forEach((daysLate, i) => {
    pushTask({
      team: pestControl,
      location: pestLocations[i % pestLocations.length],
      employeeId: employeesByTeam.get("pest-control")![i % 5],
      status: "open",
      dueOffsetDays: -daysLate,
    });
  });

  // Senaryo 3: bazi gorevler sahipsiz + gecikmis (5 gorev, farkli kategoriler)
  const unownedTeamKeys = ["cleaning-a", "office-mgmt-a", "property-mgmt", "office-mgmt-b", "catering"];
  unownedTeamKeys.forEach((key, i) => {
    const team = teamByKey.get(key)!;
    const catLocations = locationsByCategory.get(team.category) ?? [];
    pushTask({
      team,
      location: catLocations[i % catLocations.length],
      employeeId: null,
      status: "open",
      dueOffsetDays: -rngInt(rng, 1, 6),
    });
  });

  // Genel gorev havuzu: ekip kapasitesiyle oranti icin agirlikli havuz
  const weightedTeamPool: TeamRuntime[] = [];
  for (const team of teams) {
    for (let i = 0; i < team.capacity; i++) weightedTeamPool.push(team);
  }
  const GENERAL_TASK_COUNT = 240;
  for (let i = 0; i < GENERAL_TASK_COUNT; i++) {
    const team = weightedTeamPool[i % weightedTeamPool.length];
    const catLocations = locationsByCategory.get(team.category) ?? [];
    const location = rngPick(rng, catLocations);
    const employeeId = rngPick(rng, employeesByTeam.get(team.key)!);
    const roll = rng();
    if (roll < 0.55) {
      const dueOffsetDays = -rngInt(rng, 1, 45);
      pushTask({
        team,
        location,
        employeeId,
        status: "done",
        dueOffsetDays,
        completedOffsetDays: dueOffsetDays + rngInt(rng, -2, 0),
      });
    } else if (roll < 0.8) {
      pushTask({
        team,
        location,
        employeeId,
        status: "in_progress",
        dueOffsetDays: rngInt(rng, -3, 5),
      });
    } else {
      pushTask({
        team,
        location,
        employeeId,
        status: "open",
        dueOffsetDays: rngInt(rng, -5, 20),
      });
    }
  }

  await bulkInsert(
    db,
    "tais_tasks",
    [
      "id",
      "org_id",
      "category",
      "team_id",
      "location_id",
      "customer_id",
      "employee_id",
      "title",
      "status",
      "due_at",
      "completed_at",
    ],
    taskRows
  );

  // --- Satis fırsatları (40) ---
  const dealRows: unknown[][] = [];
  const dealsByCustomer = new Map<string, string[]>();
  const DEAL_STAGES = ["prospecting", "negotiation", "won", "lost"];
  for (let i = 0; i < 40; i++) {
    const customer = rngPick(rng, customers);
    const category = rngPick(rng, customerCategories[customer.index]);
    const dealId = newId();
    const updatedDaysAgo = rngInt(rng, 0, 120);
    dealRows.push([
      dealId,
      orgId,
      customer.id,
      category,
      rngPick(rng, DEAL_STAGES),
      rngInt(rng, 5000, 100000),
      daysFromReference(TAIS_REFERENCE_NOW, -updatedDaysAgo),
    ]);
    const arr = dealsByCustomer.get(customer.id) ?? [];
    arr.push(dealId);
    dealsByCustomer.set(customer.id, arr);
  }
  await bulkInsert(
    db,
    "tais_deals",
    ["id", "org_id", "customer_id", "category", "stage", "value_azn", "updated_at"],
    dealRows
  );

  // --- Potansiyel musteriler / lead (40) ---
  const leadRows: unknown[][] = [];
  const LEAD_STAGES = ["new", "contacted", "qualified", "lost"];
  for (let i = 0; i < 40; i++) {
    const linkToExisting = rng() < 0.4;
    const customer = linkToExisting ? rngPick(rng, customers) : null;
    const category = rngPick(rng, categoryPool);
    leadRows.push([
      newId(),
      orgId,
      customer?.id ?? null,
      customer ? `${customer.name} - ek hizmet talebi` : `Yeni potansiyel musteri #${i + 1}`,
      category,
      rngPick(rng, LEAD_STAGES),
      rngPick(rng, TAIS_LEAD_SOURCES),
    ]);
  }
  await bulkInsert(
    db,
    "tais_leads",
    ["id", "org_id", "customer_id", "name", "category", "stage", "source"],
    leadRows
  );

  // --- Aktiviteler (60) ---
  // Senaryo 4: yenileme tarihi en yakin olmayan musterilerden biri (index 19,
  // 21 gunluk yenileme) kasitli olarak son donemde HICBIR aktivite almaz.
  const noActivityCustomerId = customers[19].id;
  const activityCustomerPool = customers.filter((c) => c.id !== noActivityCustomerId);
  const activityRows: unknown[][] = [];
  for (let i = 0; i < 60; i++) {
    const customer = rngPick(rng, activityCustomerPool);
    const type = rngPick(rng, TAIS_ACTIVITY_TYPES);
    const subject = rngPick(rng, ACTIVITY_SUBJECTS[type]);
    const dealsForCustomer = dealsByCustomer.get(customer.id) ?? [];
    const dealId = dealsForCustomer.length > 0 && rng() < 0.5 ? rngPick(rng, dealsForCustomer) : null;
    activityRows.push([
      newId(),
      orgId,
      customer.id,
      dealId,
      type,
      subject,
      daysFromReference(TAIS_REFERENCE_NOW, -rngInt(rng, 0, 60)),
    ]);
  }
  await bulkInsert(
    db,
    "tais_activities",
    ["id", "org_id", "customer_id", "deal_id", "type", "subject", "occurred_at"],
    activityRows
  );

  // --- Hizmet talepleri (20) ---
  // Senaryo 5: catering'de son dakika talep artisi (son 2 gunde 6 talep).
  const requestRows: unknown[][] = [];
  const REQUEST_STATUSES = ["open", "in_progress", "resolved"];
  const cateringLocations = locationsByCategory.get("catering") ?? [];
  for (let i = 0; i < 6; i++) {
    const location = cateringLocations[i % cateringLocations.length];
    requestRows.push([
      newId(),
      orgId,
      location.customerId,
      location.id,
      "catering",
      rngPick(rng, ["open", "in_progress"]),
      daysFromReference(TAIS_REFERENCE_NOW, -rngInt(rng, 0, 2)),
    ]);
  }
  for (let i = 0; i < 14; i++) {
    const category = rngPick(rng, categoryPool);
    const catLocations = locationsByCategory.get(category) ?? [];
    const location = rngPick(rng, catLocations);
    requestRows.push([
      newId(),
      orgId,
      location.customerId,
      location.id,
      category,
      rngPick(rng, REQUEST_STATUSES),
      daysFromReference(TAIS_REFERENCE_NOW, -rngInt(rng, 1, 25)),
    ]);
  }
  await bulkInsert(
    db,
    "tais_service_requests",
    ["id", "org_id", "customer_id", "location_id", "category", "status", "opened_at"],
    requestRows
  );

  // --- Sikayetler (12) ---
  // Senaryo 6: 1 musteride tekrar eden sikayet (3 kayit, ayni musteri).
  const complaintRows: unknown[][] = [];
  const recurringComplaintCustomer = customers[5];
  const recurringLocations = locations.filter((l) => l.customerId === recurringComplaintCustomer.id);
  for (let i = 0; i < 3; i++) {
    const location = recurringLocations[i % recurringLocations.length];
    complaintRows.push([
      newId(),
      orgId,
      recurringComplaintCustomer.id,
      location.id,
      location.category,
      i === 2 ? "open" : "resolved",
      daysFromReference(TAIS_REFERENCE_NOW, -rngInt(rng, 3, 40)),
    ]);
  }
  const otherComplaintCustomers = rngShuffle(
    rng,
    customers.filter((c) => c.id !== recurringComplaintCustomer.id)
  ).slice(0, 9);
  for (const customer of otherComplaintCustomers) {
    const custLocations = locations.filter((l) => l.customerId === customer.id);
    const location = rngPick(rng, custLocations);
    complaintRows.push([
      newId(),
      orgId,
      customer.id,
      location.id,
      location.category,
      rngPick(rng, ["open", "resolved"]),
      daysFromReference(TAIS_REFERENCE_NOW, -rngInt(rng, 1, 45)),
    ]);
  }
  await bulkInsert(
    db,
    "tais_complaints",
    ["id", "org_id", "customer_id", "location_id", "category", "status", "opened_at"],
    complaintRows
  );

  // --- Kalite uygunsuzluklari (10) ---
  const qualityRows: unknown[][] = [];
  for (let i = 0; i < 10; i++) {
    const location = rngPick(rng, locations);
    qualityRows.push([
      newId(),
      orgId,
      location.id,
      location.category,
      rngPick(rng, ["open", "resolved"]),
      daysFromReference(TAIS_REFERENCE_NOW, -rngInt(rng, 1, 60)),
    ]);
  }
  await bulkInsert(
    db,
    "tais_quality_issues",
    ["id", "org_id", "location_id", "category", "status", "opened_at"],
    qualityRows
  );
}

/**
 * TAIS demo karar+aksiyon zincirini (bkz. decisions.ts seedTaisDecisions) org_id
 * kapsaminda siler. Gerekli: gorev/musteri/lokasyon id'leri her seed'de yeniden
 * uretilir (newId() rastgeledir, rng ile tohumlanmaz) — bu yuzden eski kararlar
 * silinmezse yeni risklerle eslesmeyen "yetim" kayitlar olarak kalir ve
 * resetTaisDemo sonrasi Karar Merkezi/Yonetici Ekrani tutarsiz gorunur.
 * Silme sirasi FK kisitlarina uyar: outcomes -> actions -> causal_links ->
 * scenarios.case_id (silinmez, NULL'lanir) -> decision_records -> decision_cases.
 */
async function wipeTaisDecisionChain(orgId: string): Promise<void> {
  const db = getDb();
  const caseIdsSubquery = `SELECT id FROM decision_cases WHERE org_id = $1 AND category_id LIKE $2`;
  const recordIdsSubquery = `SELECT id FROM decision_records WHERE org_id = $1 AND case_id IN (${caseIdsSubquery})`;
  const marker = `${TAIS_DECISION_MARKER_PREFIX}%`;
  await db.query(`DELETE FROM outcomes WHERE org_id = $1 AND decision_id IN (${recordIdsSubquery})`, [
    orgId,
    marker,
  ]);
  await db.query(`DELETE FROM actions WHERE org_id = $1 AND case_id IN (${caseIdsSubquery})`, [orgId, marker]);
  await db.query(`DELETE FROM causal_links WHERE org_id = $1 AND case_id IN (${caseIdsSubquery})`, [
    orgId,
    marker,
  ]);
  await db.query(`UPDATE scenarios SET case_id = NULL WHERE org_id = $1 AND case_id IN (${caseIdsSubquery})`, [
    orgId,
    marker,
  ]);
  await db.query(`DELETE FROM decision_records WHERE org_id = $1 AND case_id IN (${caseIdsSubquery})`, [
    orgId,
    marker,
  ]);
  await db.query(`DELETE FROM decision_cases WHERE org_id = $1 AND category_id LIKE $2`, [orgId, marker]);
}

/** Cocuk tablolardan ebeveyne dogru, org_id kapsaminda TAIS demo verisini siler. */
async function wipeTaisDemoData(orgId: string): Promise<void> {
  const db = getDb();
  await wipeTaisDecisionChain(orgId);
  const tables = [
    "tais_service_requests",
    "tais_complaints",
    "tais_quality_issues",
    "tais_activities",
    "tais_deals",
    "tais_leads",
    "tais_tasks",
    "tais_employees",
    "tais_contracts",
    "tais_locations",
    "tais_teams",
    "tais_customers",
  ];
  for (const table of tables) {
    await db.query(`DELETE FROM ${table} WHERE org_id = $1`, [orgId]);
  }
}

/**
 * TAIS IKF MMC demo kurumunu ve sentetik verisini olusturur. Idempotenttir:
 * kurum zaten mevcut ve dolu ise hicbir sey yazmadan mevcut orgId'yi doner.
 */
export async function seedTaisDemo(opts?: {
  adminEmail?: string;
  adminPassword?: string;
}): Promise<{ orgId: string; alreadySeeded: boolean }> {
  await migrate();
  const db = getDb();
  const adminEmail = opts?.adminEmail ?? TAIS_DEMO_EMAIL;
  const adminPassword = opts?.adminPassword ?? TAIS_DEMO_PASSWORD;

  let orgId = await findTaisOrg();
  if (orgId) {
    const count = await taisCustomerCount(orgId);
    if (count > 0) {
      await ensureTaisDemoUser(orgId, adminEmail, adminPassword);
      await seedTaisDecisions(orgId);
      return { orgId, alreadySeeded: true };
    }
  } else {
    orgId = newId();
    await db.query("INSERT INTO organizations (id, name, sector_id, code) VALUES ($1, $2, $3, $4)", [
      orgId,
      TAIS_ORG_NAME,
      TAIS_SECTOR_ID,
      TAIS_ORG_CODE,
    ]);
  }

  await insertTaisDemoData(orgId);
  await ensureTaisDemoUser(orgId, adminEmail, adminPassword);
  await seedTaisDecisions(orgId);
  await recordAuditEvent({
    orgId,
    actor: "sistem",
    type: "tais_seed",
    summary: "TAIS IKF MMC demo verisi olusturuldu",
  });
  return { orgId, alreadySeeded: false };
}

/**
 * Mevcut TAIS demo verisini siler ve deterministik olarak yeniden uretir.
 * Karar+aksiyon zinciri de (wipeTaisDemoData icindeki wipeTaisDecisionChain
 * araciligiyla) silinip seedTaisDecisions ile taze risklerle eslesecek
 * sekilde yeniden kurulur — aksi halde eski kararlar, id'leri her seed'de
 * degisen risklerle eslesmeyen yetim kayitlar olarak kalirdi.
 */
export async function resetTaisDemo(): Promise<{ orgId: string }> {
  await migrate();
  const existingOrgId = await findTaisOrg();
  if (!existingOrgId) {
    const { orgId } = await seedTaisDemo();
    return { orgId };
  }
  await wipeTaisDemoData(existingOrgId);
  await insertTaisDemoData(existingOrgId);
  await seedTaisDecisions(existingOrgId);
  await recordAuditEvent({
    orgId: existingOrgId,
    actor: "sistem",
    type: "tais_seed_reset",
    summary: "TAIS IKF MMC demo verisi sifirlanip yeniden olusturuldu",
  });
  return { orgId: existingOrgId };
}
