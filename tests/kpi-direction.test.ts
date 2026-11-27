import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  inferKpiDirection,
  inferKpiDirectionWithBasis,
} from "../src/lib/kpi-direction";
import { inferKpiDirection as inferOutcomeDirection } from "../src/lib/kpi-outcome-measurement";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-direction-${process.pid}-${randomUUID()}`
);
const { inferSignalDirection } = await import("../src/lib/db/repos/kpi-signals");

describe("KPI yönü için tek kanonik çıkarım", () => {
  it("kritik eşik uyarıdan yüksekse yüksek değeri kötü sayar", () => {
    expect(inferKpiDirectionWithBasis(8, 12, 5)).toEqual({
      direction: "lower_is_better",
      basis: ["warn", "critical", "target"],
    });
  });

  it("kritik eşik uyarıdan düşükse düşük değeri kötü sayar", () => {
    expect(inferKpiDirectionWithBasis(95, 90, 100)).toEqual({
      direction: "higher_is_better",
      basis: ["warn", "critical", "target"],
    });
  });

  it("hedef yoksa uyarı/kritik çiftinden yön türetir", () => {
    expect(inferKpiDirectionWithBasis(95, 90, null)).toEqual({
      direction: "higher_is_better",
      basis: ["warn", "critical"],
    });
    expect(inferKpiDirectionWithBasis(8, 12, null)).toEqual({
      direction: "lower_is_better",
      basis: ["warn", "critical"],
    });
  });

  it("tek referansla yön uydurmaz", () => {
    expect(inferKpiDirectionWithBasis(90, null, null)).toBeNull();
    expect(inferKpiDirectionWithBasis(null, 90, null)).toBeNull();
    expect(inferKpiDirectionWithBasis(null, null, 100)).toBeNull();
    expect(inferKpiDirectionWithBasis(null, null, null)).toBeNull();
  });

  it("eşit eşik çiftlerini belirsiz sayar", () => {
    expect(inferKpiDirectionWithBasis(90, 90, null)).toBeNull();
    expect(inferKpiDirectionWithBasis(90, 90, 100)).toBeNull();
    expect(inferKpiDirectionWithBasis(90, null, 90)).toBeNull();
    expect(inferKpiDirectionWithBasis(null, 90, 90)).toBeNull();
  });

  it("hedef iyi tarafta değilse çelişkili tanım sayar", () => {
    // higher_is_better tanımda hedef uyarı eşiğinin altında kalamaz.
    expect(inferKpiDirectionWithBasis(95, 90, 90)).toBeNull();
    expect(inferKpiDirectionWithBasis(95, 90, 80)).toBeNull();
    // lower_is_better tanımda hedef uyarı eşiğinin üstünde kalamaz.
    expect(inferKpiDirectionWithBasis(8, 12, 8)).toBeNull();
    expect(inferKpiDirectionWithBasis(8, 12, 10)).toBeNull();
  });

  it("hedef yalnızca uyarı veya yalnızca kritik ile verildiğinde konumdan yön türetir", () => {
    expect(inferKpiDirectionWithBasis(95, null, 100)?.direction).toBe("higher_is_better");
    expect(inferKpiDirectionWithBasis(95, null, 90)?.direction).toBe("lower_is_better");
    expect(inferKpiDirectionWithBasis(null, 12, 5)?.direction).toBe("lower_is_better");
    expect(inferKpiDirectionWithBasis(null, 12, 20)?.direction).toBe("higher_is_better");
  });

  it("sonuç ölçümü ve sinyal sınıflandırması aynı uygulamayı kullanır", () => {
    const cases: Array<[number | null, number | null, number | null]> = [
      [95, 90, 100],
      [8, 12, 5],
      [90, 90, 100],
      [95, 90, 90],
      [95, 90, null],
      [8, 12, null],
      [95, null, 100],
      [null, 12, 5],
      [null, 20, null],
      [null, null, null],
    ];
    for (const [warn, critical, target] of cases) {
      const shared = inferKpiDirection(warn, critical, target);
      expect(inferOutcomeDirection(warn, critical, target)).toBe(shared);
      expect(inferSignalDirection(warn, critical, target)?.direction ?? null).toBe(shared);
    }
  });
});
