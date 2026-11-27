import { describe, expect, it } from "vitest";
import { matchScenarioBindings } from "../src/lib/scenario-bindings";
import type { ScenarioVariable } from "../src/lib/scenario-engine";

function variable(id: string, aliases: string[]): ScenarioVariable {
  return { id, label: id, unit: "saat", value: 4, min: 0, max: 72, step: 1, kpiAliases: aliases };
}

const POINTS = [
  {
    label: "Duruş süresi (saat)",
    value: 5,
    observedAt: "2026-01-02T00:00:00.000Z",
    numericPoints: 3,
    sourceLabels: ["Konnektör: ERP"],
  },
  {
    label: "saatlik maliyet",
    value: 320,
    observedAt: "2026-01-02T00:00:00.000Z",
    numericPoints: 2,
    sourceLabels: ["Manuel KPI girişi"],
  },
];

describe("senaryo değişkeni ↔ gerçek KPI eşleşmesi", () => {
  it("birebir ve büyük/küçük harf duyarsız eşleşmeyi gerçek değerle döndürür", () => {
    const bindings = matchScenarioBindings(
      [variable("downtimeHours", ["Duruş süresi", "Duruş süresi (saat)"])],
      POINTS
    );
    expect(bindings.downtimeHours).toMatchObject({
      value: 5,
      kpiLabel: "Duruş süresi (saat)",
      numericPoints: 3,
      sourceLabels: ["Konnektör: ERP"],
    });
  });

  it("bulanık veya kısmi eşleşme yapmaz", () => {
    const bindings = matchScenarioBindings(
      [variable("downtimeHours", ["Duruş", "duruş_süresi_dakika"])],
      POINTS
    );
    expect(bindings.downtimeHours).toBeNull();
  });

  it("alias sırasına göre ilk eşleşmeyi kullanır, eşleşmeyeni null bırakır", () => {
    const bindings = matchScenarioBindings(
      [
        variable("downtimeHours", ["Yok", "Duruş süresi (saat)"]),
        variable("hourlyCost", ["Saatlik maliyet"]),
        variable("contractValue", ["Sözleşme bedeli"]),
      ],
      POINTS
    );
    expect(bindings.downtimeHours?.value).toBe(5);
    expect(bindings.hourlyCost?.value).toBe(320);
    expect(bindings.contractValue).toBeNull();
  });
});
