import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "../src/lib/db/migrations";

describe("KPI governance migration backfill", () => {
  const db = new PGlite();

  beforeAll(async () => {
    for (const migration of MIGRATIONS.filter((item) => item.id < 41)) {
      await db.exec(migration.sql);
    }
    await db.query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ('legacy-org', 'Legacy', 'manufacturing')"
    );
    await db.query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('legacy-kpi', 'legacy-org', 'OEE', 'percent', 'good / planned', 85, 70, 60)`
    );
    const migration = MIGRATIONS.find((item) => item.id === 41);
    if (!migration) throw new Error("Migration 41 missing");
    await db.exec(migration.sql);
    const validationMigration = MIGRATIONS.find((item) => item.id === 42);
    if (!validationMigration) throw new Error("Migration 42 missing");
    await db.exec(validationMigration.sql);
  });

  afterAll(async () => {
    await db.close();
  });

  it("archives legacy KPI definitions as calculable revision 1 without approving them", async () => {
    const definition = await db.query<{
      governance_state: string;
      approved_revision: number | null;
    }>(
      "SELECT governance_state, approved_revision FROM kpi_definitions WHERE org_id='legacy-org' AND id='legacy-kpi'"
    );
    expect(definition.rows[0]).toEqual({
      governance_state: "calculable",
      approved_revision: null,
    });

    const revisions = await db.query<{
      revision: number;
      actor_id: string;
      snapshot: { name: string; formula_text: string };
    }>(
      "SELECT revision, actor_id, snapshot FROM kpi_definition_revisions WHERE org_id='legacy-org' AND definition_id='legacy-kpi'"
    );
    expect(revisions.rows).toHaveLength(1);
    expect(revisions.rows[0]).toMatchObject({
      revision: 1,
      actor_id: "migration-41",
      snapshot: { name: "OEE", formula_text: "good / planned" },
    });

    const approvals = await db.query(
      "SELECT id FROM kpi_definition_approvals WHERE org_id='legacy-org' AND definition_id='legacy-kpi'"
    );
    expect(approvals.rows).toHaveLength(0);
    const validations = await db.query("SELECT id FROM kpi_definition_validations WHERE org_id='legacy-org' AND definition_id='legacy-kpi'");
    expect(validations.rows).toHaveLength(0);
  });
});
