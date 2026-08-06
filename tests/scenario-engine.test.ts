import { describe, expect, it } from "vitest";
import { getTemplate, getTemplates, runComparison } from "../src/lib/scenario-engine";

describe("getTemplates", () => {
  it("sektöre özel şablon döner (aviation)", () => {
    const templates = getTemplates("aviation");
    expect(templates.some((t) => t.id === "turnaround-delay")).toBe(true);
  });

  it("sektöre özel şablon döner (manufacturing)", () => {
    const templates = getTemplates("manufacturing");
    expect(templates.some((t) => t.id === "line-downtime")).toBe(true);
  });

  it("tanımsız/eşleşmeyen sektör için genel kapasite şablonuna düşer", () => {
    const templates = getTemplates("health");
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe("capacity-gap");
  });

  it("her şablonda genel kapasite şablonu da bulunur", () => {
    const templates = getTemplates("logistics");
    expect(templates.some((t) => t.id === "capacity-gap")).toBe(true);
  });
});

describe("getTemplate", () => {
  it("id ile doğru şablonu bulur", () => {
    const template = getTemplate("aviation", "turnaround-delay");
    expect(template?.label).toBe("Turnaround gecikme maliyeti");
  });

  it("bulunamayan id için undefined döner", () => {
    expect(getTemplate("aviation", "yok-boyle-bir-id")).toBeUndefined();
  });
});

describe("runComparison", () => {
  const template = getTemplate("aviation", "turnaround-delay")!;
  const inputs = { delayMin: 30, connections: 2, rushBags: 10 };

  it("taban, iyimser, kötümser üç senaryo üretir", () => {
    const { runs } = runComparison(template, inputs);
    expect(runs.map((r) => r.name)).toEqual(["Taban", "İyimser (−%30)", "Kötümser (+%50)"]);
  });

  it("iyimser < taban < kötümser sırası doğru (toplam maliyet)", () => {
    const { runs } = runComparison(template, inputs);
    const totalOf = (r: (typeof runs)[number]) => r.results[r.results.length - 1].value;
    const [base, optimistic, pessimistic] = runs;
    expect(totalOf(optimistic)).toBeLessThan(totalOf(base));
    expect(totalOf(base)).toBeLessThan(totalOf(pessimistic));
  });

  it("her değişken için duyarlılık üretilir", () => {
    const { sensitivity } = runComparison(template, inputs);
    expect(sensitivity).toHaveLength(template.variables.length);
    for (const v of template.variables) {
      expect(sensitivity.some((s) => s.variable === v.label)).toBe(true);
    }
  });

  it("girdiler min/max sınırlarına kırpılır (kötümser senaryo max'ı aşmaz)", () => {
    const capped = getTemplate("aviation", "turnaround-delay")!;
    const nearMax = { delayMin: 170, connections: 19, rushBags: 195 };
    const { runs } = runComparison(capped, nearMax);
    const pessimistic = runs[2];
    for (const v of capped.variables) {
      expect(pessimistic.inputs[v.id]).toBeLessThanOrEqual(v.max);
      expect(pessimistic.inputs[v.id]).toBeGreaterThanOrEqual(v.min);
    }
  });

  it("girdi min sınırının altında değilse iyimser senaryo da min altına inmez", () => {
    const { runs } = runComparison(template, { delayMin: 1, connections: 0, rushBags: 0 });
    const optimistic = runs[1];
    for (const v of template.variables) {
      expect(optimistic.inputs[v.id]).toBeGreaterThanOrEqual(v.min);
    }
  });
});
