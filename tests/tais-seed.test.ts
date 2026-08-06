import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * client.ts DB_DIR'i modül üst seviyesinde okur. Kendi geçici dizinini
 * kullanır ki dev sunucunun .data/abys-db kilidiyle veya diğer test
 * dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tais-seed-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { seedTaisDemo, resetTaisDemo, TAIS_ORG_CODE, TAIS_REFERENCE_NOW } = await import(
  "../src/lib/demo/tais/seed"
);

interface TableCounts {
  customers: number;
  locations: number;
  contracts: number;
  teams: number;
  employees: number;
  tasks: number;
  leads: number;
  deals: number;
  activities: number;
  requests: number;
  complaints: number;
  quality: number;
}

async function countAll(orgId: string): Promise<TableCounts> {
  const db = getDb();
  async function count(table: string): Promise<number> {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE org_id = $1`, [
      orgId,
    ]);
    return r.rows[0]?.n ?? 0;
  }
  const [customers, locations, contracts, teams, employees, tasks, leads, deals, activities, requests, complaints, quality] =
    await Promise.all([
      count("tais_customers"),
      count("tais_locations"),
      count("tais_contracts"),
      count("tais_teams"),
      count("tais_employees"),
      count("tais_tasks"),
      count("tais_leads"),
      count("tais_deals"),
      count("tais_activities"),
      count("tais_service_requests"),
      count("tais_complaints"),
      count("tais_quality_issues"),
    ]);
  return { customers, locations, contracts, teams, employees, tasks, leads, deals, activities, requests, complaints, quality };
}

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await getDb().close();
});

describe("seedTaisDemo (deterministik sentetik TAIS verisi)", () => {
  let orgId: string;

  beforeAll(async () => {
    const result = await seedTaisDemo();
    orgId = result.orgId;
  });

  it("beklenen hacimlerde kayit uretir (25/70/45/8/40/250/40/40/60/20/12/10)", async () => {
    const counts = await countAll(orgId);
    expect(counts.customers).toBe(25);
    expect(counts.locations).toBe(70);
    expect(counts.contracts).toBe(45);
    expect(counts.teams).toBe(8);
    expect(counts.employees).toBe(40);
    expect(counts.tasks).toBe(250);
    expect(counts.leads).toBe(40);
    expect(counts.deals).toBe(40);
    expect(counts.activities).toBe(60);
    expect(counts.requests).toBe(20);
    expect(counts.complaints).toBe(12);
    expect(counts.quality).toBe(10);
  });

  it("organizasyon kodu ve adi dogru yazilir", async () => {
    const r = await getDb().query<{ name: string; code: string; sector_id: string }>(
      "SELECT name, code, sector_id FROM organizations WHERE id = $1",
      [orgId]
    );
    expect(r.rows[0]?.code).toBe(TAIS_ORG_CODE);
    expect(r.rows[0]?.name).toBe("TAIS IKF MMC");
  });

  it("idempotent: ikinci cagri duplicate uretmez, ayni orgId'yi doner", async () => {
    const before = await countAll(orgId);
    const second = await seedTaisDemo();
    expect(second.orgId).toBe(orgId);
    expect(second.alreadySeeded).toBe(true);
    const after = await countAll(orgId);
    expect(after).toEqual(before);
  });

  // NOT: tum senaryo tarihleri gercek `now()`e degil, sabit TAIS_REFERENCE_NOW'a
  // gore uretilir (bkz. seed.ts determinizm sozlesmesi). Testler de ayni referans
  // ana gore sorgular ki gercek saat ilerledikce testler kirilmasin.
  it("senaryo: Cleaning Team B icin 3 acik SLA-riskli gorev var (referans anindan 48 saat icinde son tarih)", async () => {
    const r = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tais_tasks t
       JOIN tais_teams tm ON tm.id = t.team_id
       WHERE t.org_id = $1 AND tm.name = 'Cleaning Team B' AND t.status = 'open'
         AND t.due_at <= $2::timestamptz + interval '2 days'`,
      [orgId, TAIS_REFERENCE_NOW]
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(3);
  });

  it("senaryo: en az 2 pest-control gorevi gecikmis (referans anindan once son tarih, hala acik)", async () => {
    const r = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tais_tasks
       WHERE org_id = $1 AND category = 'pest_control' AND status = 'open' AND due_at < $2::timestamptz`,
      [orgId, TAIS_REFERENCE_NOW]
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(2);
  });

  it("senaryo: en az 5 gorev sahipsiz (employee_id NULL)", async () => {
    const r = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tais_tasks WHERE org_id = $1 AND employee_id IS NULL`,
      [orgId]
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(5);
  });

  it("senaryo: catering'de referans anindan onceki 2 gunde en az 6 hizmet talebi var (talep artisi)", async () => {
    const r = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tais_service_requests
       WHERE org_id = $1 AND category = 'catering' AND opened_at >= $2::timestamptz - interval '3 days'`,
      [orgId, TAIS_REFERENCE_NOW]
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(6);
  });

  it("senaryo: en az 4 sozlesmenin yenileme tarihi referans anindan 30 gun icinde", async () => {
    const r = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tais_contracts
       WHERE org_id = $1 AND renewal_date <= $2::timestamptz + interval '30 days'`,
      [orgId, TAIS_REFERENCE_NOW]
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(4);
  });

  it("senaryo: bir musteride tekrar eden sikayet var (ayni musteride >=3 kayit)", async () => {
    const r = await getDb().query<{ customer_id: string; n: number }>(
      `SELECT customer_id, count(*)::int AS n FROM tais_complaints
       WHERE org_id = $1 GROUP BY customer_id ORDER BY n DESC LIMIT 1`,
      [orgId]
    );
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(3);
  });

  it("her gorev, ait oldugu ekiple ayni kategoriye sahiptir (tutarlilik)", async () => {
    const r = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tais_tasks t
       JOIN tais_teams tm ON tm.id = t.team_id
       WHERE t.org_id = $1 AND t.category <> tm.category`,
      [orgId]
    );
    expect(r.rows[0]?.n).toBe(0);
  });
});

describe("TAIS demo verisi tenant izolasyonu", () => {
  it("baska bir organizasyonun TAIS satirlarini gormez", async () => {
    const { orgId } = await seedTaisDemo();
    const otherOrgId = randomUUID().replace(/-/g, "").slice(0, 16);
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      otherOrgId,
      "Baska Kurum",
      "aviation",
    ]);
    const counts = await countAll(otherOrgId);
    expect(counts.customers).toBe(0);
    expect(counts.tasks).toBe(0);

    const taisCounts = await countAll(orgId);
    expect(taisCounts.customers).toBe(25);
  });
});

describe("resetTaisDemo (siifirlanabilirlik)", () => {
  it("wipe + yeniden uretim sonrasi ayni hacimleri verir (determinizm)", async () => {
    const before = await seedTaisDemo();
    const beforeCounts = await countAll(before.orgId);

    const after = await resetTaisDemo();
    expect(after.orgId).toBe(before.orgId);
    const afterCounts = await countAll(after.orgId);
    expect(afterCounts).toEqual(beforeCounts);
  });
});
