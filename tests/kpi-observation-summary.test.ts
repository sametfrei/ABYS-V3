import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-observation-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { listKpiObservationSummaries } = await import("../src/lib/db/repos/kpi-values");

const ORG_A = "org-obs-a";
const ORG_B = "org-obs-b";

beforeAll(async () => {
  await migrate();
  const db = getDb();
  for (const [id, name] of [
    [ORG_A, "A"],
    [ORG_B, "B"],
  ]) {
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [
      id,
      name,
    ]);
    await db.query(
      `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
       VALUES ($1, $2, 'other', $3, '{}', 'test')`,
      [`ds-${id}`, id, `Konnektör: ${name}`]
    );
  }

  await db.query(
    `INSERT INTO kpi_definitions (id, org_id, name, formula_text, source, source_ref)
     VALUES ('kd-obs-a', $1, 'İlk geçiş verimi', 'ilk seferde hatasız birim / toplam birim', 'industry-pack', 'manufacturing@2')`,
    [ORG_A]
  );

  const rows: Array<[string, string, string, string, string]> = [
    ["v-a-1", ORG_A, "ds-org-obs-a", "İlk geçiş verimi", "90"],
    ["v-a-2", ORG_A, "ds-org-obs-a", "İlk geçiş verimi", "95"],
    ["v-a-3", ORG_A, "ds-org-obs-a", "İlk geçiş verimi", "abc"],
    ["v-a-4", ORG_A, "ds-org-obs-a", "Ekipman etkinliği (OEE)", "76.5"],
    ["v-b-1", ORG_B, "ds-org-obs-b", "İlk geçiş verimi", "50"],
  ];
  for (const [id, org, dataset, label, value] of rows) {
    await db.query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        org,
        dataset,
        label,
        value,
        id === "v-a-1"
          ? "2026-01-01T00:00:00Z"
          : id === "v-a-2"
            ? "2026-01-02T00:00:00Z"
            : id === "v-a-3"
              ? "2026-01-03T00:00:00Z"
              : "2026-01-04T00:00:00Z",
      ]
    );
  }
});

afterAll(async () => {
  await getDb().close();
});

describe("KPI gözlem özeti", () => {
  it("etiket başına sayı, son değer, son zaman ve kökeni org kapsamında döndürür", async () => {
    const summaries = await listKpiObservationSummaries(ORG_A);
    const fpy = summaries.find((summary) => summary.label === "İlk geçiş verimi");
    expect(fpy).toMatchObject({
      observationCount: 3,
      numericCount: 2,
      latestValue: "abc",
      latestObservedAt: "2026-01-03T00:00:00.000Z",
      sourceLabels: ["Konnektör: A"],
      definitionSource: "industry-pack",
      definitionSourceRef: "manufacturing@2",
      formulaText: "ilk seferde hatasız birim / toplam birim",
    });

    const oee = summaries.find((summary) => summary.label === "Ekipman etkinliği (OEE)");
    expect(oee).toMatchObject({
      observationCount: 1,
      numericCount: 1,
      latestValue: "76.5",
      definitionSource: null,
      definitionSourceRef: null,
      formulaText: null,
    });
  });

  it("başka kurumun gözlemlerini saymaz", async () => {
    const summaries = await listKpiObservationSummaries(ORG_B);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      label: "İlk geçiş verimi",
      observationCount: 1,
      latestValue: "50",
      sourceLabels: ["Konnektör: B"],
    });
  });
});
