import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(os.tmpdir(), `abys-causal-suggestions-${process.pid}-${randomUUID()}`);

const { migrate, getDb } = await import("../src/lib/db/client");
const { suggestCausalCandidates } = await import("../src/lib/db/repos/causal");

const ORG = "org-causal-candidates";
const OTHER_ORG = "org-causal-candidates-other";
const CASE_ID = "case-causal-candidates";
const DATASET_ID = "dataset-causal-candidates";

function payload(label: string, scopeVerified = true, definitionVerified = true) {
  return JSON.stringify({
    label,
    series: { entity: "plant-1", scopeVerified, definitionVerified },
  });
}

async function insertSignal(id: string, label: string, daysAgo: number, verified = true) {
  await getDb().query(
    `INSERT INTO signals (id,org_id,sector_id,dataset_id,category_id,severity,title,payload,created_at)
     VALUES ($1,$2,'manufacturing','dataset-causal-candidates','kpi','warning',$3,$4::jsonb,$5)`,
    [id, ORG, label, payload(label, verified, verified), new Date(Date.now() - daysAgo * 86_400_000).toISOString()]
  );
}

describe("automatic causal candidate discovery", () => {
  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id,name,sector_id) VALUES ($1,$2,'manufacturing'),($3,$4,'manufacturing')", [ORG, "Causal A", OTHER_ORG, "Causal B"]);
    await db.query(
      "INSERT INTO datasets (id,org_id,sector_id,source_label,raw_content,ingested_by) VALUES ($1,$2,'manufacturing','test','{}','test')",
      [DATASET_ID, ORG]
    );
    await db.query(
      "INSERT INTO decision_cases (id,org_id,sector_id,category_id,severity,title,confidence,payload) VALUES ($1,$2,'manufacturing','risk','warning','KPI B anomaly',70,'{}'::jsonb)",
      [CASE_ID, ORG]
    );

    for (let index = 0; index < 4; index += 1) {
      const effectDaysAgo = 12 + index * 20;
      await insertSignal(`cause-a-${index}`, "KPI A", effectDaysAgo + 7);
      await insertSignal(`effect-b-${index}`, "KPI B", effectDaysAgo);
    }
    await insertSignal("unverified-cause", "KPI Unverified", 10, false);

    await db.query(
      `INSERT INTO decision_case_signals (id,org_id,case_id,signal_id,link_reason,linked_by_id,linked_by_name)
       VALUES ('case-signal-causal','${ORG}','${CASE_ID}','effect-b-0','test','tester','Tester')`
    );
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("returns repeated same-scope lead-lag association as observational only", async () => {
    const candidates = await suggestCausalCandidates(ORG, CASE_ID);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      fromLabel: "KPI A",
      toLabel: "KPI B",
      associationRatePct: 100,
      sampleSize: 4,
      matchedEffects: 4,
      averageLagDays: 7,
      dataQuality: "low",
      uncertainty: "high",
    });
    expect(candidates[0].note).toContain("Korelasyon nedensellik kanıtı değildir");
  });

  it("never crosses tenant boundaries and returns no candidate for another tenant", async () => {
    await expect(suggestCausalCandidates(OTHER_ORG, CASE_ID)).resolves.toEqual([]);
  });
});
