import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tais-kpi-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { seedTaisDemo, TAIS_REFERENCE_NOW } = await import("../src/lib/demo/tais/seed");
const { TAIS_CUSTOMER_NAMES } = await import("../src/lib/demo/tais/data");
const { loadTaisKpiInputs, computeTaisKpis } = await import("../src/lib/demo/tais/kpi");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await getDb().close();
});

describe("TAIS KPI hesaplama (deterministik, seed verisinden turetilmis)", () => {
  let orgId: string;

  beforeAll(async () => {
    const result = await seedTaisDemo();
    orgId = result.orgId;
  });

  it("ayni girdi icin ayni KPI anlik goruntusunu uretir (determinizm)", async () => {
    const inputsA = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const inputsB = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const snapshotA = computeTaisKpis(inputsA);
    const snapshotB = computeTaisKpis(inputsB);
    expect(snapshotA).toEqual(snapshotB);
  });

  it("geciken gorev sayisi, dogrudan SQL sayimiyla ayni deger uretir", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { operations } = computeTaisKpis(inputs);

    const r = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tais_tasks
       WHERE org_id = $1 AND status <> 'done' AND due_at < $2::timestamptz`,
      [orgId, TAIS_REFERENCE_NOW]
    );
    expect(operations.overdueTaskCount).toBe(r.rows[0]?.n);
  });

  it("senaryo: en az 3 acik gorev SLA riski penceresinde (48 saat icinde, henuz gecmemis)", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { operations } = computeTaisKpis(inputs);
    expect(operations.slaRiskTaskCount).toBeGreaterThanOrEqual(3);
  });

  it("senaryo: en az 5 gorev sahipsiz (employee_id NULL, aktif)", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { operations } = computeTaisKpis(inputs);
    expect(operations.unassignedTaskCount).toBeGreaterThanOrEqual(5);
  });

  it("senaryo: recurringComplaintCustomers listesi, tekrar eden sikayetli musteriyi (index 5) icerir", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { operations } = computeTaisKpis(inputs);

    const r = await getDb().query<{ id: string }>("SELECT id FROM tais_customers WHERE org_id = $1 AND name = $2", [
      orgId,
      TAIS_CUSTOMER_NAMES[5],
    ]);
    const recurringCustomerId = r.rows[0]?.id;
    expect(operations.recurringComplaintCustomers.some((c) => c.customerId === recurringCustomerId)).toBe(true);
  });

  it("senaryo: en az 4 sozlesmenin yenilemesi yaklasiyor (upcomingRenewalCount)", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { commercial } = computeTaisKpis(inputs);
    expect(commercial.upcomingRenewalCount).toBeGreaterThanOrEqual(4);
  });

  it("senaryo: churnRiskCustomerIds, aktivitesiz + yenilemesi yaklasan musteriyi (index 19) icerir", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { commercial } = computeTaisKpis(inputs);

    const r = await getDb().query<{ id: string }>("SELECT id FROM tais_customers WHERE org_id = $1 AND name = $2", [
      orgId,
      TAIS_CUSTOMER_NAMES[19],
    ]);
    const noActivityCustomerId = r.rows[0]?.id;
    expect(commercial.churnRiskCustomerIds).toContain(noActivityCustomerId);
  });

  it("yonetim KPI'lari 0-100 araligindadir (skor niteligindekiler)", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { management } = computeTaisKpis(inputs);
    expect(management.operationsHealthScore).toBeGreaterThanOrEqual(0);
    expect(management.operationsHealthScore).toBeLessThanOrEqual(100);
    expect(management.teamCapacityScore).toBeGreaterThanOrEqual(0);
    expect(management.teamCapacityScore).toBeLessThanOrEqual(100);
    expect(management.slaComplianceRatePct).toBeGreaterThanOrEqual(0);
    expect(management.slaComplianceRatePct).toBeLessThanOrEqual(100);
    expect(management.dataFreshnessScorePct).toBeGreaterThanOrEqual(0);
    expect(management.dataFreshnessScorePct).toBeLessThanOrEqual(100);
  });

  it("tahmini onlenebilir kayip negatif olamaz ve churn riski yoksa sifirdir", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { management, commercial } = computeTaisKpis(inputs);
    expect(management.estimatedPreventableLossAzn).toBeGreaterThanOrEqual(0);
    if (commercial.churnRiskCustomerIds.length === 0) {
      expect(management.estimatedPreventableLossAzn).toBe(0);
    }
  });

  it("aktif gorev + tamamlanan gorev toplami, toplam gorev sayisina esittir", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { operations } = computeTaisKpis(inputs);
    const totalFromCategories = operations.tasksByCategory.reduce((sum, c) => sum + c.total, 0);
    expect(operations.activeTaskCount + operations.completedTaskCount).toBe(totalFromCategories);
    expect(totalFromCategories).toBe(250);
  });

  it("ekibe gore is yuku, tum ekipleri (8) icerir ve kapasiteler pozitiftir", async () => {
    const inputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const { operations } = computeTaisKpis(inputs);
    expect(operations.workloadByTeam).toHaveLength(8);
    for (const team of operations.workloadByTeam) {
      expect(team.capacity).toBeGreaterThan(0);
    }
  });
});
