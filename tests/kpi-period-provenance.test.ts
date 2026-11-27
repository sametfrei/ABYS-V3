import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-period-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { insertDataset } = await import("../src/lib/db/repos/data");
const {
  MANUAL_KPI_SOURCE_LABEL,
  recordKpiValues,
} = await import("../src/lib/db/repos/kpi-values");
const { loadKpiSeriesScopes } = await import("../src/lib/db/repos/kpi-signals");

const ORG = "org-kpi-period";
const ORG_LOAD = "org-kpi-period-load";
const LABEL = "İlk geçiş verimi";

beforeAll(async () => {
  await migrate();
  for (const [orgId, name] of [
    [ORG, "KPI Period"],
    [ORG_LOAD, "KPI Period Load"],
  ]) {
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')",
      [orgId, name]
    );
  }
  for (const [orgId, definitionId] of [
    [ORG, "kd-period"],
    [ORG_LOAD, "kd-period-load"],
  ]) {
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, source, source_ref,
          warn_threshold, critical_threshold, target, update_frequency)
       VALUES ($1, $2, $3, 'ratio', 'iyi birim / toplam birim',
               'manual', NULL, 95, 90, 100, 'daily')`,
      [definitionId, orgId, LABEL]
    );
  }
});

afterAll(async () => {
  await getDb().close();
});

describe("gözlem dönemi ile raporlama sıklığı ayrımı", () => {
  it("manuel girişte update_frequency gözlem dönemi olarak yazılmaz", async () => {
    await recordKpiValues(ORG, [
      { label: LABEL, value: 90, observedAt: "2026-01-01T00:00:00Z" },
      { label: LABEL, value: 91, observedAt: "2026-01-02T00:00:00Z", period: "2026-Q1" },
    ]);

    const rows = await getDb().query<{
      created_at: string | Date;
      period: string | null;
      definition_id: string | null;
    }>(
      `SELECT created_at, period, definition_id
         FROM kpi_values
        WHERE org_id = $1 AND dataset_id = (
          SELECT id FROM datasets WHERE org_id = $1 AND source_label = $2
        )
        ORDER BY created_at ASC`,
      [ORG, MANUAL_KPI_SOURCE_LABEL]
    );
    expect(rows.rows.map((row) => row.period)).toEqual([null, "2026-Q1"]);
    expect(rows.rows.every((row) => row.definition_id === "kd-period")).toBe(true);

    const definition = await getDb().query<{ update_frequency: string | null }>(
      "SELECT update_frequency FROM kpi_definitions WHERE org_id = $1 AND name = $2",
      [ORG, LABEL]
    );
    expect(definition.rows[0]?.update_frequency).toBe("daily");
  });

  it("CSV/veri seti girişi yalnızca açıkça verilen dönemi saklar", async () => {
    await insertDataset({
      orgId: ORG,
      sectorId: "other",
      sourceLabel: "CSV: dönem testi",
      rawContent: "{}",
      ingestedBy: "test",
      kpis: [
        { label: LABEL, value: "92" },
        { label: LABEL, value: "93", period: "2026-Q2" },
      ],
    });

    const rows = await getDb().query<{ period: string | null }>(
      `SELECT period FROM kpi_values
        WHERE org_id = $1 AND dataset_id = (
          SELECT id FROM datasets WHERE org_id = $1 AND source_label = 'CSV: dönem testi'
        )
        ORDER BY value::numeric ASC`,
      [ORG]
    );
    expect(rows.rows.map((row) => row.period)).toEqual([null, "2026-Q2"]);
  });

  it("farklı gözlem dönemleri ayrı seri; NULL legacy dönem bilinenlerle birleşmez", async () => {
    const values = [90, 91, 90, 92, 89, 91, 90, 90, 91, 90, 150];
    const day = (index: number) =>
      `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00Z`;

    await recordKpiValues(
      ORG_LOAD,
      values.map((value, index) => ({
        label: LABEL,
        value,
        observedAt: day(index),
        period: "2026-Q1",
      }))
    );
    await recordKpiValues(
      ORG_LOAD,
      values.map((value, index) => ({
        label: LABEL,
        value,
        observedAt: day(index),
        period: "2026-Q2",
      }))
    );
    await recordKpiValues(
      ORG_LOAD,
      values.map((value, index) => ({
        label: LABEL,
        value,
        observedAt: day(index),
      }))
    );

    const loaded = await loadKpiSeriesScopes(ORG_LOAD);
    const periods = loaded.series.map((series) => series.scope.period).sort();
    expect(periods).toEqual([null, "2026-Q1", "2026-Q2"].sort());
    expect(loaded.series.every((series) => series.points.length === 11)).toBe(true);
    expect(loaded.verifiedSeries).toBe(loaded.series.length);
  });
});
