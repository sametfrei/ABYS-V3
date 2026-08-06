import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tais-decisions-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { seedTaisDemo, TAIS_REFERENCE_NOW } = await import("../src/lib/demo/tais/seed");
const { loadTaisRiskInputs, computeTaisRisks } = await import("../src/lib/demo/tais/risks");
const { buildTaisDecisionPlans, seedTaisDecisions } = await import("../src/lib/demo/tais/decisions");
const { createAction } = await import("../src/lib/db/repos/actions");

describe("TAIS karar+aksiyon zinciri", () => {
  let orgId: string;

  beforeAll(async () => {
    await migrate();
    const result = await seedTaisDemo();
    orgId = result.orgId;
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("saf plan uretici: her zaman tam olarak 6 karar ve toplam 12 aksiyon uretir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    const plans = buildTaisDecisionPlans(inputs, risks);

    expect(plans.length).toBe(6);
    const totalActions = plans.reduce((sum, p) => sum + p.actions.length, 0);
    expect(totalActions).toBe(12);

    for (const plan of plans) {
      expect(plan.case.options.length).toBe(3); // A/B/C alternatifleri
      expect(plan.case.recommendedOptionRank).toBe(1);
      expect(plan.case.counterfactual.narrative.length).toBeGreaterThan(0); // karar verilmezse sonuc
      expect(plan.case.evidence.length).toBeGreaterThan(0); // kanit zinciri
    }
  });

  it("ANA KARAR: Cleaning Team B / pest-control / yenileme temasi tasir ve 7 aksiyon uretir (3 transfer + 2 pest + 4->? kontrol)", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    const plans = buildTaisDecisionPlans(inputs, risks);
    const main = plans[0];

    expect(main.slug).toBe("cleaning-b-rebalance-pest-renewal");
    expect(main.case.title).toContain("Cleaning Team B");
    // Not: veri modelinde "Team C" yok; gercek ikinci temizlik ekibi Cleaning Team A'dir.
    expect(main.case.title).toContain("Cleaning Team A");
    expect(main.riskIds.length).toBeGreaterThan(0);
    const capacityRisk = risks.find(
      (risk) => risk.ruleId === "team_capacity_overload" && risk.title.includes("Cleaning Team B")
    );
    expect(capacityRisk).toBeDefined();
    expect(main.riskIds).toContain(capacityRisk!.id);
    expect(main.actions[0].relatedRiskId).toBe(capacityRisk!.id);
    const cleaningB = inputs.teams.find((team) => team.name === "Cleaning Team B");
    const riskBasedUtilization = Math.round((capacityRisk!.affectedCount / cleaningB!.capacity) * 100);
    expect(main.case.businessImpact).toContain(`%${riskBasedUtilization}`);
    // 1 gorev aktarim aksiyonu + 2 pest-control aksiyonu + 4 musteri takip aksiyonu = 7
    expect(main.actions.length).toBe(7);
  });

  it("ayni girdi icin ayni karar planlarini uretir (determinizm)", async () => {
    const inputsA = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risksA = computeTaisRisks(inputsA);
    const plansA = buildTaisDecisionPlans(inputsA, risksA);

    const inputsB = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risksB = computeTaisRisks(inputsB);
    const plansB = buildTaisDecisionPlans(inputsB, risksB);

    expect(plansA).toEqual(plansB);
  });

  it("seedTaisDecisions: karar-risk-aksiyon zinciri DB'de bagli (decision_cases -> decision_records -> actions)", async () => {
    const { decisions } = await seedTaisDecisions(orgId);
    expect(decisions.length).toBe(6);

    const totalActions = decisions.reduce((sum, d) => sum + d.actionIds.length, 0);
    expect(totalActions).toBe(12);

    const db = getDb();
    for (const d of decisions) {
      expect(d.caseId).toBeTruthy();
      expect(d.decisionId).toBeTruthy();
      expect(d.actionIds.length).toBeGreaterThan(0);

      // decision_records.case_id -> decision_cases.id
      const record = await db.query<{ case_id: string; org_id: string }>(
        "SELECT case_id, org_id FROM decision_records WHERE id = $1",
        [d.decisionId]
      );
      expect(record.rows.length).toBe(1);
      expect(record.rows[0].case_id).toBe(d.caseId);
      expect(record.rows[0].org_id).toBe(orgId);

      // decision_cases durumu 'decided' olmali (recordDecision tarafindan guncellenir)
      const caseRow = await db.query<{ status: string }>(
        "SELECT status FROM decision_cases WHERE id = $1",
        [d.caseId]
      );
      expect(caseRow.rows[0]?.status).toBe("decided");

      // actions.decision_id -> decision_records.id, actions.case_id -> decision_cases.id
      for (const actionId of d.actionIds) {
        const actionRow = await db.query<{ decision_id: string; case_id: string; owner: string; due_at: string | null }>(
          "SELECT decision_id, case_id, owner, due_at FROM actions WHERE id = $1",
          [actionId]
        );
        expect(actionRow.rows.length).toBe(1);
        expect(actionRow.rows[0].decision_id).toBe(d.decisionId);
        expect(actionRow.rows[0].case_id).toBe(d.caseId);
        expect(actionRow.rows[0].owner).toBeTruthy(); // sorumlu
        expect(actionRow.rows[0].due_at).toBeTruthy(); // son tarih
      }
    }
  });

  it("seedTaisDecisions idempotenttir: iki kez cagirinca ayni kararlar donulur, DB'de yeni satir olusmaz", async () => {
    const first = await seedTaisDecisions(orgId);
    const second = await seedTaisDecisions(orgId);

    expect(second.alreadySeeded).toBe(true);
    expect(second.decisions.map((d) => d.slug).sort()).toEqual(first.decisions.map((d) => d.slug).sort());
    expect(second.decisions.map((d) => d.caseId).sort()).toEqual(first.decisions.map((d) => d.caseId).sort());

    const db = getDb();
    const caseCount = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1 AND category_id LIKE 'tais-decision:%'",
      [orgId]
    );
    expect(caseCount.rows[0].n).toBe(6);

    const decisionIds = first.decisions.map((d) => d.decisionId);
    const actionCount = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM actions WHERE org_id = $1 AND decision_id = ANY($2)`,
      [orgId, decisionIds]
    );
    expect(actionCount.rows[0].n).toBe(12);
  });

  it("karar kaydi olmadan aksiyon olusturulamaz (FK zorunlulugu)", async () => {
    await expect(
      createAction({
        orgId,
        decisionId: "nonexistent-decision-id",
        caseId: "nonexistent-case-id",
        title: "Gecersiz aksiyon",
        owner: "Test",
      })
    ).rejects.toBeTruthy();
  });

  it("her aksiyonun bagli oldugu risk (varsa) planin riskIds kumesinde yer alir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    const plans = buildTaisDecisionPlans(inputs, risks);

    for (const plan of plans) {
      for (const action of plan.actions) {
        if (action.relatedRiskId) {
          expect(plan.riskIds).toContain(action.relatedRiskId);
        }
      }
    }
  });
});
