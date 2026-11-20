import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-decision-lifecycle-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { DecisionLifecycleError, recordHumanDecision } = await import(
  "../src/lib/db/repos/decision-lifecycle"
);
const { verifyAuditChain } = await import("../src/lib/db/repos/audit");

const ORG_A = "org-decision-lifecycle-a";
const ORG_B = "org-decision-lifecycle-b";

async function insertCase(id: string, orgId: string): Promise<void> {
  await getDb().query(
    `INSERT INTO decision_cases
       (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
     VALUES ($1, $2, 'aviation', 'risk', 'high', 'open', 'Lifecycle case', 80, '{}'::jsonb)`,
    [id, orgId]
  );
}

describe("karar → aksiyon atomik yaşam döngüsü", () => {
  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [orgId, name] of [
      [ORG_A, "Lifecycle A"],
      [ORG_B, "Lifecycle B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [
        orgId,
        name,
      ]);
    }
    await insertCase("case-lifecycle-a", ORG_A);
    await insertCase("case-lifecycle-b", ORG_B);
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("karar ve aksiyon aynı transaction'da oluşur", async () => {
    const result = await recordHumanDecision({
      orgId: ORG_A,
      caseId: "case-lifecycle-a",
      choice: "accepted",
      reason: "Maliyet baskısı",
      chosenAction: "Tedarikçi sözleşmesini yenile",
      actorId: "user-a",
      actorName: "CEO A",
    });
    expect(result.actionId).toBeTruthy();
    const db = getDb();
    const decision = await db.query<{ choice: string; sector_id: string }>(
      "SELECT choice, sector_id FROM decision_records WHERE id = $1 AND org_id = $2",
      [result.recordId, ORG_A]
    );
    expect(decision.rows[0]).toMatchObject({ choice: "accepted", sector_id: "aviation" });
    const action = await db.query<{ decision_id: string; status: string }>(
      "SELECT decision_id, status FROM actions WHERE id = $1 AND org_id = $2",
      [result.actionId, ORG_A]
    );
    expect(action.rows[0]).toMatchObject({ decision_id: result.recordId, status: "open" });
    expect(await verifyAuditChain(ORG_A)).toMatchObject({ valid: true });
  });

  it("ikinci audit yazımı düşerse karar, aksiyon ve olay birlikte geri alınır", async () => {
    const db = getDb();
    await insertCase("case-lifecycle-rollback", ORG_A);
    const before = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_records WHERE org_id = $1",
      [ORG_A]
    );
    let calls = 0;
    await expect(
      recordHumanDecision({
        orgId: ORG_A,
        caseId: "case-lifecycle-rollback",
        choice: "accepted",
        chosenAction: "Rollback aksiyonu",
        actorId: "user-a",
        actorName: "CEO A",
        auditWriter: async () => {
          calls++;
          if (calls === 2) throw new Error("kasıtlı ikinci audit hatası");
          return "audit-id";
        },
      })
    ).rejects.toThrow("kasıtlı ikinci audit hatası");

    const after = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_records WHERE org_id = $1",
      [ORG_A]
    );
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
    const caseRow = await db.query<{ status: string }>(
      "SELECT status FROM decision_cases WHERE id = 'case-lifecycle-rollback' AND org_id = $1",
      [ORG_A]
    );
    expect(caseRow.rows[0]?.status).toBe("open");
    const actions = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM actions WHERE org_id = $1 AND title = 'Rollback aksiyonu'",
      [ORG_A]
    );
    expect(actions.rows[0]?.n).toBe(0);
  });

  it("başka kurumun vakası için karar üretmez", async () => {
    await expect(
      recordHumanDecision({
        orgId: ORG_A,
        caseId: "case-lifecycle-b",
        choice: "accepted",
        actorId: "user-a",
        actorName: "CEO A",
      })
    ).rejects.toBeInstanceOf(DecisionLifecycleError);
  });
});
