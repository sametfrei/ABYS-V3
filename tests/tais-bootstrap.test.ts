import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * bkz. tests/tais-seed.test.ts için aynı gerekçe. Kendi geçici dizinini
 * kullanır ki dev sunucunun kilidiyle veya diğer test dosyalarıyla
 * çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tais-bootstrap-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { bootstrapTaisDemo } = await import("../src/lib/demo/tais/bootstrap");
const { resetTaisDemo, TAIS_ORG_CODE } = await import("../src/lib/demo/tais/seed");
const { TAIS_REFERENCE_NOW } = await import("../src/lib/demo/tais/constants");
const { loadTaisRiskInputs, computeTaisRisks } = await import("../src/lib/demo/tais/risks");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await getDb().close();
});

describe("bootstrapTaisDemo: hata durumunda rollback", () => {
  it("insertTaisDemoData sirasinda hata olursa hicbir sey commit edilmez (org bile olusmaz)", async () => {
    const db = getDb();
    const orgCountBefore = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM organizations WHERE code = $1",
      [TAIS_ORG_CODE]
    );
    expect(orgCountBefore.rows[0]?.n).toBe(0);

    const originalQuery = db.query.bind(db);
    const spy = vi
      .spyOn(db, "query")
      .mockImplementation(async (sql: unknown, params?: unknown[]) => {
        if (typeof sql === "string" && sql.includes("INSERT INTO tais_teams")) {
          throw new Error("kasıtlı test hatası: rollback doğrulaması");
        }
        return originalQuery(sql as string, params as never);
      });

    await expect(bootstrapTaisDemo()).rejects.toThrow("kasıtlı test hatası");
    spy.mockRestore();

    const orgCountAfter = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM organizations WHERE code = $1",
      [TAIS_ORG_CODE]
    );
    expect(orgCountAfter.rows[0]?.n).toBe(0);
  });
});

describe("bootstrapTaisDemo: temiz ortamda sifirdan kurulum", () => {
  let firstResult: Awaited<ReturnType<typeof bootstrapTaisDemo>>;

  it("basarili olur, org+kullanici+veri+karar zincirini kurar", async () => {
    firstResult = await bootstrapTaisDemo();
    expect(firstResult.orgId).toBeTruthy();
    expect(firstResult.adminEmail).toBe("ceo@tais.demo");
    expect(firstResult.baseDataAlreadySeeded).toBe(false);
    expect(firstResult.decisionCount).toBe(6);
    expect(firstResult.actionCount).toBe(12);
    expect(firstResult.counts.tais_customers).toBe(25);
    expect(firstResult.counts.tais_tasks).toBe(250);
    expect(firstResult.counts.decision_cases).toBe(6);
    expect(firstResult.counts.actions).toBe(12);
  });

  it("org tek kalir (duplicate organizations satiri yok)", async () => {
    const r = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM organizations WHERE code = $1",
      [TAIS_ORG_CODE]
    );
    expect(r.rows[0]?.n).toBe(1);
  });

  it("demo yonetici kullanicisi dogru org'a ve role baglidir", async () => {
    const r = await getDb().query<{ org_id: string; role: string; n: number }>(
      "SELECT org_id, role, count(*)::int AS n FROM users WHERE email = $1 GROUP BY org_id, role",
      [firstResult.adminEmail]
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0]?.n).toBe(1);
    expect(r.rows[0]?.org_id).toBe(firstResult.orgId);
    expect(r.rows[0]?.role).toBe("ceo");
  });

  it("ikinci bootstrap cagrisi duplicate uretmez, ayni orgId'yi doner, sayilar degismez", async () => {
    const second = await bootstrapTaisDemo();
    expect(second.orgId).toBe(firstResult.orgId);
    expect(second.baseDataAlreadySeeded).toBe(true);
    expect(second.decisionsAlreadySeeded).toBe(true);
    expect(second.counts).toEqual(firstResult.counts);

    const userCount = await getDb().query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE email = $1", [
      firstResult.adminEmail,
    ]);
    expect(userCount.rows[0]?.n).toBe(1);
  });

  it("baska bir kurumun (onceden var olan) verisine dokunmaz", async () => {
    const otherOrgId = randomBytes(8).toString("hex");
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      otherOrgId,
      "Baska Kurum Bootstrap Testi",
      "aviation",
    ]);
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [randomBytes(8).toString("hex"), otherOrgId, "sahibi@baska-kurum.test", "Sahibi", "ceo", "x:x"]
    );

    await bootstrapTaisDemo();

    const otherOrgUsers = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE org_id = $1", [
      otherOrgId,
    ]);
    expect(otherOrgUsers.rows[0]?.n).toBe(1);
    const otherOrgStillThere = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM organizations WHERE id = $1",
      [otherOrgId]
    );
    expect(otherOrgStillThere.rows[0]?.n).toBe(1);
  });
});

describe("bootstrapTaisDemo: uretim koruması", () => {
  it("NODE_ENV=production ve ALLOW_TAIS_DEMO_BOOTSTRAP yokken reddedilir", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_TAIS_DEMO_BOOTSTRAP", "");
    await expect(bootstrapTaisDemo()).rejects.toThrow(/üretim ortamında kapalıdır/);
    vi.unstubAllEnvs();
  });

  it("ALLOW_TAIS_DEMO_BOOTSTRAP=true iken uretimde de calisir", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_TAIS_DEMO_BOOTSTRAP", "true");
    const result = await bootstrapTaisDemo();
    expect(result.orgId).toBeTruthy();
    vi.unstubAllEnvs();
  });
});

describe("resetTaisDemo: yalnizca TAIS demo verisini etkiler", () => {
  it("baska kurumun 'tais-decision:' onekli karari + TAIS org'unun ilgisiz karari reset sirasinda silinmez", async () => {
    const db = getDb();
    const taisOrg = await db.query<{ id: string }>("SELECT id FROM organizations WHERE code = $1", [
      TAIS_ORG_CODE,
    ]);
    const taisOrgId = taisOrg.rows[0]!.id;

    const otherOrgId = randomBytes(8).toString("hex");
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      otherOrgId,
      "Baska Kurum Reset Testi",
      "aviation",
    ]);

    // Baska kurumda, TAIS karar oneki ile YANLIŞLIKLA eslesecek bir kayit —
    // org_id filtresi olmadan yalniz LIKE ile silinseydi bu satir da giderdi.
    const otherOrgCaseId = randomBytes(8).toString("hex");
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [otherOrgCaseId, otherOrgId, "aviation", "tais-decision:should-not-be-touched", "warning", "open", "Baska kurum karari", 50, "{}"]
    );

    // TAIS org'unun kendisinde, TAIS demo zincirine AIT OLMAYAN bir karar —
    // wipeTaisDecisionChain'in 'tais-decision:' oneki disindaki kayitlara dokunmadigini kanitlar.
    const unrelatedCaseId = randomBytes(8).toString("hex");
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [unrelatedCaseId, taisOrgId, "other", "manual-unrelated-case", "info", "open", "TAIS orgunda elle eklenmis ilgisiz karar", 40, "{}"]
    );

    await resetTaisDemo();

    const otherOrgCaseStillThere = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE id = $1",
      [otherOrgCaseId]
    );
    expect(otherOrgCaseStillThere.rows[0]?.n).toBe(1);

    const unrelatedCaseStillThere = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE id = $1",
      [unrelatedCaseId]
    );
    expect(unrelatedCaseStillThere.rows[0]?.n).toBe(1);

    // TAIS zinciri kendisi taze uretilmis olmali (6 karar, hepsi 'tais-decision:' onekli).
    const taisDecisions = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1 AND category_id LIKE 'tais-decision:%'",
      [taisOrgId]
    );
    expect(taisDecisions.rows[0]?.n).toBe(6);
  }, 30_000);

  it("reset sonrasi karar->risk baglantisi yetim kalmaz (aksiyonlarin related_risk_id'si guncel risk listesinde bulunur)", async () => {
    const db = getDb();
    const taisOrg = await db.query<{ id: string }>("SELECT id FROM organizations WHERE code = $1", [
      TAIS_ORG_CODE,
    ]);
    const taisOrgId = taisOrg.rows[0]!.id;

    // Risk id'leri (ör. "team_capacity_overload:<teamId>") icerdikleri
    // musteri/lokasyon/ekip id'leri her resetTaisDemo() cagrisinda
    // yeniden uretildigi (newId() rastgeledir) icin, eski bir reset'ten
    // kalma bir related_risk_id ARTIK HICBIR gecerli riske karsilik
    // gelmeyebilir. Gercek davranisi kanitlamak icin, TAIS'in kullandigi
    // AYNI risk hesaplama fonksiyonunu calistirip guncel risk id kumesiyle
    // karsilastiriyoruz — bu tam olarak pickMainDecision'in dayandigi kesisimdir.
    const inputs = await loadTaisRiskInputs(taisOrgId, TAIS_REFERENCE_NOW);
    const currentRiskIds = new Set(computeTaisRisks(inputs).map((r) => r.id));
    expect(currentRiskIds.size).toBeGreaterThan(0);

    const actions = await db.query<{ related_risk_id: string | null }>(
      `SELECT related_risk_id FROM actions WHERE org_id = $1 AND related_risk_id IS NOT NULL`,
      [taisOrgId]
    );
    expect(actions.rows.length).toBeGreaterThan(0);

    for (const { related_risk_id } of actions.rows) {
      expect(currentRiskIds.has(related_risk_id!)).toBe(true);
    }
  });
});
