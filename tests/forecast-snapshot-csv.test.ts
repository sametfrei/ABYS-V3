import { describe, expect, it } from "vitest";
import { SNAPSHOT_CSV_HEADER, snapshotToRow, toSnapshotCsv } from "../src/lib/forecast-snapshot-csv";
import type { ForecastSnapshotRecord } from "../src/lib/db/repos/forecast-snapshots";

function record(overrides: Partial<ForecastSnapshotRecord> = {}): ForecastSnapshotRecord {
  return {
    id: "s-1",
    label: "Günlük ciro",
    model: "naive",
    evidence: "test",
    horizon: 1,
    seriesPoints: 8,
    p10: 90,
    p50: 100,
    p90: 110,
    lastObservedAt: "2026-01-08T00:00:00.000Z",
    createdBy: "CEO",
    createdAt: "2026-01-08T00:00:00.000Z",
    evaluation: {
      status: "evaluated",
      actual: 105,
      insideRange: true,
      absError: 5,
      rangeWidth: 20,
    },
    ...overrides,
  };
}

describe("tahmin anlık görüntüsü CSV üretimi", () => {
  it("başlık sırası sabittir ve satır uzunluğu eşleşir", () => {
    const row = snapshotToRow(record());
    expect(row).toHaveLength(SNAPSHOT_CSV_HEADER.length);
    const csv = toSnapshotCsv([record()]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(SNAPSHOT_CSV_HEADER.join(","));
    expect(lines.filter(Boolean)).toHaveLength(2);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("ölçülmemiş kayıtta değerlendirme alanlarını boş bırakır", () => {
    const row = snapshotToRow(
      record({
        evaluation: { status: "pending", actual: null, insideRange: null, absError: null, rangeWidth: 20 },
      })
    );
    const index = (name: string) => SNAPSHOT_CSV_HEADER.indexOf(name as never);
    expect(row[index("evaluation_status")]).toBe("pending");
    expect(row[index("actual")]).toBe("");
    expect(row[index("inside_range")]).toBe("");
    expect(row[index("abs_error")]).toBe("");
    expect(row[index("range_width")]).toBe("");
  });

  it("etiket içindeki virgülü kaçırır", () => {
    const csv = toSnapshotCsv([record({ label: "Ciro, günlük" })]);
    expect(csv).toContain('"Ciro, günlük"');
  });

  it("boş listede yalnızca başlık döner", () => {
    expect(toSnapshotCsv([])).toBe(`${SNAPSHOT_CSV_HEADER.join(",")}\r\n`);
  });
});
