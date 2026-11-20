import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-migration-governance-${process.pid}-${randomUUID()}`
);
delete process.env.ABYS_MIGRATION_18_APPROVED;

const { getDb, getPendingMigrationApprovals, migrate } = await import("../src/lib/db/client");

describe("migration governance", () => {
  afterAll(async () => {
    await getDb().close();
  });

  it("onay gerektiren migration 18'i uygulamadan bekletir", async () => {
    await migrate();
    const pending = getPendingMigrationApprovals();
    expect(pending).toContainEqual(
      expect.objectContaining({ id: 18, approvalEnv: "ABYS_MIGRATION_18_APPROVED" })
    );

    const applied = await getDb().query<{ id: number }>("SELECT id FROM _migrations ORDER BY id");
    expect(applied.rows.map((row) => row.id)).not.toContain(18);
    expect(applied.rows.map((row) => row.id)).toContain(20);
    expect(applied.rows.map((row) => row.id)).toContain(21);
    expect(applied.rows.map((row) => row.id)).toContain(22);
    expect(applied.rows.map((row) => row.id)).toContain(23);

    const columns = await getDb().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'organizations' ORDER BY ordinal_position`
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("parent_id");

    const runColumns = await getDb().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'connector_sync_runs'`
    );
    expect(runColumns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(["rejected_count", "source_schema", "mapping_suggestions"])
    );
  });
});
