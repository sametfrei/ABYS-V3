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
      actorRole: "ceo",
    });
    expect(result.actionId).toBeTruthy();
    const db = getDb();
    const decision = await db.query<{
      choice: string;
      sector_id: string;
      decided_by_id: string | null;
      decided_role: string | null;
      approval_permission: string | null;
      approval_source: string | null;
      approved_at: string | null;
      approval_audit_id: string | null;
    }>(
      `SELECT choice, sector_id, decided_by_id, decided_role, approval_permission,
              approval_source, approved_at, approval_audit_id
         FROM decision_records WHERE id = $1 AND org_id = $2`,
      [result.recordId, ORG_A]
    );
    expect(decision.rows[0]).toMatchObject({
      choice: "accepted",
      sector_id: "aviation",
      decided_by_id: "user-a",
      decided_role: "ceo",
      approval_permission: "record_decision",
      approval_source: "human",
    });
    expect(decision.rows[0]?.approved_at).toBeTruthy();
    expect(decision.rows[0]?.approval_audit_id).toBeTruthy();
    const audit = await db.query<{ type: string; detail: string }>(
      "SELECT type, detail FROM audit_events WHERE id = $1 AND org_id = $2",
      [decision.rows[0]?.approval_audit_id, ORG_A]
    );
    expect(audit.rows[0]?.type).toBe("decision_made");
    expect(audit.rows[0]?.detail).toContain(result.recordId);
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

  it("yetkisiz rol onay veremez; karar ve aksiyon oluşmaz", async () => {
    await insertCase("case-lifecycle-unauthorized", ORG_A);
    await expect(
      recordHumanDecision({
        orgId: ORG_A,
        caseId: "case-lifecycle-unauthorized",
        choice: "accepted",
        actorId: "guest-a",
        actorName: "Guest A",
        actorRole: "guest",
      })
    ).rejects.toMatchObject({ reason: "unauthorized_approver" });
    const decisions = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_records WHERE org_id = $1 AND case_id = $2",
      [ORG_A, "case-lifecycle-unauthorized"]
    );
    expect(Number(decisions.rows[0]?.n)).toBe(0);
  });

  it("onay provenance'ı yazıldıktan sonra sessizce değiştirilemez", async () => {
    await insertCase("case-lifecycle-immutable", ORG_A);
    const created = await recordHumanDecision({
      orgId: ORG_A,
      caseId: "case-lifecycle-immutable",
      choice: "accepted",
      actorId: "ceo-a",
      actorName: "CEO A",
      actorRole: "ceo",
    });
    await expect(
      getDb().query(
        "UPDATE decision_records SET decided_role = 'guest' WHERE id = $1 AND org_id = $2",
        [created.recordId, ORG_A]
      )
    ).rejects.toThrow(/provenance immutable|immutable/i);
    const row = await getDb().query<{ decided_role: string | null }>(
      "SELECT decided_role FROM decision_records WHERE id = $1 AND org_id = $2",
      [created.recordId, ORG_A]
    );
    expect(row.rows[0]?.decided_role).toBe("ceo");
  });

  it("sistem onay kaydı sonradan insan onayına çevrilemez", async () => {
    await insertCase("case-lifecycle-system-immutable", ORG_A);
    await getDb().query(
      `INSERT INTO decision_records
         (id, org_id, case_id, sector_id, choice, decided_by, payload, approval_source)
       VALUES ('dr-system-immutable', $1, 'case-lifecycle-system-immutable', 'aviation',
               'accepted', 'sistem', '{}'::jsonb, 'system')`,
      [ORG_A]
    );
    await expect(
      getDb().query(
        `UPDATE decision_records
            SET approval_source = 'human', decided_by_id = 'attacker'
          WHERE id = 'dr-system-immutable' AND org_id = $1`,
        [ORG_A]
      )
    ).rejects.toThrow(/provenance immutable|immutable/i);
    const row = await getDb().query<{ approval_source: string | null }>(
      "SELECT approval_source FROM decision_records WHERE id = 'dr-system-immutable' AND org_id = $1",
      [ORG_A]
    );
    expect(row.rows[0]?.approval_source).toBe("system");
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

  it("aynı vaka için ikinci kabul reddedilir ve mükerrer aksiyon oluşmaz", async () => {
    await insertCase("case-lifecycle-duplicate", ORG_A);
    const first = await recordHumanDecision({
      orgId: ORG_A,
      caseId: "case-lifecycle-duplicate",
      choice: "accepted",
      chosenAction: "Tek aksiyon",
      actorId: "user-a",
      actorName: "CEO A",
    });
    await expect(
      recordHumanDecision({
        orgId: ORG_A,
        caseId: "case-lifecycle-duplicate",
        choice: "accepted",
        chosenAction: "İkinci aksiyon",
        actorId: "user-a",
        actorName: "CEO A",
      })
    ).rejects.toMatchObject({ reason: "already_decided" });
    const actions = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM actions WHERE org_id = $1 AND decision_id = $2",
      [ORG_A, first.recordId]
    );
    expect(actions.rows[0]?.n).toBe(1);
  });

  it("sistem önerisi insan onayını engellemez, insan kaydı tekrarını engeller", async () => {
    await insertCase("case-lifecycle-system-seed", ORG_A);
    await getDb().query(
      `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload)
       VALUES ('dr-system-seed', $1, 'case-lifecycle-system-seed', 'aviation', 'accepted', 'sistem', '{}')`,
      [ORG_A]
    );
    const human = await recordHumanDecision({
      orgId: ORG_A,
      caseId: "case-lifecycle-system-seed",
      choice: "accepted",
      chosenAction: "İnsan onayı aksiyonu",
      actorId: "user-a",
      actorName: "CEO A",
    });
    expect(human.actionId).toBeTruthy();
    await expect(
      recordHumanDecision({
        orgId: ORG_A,
        caseId: "case-lifecycle-system-seed",
        choice: "accepted",
        actorId: "user-a",
        actorName: "CEO A",
      })
    ).rejects.toMatchObject({ reason: "already_decided" });
  });
});
