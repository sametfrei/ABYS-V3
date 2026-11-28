import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(os.tmpdir(), `abys-kpi-governance-${process.pid}-${randomUUID()}`);
const { getDb, migrate } = await import("../src/lib/db/client");
const { upsertDefinition, listDefinitions, evaluateAgainstThresholds, approveDefinition, validateDefinition } = await import("../src/lib/db/repos/kpi-registry");

const orgA = `gov-a-${randomUUID()}`;
const orgB = `gov-b-${randomUUID()}`;
beforeAll(async () => {
  await migrate();
  const db = getDb();
  await db.query("INSERT INTO organizations (id,name,sector_id) VALUES ($1,'A','other'),($2,'B','other')", [orgA, orgB]);
});

describe("KPI definition governance", () => {
  it("keeps tenant scope, history append-only, and edit-after-approval unreviewed", async () => {
    const id = await upsertDefinition({ orgId: orgA, name: "Margin", formulaText: "profit / revenue", unit: "percent", warnThreshold: 10, criticalThreshold: 5 });
    expect((await listDefinitions(orgB)).some((definition) => definition.id === id)).toBe(false);
    expect((await evaluateAgainstThresholds(orgA, "Margin", 4)).status).toBe("unknown");
    await validateDefinition({ orgId: orgA, id, userId: "validator", displayName: "Validator", role: "data_admin" });
    await approveDefinition({ orgId: orgA, id, userId: "approver", displayName: "Approver", role: "ceo" });
    expect((await evaluateAgainstThresholds(orgA, "Margin", 4)).status).toBe("critical");
    await upsertDefinition({ orgId: orgA, name: "Margin", formulaText: "profit / revenue", unit: "percent", warnThreshold: 12, criticalThreshold: 6 });
    expect((await evaluateAgainstThresholds(orgA, "Margin", 4)).status).toBe("unknown");
    const history = await getDb().query<{ revision: number }>("SELECT revision FROM kpi_definition_revisions WHERE org_id=$1 AND definition_id=$2 ORDER BY revision", [orgA, id]);
    expect(history.rows.map((row) => row.revision)).toEqual([1, 2]);
    await expect(getDb().query("DELETE FROM kpi_definition_revisions WHERE org_id=$1 AND definition_id=$2", [orgA, id])).rejects.toThrow(/append-only/i);
    const validations = await getDb().query<{ validated_by_id: string; revision: number; permission: string }>("SELECT validated_by_id,revision,permission FROM kpi_definition_validations WHERE org_id=$1 AND definition_id=$2", [orgA, id]);
    expect(validations.rows).toEqual([{ validated_by_id: "validator", revision: 1, permission: "validate_kpi_definition" }]);
    await expect(getDb().query("DELETE FROM kpi_definition_validations WHERE org_id=$1 AND definition_id=$2", [orgA, id])).rejects.toThrow(/append-only/i);
    const approvals = await getDb().query<{ approved_by_id: string; revision: number; permission: string }>("SELECT approved_by_id,revision,permission FROM kpi_definition_approvals WHERE org_id=$1 AND definition_id=$2", [orgA, id]);
    expect(approvals.rows).toEqual([{ approved_by_id: "approver", revision: 1, permission: "approve_kpi_definition" }]);
    await expect(getDb().query("DELETE FROM kpi_definition_approvals WHERE org_id=$1 AND definition_id=$2", [orgA, id])).rejects.toThrow(/append-only/i);
    await expect(approveDefinition({ orgId: orgB, id, userId: "other", displayName: "Other", role: "ceo" })).resolves.toBe(false);
    await expect(validateDefinition({ orgId: orgA, id, userId: "analyst", displayName: "Analyst", role: "analyst" })).resolves.toBe(true);
  });

  it("requires structural validation and rejects incomplete or inconsistent definitions", async () => {
    const noFormulaId = await upsertDefinition({ orgId: orgA, name: "No formula", unit: "percent", warnThreshold: 10, criticalThreshold: 5, target: 15 });
    await expect(approveDefinition({ orgId: orgA, id: noFormulaId, userId: "approver", displayName: "Approver", role: "ceo" })).rejects.toThrow(/structural validation/i);
    await expect(validateDefinition({ orgId: orgA, id: noFormulaId, userId: "validator", displayName: "Validator", role: "data_admin" })).rejects.toThrow(/formulaPresent/i);
    const noFormula = await getDb().query<{ governance_state: string }>("SELECT governance_state FROM kpi_definitions WHERE org_id=$1 AND id=$2", [orgA, noFormulaId]);
    expect(noFormula.rows[0]?.governance_state).toBe("calculable");

    const inconsistentId = await upsertDefinition({ orgId: orgA, name: "Bad target", formulaText: "actual / plan", unit: "percent", warnThreshold: 10, criticalThreshold: 5, target: 7 });
    await expect(validateDefinition({ orgId: orgA, id: inconsistentId, userId: "validator", displayName: "Validator", role: "data_admin" })).rejects.toThrow(/targetConsistent/i);
    await expect(validateDefinition({ orgId: orgA, id: inconsistentId, userId: "board", displayName: "Board", role: "board" })).rejects.toThrow(/not permitted/i);
  });
});
