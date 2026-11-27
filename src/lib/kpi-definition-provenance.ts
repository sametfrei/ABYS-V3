import { createHash } from "node:crypto";

/**
 * KPI tanımının doğrulanabilir parmak izi.
 *
 * Formül, birim, kaynak, kaynak sürümü ve eşikler birlikte hash'lenir. Bu
 * alanlardan biri değişirse eski gözlemle yeni gözlem doğrudan
 * karşılaştırılmaz. Sürüm etiketi (`source_ref`) yoksa `versionKnown=false`
 * olarak açıkça taşınır; hash varsa formül kimliği yine doğrulanabilir.
 */
export interface KpiDefinitionFingerprintInput {
  formulaText: string | null;
  unit: string | null;
  source: string;
  sourceRef: string | null;
  warn: number | null;
  critical: number | null;
  target: number | null;
}

export function computeKpiDefinitionHash(
  input: KpiDefinitionFingerprintInput
): string | null {
  const formula = input.formulaText?.trim();
  if (!formula) return null;
  return createHash("sha256")
    .update(
      JSON.stringify([
        formula,
        input.unit ?? "",
        input.source,
        input.sourceRef ?? "",
        input.warn,
        input.critical,
        input.target,
      ])
    )
    .digest("hex")
    .slice(0, 32);
}

export interface KpiDefinitionSnapshot {
  id: string;
  name: string;
  unit: string | null;
  formulaText: string | null;
  source: string;
  sourceRef: string | null;
  formulaHash: string | null;
  /** İnsan-okur sürüm etiketi var mı? Yoksa hash ile doğrulanır. */
  versionKnown: boolean;
  warn: number | null;
  critical: number | null;
  target: number | null;
  /**
   * Tanımın raporlama sıklığı (ör. "daily", "on-demand"). Gözlem dönemi
   * DEĞİLDİR; `kpi_values.period` ile karıştırılmaz.
   */
  updateFrequency: string | null;
  capturedAt: string;
}

export function snapshotFromDefinition(row: {
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
}): KpiDefinitionSnapshot {
  const warn = row.warn_threshold === null ? null : Number(row.warn_threshold);
  const critical = row.critical_threshold === null ? null : Number(row.critical_threshold);
  const target = row.target === null ? null : Number(row.target);
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    formulaText: row.formula_text,
    source: row.source,
    sourceRef: row.source_ref,
    formulaHash: computeKpiDefinitionHash({
      formulaText: row.formula_text,
      unit: row.unit,
      source: row.source,
      sourceRef: row.source_ref,
      warn,
      critical,
      target,
    }),
    versionKnown: row.source_ref !== null,
    warn,
    critical,
    target,
    updateFrequency: row.update_frequency,
    capturedAt: new Date().toISOString(),
  };
}
