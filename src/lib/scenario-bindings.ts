import type { ScenarioVariable } from "./scenario-engine";

/**
 * Senaryo değişkeni → gerçek KPI gözlemi eşleşmesi.
 *
 * Yalnızca değişkende AÇIKÇA tanımlı `kpiAliases` ile birebir (büyük/küçük
 * harf duyarsız, kırpılmış) eşleşme kabul edilir. Bulanık eşleştirme yoktur:
 * yanlış eşleşme, ölçülmemiş bir varsayımı ölçülmüş gibi göstereceği için
 * güvenlik sınırıdır. Eşleşme yoksa değişken varsayılan değerini korur ve
 * kaynağı "template_default" olarak raporlanır.
 */

export interface NumericKpiPoint {
  label: string;
  value: number;
  observedAt: string;
  numericPoints: number;
  sourceLabels: string[];
}

export interface ScenarioBinding {
  value: number;
  kpiLabel: string;
  observedAt: string;
  numericPoints: number;
  sourceLabels: string[];
}

function normalize(label: string): string {
  return label.trim().toLowerCase();
}

export function matchScenarioBindings(
  variables: ScenarioVariable[],
  latest: NumericKpiPoint[]
): Record<string, ScenarioBinding | null> {
  const byLabel = new Map<string, NumericKpiPoint>();
  for (const point of latest) byLabel.set(normalize(point.label), point);

  const result: Record<string, ScenarioBinding | null> = {};
  for (const variable of variables) {
    let match: NumericKpiPoint | undefined;
    for (const alias of variable.kpiAliases ?? []) {
      match = byLabel.get(normalize(alias));
      if (match) break;
    }
    result[variable.id] = match
      ? {
          value: match.value,
          kpiLabel: match.label,
          observedAt: match.observedAt,
          numericPoints: match.numericPoints,
          sourceLabels: match.sourceLabels,
        }
      : null;
  }
  return result;
}
