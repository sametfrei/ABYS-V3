import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tais-risks-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { seedTaisDemo, TAIS_REFERENCE_NOW } = await import("../src/lib/demo/tais/seed");
const { TAIS_CUSTOMER_NAMES } = await import("../src/lib/demo/tais/data");
const { loadTaisRiskInputs, computeTaisRisks } = await import("../src/lib/demo/tais/risks");
type TaisRiskInputs = import("../src/lib/demo/tais/risks").TaisRiskInputs;

/** Bos/notr bir TaisRiskInputs iskeleti — testler yalnizca ilgili alanlari doldurur. */
function baseInputs(overrides: Partial<TaisRiskInputs> = {}): TaisRiskInputs {
  return {
    referenceNow: TAIS_REFERENCE_NOW,
    teams: [],
    customers: [],
    locations: [],
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

describe("TAIS risk kurallari — birim testleri (sentetik girdi, DB'siz)", () => {
  it("hesaplanan tüm risklerin durumu merkezi ve deterministik olarak açıktır", () => {
    const risks = computeTaisRisks(baseInputs({
      teams: [{ id: "team1", name: "Cleaning Team B", category: "cleaning", capacity: 1 }],
      tasks: [
        {
          id: "t1",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: null,
          status: "open",
          dueAt: "2026-07-19T09:00:00.000Z",
          completedAt: null,
        },
      ],
    }));

    expect(risks.length).toBeGreaterThan(0);
    expect(risks.every((risk) => risk.status === "open")).toBe(true);
  });

  it("Kural 1: son tarihi gecmis acik gorev, musteri+lokasyon bazinda gruplanir ve kanit iceriri", () => {
    const inputs = baseInputs({
      customers: [{ id: "c1", name: "Musteri A" }],
      locations: [{ id: "l1", name: "Lokasyon 1", customerId: "c1", category: "cleaning" }],
      tasks: [
        {
          id: "t1",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: "e1",
          status: "open",
          dueAt: "2026-07-15T00:00:00.000Z",
          completedAt: null,
        },
        {
          id: "t2",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: "e1",
          status: "in_progress",
          dueAt: "2026-07-10T00:00:00.000Z",
          completedAt: null,
        },
      ],
    });
    const risks = computeTaisRisks(inputs);
    const risk = risks.find((r) => r.ruleId === "overdue_open_task");
    expect(risk).toBeDefined();
    expect(risk!.customerId).toBe("c1");
    expect(risk!.locationId).toBe("l1");
    expect(risk!.affectedCount).toBe(2);
    expect(risk!.evidence.map((e) => e.id).sort()).toEqual(["t1", "t2"]);
    expect(risk!.evidence.every((e) => e.type === "task")).toBe(true);
  });

  it("Kural 2: SLA suresine yaklasan gorev (48 saat penceresi icinde) tetiklenir, pencere disi tetiklenmez", () => {
    const withinWindow = baseInputs({
      customers: [{ id: "c1", name: "Musteri A" }],
      locations: [{ id: "l1", name: "Lokasyon 1", customerId: "c1", category: "cleaning" }],
      tasks: [
        {
          id: "t1",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: "e1",
          status: "open",
          dueAt: "2026-07-20T20:00:00.000Z", // referans 09:00, 11 saat sonra
          completedAt: null,
        },
      ],
    });
    const outsideWindow = baseInputs({
      customers: [{ id: "c1", name: "Musteri A" }],
      locations: [{ id: "l1", name: "Lokasyon 1", customerId: "c1", category: "cleaning" }],
      tasks: [
        {
          id: "t1",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: "e1",
          status: "open",
          dueAt: "2026-07-25T09:00:00.000Z", // 5 gun sonra, pencere disi
          completedAt: null,
        },
      ],
    });
    expect(computeTaisRisks(withinWindow).some((r) => r.ruleId === "sla_risk_task")).toBe(true);
    expect(computeTaisRisks(outsideWindow).some((r) => r.ruleId === "sla_risk_task")).toBe(false);
  });

  it("Kural 3: sorumlusu olmayan gorev ekip bazinda gruplanir", () => {
    const inputs = baseInputs({
      teams: [{ id: "team1", name: "Cleaning Team A", category: "cleaning", capacity: 30 }],
      tasks: [
        {
          id: "t1",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: null,
          status: "open",
          dueAt: "2026-08-01T00:00:00.000Z",
          completedAt: null,
        },
      ],
    });
    const risk = computeTaisRisks(inputs).find((r) => r.ruleId === "unassigned_task");
    expect(risk).toBeDefined();
    expect(risk!.customerId).toBeNull();
    expect(risk!.evidence).toEqual([{ type: "task", id: "t1" }]);
  });

  it("Kural 4: ayni ekipte asiri gorev yogunlugu (kapasite esigi asimi) esik alti tetiklenmez", () => {
    const overloaded = baseInputs({
      teams: [{ id: "team1", name: "Cleaning Team B", category: "cleaning", capacity: 2 }],
      tasks: [1, 2, 3].map((n) => ({
        id: `t${n}`,
        category: "cleaning" as const,
        teamId: "team1",
        locationId: "l1",
        customerId: "c1",
        employeeId: "e1",
        status: "open" as const,
        dueAt: "2026-08-01T00:00:00.000Z",
        completedAt: null,
      })),
    });
    const notOverloaded = baseInputs({
      teams: [{ id: "team1", name: "Cleaning Team B", category: "cleaning", capacity: 10 }],
      tasks: [1, 2].map((n) => ({
        id: `t${n}`,
        category: "cleaning" as const,
        teamId: "team1",
        locationId: "l1",
        customerId: "c1",
        employeeId: "e1",
        status: "open" as const,
        dueAt: "2026-08-01T00:00:00.000Z",
        completedAt: null,
      })),
    });
    expect(computeTaisRisks(overloaded).some((r) => r.ruleId === "team_capacity_overload")).toBe(true);
    expect(computeTaisRisks(notOverloaded).some((r) => r.ruleId === "team_capacity_overload")).toBe(false);
  });

  it("Kural 6: uzun sure guncellenmeyen deal (>=30 gun) tetiklenir, taze deal tetiklenmez", () => {
    const stale = baseInputs({
      customers: [{ id: "c1", name: "Musteri A" }],
      deals: [
        {
          id: "d1",
          customerId: "c1",
          category: "cleaning",
          stage: "negotiation",
          valueAzn: 10000,
          updatedAt: "2026-06-01T00:00:00.000Z", // ~49 gun once
        },
      ],
    });
    const fresh = baseInputs({
      customers: [{ id: "c1", name: "Musteri A" }],
      deals: [
        {
          id: "d1",
          customerId: "c1",
          category: "cleaning",
          stage: "negotiation",
          valueAzn: 10000,
          updatedAt: "2026-07-19T00:00:00.000Z", // 1 gun once
        },
      ],
    });
    expect(computeTaisRisks(stale).some((r) => r.ruleId === "stale_deal")).toBe(true);
    expect(computeTaisRisks(fresh).some((r) => r.ruleId === "stale_deal")).toBe(false);
  });

  it("Kural 9: ayni lokasyonda tekrar eden uygunsuzluk (>=2) tetiklenir", () => {
    const inputs = baseInputs({
      locations: [{ id: "l1", name: "Lokasyon 1", customerId: "c1", category: "cleaning" }],
      customers: [{ id: "c1", name: "Musteri A" }],
      qualityIssues: [
        { id: "q1", locationId: "l1", category: "cleaning", status: "open", openedAt: "2026-07-01T00:00:00.000Z" },
        { id: "q2", locationId: "l1", category: "cleaning", status: "resolved", openedAt: "2026-06-01T00:00:00.000Z" },
      ],
    });
    const risk = computeTaisRisks(inputs).find((r) => r.ruleId === "recurring_quality_issue");
    expect(risk).toBeDefined();
    expect(risk!.locationId).toBe("l1");
    expect(risk!.affectedCount).toBe(2);
  });

  it("Kural 10: veri kaynagindan belirli sure guncelleme gelmemesi (kategori bazinda) tetiklenir", () => {
    const inputs = baseInputs({
      tasks: [
        {
          id: "t1",
          category: "office_mgmt",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: "e1",
          status: "done",
          dueAt: "2026-06-01T00:00:00.000Z",
          completedAt: "2026-06-01T00:00:00.000Z", // ~49 gun once, DATA_STALE_DAYS(14) asildi
        },
      ],
    });
    const risk = computeTaisRisks(inputs).find((r) => r.ruleId === "stale_data_source");
    expect(risk).toBeDefined();
    expect(risk!.category).toBe("office_mgmt");
    expect(risk!.evidence).toEqual([{ type: "task", id: "t1" }]);
  });

  it("Kural 10: kategoride hic kayit yoksa risk uretilmez (degerlendirilemez)", () => {
    const risks = computeTaisRisks(baseInputs());
    expect(risks.some((r) => r.ruleId === "stale_data_source")).toBe(false);
  });

  it("Kural 11: hizmet talebi <-> gorev eslesmemesi (matchedTaskId null, acik) tetiklenir", () => {
    const inputs = baseInputs({
      customers: [{ id: "c1", name: "Musteri A" }],
      serviceRequests: [
        {
          id: "sr1",
          customerId: "c1",
          locationId: "l1",
          category: "catering",
          status: "open",
          matchedTaskId: null,
          openedAt: "2026-07-18T00:00:00.000Z",
        },
        {
          id: "sr2",
          customerId: "c1",
          locationId: "l1",
          category: "catering",
          status: "resolved",
          matchedTaskId: null,
          openedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    const risk = computeTaisRisks(inputs).find((r) => r.ruleId === "unmatched_service_request");
    expect(risk).toBeDefined();
    expect(risk!.affectedCount).toBe(1);
    expect(risk!.evidence).toEqual([{ type: "service_request", id: "sr1" }]);
  });

  it("Kural 12: kritik musteride (yuksek sozlesme degeri) yuksek gecikme orani tetiklenir, onemsiz musteride tetiklenmez", () => {
    const overdueTasks = (customerId: string) =>
      [1, 2, 3, 4].map((n) => ({
        id: `${customerId}-t${n}`,
        category: "cleaning" as const,
        teamId: "team1",
        locationId: "l1",
        customerId,
        employeeId: "e1",
        status: (n <= 3 ? "open" : "done") as "open" | "done",
        dueAt: n <= 3 ? "2026-07-01T00:00:00.000Z" : "2026-06-01T00:00:00.000Z",
        completedAt: n <= 3 ? null : "2026-06-01T00:00:00.000Z",
      }));
    const inputs = baseInputs({
      customers: [
        { id: "critical", name: "Kritik Musteri" },
        { id: "minor", name: "Kucuk Musteri" },
      ],
      contracts: [
        {
          id: "ct1",
          customerId: "critical",
          category: "cleaning",
          status: "active",
          valueAzn: 100000,
          renewalDate: "2027-01-01T00:00:00.000Z",
        },
        {
          id: "ct2",
          customerId: "minor",
          category: "cleaning",
          status: "active",
          valueAzn: 1000,
          renewalDate: "2027-01-01T00:00:00.000Z",
        },
      ],
      tasks: [...overdueTasks("critical"), ...overdueTasks("minor")],
    });
    const risks = computeTaisRisks(inputs).filter((r) => r.ruleId === "high_delay_critical_customer");
    expect(risks.some((r) => r.customerId === "critical")).toBe(true);
    expect(risks.some((r) => r.customerId === "minor")).toBe(false);
  });

  it("skor 0-100 araligindadir ve siddet bandiyla tutarlidir", () => {
    const inputs = baseInputs({
      teams: [{ id: "team1", name: "Ekip", category: "cleaning", capacity: 1 }],
      tasks: [1, 2, 3, 4, 5].map((n) => ({
        id: `t${n}`,
        category: "cleaning" as const,
        teamId: "team1",
        locationId: "l1",
        customerId: "c1",
        employeeId: "e1",
        status: "open" as const,
        dueAt: "2026-06-01T00:00:00.000Z",
        completedAt: null,
      })),
    });
    const risks = computeTaisRisks(inputs);
    expect(risks.length).toBeGreaterThan(0);
    for (const r of risks) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      if (r.score >= 70) expect(r.severity).toBe("critical");
      else if (r.score >= 40) expect(r.severity).toBe("warning");
      else expect(r.severity).toBe("info");
    }
  });

  it("her risk en az bir kanit kaydina baglidir", () => {
    const inputs = baseInputs({
      teams: [{ id: "team1", name: "Ekip", category: "cleaning", capacity: 1 }],
      customers: [{ id: "c1", name: "Musteri A" }],
      locations: [{ id: "l1", name: "Lokasyon 1", customerId: "c1", category: "cleaning" }],
      tasks: [
        {
          id: "t1",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: null,
          status: "open",
          dueAt: "2026-06-01T00:00:00.000Z",
          completedAt: null,
        },
      ],
    });
    const risks = computeTaisRisks(inputs);
    expect(risks.length).toBeGreaterThan(0);
    for (const r of risks) {
      expect(r.evidence.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("sonuc listesi skora gore azalan sirada (deterministik siralama)", () => {
    const inputs = baseInputs({
      teams: [
        { id: "team1", name: "Ekip 1", category: "cleaning", capacity: 1 },
        { id: "team2", name: "Ekip 2", category: "catering", capacity: 100 },
      ],
      customers: [{ id: "c1", name: "Musteri A" }],
      locations: [{ id: "l1", name: "Lokasyon 1", customerId: "c1", category: "cleaning" }],
      tasks: [
        {
          id: "t1",
          category: "cleaning",
          teamId: "team1",
          locationId: "l1",
          customerId: "c1",
          employeeId: null,
          status: "open",
          dueAt: "2026-06-01T00:00:00.000Z",
          completedAt: null,
        },
        {
          id: "t2",
          category: "catering",
          teamId: "team2",
          locationId: "l1",
          customerId: "c1",
          employeeId: "e1",
          status: "open",
          dueAt: "2026-07-19T12:00:00.000Z",
          completedAt: null,
        },
      ],
    });
    const risks = computeTaisRisks(inputs);
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i - 1].score).toBeGreaterThanOrEqual(risks[i].score);
    }
  });

  it("ayni girdi icin ayni riskleri ve ayni sirayi uretir (determinizm)", () => {
    const inputs = baseInputs({
      teams: [{ id: "team1", name: "Ekip", category: "cleaning", capacity: 1 }],
      tasks: [1, 2].map((n) => ({
        id: `t${n}`,
        category: "cleaning" as const,
        teamId: "team1",
        locationId: "l1",
        customerId: "c1",
        employeeId: null,
        status: "open" as const,
        dueAt: "2026-06-01T00:00:00.000Z",
        completedAt: null,
      })),
    });
    expect(computeTaisRisks(inputs)).toEqual(computeTaisRisks(inputs));
  });
});

describe("TAIS risk kurallari — seed verisiyle entegrasyon (deterministik senaryo kancalari)", () => {
  let orgId: string;

  beforeAll(async () => {
    await migrate();
    const result = await seedTaisDemo();
    orgId = result.orgId;
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("ayni girdi icin ayni risk anlik goruntusunu uretir (determinizm)", async () => {
    const inputsA = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const inputsB = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    expect(computeTaisRisks(inputsA)).toEqual(computeTaisRisks(inputsB));
  });

  it("senaryo: Cleaning Team B kapasite asimi riski uretilir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    const cleaningB = inputs.teams.find((t) => t.name === "Cleaning Team B");
    expect(cleaningB).toBeDefined();
    expect(risks.some((r) => r.ruleId === "team_capacity_overload" && r.id.includes(cleaningB!.id))).toBe(true);
  });

  it("senaryo: pest control icin gecikmis periyodik hizmet riski uretilir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    expect(risks.some((r) => r.ruleId === "overdue_periodic_service" && r.category === "pest_control")).toBe(true);
  });

  it("senaryo: tekrar eden sikayetli musteri (index 5) icin recurring_complaint riski uretilir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    const customerId = inputs.customers.find((c) => c.name === TAIS_CUSTOMER_NAMES[5])?.id;
    expect(customerId).toBeDefined();
    expect(risks.some((r) => r.ruleId === "recurring_complaint" && r.customerId === customerId)).toBe(true);
  });

  it("senaryo: aktivitesiz + yenilemesi yaklasan musteri (index 19) icin renewal_without_activity riski uretilir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    const customerId = inputs.customers.find((c) => c.name === TAIS_CUSTOMER_NAMES[19])?.id;
    expect(customerId).toBeDefined();
    expect(risks.some((r) => r.ruleId === "renewal_without_activity" && r.customerId === customerId)).toBe(true);
  });

  it("senaryo: hicbir hizmet talebi bir goreve eslenmedigi icin unmatched_service_request riski uretilir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    expect(risks.some((r) => r.ruleId === "unmatched_service_request")).toBe(true);
  });

  it("her risk en az bir kanit kaydina bagli ve gecerli bir kural id'sine sahiptir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    expect(risks.length).toBeGreaterThan(0);
    for (const r of risks) {
      expect(r.evidence.length).toBeGreaterThanOrEqual(1);
      expect(typeof r.ruleId).toBe("string");
    }
  });

  it("risk listesi skora gore azalan sirada dizilidir", async () => {
    const inputs = await loadTaisRiskInputs(orgId, TAIS_REFERENCE_NOW);
    const risks = computeTaisRisks(inputs);
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i - 1].score).toBeGreaterThanOrEqual(risks[i].score);
    }
  });
});
