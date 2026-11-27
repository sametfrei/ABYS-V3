import {
  snapshotFromDefinition,
  type KpiDefinitionSnapshot,
} from "@/lib/kpi-definition-provenance";

interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface DefinitionRow {
  id: string;
  name: string;
  unit: string | null;
  formula_text: string | null;
  source: string;
  source_ref: string | null;
  warn_threshold: string | number | null;
  critical_threshold: string | number | null;
  target: string | number | null;
  update_frequency: string | null;
}

/** Org'un tüm KPI tanımlarını tek sorguda, etiket -> snapshot olarak getirir. */
export async function listKpiDefinitionSnapshots(
  db: Queryable,
  orgId: string
): Promise<Map<string, KpiDefinitionSnapshot>> {
  const result = await db.query<DefinitionRow>(
    `SELECT id, name, unit, formula_text, source, source_ref,
            warn_threshold, critical_threshold, target, update_frequency
       FROM kpi_definitions
      WHERE org_id = $1`,
    [orgId]
  );
  return new Map(
    result.rows.map((row) => [row.name, snapshotFromDefinition(row)])
  );
}

export async function getKpiDefinitionSnapshot(
  db: Queryable,
  orgId: string,
  name: string
): Promise<KpiDefinitionSnapshot | null> {
  const result = await db.query<DefinitionRow>(
    `SELECT id, name, unit, formula_text, source, source_ref,
            warn_threshold, critical_threshold, target, update_frequency
       FROM kpi_definitions
      WHERE org_id = $1 AND name = $2`,
    [orgId, name]
  );
  const row = result.rows[0];
  return row ? snapshotFromDefinition(row) : null;
}
