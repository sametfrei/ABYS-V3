import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * "Mevcut ekranları TAIS verisiyle doldur" görevinin sayısal tutarlılık
 * doğrulaması: Riskler ve Sinyaller (Alerts), Analiz (Analysis) ve Karar
 * Merkezi/Aksiyonlar (Decisions/Actions) ekranlarını besleyen fonksiyonlar
 * BAĞIMSIZ kod yollarından (loadTaisKpiInputs vs loadTaisRiskInputs vs
 * listCasesForOrg/listActions) aynı gerçek dünya sayısına ulaşmalı.
 */

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tais-consistency-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { seedTaisDemo, TAIS_REFERENCE_NOW } = await import("../src/lib/demo/tais/seed");
const { seedTaisDecisions } = await import("../src/lib/demo/tais/decisions");
const { loadTaisKpiInputs, computeTaisKpis } = await import("../src/lib/demo/tais/kpi");
const { loadTaisRiskInputs, computeTaisRisks } = await import("../src/lib/demo/tais/risks");
const { listCasesForOrg } = await import("../src/lib/db/repos/decisions");
const { listActions } = await import("../src/lib/db/repos/actions");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await getDb().close();
});

describe("TAIS ekranları arası sayısal tutarlılık", () => {
  let orgId: string;

  beforeAll(async () => {
    const seeded = await seedTaisDemo();
    orgId = seeded.orgId;
    await seedTaisDecisions(orgId);
  });

  it("Analiz ekranının geciken görev sayısı (KPI) ile Riskler ekranının 'gecikmiş görev' risklerinin toplam etkilenen görev sayısı eşittir", async () => {
    const kpiInputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const kpis = computeTaisKpis(kpiInputs);

    const riskInputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(riskInputs);
    const overdueTaskRisks = risks.filter((r) => r.ruleId === "overdue_open_task");
    const totalFromRisks = overdueTaskRisks.reduce((sum, r) => sum + r.affectedCount, 0);

    expect(totalFromRisks).toBe(kpis.operations.overdueTaskCount);
    expect(totalFromRisks).toBeGreaterThan(0);
  });

  it("Analiz ekranının sahipsiz görev sayısı ile Riskler ekranının 'sahipsiz görev' risklerinin toplam etkilenen görev sayısı eşittir", async () => {
    const kpiInputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const kpis = computeTaisKpis(kpiInputs);

    const riskInputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(riskInputs);
    const unassignedRisks = risks.filter((r) => r.ruleId === "unassigned_task");
    const totalFromRisks = unassignedRisks.reduce((sum, r) => sum + r.affectedCount, 0);

    expect(totalFromRisks).toBe(kpis.operations.unassignedTaskCount);
  });

  it("Karar Merkezi ekranındaki TAIS kararları — hepsi 'decided' statüsünde ve tam 6 tanedir", async () => {
    const cases = await listCasesForOrg(orgId);
    const taisCases = cases.filter((c) => c.case.categoryId.startsWith("tais-decision:"));
    expect(taisCases).toHaveLength(6);
    expect(taisCases.every((c) => c.status === "decided")).toBe(true);
  });

  it("Aksiyonlar ekranındaki aksiyon sayısı — kararlardan üretilen toplam 12 aksiyonla eşleşir", async () => {
    const actions = await listActions(orgId);
    const taisDecisionIds = new Set(
      (await listCasesForOrg(orgId))
        .filter((c) => c.case.categoryId.startsWith("tais-decision:"))
        .map((c) => c.id)
    );
    const taisActions = actions.filter((a) => taisDecisionIds.has(a.case_id));
    expect(taisActions).toHaveLength(12);
  });

  it("Her aksiyon var olan bir riske bağlıdır; yetim aksiyon ve kırık öncelik zinciri yoktur", async () => {
    const riskInputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(riskInputs);
    const riskIds = new Set(risks.map((r) => r.id));

    const actions = await listActions(orgId);
    const withRisk = actions.filter((a) => a.related_risk_id !== null);
    expect(withRisk).toHaveLength(actions.length);
    for (const a of withRisk) {
      expect(riskIds.has(a.related_risk_id as string)).toBe(true);
    }
  });
});
