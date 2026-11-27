import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-memory-bounds-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { getAllKpiSeries } = await import("../src/lib/db/repos/forecast");
const { listSignals } = await import("../src/lib/db/repos/data");
const { listCasesForOrg } = await import("../src/lib/db/repos/decisions");

const ORG_A = "org-mem-a";
const ORG_B = "org-mem-b";

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

  // 150 gözlemli seri: getAllKpiSeries SQL'de son 120'yi almalı.
  for (let i = 0; i < 150; i++) {
    await db.query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ($1, $2, $3, 'Uzun seri', $4, $5)`,
      [
        `kv-long-${i}`,
        ORG_A,
        `ds-${ORG_A}`,
        String(i),
        new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      ]
    );
  }
  for (let i = 0; i < 3; i++) {
    await db.query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ($1, $2, $3, 'Kısa seri', $4, $5)`,
      [`kv-short-${i}`, ORG_A, `ds-${ORG_A}`, String(i), `2026-02-0${i + 1}T00:00:00Z`]
    );
  }
  await db.query(
    `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
     VALUES ('kv-b', $1, $2, 'Uzun seri', '999', '2026-01-01T00:00:00Z')`,
    [ORG_B, `ds-${ORG_B}`]
  );

  for (let i = 0; i < 5; i++) {
    await db.query(
      `INSERT INTO signals (id, org_id, sector_id, dataset_id, category_id, severity, title, payload, created_at)
       VALUES ($1, $2, 'other', $3, 'test', 'warning', $4, '{}'::jsonb, $5)`,
      [
        `sig-a-${i}`,
        ORG_A,
        `ds-${ORG_A}`,
        `Sinyal ${i}`,
        `2026-03-0${i + 1}T00:00:00Z`,
      ]
    );
  }
  await db.query(
    `INSERT INTO signals (id, org_id, sector_id, dataset_id, category_id, severity, title, payload, created_at)
     VALUES ('sig-b', $1, 'other', $2, 'test', 'warning', 'B sinyali', '{}'::jsonb, '2026-03-09T00:00:00Z')`,
    [ORG_B, `ds-${ORG_B}`]
  );

  for (let i = 0; i < 3; i++) {
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, title, confidence, payload, created_at)
       VALUES ($1, $2, 'other', 'test', 'warning', $3, 50, '{}'::jsonb, $4)`,
      [
        `case-a-${i}`,
        ORG_A,
        `Vaka ${i}`,
        `2026-04-0${i + 1}T00:00:00Z`,
      ]
    );
  }
  await db.query(
    `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, title, confidence, payload, created_at)
     VALUES ('case-b', $1, 'other', 'test', 'warning', 'B vakası', 50, '{}'::jsonb, '2026-04-09T00:00:00Z')`,
    [ORG_B]
  );
});

afterAll(async () => {
  await getDb().close();
});

describe("bellek sınırları", () => {
  it("KPI serileri SQL'de etiket başına sınırlanır, tüm tablo JS'e yüklenmez", async () => {
    const series = await getAllKpiSeries(ORG_A, 120);
    const long = series.get("Uzun seri");
    expect(long?.values).toHaveLength(120);
    // Son 120 gözlem: 30..149; sıra eskiden yeniye.
    expect(long?.values[0]).toBe(30);
    expect(long?.values.at(-1)).toBe(149);
    expect(series.get("Kısa seri")?.values).toEqual([0, 1, 2]);
    expect(series.get("Uzun seri")?.values).not.toContain(999);
  });

  it("sinyal listesi üst sınırı uygular ve org kapsamlı kalır", async () => {
    const limited = await listSignals(ORG_A, undefined, 2);
    expect(limited).toHaveLength(2);
    expect(limited.map((row) => row.id)).toEqual(["sig-a-4", "sig-a-3"]);
    const all = await listSignals(ORG_A);
    expect(all).toHaveLength(5);
    expect(all.some((row) => row.id === "sig-b")).toBe(false);
  });

  it("vaka listesi üst sınırı uygular ve org kapsamlı kalır", async () => {
    const limited = await listCasesForOrg(ORG_A, undefined, 2);
    expect(limited).toHaveLength(2);
    expect(limited.map((row) => row.id)).toEqual(["case-a-2", "case-a-1"]);
    const all = await listCasesForOrg(ORG_A);
    expect(all).toHaveLength(3);
    expect(all.some((row) => row.id === "case-b")).toBe(false);
  });
});
