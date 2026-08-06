import { describe, expect, it } from "vitest";
import { answerTaisQuestion } from "../src/lib/demo/tais/ask";
import { TAIS_REFERENCE_NOW } from "../src/lib/demo/tais/seed";
import type { TaisKpiInputs } from "../src/lib/demo/tais/kpi";
import type { TaisRiskInputs } from "../src/lib/demo/tais/risks";
import type { TaisDecisionMeta } from "../src/lib/demo/tais/executive-summary";
import type { AiDecisionCase } from "../src/lib/ai/provider";

/**
 * TAIS "Ask ABYS tutarlılığı" (kuyruk maddesi) — sentetik girdi, DB'siz birim
 * testleri. `answerTaisQuestion` SAF olduğu için (bkz. ask.ts sözleşmesi)
 * gerçek DB/seed'e ihtiyaç yok; senaryo burada elle kurulur.
 */

const CUSTOMERS = [
  { id: "c1", name: "Musteri A" },
  { id: "c2", name: "Musteri B" },
];
const LOCATIONS = [
  { id: "l1", name: "Lokasyon 1", customerId: "c1", category: "cleaning" as const },
  { id: "l2", name: "Lokasyon 2", customerId: "c2", category: "pest_control" as const },
  { id: "l3", name: "Lokasyon 3", customerId: "c1", category: "catering" as const },
];
const TEAMS = [
  { id: "team-clean-b", name: "Cleaning Team B", category: "cleaning" as const, capacity: 2 },
  { id: "team-clean-a", name: "Cleaning Team A", category: "cleaning" as const, capacity: 10 },
  { id: "team-pest", name: "Pest Control Team", category: "pest_control" as const, capacity: 5 },
  { id: "team-catering", name: "Catering Team", category: "catering" as const, capacity: 5 },
];

const OVERDUE_DUE = "2026-07-15T00:00:00.000Z"; // referans 2026-07-20 — 5 gun once
const SLA_SOON_DUE = "2026-07-20T20:00:00.000Z"; // referans 09:00 — 11 saat sonra

function kpiInputs(overrides: Partial<TaisKpiInputs> = {}): TaisKpiInputs {
  return {
    referenceNow: TAIS_REFERENCE_NOW,
    teams: TEAMS,
    customerCount: CUSTOMERS.length,
    tasks: [],
    contracts: [],
    deals: [],
    leads: [],
    activities: [],
    complaints: [],
    qualityIssues: [],
    ...overrides,
  };
}

function riskInputs(overrides: Partial<TaisRiskInputs> = {}): TaisRiskInputs {
  return {
    referenceNow: TAIS_REFERENCE_NOW,
    teams: TEAMS,
    customers: CUSTOMERS,
    locations: LOCATIONS,
    tasks: [],
    contracts: [],
    deals: [],
    activities: [],
    complaints: [],
    qualityIssues: [],
    serviceRequests: [],
    ...overrides,
  };
}

// Ortak senaryo: 3 gecikmiş cleaning görevi (aynı zamanda team-clean-b'yi kapasite
// eşiğinin (0.85) üzerine çıkarır), 1 gecikmiş pest_control görevi, catering'de
// SLA penceresine giren 1 görev, c1 için 30 gün içinde yenilenecek sözleşme,
// c2 için 40 gündür güncellenmemiş açık fırsat, l1'de tekrarlanan 2 şikâyet.
const TASKS = [
  { id: "t1", category: "cleaning" as const, teamId: "team-clean-b", locationId: "l1", customerId: "c1", employeeId: "e1", status: "open" as const, dueAt: OVERDUE_DUE, completedAt: null },
  { id: "t2", category: "cleaning" as const, teamId: "team-clean-b", locationId: "l1", customerId: "c1", employeeId: "e1", status: "open" as const, dueAt: OVERDUE_DUE, completedAt: null },
  { id: "t3", category: "cleaning" as const, teamId: "team-clean-b", locationId: "l1", customerId: "c1", employeeId: "e1", status: "open" as const, dueAt: OVERDUE_DUE, completedAt: null },
  { id: "t4", category: "pest_control" as const, teamId: "team-pest", locationId: "l2", customerId: "c2", employeeId: "e2", status: "open" as const, dueAt: OVERDUE_DUE, completedAt: null },
  { id: "t5", category: "catering" as const, teamId: "team-catering", locationId: "l3", customerId: "c1", employeeId: "e3", status: "open" as const, dueAt: SLA_SOON_DUE, completedAt: null },
];

const CONTRACTS = [
  { id: "ct1", customerId: "c1", category: "cleaning" as const, status: "active", valueAzn: 10000, renewalDate: "2026-08-05T00:00:00.000Z" },
];
const DEALS = [
  { id: "d1", customerId: "c2", category: "pest_control" as const, stage: "negotiation" as const, valueAzn: 5000, updatedAt: "2026-06-10T00:00:00.000Z" },
];
const COMPLAINTS = [
  { id: "cp1", customerId: "c1", locationId: "l1", category: "cleaning" as const, status: "open", openedAt: "2026-07-10T00:00:00.000Z" },
  { id: "cp2", customerId: "c1", locationId: "l1", category: "cleaning" as const, status: "open", openedAt: "2026-07-12T00:00:00.000Z" },
];

const FULL_KPI_INPUTS = kpiInputs({ tasks: TASKS, contracts: CONTRACTS, deals: DEALS, complaints: COMPLAINTS });
const FULL_RISK_INPUTS = riskInputs({ tasks: TASKS, contracts: CONTRACTS, deals: DEALS, complaints: COMPLAINTS });

function ask(question: string, decisions: TaisDecisionMeta[] = []) {
  return answerTaisQuestion({
    question,
    kpiInputs: FULL_KPI_INPUTS,
    riskInputs: FULL_RISK_INPUTS,
    decisions,
    referenceNow: TAIS_REFERENCE_NOW,
  });
}

describe("TAIS Ask ABYS — deterministik soru eşleme (12 senaryo)", () => {
  it("1) bugün en kritik operasyonel risk nedir", () => {
    const r = ask("Bugün en kritik operasyonel risk nedir?");
    expect(r).not.toBeNull();
    expect(r!.statements.length).toBeGreaterThan(0);
    expect(r!.sources.length).toBeGreaterThan(0);
    expect(r!.answer).toMatch(/kritik operasyonel riski/);
  });

  it("2) hangi hizmet görevleri gecikiyor", () => {
    const r = ask("Hangi hizmet görevleri gecikiyor?");
    expect(r).not.toBeNull();
    expect(r!.answer).toContain("4"); // t1,t2,t3,t4 gecikmis (t5 henuz gecmemis)
    expect(r!.sources.map((s) => s.ref).sort()).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("3) hangi ekipte kapasite problemi var", () => {
    const r = ask("Hangi ekipte kapasite problemi var?");
    expect(r).not.toBeNull();
    expect(r!.answer).toContain("Cleaning Team B");
    expect(r!.sources.some((s) => s.title.includes("Cleaning Team B"))).toBe(true);
  });

  it("4) hangi müşterilerde SLA riski var", () => {
    const r = ask("Hangi müşterilerde SLA riski var?");
    expect(r).not.toBeNull();
    expect(r!.answer).toMatch(/SLA riski/);
    expect(r!.sources.length).toBeGreaterThan(0);
  });

  it("5) yenileme tarihi yaklaşan müşteriler", () => {
    const r = ask("Yenileme tarihi yaklaşan müşteriler kimler?");
    expect(r).not.toBeNull();
    expect(r!.answer).toContain("1 sözleşme");
    expect(r!.statements[0].text).toContain("Musteri A");
  });

  it("6) hangi satış fırsatlarında takip gecikmiş", () => {
    const r = ask("Hangi satış fırsatlarında takip gecikmiş?");
    expect(r).not.toBeNull();
    expect(r!.answer).toMatch(/takip gecikmiş/);
  });

  it("7) hangi lokasyonda şikâyet artışı var", () => {
    const r = ask("Hangi lokasyonda şikâyet artışı var?");
    expect(r).not.toBeNull();
    expect(r!.sources.length).toBeGreaterThan(0);
  });

  it("8) pest control görevleri gecikti mi", () => {
    const r = ask("Hangi pest-control görevleri gecikti?");
    expect(r).not.toBeNull();
    expect(r!.sources.map((s) => s.ref)).toEqual(["t4"]);
  });

  it("9) catering'de bugün risk var mı — risk varsa gösterilir", () => {
    const r = ask("Catering'de bugün risk var mı?");
    expect(r).not.toBeNull();
    expect(r!.answer).toMatch(/Catering/);
  });

  it("9b) catering'de risk yoksa dürüstçe 'yok' der (uydurma yok)", () => {
    const noRiskKpi = kpiInputs({ tasks: TASKS.filter((t) => t.id !== "t5"), contracts: CONTRACTS, deals: DEALS, complaints: COMPLAINTS });
    const noRiskRisks = riskInputs({ tasks: TASKS.filter((t) => t.id !== "t5"), contracts: CONTRACTS, deals: DEALS, complaints: COMPLAINTS });
    const r = answerTaisQuestion({
      question: "Catering'de bugün risk var mı?",
      kpiInputs: noRiskKpi,
      riskInputs: noRiskRisks,
      decisions: [],
      referenceNow: TAIS_REFERENCE_NOW,
    });
    expect(r).not.toBeNull();
    expect(r!.answer).toMatch(/risk kaydı yok/);
    expect(r!.sources).toEqual([]);
  });

  it("10) yönetimin bugün vermesi gereken karar — bağlı risk varsa seçilir", () => {
    const overdueRiskId = "overdue_open_task:c1:l1";
    const decisions: TaisDecisionMeta[] = [
      {
        caseId: "case1",
        decisionId: "dec1",
        state: "approved",
        riskIds: [overdueRiskId],
        case: {
          categoryId: "tais-decision:test",
          categoryLabel: "Test",
          severity: "critical",
          title: "Gecikmiş görevleri önceliklendir",
          businessImpact: "Müşteri memnuniyetsizliği riski.",
          confidence: 80,
          confidenceRationale: "3 gecikmiş görev kaydına dayanıyor.",
          evidence: [],
          assumptions: [],
          historicalComparison: "",
          counterfactual: { narrative: "", projectedImpact: "", timeHorizon: "" },
          options: [
            { title: "Yeniden ata", detail: "Sorumlu ata.", feasible: true, feasibilityNote: "", tradeoffs: "", expectedOutcome: "", rank: 1 },
          ],
          recommendedOptionRank: 1,
        } as AiDecisionCase,
      },
    ];
    const r = ask("Yönetimin bugün vermesi gereken karar nedir?", decisions);
    expect(r).not.toBeNull();
    expect(r!.answer).toContain("Gecikmiş görevleri önceliklendir");
    expect(r!.sources[0].ref).toBe("case1");
  });

  it("10b) hiçbir karar açık risklerle eşleşmiyorsa uydurma yapmaz", () => {
    const decisions: TaisDecisionMeta[] = [
      {
        caseId: "case1",
        decisionId: "dec1",
        state: "approved",
        riskIds: ["no-such-risk"],
        case: {} as AiDecisionCase,
      },
    ];
    const r = ask("Yönetimin bugün vermesi gereken karar nedir?", decisions);
    expect(r).not.toBeNull();
    expect(r!.answer).toMatch(/ana karar yok/);
  });

  it("11) riski azaltmak için hangi görevler yeniden dağıtılmalı", () => {
    const r = ask("Riski azaltmak için hangi görevler yeniden dağıtılmalı?");
    expect(r).not.toBeNull();
    expect(r!.answer).toContain("Cleaning Team B");
    expect(r!.answer).toContain("Cleaning Team A");
  });

  it("12) TAIS'in genel operasyon sağlığı", () => {
    const r = ask("TAIS'in genel operasyon sağlığı nasıl?");
    expect(r).not.toBeNull();
    expect(r!.statements.some((s) => s.text.includes("Operasyon sağlık skoru"))).toBe(true);
    expect(r!.statements.some((s) => s.text.includes("SLA uyum oranı"))).toBe(true);
  });

  it("eşleşmeyen soru için null döner (çağıran genel Ask ABYS akışına devam eder)", () => {
    const r = ask("Bugün hava nasıl?");
    expect(r).toBeNull();
  });

  it("veri yoksa (boş kapsam) hiçbir sayı uydurmaz", () => {
    const empty = kpiInputs();
    const emptyRisk = riskInputs();
    const r = answerTaisQuestion({
      question: "Hangi hizmet görevleri gecikiyor?",
      kpiInputs: empty,
      riskInputs: emptyRisk,
      decisions: [],
      referenceNow: TAIS_REFERENCE_NOW,
    });
    expect(r).not.toBeNull();
    expect(r!.answer).toMatch(/yok/);
    expect(r!.sources).toEqual([]);
  });
});
