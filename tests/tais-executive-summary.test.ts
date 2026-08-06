import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tais-exec-summary-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { seedTaisDemo, TAIS_REFERENCE_NOW } = await import("../src/lib/demo/tais/seed");
const { loadTaisKpiInputs } = await import("../src/lib/demo/tais/kpi");
const { loadTaisRiskInputs, computeTaisRisks } = await import("../src/lib/demo/tais/risks");
const {
  filterExecutiveInputs,
  computeServiceAreaStatuses,
  selectTopRisks,
  pickMainDecision,
  selectTopActions,
  buildExecutiveBrief,
  healthLevel,
  RANGE_WINDOW_DAYS,
} = await import("../src/lib/demo/tais/executive-summary");
const { computeTaisKpis } = await import("../src/lib/demo/tais/kpi");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await getDb().close();
});

describe("TAIS yönetici ekranı — filtreleme ve seçim (deterministik, saf fonksiyonlar)", () => {
  let kpiInputsFull: Awaited<ReturnType<typeof loadTaisKpiInputs>>;
  let riskInputsFull: Awaited<ReturnType<typeof loadTaisRiskInputs>>;

  beforeAll(async () => {
    const { orgId } = await seedTaisDemo();
    kpiInputsFull = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    riskInputsFull = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
  });

  it("RANGE_WINDOW_DAYS artan sıradadır (today < 7d < 30d)", () => {
    expect(RANGE_WINDOW_DAYS.today).toBeLessThan(RANGE_WINDOW_DAYS["7d"]);
    expect(RANGE_WINDOW_DAYS["7d"]).toBeLessThan(RANGE_WINDOW_DAYS["30d"]);
  });

  it("'today' penceresi 'today' ⊆ '7d' ⊆ '30d' — ileri dönük görev sayısı azalan/eşit sırayla artar", () => {
    const filtersToday = { range: "today" as const, category: null, customerId: null, locationId: null };
    const filters7d = { range: "7d" as const, category: null, customerId: null, locationId: null };
    const filters30d = { range: "30d" as const, category: null, customerId: null, locationId: null };

    const today = filterExecutiveInputs(kpiInputsFull, riskInputsFull, filtersToday);
    const d7 = filterExecutiveInputs(kpiInputsFull, riskInputsFull, filters7d);
    const d30 = filterExecutiveInputs(kpiInputsFull, riskInputsFull, filters30d);

    expect(today.kpiInputs.tasks.length).toBeLessThanOrEqual(d7.kpiInputs.tasks.length);
    expect(d7.kpiInputs.tasks.length).toBeLessThanOrEqual(d30.kpiInputs.tasks.length);
    // gecikmis (dueAt < referenceNow) gorevler her pencerede aynen kalir
    const overdueToday = today.kpiInputs.tasks.filter(
      (t) => new Date(t.dueAt).getTime() < new Date(TAIS_REFERENCE_NOW).getTime()
    ).length;
    const overdue30d = d30.kpiInputs.tasks.filter(
      (t) => new Date(t.dueAt).getTime() < new Date(TAIS_REFERENCE_NOW).getTime()
    ).length;
    expect(overdueToday).toBe(overdue30d);
  });

  it("30 günlük rapor özetindeki aktif/geciken görevler kategori tablosunun toplamlarıyla aynıdır", () => {
    const { kpiInputs } = filterExecutiveInputs(kpiInputsFull, riskInputsFull, {
      range: "30d",
      category: null,
      customerId: null,
      locationId: null,
    });
    const kpis = computeTaisKpis(kpiInputs);
    const tableOpenTotal = kpis.operations.tasksByCategory.reduce((sum, row) => sum + row.open, 0);
    const tableOverdueTotal = kpis.operations.tasksByCategory.reduce((sum, row) => sum + row.overdue, 0);

    expect(tableOpenTotal).toBe(kpis.operations.activeTaskCount);
    expect(tableOverdueTotal).toBe(kpis.operations.overdueTaskCount);
  });

  it("kategori filtresi yalnızca o kategorideki ekip/görev/lokasyonları bırakır", () => {
    const filters = { range: "30d" as const, category: "pest_control" as const, customerId: null, locationId: null };
    const { kpiInputs, riskInputs } = filterExecutiveInputs(kpiInputsFull, riskInputsFull, filters);
    expect(kpiInputs.teams.every((t) => t.category === "pest_control")).toBe(true);
    expect(kpiInputs.tasks.every((t) => t.category === "pest_control")).toBe(true);
    expect(riskInputs.locations.every((l) => l.category === "pest_control")).toBe(true);
    expect(kpiInputs.tasks.length).toBeGreaterThan(0);
  });

  it("müşteri filtresi yalnızca o müşteriye ait kayıtları bırakır ve customerCount=1 olur", () => {
    const someCustomerId = riskInputsFull.customers[5].id;
    const filters = { range: "30d" as const, category: null, customerId: someCustomerId, locationId: null };
    const { kpiInputs, riskInputs } = filterExecutiveInputs(kpiInputsFull, riskInputsFull, filters);
    expect(kpiInputs.customerCount).toBe(1);
    expect(kpiInputs.tasks.every((t) => t.customerId === someCustomerId)).toBe(true);
    expect(riskInputs.customers.every((c) => c.id === someCustomerId)).toBe(true);
  });

  it("computeServiceAreaStatuses 6 hizmet alanının tümünü döner, en kritik ilk sırada", () => {
    const areas = computeServiceAreaStatuses(kpiInputsFull, riskInputsFull, {
      range: "30d",
      customerId: null,
      locationId: null,
    });
    expect(areas).toHaveLength(6);
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i - 1].healthScore).toBeLessThanOrEqual(areas[i].healthScore);
    }
  });

  it("selectTopRisks ilk N riski (zaten skora göre sıralı) döner", () => {
    const risks = computeTaisRisks(riskInputsFull);
    const top = selectTopRisks(risks, 3);
    expect(top).toHaveLength(3);
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
    expect(top[1].score).toBeGreaterThanOrEqual(top[2].score);
  });

  it("healthLevel eşikleri doğru sınıflandırır", () => {
    expect(healthLevel(39)).toBe("critical");
    expect(healthLevel(40)).toBe("attention");
    expect(healthLevel(69)).toBe("attention");
    expect(healthLevel(70)).toBe("normal");
    expect(healthLevel(100)).toBe("normal");
  });
});

describe("TAIS yönetici ekranı — karar/aksiyon seçimi (sentetik girdi, DB gerektirmez)", () => {
  const baseCase = {
    categoryLabel: "Test",
    confidence: 80,
    confidenceRationale: "test",
    evidence: [
      { source: "a", fact: "a", reliability: "verified" as const },
      { source: "b", fact: "b", reliability: "verified" as const },
    ],
    assumptions: [],
    historicalComparison: "-",
    counterfactual: { narrative: "n", projectedImpact: "p", timeHorizon: "t" },
    options: [],
    recommendedOptionRank: 1,
  };

  it("pickMainDecision en çok risk kesişimi olan kararı seçer", () => {
    const decisions = [
      {
        caseId: "case-1",
        decisionId: "dec-1",
        state: "approved",
        riskIds: ["r1", "r2"],
        case: { ...baseCase, categoryId: "tais-decision:a", severity: "warning" as const, title: "Karar A", businessImpact: "x" },
      },
      {
        caseId: "case-2",
        decisionId: "dec-2",
        state: "approved",
        riskIds: ["r3"],
        case: { ...baseCase, categoryId: "tais-decision:b", severity: "critical" as const, title: "Karar B", businessImpact: "y" },
      },
    ];
    const filteredRiskIds = new Set(["r1", "r2", "r3"]);
    const picked = pickMainDecision(decisions, filteredRiskIds);
    expect(picked?.decisionId).toBe("dec-1");
    expect(picked?.matchedRiskCount).toBe(2);
  });

  it("pickMainDecision hiçbir risk kesişmezse null döner", () => {
    const decisions = [
      {
        caseId: "case-1",
        decisionId: "dec-1",
        state: "approved",
        riskIds: ["r1"],
        case: { ...baseCase, categoryId: "tais-decision:a", severity: "warning" as const, title: "Karar A", businessImpact: "x" },
      },
    ];
    expect(pickMainDecision(decisions, new Set(["r9"]))).toBeNull();
  });

  it("selectTopActions ilişkili risk id'siyle veya ana karara bağlılıkla kapsam-içi sayar", () => {
    const actions = [
      { id: "a1", decisionId: "d1", caseId: "c1", title: "A1", owner: "x", dueAt: null, status: "open", relatedRiskId: "r1" },
      { id: "a2", decisionId: "d2", caseId: "c2", title: "A2", owner: "x", dueAt: null, status: "open", relatedRiskId: "r-out-of-scope" },
      { id: "a3", decisionId: "d1", caseId: "c1", title: "A3", owner: "x", dueAt: null, status: "open", relatedRiskId: null },
      { id: "a4", decisionId: "d3", caseId: "c3", title: "A4", owner: "x", dueAt: null, status: "open", relatedRiskId: null },
    ];
    const result = selectTopActions(actions, new Set(["r1"]), "d1", 3);
    expect(result.map((a) => a.id)).toEqual(["a1", "a3"]);
  });

  it("buildExecutiveBrief gerçek seed verisiyle 80-120 kelime aralığına yakın, tamamen sayısal veriye dayalı metin üretir", async () => {
    const { orgId } = await seedTaisDemo();
    const kpiInputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const riskInputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const kpis = computeTaisKpis(kpiInputs);
    const risks = computeTaisRisks(riskInputs);
    const topRisks = selectTopRisks(risks, 3);

    const brief = buildExecutiveBrief({ range: "30d", kpis, topRisks, main: null, actionCount: 3 });
    const wordCount = brief.trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(60);
    expect(wordCount).toBeLessThanOrEqual(140);
    expect(brief).toContain(`%${kpis.management.operationsHealthScore}`);
    expect(brief).toContain(`%${kpis.management.slaComplianceRatePct}`);
  });

  it("buildExecutiveBrief boş kapsamda (risk/karar yok) çökmeden anlamlı metin üretir", async () => {
    const { orgId } = await seedTaisDemo();
    const kpiInputs = await loadTaisKpiInputs(orgId, TAIS_REFERENCE_NOW);
    const kpis = computeTaisKpis(kpiInputs);
    const brief = buildExecutiveBrief({ range: "today", kpis, topRisks: [], main: null, actionCount: 0 });
    expect(brief).toContain("öne çıkan bir risk kaydı bulunmuyor");
    expect(brief).toContain("öncelikli bir yönetici kararı bulunmuyor");
    expect(brief).toContain("açık önerilen aksiyon yok");
  });
});
