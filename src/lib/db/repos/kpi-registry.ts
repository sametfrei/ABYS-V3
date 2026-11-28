import { randomBytes } from "crypto";
import { randomUUID } from "node:crypto";
import { getDb, migrate } from "../client";
import { computeKpiDefinitionHash } from "@/lib/kpi-definition-provenance";
import { hasPermission } from "@/lib/auth/permissions";
import { recordAuditEventInTransaction } from "./audit";

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
  source: string;
  sourceRef: string | null;
  createdAt: string;
  governanceState: "discovered" | "mapped" | "calculable" | "validated" | "approved";
  approvedRevision: number | null;
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
  source: string;
  source_ref: string | null;
  created_at: string;
  governance_state: KpiDefinition["governanceState"];
  approved_revision: number | null;
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
    source: row.source,
    sourceRef: row.source_ref,
    createdAt: row.created_at,
    governanceState: row.governance_state,
    approvedRevision: row.approved_revision,
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
  actorId?: string;
  actorName?: string;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  return getDb().transaction(async (tx) => {
    await tx.query("SELECT set_config('abys.actor_id',$1,true), set_config('abys.actor_name',$2,true)", [params.actorId ?? "system", params.actorName ?? "System / import"]);
    const r = await tx.query<{ id: string }>(
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
       update_frequency = EXCLUDED.update_frequency,
       governance_state = 'calculable',
       approved_revision = NULL,
       source = 'manual',
       source_ref = NULL
     RETURNING id, org_id, name, description, unit, formula_text, owner, department, target, warn_threshold, critical_threshold, update_frequency, source, source_ref, created_at, governance_state, approved_revision`,
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
    const row = r.rows[0];
    return row.id;
  });
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
    source: string;
    source_ref: string | null;
    created_at: string;
    governance_state: KpiDefinition["governanceState"];
    approved_revision: number | null;
  }>(
    `SELECT id, name, description, unit, formula_text, owner, department, target, warn_threshold, critical_threshold, update_frequency, source, source_ref, created_at, governance_state, approved_revision
     FROM kpi_definitions WHERE org_id = $1 ORDER BY name`,
    [orgId]
  );
  return r.rows.map((row) => mapRow(row, orgId));
}

export async function validateDefinition(params: {
  orgId: string;
  id: string;
  userId: string;
  displayName: string;
  role: string;
}): Promise<boolean> {
  await migrate();
  if (!hasPermission(params.role, "validate_kpi_definition")) {
    throw new Error("Role is not permitted to validate KPI definitions.");
  }

  return getDb().transaction(async (tx) => {
    const current = await tx.query<{
      name: string; unit: string | null; formula_text: string | null; source: string;
      source_ref: string | null; warn_threshold: number | string | null;
      critical_threshold: number | string | null; target: number | string | null;
      governance_state: string;
    }>(
      "SELECT name,unit,formula_text,source,source_ref,warn_threshold,critical_threshold,target,governance_state FROM kpi_definitions WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [params.orgId, params.id]
    );
    const row = current.rows[0];
    if (!row) return false;
    if (row.governance_state === "validated") return true;
    if (row.governance_state !== "calculable") {
      throw new Error("Definition must be calculable before structural validation.");
    }

    const warn = toNumberOrNull(row.warn_threshold);
    const critical = toNumberOrNull(row.critical_threshold);
    const target = toNumberOrNull(row.target);
    const checks = {
      formulaPresent: Boolean(row.formula_text?.trim()),
      unitPresent: Boolean(row.unit?.trim()),
      thresholdPresent: warn !== null || critical !== null,
      thresholdsDistinct: warn === null || critical === null || warn !== critical,
      targetConsistent: (() => {
        if (warn !== null && critical !== null) {
          return target === null || (critical <= warn ? target > warn : target < warn);
        }
        const onlyThreshold = warn ?? critical;
        return onlyThreshold === null || (target !== null && target !== onlyThreshold);
      })(),
      formulaExecution: "not_executed",
    };
    const valid = checks.formulaPresent && checks.unitPresent && checks.thresholdPresent && checks.thresholdsDistinct && checks.targetConsistent;
    if (!valid) {
      throw new Error(`KPI structural validation failed: ${Object.entries(checks).filter(([key, value]) => key !== "formulaExecution" && value === false).map(([key]) => key).join(", ")}`);
    }

    const revisionResult = await tx.query<{ revision: number; snapshot: Record<string, unknown> }>(
      "SELECT revision, snapshot FROM kpi_definition_revisions WHERE org_id=$1 AND definition_id=$2 ORDER BY revision DESC LIMIT 1",
      [params.orgId, params.id]
    );
    const revision = revisionResult.rows[0];
    if (!revision) throw new Error("A recorded definition revision is required for validation.");
    const currentHash = computeKpiDefinitionHash({
      formulaText: row.formula_text, unit: row.unit, source: row.source, sourceRef: row.source_ref,
      warn, critical, target,
    });
    const snapshot = revision.snapshot;
    const revisionHash = computeKpiDefinitionHash({
      formulaText: typeof snapshot.formula_text === "string" ? snapshot.formula_text : null,
      unit: typeof snapshot.unit === "string" ? snapshot.unit : null,
      source: typeof snapshot.source === "string" ? snapshot.source : "",
      sourceRef: typeof snapshot.source_ref === "string" ? snapshot.source_ref : null,
      warn: toNumberOrNull(snapshot.warn_threshold),
      critical: toNumberOrNull(snapshot.critical_threshold),
      target: toNumberOrNull(snapshot.target),
    });
    if (!currentHash || currentHash !== revisionHash) {
      throw new Error("Current definition does not match the latest immutable revision.");
    }

    const auditEventId = await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.displayName, type: "kpi_definition_validated",
      summary: `KPI definition structurally validated: ${params.id}`,
      detail: JSON.stringify({ definitionId: params.id, revision: revision.revision, definitionHash: currentHash, actorId: params.userId, role: params.role, permission: "validate_kpi_definition", checks }),
    });
    await tx.query(
      "INSERT INTO kpi_definition_validations (id,org_id,definition_id,revision,definition_hash,validated_by_id,validated_by_name,validated_role,permission,checks,audit_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'validate_kpi_definition',$9::jsonb,$10)",
      [randomUUID(), params.orgId, params.id, revision.revision, currentHash, params.userId, params.displayName, params.role, JSON.stringify(checks), auditEventId]
    );
    await tx.query("UPDATE kpi_definitions SET governance_state='validated' WHERE org_id=$1 AND id=$2", [params.orgId, params.id]);
    return true;
  });
}

export async function approveDefinition(params: {
  orgId: string;
  id: string;
  userId: string;
  displayName: string;
  role: string;
}): Promise<boolean> {
  await migrate();
  if (!hasPermission(params.role, "approve_kpi_definition")) {
    throw new Error("Role is not permitted to approve KPI definitions.");
  }

  return getDb().transaction(async (tx) => {
    const current = await tx.query<{
      name: string;
      unit: string | null;
      formula_text: string | null;
      source: string;
      source_ref: string | null;
      warn_threshold: number | string | null;
      critical_threshold: number | string | null;
      target: number | string | null;
      governance_state: string;
    }>(
      "SELECT name,unit,formula_text,source,source_ref,warn_threshold,critical_threshold,target,governance_state FROM kpi_definitions WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [params.orgId, params.id]
    );
    const row = current.rows[0];
    if (!row) return false;
    if (row.governance_state !== "validated") {
      throw new Error("Definition must pass structural validation before approval.");
    }

    const revisionResult = await tx.query<{
      revision: number;
      snapshot: Record<string, unknown>;
    }>(
      "SELECT revision, snapshot FROM kpi_definition_revisions WHERE org_id=$1 AND definition_id=$2 ORDER BY revision DESC LIMIT 1",
      [params.orgId, params.id]
    );
    const revision = revisionResult.rows[0];
    if (!revision) throw new Error("A recorded definition revision is required for approval.");

    const hashInput = {
      formulaText: row.formula_text,
      unit: row.unit,
      source: row.source,
      sourceRef: row.source_ref,
      warn: toNumberOrNull(row.warn_threshold),
      critical: toNumberOrNull(row.critical_threshold),
      target: toNumberOrNull(row.target),
    };
    const currentHash = computeKpiDefinitionHash(hashInput);
    const snapshot = revision.snapshot;
    const revisionHash = computeKpiDefinitionHash({
      formulaText: typeof snapshot.formula_text === "string" ? snapshot.formula_text : null,
      unit: typeof snapshot.unit === "string" ? snapshot.unit : null,
      source: typeof snapshot.source === "string" ? snapshot.source : "",
      sourceRef: typeof snapshot.source_ref === "string" ? snapshot.source_ref : null,
      warn: toNumberOrNull(snapshot.warn_threshold),
      critical: toNumberOrNull(snapshot.critical_threshold),
      target: toNumberOrNull(snapshot.target),
    });
    if (!currentHash || currentHash !== revisionHash) {
      throw new Error("Current definition does not match the latest immutable revision.");
    }

    const auditEventId = await recordAuditEventInTransaction(tx, {
      orgId: params.orgId,
      actor: params.displayName,
      type: "kpi_definition_approved",
      summary: `KPI definition approved: ${params.id}`,
      detail: JSON.stringify({
        definitionId: params.id,
        revision: revision.revision,
        definitionHash: currentHash,
        actorId: params.userId,
        role: params.role,
        permission: "approve_kpi_definition",
      }),
    });

    await tx.query(
      "INSERT INTO kpi_definition_approvals (id,org_id,definition_id,revision,definition_hash,approved_by_id,approved_by_name,approved_role,permission,audit_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'approve_kpi_definition',$9)",
      [randomUUID(), params.orgId, params.id, revision.revision, currentHash, params.userId, params.displayName, params.role, auditEventId]
    );
    await tx.query(
      "UPDATE kpi_definitions SET governance_state='approved', approved_revision=$3 WHERE org_id=$1 AND id=$2",
      [params.orgId, params.id, revision.revision]
    );
    return true;
  });
}

/**
 * Yön çıkarımı: kritik/uyarı eşiğinin hedefe göre konumu. Düşük değer kötüyse
 * true. Eşikler yoksa güvenli varsayım düşük değerin kötü olduğudur.
 * Deterministik ve saf; KPI değerlendirme ile sinyal sınıflandırma aynı
 * kuralı paylaşır.
 */
export function lowerIsWorseValue(
  warnThreshold: number | null,
  criticalThreshold: number | null,
  target: number | null
): boolean {
  return criticalThreshold !== null && warnThreshold !== null
    ? criticalThreshold <= warnThreshold
    : criticalThreshold !== null && target !== null
      ? criticalThreshold <= target
      : warnThreshold !== null && target !== null
        ? warnThreshold <= target
        : true;
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
  if (!definition) return { status: "unknown", definition: null };
  if (definition.governanceState !== "approved") return { status: "unknown", definition };

  const { warnThreshold, criticalThreshold, target } = definition;
  if (criticalThreshold === null && warnThreshold === null) {
    return { status: "unknown", definition };
  }

  const lowerIsWorse = lowerIsWorseValue(warnThreshold, criticalThreshold, target);

  if (lowerIsWorse) {
    if (criticalThreshold !== null && value <= criticalThreshold) return { status: "critical", definition };
    if (warnThreshold !== null && value <= warnThreshold) return { status: "warning", definition };
    return { status: "healthy", definition };
  }
  if (criticalThreshold !== null && value >= criticalThreshold) return { status: "critical", definition };
  if (warnThreshold !== null && value >= warnThreshold) return { status: "warning", definition };
  return { status: "healthy", definition };
}
