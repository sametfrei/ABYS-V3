import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * client.ts DB_DIR'i modül üst seviyesinde okur. Statik importlar, dosyadaki
 * konumlarından bağımsız olarak modülün geri kalanından önce değerlendirilir;
 * bu yüzden db'ye dokunan her şey dinamik import ile ve bu satırdan SONRA
 * yüklenir. Kendi geçici dizini kullanır ki dev sunucunun .data/abys-db
 * kilidiyle veya diğer test dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-tenant-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { insertCases, listCasesForOrg, recordDecision, updateDecisionState } = await import(
  "../src/lib/db/repos/decisions"
);
const { insertLink, listLinks, updateStatus } = await import("../src/lib/db/repos/causal");
const { insertDocument, listDocuments } = await import("../src/lib/db/repos/documents");
const { createAction, listActions, updateAction } = await import("../src/lib/db/repos/actions");

function makeCase(title: string) {
  return {
    categoryId: "risk",
    categoryLabel: "Risk",
    severity: "warning" as const,
    title,
    businessImpact: "Test etkisi",
    confidence: 70,
    confidenceRationale: "Test gerekçesi, en az otuz karakter olacak şekilde yazıldı.",
    evidence: [{ source: "test", fact: "test kanıtı", reliability: "verified" as const }],
    assumptions: [],
    historicalComparison: "Test karşılaştırması",
    counterfactual: { narrative: "n/a", projectedImpact: "n/a", timeHorizon: "n/a" },
    options: [
      {
        title: "Seçenek 1",
        detail: "detay",
        feasible: true,
        feasibilityNote: "uygulanabilir",
        tradeoffs: "yok",
        expectedOutcome: "iyileşme",
        rank: 1,
      },
    ],
    recommendedOptionRank: 1,
  };
}

describe("tenant (org) izolasyonu", () => {
  const orgA = randomBytes(8).toString("hex");
  const orgB = randomBytes(8).toString("hex");
  let caseA: string;
  let caseB: string;
  let decisionA: string;
  let decisionB: string;
  let linkB: string;
  let actionB: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgA,
      "Org A",
      "aviation",
    ]);
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgB,
      "Org B",
      "aviation",
    ]);

    const [storedA] = await insertCases(orgA, "aviation", [makeCase("Org A vakası")]);
    const [storedB] = await insertCases(orgB, "aviation", [makeCase("Org B vakası")]);
    caseA = storedA.id;
    caseB = storedB.id;

    decisionA = await recordDecision({
      orgId: orgA,
      caseId: caseA,
      sectorId: "aviation",
      choice: "accepted",
      decidedBy: "test-a",
      payload: { reason: "org A kararı" },
    });
    decisionB = await recordDecision({
      orgId: orgB,
      caseId: caseB,
      sectorId: "aviation",
      choice: "accepted",
      decidedBy: "test-b",
      payload: { reason: "org B kararı" },
    });

    await insertLink({
      orgId: orgA,
      caseId: caseA,
      fromLabel: "A sebebi",
      toLabel: "A sonucu",
      confidence: 60,
      createdBy: "test-a",
    });
    linkB = await insertLink({
      orgId: orgB,
      caseId: caseB,
      fromLabel: "B sebebi",
      toLabel: "B sonucu",
      confidence: 60,
      createdBy: "test-b",
    });

    await insertDocument({
      orgId: orgA,
      title: "Org A belgesi",
      sourceType: "txt",
      text: "org a içerik gizli-a-anahtar-kelime",
      uploadedBy: "test-a",
    });
    await insertDocument({
      orgId: orgB,
      title: "Org B belgesi",
      sourceType: "txt",
      text: "org b içerik gizli-b-anahtar-kelime",
      uploadedBy: "test-b",
    });

    await createAction({
      orgId: orgA,
      decisionId: decisionA,
      caseId: caseA,
      title: "Org A aksiyonu",
      owner: "test-a",
    });
    actionB = await createAction({
      orgId: orgB,
      decisionId: decisionB,
      caseId: caseB,
      title: "Org B aksiyonu",
      owner: "test-b",
    });
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("listCasesForOrg orgB kaydını asla döndürmez", async () => {
    const casesA = await listCasesForOrg(orgA);
    expect(casesA.some((c) => c.id === caseB)).toBe(false);
    expect(casesA.some((c) => c.case.title === "Org B vakası")).toBe(false);
    expect(casesA.some((c) => c.id === caseA)).toBe(true);
  });

  it("listLinks orgB'nin bağlantısını asla döndürmez", async () => {
    const linksA = await listLinks(orgA, caseA);
    expect(linksA.some((l) => l.id === linkB)).toBe(false);
    expect(linksA.map((l) => l.fromLabel)).toContain("A sebebi");
  });

  it("listDocuments orgB'nin belgesini asla döndürmez", async () => {
    const docsA = (await listDocuments(orgA, "ceo")) as { title: string }[];
    expect(docsA.some((d) => d.title === "Org B belgesi")).toBe(false);
    expect(docsA.some((d) => d.title === "Org A belgesi")).toBe(true);
  });

  it("listActions orgB'nin aksiyonunu asla döndürmez", async () => {
    const actionsA = await listActions(orgA);
    expect(actionsA.some((a) => a.id === actionB)).toBe(false);
    expect(actionsA.some((a) => a.title === "Org A aksiyonu")).toBe(true);
  });

  it("orgA, orgB'ye ait bir bağlantı id'sini doğrudan güncelleyemez", async () => {
    const ok = await updateStatus(orgA, linkB, "expert_confirmed");
    expect(ok).toBe(false);
    // Kayıt gerçekten değişmemiş olmalı (orgB'nin kendi görünümünde hâlâ eski durumda).
    const linksB = await listLinks(orgB, caseB);
    expect(linksB.find((l) => l.id === linkB)?.relationStatus).toBe("observed_correlation");
  });

  it("orgA, orgB'ye ait bir karar id'sini doğrudan güncelleyemez", async () => {
    const ok = await updateDecisionState(orgA, decisionB, "closed");
    expect(ok).toBe(false);
  });

  it("orgA, orgB'ye ait bir aksiyon id'sini doğrudan güncelleyemez", async () => {
    const ok = await updateAction({ orgId: orgA, actionId: actionB, status: "done" });
    expect(ok).toBe(false);
    const actionsB = await listActions(orgB);
    expect(actionsB.find((a) => a.id === actionB)?.status).toBe("open");
  });
});
