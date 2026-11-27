import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CanonicalRecord, RestConnectorConfig } from "../src/lib/connectors/types";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-auto-kpi-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { confirmBusinessProfile } = await import("../src/lib/db/repos/business-context");
const { promoteConnectorRecords } = await import("../src/lib/db/repos/connector-promotion");
const { commitConnectorSync } = await import("../src/lib/db/repos/connector-sync");
const { upsertDefinition } = await import("../src/lib/db/repos/kpi-registry");

const ORG = "org-auto-kpi";
const ORG_MANUAL = "org-auto-kpi-manual";
const ORG_ISOLATED = "org-auto-kpi-isolated";
const SEED_CONFIG = "cfg-auto-kpi-seed";
const CONFIG = "cfg-auto-kpi";
const CONFIG_EXPLICIT = "cfg-auto-kpi-explicit";

const FIELDS: Record<string, number> = {
  planned_production_time: 600,
  downtime_minutes: 60,
  ideal_cycle_time_minutes: 1,
  total_units: 480,
  good_units: 456,
  scrap_units: 24,
  actual_production_time: 500,
  available_capacity_time: 600,
  production_cost: 9600,
  orders_delivered_on_time: 9,
  orders_total: 10,
};

function config(overrides: Partial<RestConnectorConfig> = {}): RestConnectorConfig {
  return {
    kind: "rest",
    baseUrl: "https://erp.example.test",
    path: "/production",
    authType: "none",
    entity: "product",
    idField: "id",
    fieldMap: {},
    pagination: { type: "none" },
    ...overrides,
  };
}

function record(externalId: string, fields: Record<string, number> = FIELDS): CanonicalRecord {
  return {
    entity: "product",
    externalId,
    sourceUpdatedAt: "2026-01-01T00:00:00Z",
    fields,
  };
}

beforeAll(async () => {
  await migrate();
  const db = getDb();
  await db.query(
    "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')",
    [ORG, "Auto KPI"]
  );

  // Onay için keşif kanıtı gerçek konnektör kayıtlarından gelir.
  await db.query(
    `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
     VALUES ($1, $2, 'rest-generic', 'Üretim', $3, 'test')`,
    [SEED_CONFIG, ORG, JSON.stringify(config())]
  );
  await db.query(
    `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data, source_updated_at)
     VALUES ('rec-auto-kpi-seed', $1, $2, 'product', 'P-0', $3, '2026-01-01T00:00:00Z')`,
    [ORG, SEED_CONFIG, JSON.stringify({ fields: FIELDS })]
  );

  const confirmed = await confirmBusinessProfile({
    orgId: ORG,
    packId: "manufacturing",
    acknowledgeConfidence: true,
    actor: "test",
  });
  expect(confirmed.profile.industryPackId).toBe("manufacturing");

  // Aynı adda manuel tanımı olan org: paket KPI'sı otomatik hesaplanmamalı.
  await db.query(
    "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')",
    [ORG_MANUAL, "Auto KPI Manual"]
  );
  await db.query(
    `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
     VALUES ('cfg-auto-kpi-manual-seed', $1, 'rest-generic', 'Üretim', $2, 'test')`,
    [ORG_MANUAL, JSON.stringify(config())]
  );
  await db.query(
    `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data, source_updated_at)
     VALUES ('rec-auto-kpi-manual-seed', $1, 'cfg-auto-kpi-manual-seed', 'product', 'PM-0', $2, '2026-01-01T00:00:00Z')`,
    [ORG_MANUAL, JSON.stringify({ fields: FIELDS })]
  );
  await upsertDefinition({
    orgId: ORG_MANUAL,
    name: "İlk geçiş verimi",
    formulaText: "operatör tarafından doğrulanmış özel formül",
    owner: "Kalite Müdürü",
  });
  const manualConfirmed = await confirmBusinessProfile({
    orgId: ORG_MANUAL,
    packId: "manufacturing",
    acknowledgeConfidence: true,
    actor: "test",
  });
  expect(manualConfirmed.profile.industryPackId).toBe("manufacturing");

  // Profili olmayan org: başka org'un onaylı profili kullanılmamalı.
  await db.query(
    "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')",
    [ORG_ISOLATED, "Auto KPI Isolated"]
  );
});

afterAll(async () => {
  await getDb().close();
});

describe("onaylanmış profil ile otomatik KPI hesaplama", () => {
  it("alanları kayıtta birlikte bulunan paket KPI'larını elle eşleme olmadan hesaplar", async () => {
    const result = await promoteConnectorRecords({
      orgId: ORG,
      configId: CONFIG,
      configName: "Üretim",
      config: config(),
      records: [record("P-1")],
      runId: "run-auto-1",
    });

    // OEE, FPY, fire, kapasite, zamanında teslimat ve birim maliyet hesaplanabilir;
    // stok devri ve tedarikçi hata oranı için gerekli alanlar kayıtta yok.
    expect(result.autoSelectedKpiCount).toBeGreaterThanOrEqual(6);
    expect(result.autoComputedKpiObservationCount).toBeGreaterThanOrEqual(6);
    expect(result.autoComputedKpiObservationCount).toBe(result.computedKpiObservationCount);
    expect(result.warnings.join(" ")).toContain("otomatik hesaplama için seçildi");

    const rows = await getDb().query<{ label: string; value: string }>(
      "SELECT label, value FROM kpi_values WHERE org_id = $1",
      [ORG]
    );
    const labels = rows.rows.map((row) => row.label);
    expect(labels).toContain("Ekipman etkinliği (OEE)");
    expect(labels).toContain("İlk geçiş verimi");
    expect(labels).not.toContain("Stok devir hızı");
    expect(labels).not.toContain("Tedarikçi hata oranı");

    const fpy = rows.rows.find((row) => row.label === "İlk geçiş verimi");
    expect(Number(fpy?.value)).toBeCloseTo(95, 6);

    const provenance = await getDb().query<{
      definition_id: string | null;
      definition_hash: string | null;
      definition_version: string | null;
      entity: string | null;
      external_id: string | null;
      period: string | null;
    }>(
      `SELECT definition_id, definition_hash, definition_version,
              entity, external_id, period
         FROM kpi_values
        WHERE org_id = $1 AND label = 'İlk geçiş verimi'
        LIMIT 1`,
      [ORG]
    );
    expect(provenance.rows[0]?.definition_id).toBeTruthy();
    expect(provenance.rows[0]?.definition_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(provenance.rows[0]?.definition_version).toMatch(/^manufacturing@/);
    expect(provenance.rows[0]).toMatchObject({
      entity: "product",
      external_id: "P-1",
      // Gözlem dönemi connector kaydında yok; tanımın update_frequency değeri
      // raporlama sıklığıdır ve gözlem dönemi olarak yazılmaz.
      period: null,
    });
    const definitionFrequency = await getDb().query<{ update_frequency: string | null }>(
      "SELECT update_frequency FROM kpi_definitions WHERE org_id = $1 AND name = 'İlk geçiş verimi'",
      [ORG]
    );
    expect(definitionFrequency.rows[0]?.update_frequency).toBe("on-demand");
  });

  it("operatörün açık computedKpiMap seçimi otomatik seçimi devre dışı bırakır", async () => {
    const result = await promoteConnectorRecords({
      orgId: ORG,
      configId: CONFIG_EXPLICIT,
      configName: "Üretim (özel)",
      config: config({
        computedKpiMap: { "manufacturing:first_pass_yield": "Özel FPY" },
      }),
      records: [record("P-2")],
      runId: "run-auto-2",
    });

    expect(result.autoSelectedKpiCount).toBe(0);
    expect(result.autoComputedKpiObservationCount).toBe(0);
    expect(result.computedKpiObservationCount).toBe(1);

    const rows = await getDb().query<{ label: string; value: string }>(
      "SELECT label, value FROM kpi_values WHERE org_id = $1 AND label = 'Özel FPY'",
      [ORG]
    );
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].value)).toBeCloseTo(95, 6);
  });

  it("senkron transaction'ı içinde de onaylı profili okuyup hesaplar", async () => {
    let autoComputed = 0;
    await getDb().transaction(async (tx) => {
      const result = await promoteConnectorRecords({
        orgId: ORG,
        configId: "cfg-auto-kpi-tx",
        configName: "TX üretim",
        config: config(),
        records: [record("P-4")],
        runId: "run-auto-4",
        tx,
      });
      expect(result.autoSelectedKpiCount).toBeGreaterThanOrEqual(6);
      autoComputed = result.autoComputedKpiObservationCount;
    });
    expect(autoComputed).toBeGreaterThanOrEqual(6);
  });

  it("paket KPI'sı için alanlar eksikse otomatik hesaplama yapmaz", async () => {
    const result = await promoteConnectorRecords({
      orgId: ORG,
      configId: "cfg-auto-kpi-partial",
      configName: "Kısmi üretim",
      config: config(),
      records: [record("P-3", { good_units: 90, total_units: 100 })],
      runId: "run-auto-3",
    });

    // Yalnızca FPY tamamen karşılanır; OEE, fire, kapasite ve teslimat seçilmez.
    expect(result.autoSelectedKpiCount).toBe(1);
    expect(result.autoComputedKpiObservationCount).toBe(1);

    const dataset = await getDb().query<{ id: string }>(
      "SELECT id FROM datasets WHERE org_id = $1 AND source_label = $2",
      [ORG, "Konnektör: Kısmi üretim"]
    );
    expect(dataset.rows).toHaveLength(1);
    const rows = await getDb().query<{ label: string }>(
      "SELECT label FROM kpi_values WHERE org_id = $1 AND dataset_id = $2",
      [ORG, dataset.rows[0].id]
    );
    expect(rows.rows.map((row) => row.label)).toEqual(["İlk geçiş verimi"]);
  });

  it("manuel tanımlı KPI'yı paket formülüyle otomatik hesaplamaz", async () => {
    const result = await promoteConnectorRecords({
      orgId: ORG_MANUAL,
      configId: "cfg-auto-kpi-manual",
      configName: "Manuel üretim",
      config: config(),
      records: [record("PM-1")],
      runId: "run-manual-1",
    });

    expect(result.warnings.join(" ")).toContain("Manuel tanımlı KPI'lar otomatik hesaplanmadı");
    expect(result.autoSelectedKpiCount).toBeGreaterThanOrEqual(5);
    expect(result.autoComputedKpiObservationCount).toBeGreaterThanOrEqual(5);

    const dataset = await getDb().query<{ id: string }>(
      "SELECT id FROM datasets WHERE org_id = $1 AND source_label = $2",
      [ORG_MANUAL, "Konnektör: Manuel üretim"]
    );
    expect(dataset.rows).toHaveLength(1);
    const rows = await getDb().query<{ label: string }>(
      "SELECT label FROM kpi_values WHERE org_id = $1 AND dataset_id = $2",
      [ORG_MANUAL, dataset.rows[0].id]
    );
    const labels = rows.rows.map((row) => row.label);
    expect(labels).not.toContain("İlk geçiş verimi");
    expect(labels).toContain("Ekipman etkinliği (OEE)");
  });

  it("gerçek senkron commit'i kanonik kayıt, KPI ve run kapanışını birlikte yazar", async () => {
    const db = getDb();
    await db.query(
      `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
       VALUES ('cfg-auto-kpi-e2e', $1, 'rest-generic', 'E2E', $2, 'test')`,
      [ORG, JSON.stringify(config())]
    );
    await db.query(
      `INSERT INTO connector_sync_runs (id, org_id, config_id, status)
       VALUES ('run-auto-e2e', $1, 'cfg-auto-kpi-e2e', 'running')`,
      [ORG]
    );

    const result = await commitConnectorSync({
      orgId: ORG,
      configId: "cfg-auto-kpi-e2e",
      configName: "E2E",
      config: config(),
      runId: "run-auto-e2e",
      records: [record("P-E2E")],
      rejected: [],
      pages: 1,
      readCount: 1,
      skippedCount: 0,
      checkpoint: null,
      warnings: [],
      sourceSchema: [],
      mappingSuggestions: [],
    });

    expect(result.written).toBe(1);
    expect(result.promotion.autoComputedKpiObservationCount).toBeGreaterThanOrEqual(6);

    const run = await db.query<{ status: string }>(
      "SELECT status FROM connector_sync_runs WHERE id = 'run-auto-e2e'"
    );
    expect(run.rows[0].status).toBe("success");

    const canonical = await db.query(
      "SELECT 1 FROM connector_records WHERE org_id = $1 AND config_id = 'cfg-auto-kpi-e2e' AND external_id = 'P-E2E'",
      [ORG]
    );
    expect(canonical.rows).toHaveLength(1);

    const dataset = await db.query<{ id: string }>(
      "SELECT id FROM datasets WHERE org_id = $1 AND source_label = $2",
      [ORG, "Konnektör: E2E"]
    );
    const values = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM kpi_values WHERE org_id = $1 AND dataset_id = $2",
      [ORG, dataset.rows[0].id]
    );
    expect(values.rows[0].n).toBeGreaterThanOrEqual(6);
  });

  it("profili olmayan org başka org'un profiliyle hesaplamaz", async () => {
    const result = await promoteConnectorRecords({
      orgId: ORG_ISOLATED,
      configId: "cfg-auto-kpi-isolated",
      configName: "İzole üretim",
      config: config(),
      records: [record("PI-1")],
      runId: "run-isolated-1",
    });
    expect(result.autoSelectedKpiCount).toBe(0);
    expect(result.autoComputedKpiObservationCount).toBe(0);
    const rows = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM kpi_values WHERE org_id = $1",
      [ORG_ISOLATED]
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it("operatörün açık seçimi manuel tanımın adını kullanabilir", async () => {
    const result = await promoteConnectorRecords({
      orgId: ORG_MANUAL,
      configId: "cfg-auto-kpi-manual-explicit",
      configName: "Manuel üretim (özel)",
      config: config({
        computedKpiMap: { "manufacturing:first_pass_yield": "Operatör FPY" },
      }),
      records: [record("PM-2")],
      runId: "run-manual-2",
    });

    expect(result.autoSelectedKpiCount).toBe(0);
    expect(result.computedKpiObservationCount).toBe(1);
    const rows = await getDb().query<{ label: string }>(
      "SELECT label FROM kpi_values WHERE org_id = $1 AND label = 'Operatör FPY'",
      [ORG_MANUAL]
    );
    expect(rows.rows).toHaveLength(1);
  });
});
