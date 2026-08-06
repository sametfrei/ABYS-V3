import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";

/**
 * KPI kayıt defteri repository'si — tüm sorgular org-farkındalıklı.
 * Eşik karşılaştırması burada, kodda, deterministik olarak yapılır;
 * modele sayı ürettirilmez.
 */

export interface KpiDefinition {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  unit: string | null;
  formulaText: string | null;
  owner: string | null;
  department: string | null;
  target: number | null;
  warnThreshold: number | null;
  criticalThreshold: number | null;
  updateFrequency: string | null;
  createdAt: string;
}

export type ThresholdStatus = "critical" | "warning" | "healthy" | "unknown";

function toNumberOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapRow(row: {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  formula_text: string | null;
  owner: string | null;
  department: string | null;
  target: string | number | null;
  warn_threshold: string | number | null;
  critical_threshold: string | number | null;
  update_frequency: string | null;
  created_at: string;
}, orgId: string): KpiDefinition {
  return {
    id: row.id,
    orgId,
    name: row.name,
    description: row.description,
    unit: row.unit,
    formulaText: row.formula_text,
    owner: row.owner,
    department: row.department,
    target: toNumberOrNull(row.target),
    warnThreshold: toNumberOrNull(row.warn_threshold),
    criticalThreshold: toNumberOrNull(row.critical_threshold),
    updateFrequency: row.update_frequency,
    createdAt: row.created_at,
  };
}

/** Aynı org+isim için varsa günceller, yoksa yeni tanım ekler. */
export async function upsertDefinition(params: {
  orgId: string;
  name: string;
  description?: string;
  unit?: string;
  formulaText?: string;
  owner?: string;
  department?: string;
  target?: number;
  warnThreshold?: number;
  criticalThreshold?: number;
  updateFrequency?: string;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  const r = await getDb().query<{ id: string }>(
    `INSERT INTO kpi_definitions
       (id, org_id, name, description, unit, formula_text, owner, department, target, warn_threshold, critical_threshold, update_frequency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (org_id, name) DO UPDATE SET
       description = EXCLUDED.description,
       unit = EXCLUDED.unit,
       formula_text = EXCLUDED.formula_text,
       owner = EXCLUDED.owner,
       department = EXCLUDED.department,
       target = EXCLUDED.target,
       warn_threshold = EXCLUDED.warn_threshold,
       critical_threshold = EXCLUDED.critical_threshold,
       update_frequency = EXCLUDED.update_frequency
     RETURNING id`,
    [
      id,
      params.orgId,
      params.name,
      params.description ?? null,
      params.unit ?? null,
      params.formulaText ?? null,
      params.owner ?? null,
      params.department ?? null,
      params.target ?? null,
      params.warnThreshold ?? null,
      params.criticalThreshold ?? null,
      params.updateFrequency ?? null,
    ]
  );
  return r.rows[0].id;
}

export async function listDefinitions(orgId: string): Promise<KpiDefinition[]> {
  await migrate();
  const r = await getDb().query<{
    id: string;
    name: string;
    description: string | null;
    unit: string | null;
    formula_text: string | null;
    owner: string | null;
    department: string | null;
    target: string | number | null;
    warn_threshold: string | number | null;
    critical_threshold: string | number | null;
    update_frequency: string | null;
    created_at: string;
  }>(
    `SELECT id, name, description, unit, formula_text, owner, department, target, warn_threshold, critical_threshold, update_frequency, created_at
     FROM kpi_definitions WHERE org_id = $1 ORDER BY name`,
    [orgId]
  );
  return r.rows.map((row) => mapRow(row, orgId));
}

/**
 * Bir KPI değerini org'un kayıtlı eşiklerine karşı deterministik olarak
 * değerlendirir. Yön (düşük mü kötü, yüksek mi kötü) kritik eşiğin uyarı
 * eşiğine/hedefe göre konumundan çıkarılır — modele sayı ürettirilmez.
 */
export async function evaluateAgainstThresholds(
  orgId: string,
  label: string,
  value: number
): Promise<{ status: ThresholdStatus; definition: KpiDefinition | null }> {
  const definitions = await listDefinitions(orgId);
  const definition = definitions.find((d) => d.name === label) ?? null;
  if (!definition) {
    return { status: "unknown", definition: null };
  }

  const { warnThreshold, criticalThreshold, target } = definition;
  if (criticalThreshold === null && warnThreshold === null) {
    return { status: "unknown", definition };
  }

  const lowerIsWorse =
    criticalThreshold !== null && warnThreshold !== null
      ? criticalThreshold <= warnThreshold
      : criticalThreshold !== null && target !== null
        ? criticalThreshold <= target
        : warnThreshold !== null && target !== null
          ? warnThreshold <= target
          : true;

  if (lowerIsWorse) {
    if (criticalThreshold !== null && value <= criticalThreshold) return { status: "critical", definition };
    if (warnThreshold !== null && value <= warnThreshold) return { status: "warning", definition };
    return { status: "healthy", definition };
  }
  if (criticalThreshold !== null && value >= criticalThreshold) return { status: "critical", definition };
  if (warnThreshold !== null && value >= warnThreshold) return { status: "warning", definition };
  return { status: "healthy", definition };
}
