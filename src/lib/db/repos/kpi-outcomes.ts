import { randomBytes } from "node:crypto";
import type { Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import {
  classifyKpiChange,
  formatMeasurementEvidence,
  inferKpiDirection,
  type KpiMeasurementInsufficientReason,
  type KpiMeasurementResult,
  type KpiOutcomeMeasurement,
} from "@/lib/kpi-outcome-measurement";
import { recordAuditEventInTransaction } from "./audit";
import { getKpiDefinitionSnapshot } from "./kpi-definition-provenance";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * KPI tabanlı gerçekleşen sonuç ölçümü.
 *
 * Zincir: onaylanmış karar → tamamlanmış aksiyon → aynı KPI'nın eylem öncesi
 * ve sonrası gerçek gözlemleri → deterministik iyileşme/kötüleşme sınıfı →
 * tek doğrulanmış ölçüm kaydı. Hiçbir değer uydurulmaz: eksik gözlem, eksik
 * KPI tanımı veya belirsiz yön "yetersiz" döner ve sonuç yazılmaz.
 */

const NUMERIC_VALUE_REGEX = "^[+-]?[0-9]+(\\.[0-9]+)?$";

const METHOD =
  "Eylem oluşturulmadan önceki ve eylem tamamlandıktan sonraki son KPI gözlemleri karşılaştırıldı; yön kayıtlı KPI eşiklerinden türetildi. Bu, gözlenen değişimdir; eylemin nedensel etkisi kanıtlanmamıştır.";

export type KpiOutcomeRejectionReason =
  | KpiMeasurementInsufficientReason
  | "already_measured";

export class KpiOutcomeError extends Error {
  readonly code = "KPI_OUTCOME_REJECTED";

  constructor(
    message: string,
    public readonly reason: KpiOutcomeRejectionReason,
    public readonly outcomeId?: string
  ) {
    super(message);
    this.name = "KpiOutcomeError";
  }
}

interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface DecisionRow {
  id: string;
  choice: string;
  decided_by: string;
  decided_by_id: string | null;
  decided_role: string | null;
  approval_permission: string | null;
  approval_source: string | null;
  approved_at: string | Date | null;
  approval_audit_id: string | null;
  approval_audit_valid: boolean | null;
  state: string;
  created_at: string | Date;
  sector_id: string;
  payload: unknown;
}

interface ActionRow {
  id: string;
  status: string;
  created_at: string | Date;
  started_at: string | Date | null;
  done_at: string | Date | null;
}

interface ObservationRow {
  value: string | number;
  created_at: string | Date;
  dataset_id: string;
  source_label: string;
  sector_id: string;
  definition_id: string | null;
  definition_hash: string | null;
  definition_version: string | null;
  observation_count: number | string;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Eşzamanlı iki ölçüm isteği benzersizlik indeksine çarparsa ham 500 yerine
 * aynı "already_measured" sözleşmesini döndür. Transaction hata nedeniyle
 * geri alınacağı için bu noktada tekrar sorgu yapılmaz.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { code?: unknown }).code === "23505" ||
      /duplicate key value/i.test((err as { message?: unknown }).message as string))
  );
}

function kpiLabelFromPayload(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const origin = (payload as { origin?: unknown }).origin;
  if (typeof origin !== "object" || origin === null) return null;
  const record = origin as { kind?: unknown; label?: unknown };
  if (record.kind !== "kpi_signal") return null;
  return typeof record.label === "string" && record.label.trim().length > 0
    ? record.label.trim()
    : null;
}

async function latestObservation(
  db: Queryable,
  params: {
    orgId: string;
    label: string;
    cutoff: string;
    /** true: cutoff'tan sonraki en yeni gözlem; false: cutoff'a kadarki en yeni. */
    after: boolean;
    measurementEnd?: string | null;
  }
): Promise<ObservationRow | null> {
  const comparator = params.after ? ">" : "<=";
  const conditions = [
    "v.org_id = $1",
    "v.label = $2",
    "v.value ~ $3",
    `v.created_at ${comparator} $4`,
  ];
  const values: unknown[] = [params.orgId, params.label, NUMERIC_VALUE_REGEX, params.cutoff];
  let countCondition = `c.created_at ${comparator} $4`;
  if (params.after && params.measurementEnd) {
    values.push(params.measurementEnd);
    conditions.push("v.created_at <= $5");
    countCondition += " AND c.created_at <= $5";
  }
  const result = await db.query<ObservationRow>(
    `SELECT v.value, v.created_at, v.dataset_id, d.source_label, d.sector_id,
            v.definition_id, v.definition_hash, v.definition_version,
            (SELECT count(*)::int FROM kpi_values c
              WHERE c.org_id = $1 AND c.label = $2 AND c.value ~ $3 AND ${countCondition}) AS observation_count
       FROM kpi_values v
       JOIN datasets d ON d.id = v.dataset_id AND d.org_id = v.org_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY v.created_at DESC, v.id DESC
      LIMIT 1`,
    values
  );
  return result.rows[0] ?? null;
}

async function computeMeasurement(
  db: Queryable,
  params: {
    orgId: string;
    decisionId: string;
    measurementEnd: string | null;
  }
): Promise<KpiMeasurementResult> {
  const decisionResult = await db.query<DecisionRow>(
    `SELECT r.id, r.choice, r.decided_by, r.decided_by_id, r.decided_role,
            r.approval_permission, r.approval_source, r.approved_at,
            r.approval_audit_id, r.state, r.created_at, r.sector_id, c.payload,
            (ae.id IS NOT NULL AND ae.type = 'decision_made'
              AND POSITION('"decisionId":"' || r.id || '"' IN COALESCE(ae.detail, '')) > 0) AS approval_audit_valid
       FROM decision_records r
       JOIN decision_cases c ON c.id = r.case_id AND c.org_id = r.org_id
       LEFT JOIN audit_events ae
         ON ae.id = r.approval_audit_id AND ae.org_id = r.org_id
      WHERE r.org_id = $1 AND r.id = $2`,
    [params.orgId, params.decisionId]
  );
  const decision = decisionResult.rows[0];
  if (!decision) {
    return {
      status: "insufficient",
      reason: "not_found",
      detail: "Karar kaydı bu kurumda bulunamadı.",
    };
  }
  if (decision.choice !== "accepted" && decision.choice !== "modified") {
    return {
      status: "insufficient",
      reason: "not_accepted",
      detail: "Yalnızca kabul edilmiş veya değiştirilerek onaylanmış kararlar ölçülebilir.",
    };
  }
  const decidedBy = decision.decided_by.trim().toLocaleLowerCase("tr");
  if (
    decision.approval_source !== "human" ||
    !decidedBy ||
    decidedBy === "sistem"
  ) {
    return {
      status: "insufficient",
      reason: "not_human_approved",
      detail:
        "Karar insan onayı provenance'ı taşımıyor; yetkili bir insan onayı olmadan sonuç ölçülemez.",
    };
  }
  if (
    !decision.decided_by_id ||
    !decision.decided_role ||
    !decision.approved_at ||
    !decision.approval_audit_id ||
    decision.approval_audit_valid !== true
  ) {
    return {
      status: "insufficient",
      reason: "approval_provenance_missing",
      detail:
        "Onaylayan kullanıcı, rol, onay zamanı veya audit referansı eksik; onay doğrulanmış sayılmaz.",
    };
  }
  if (
    decision.approval_permission !== "record_decision" ||
    !hasPermission(decision.decided_role, "record_decision")
  ) {
    return {
      status: "insufficient",
      reason: "unauthorized_approver",
      detail:
        "Onay anındaki rol/yetki karar kaydetmeye yetkili değil; onay doğrulanmış sayılmaz.",
    };
  }

  const label = kpiLabelFromPayload(decision.payload);
  if (!label) {
    return {
      status: "insufficient",
      reason: "no_kpi_origin",
      detail:
        "Karar bir KPI sinyalinden türetilmemiş; eylem öncesi/sonrası ölçülecek KPI etiketi yok.",
    };
  }

  const definition = await getKpiDefinitionSnapshot(db, params.orgId, label);
  if (!definition) {
    return {
      status: "insufficient",
      reason: "no_definition",
      detail: `"${label}" için kayıtlı KPI tanımı yok; yön güvenilir biçimde belirlenemez.`,
    };
  }
  if (!definition.formulaHash) {
    return {
      status: "insufficient",
      reason: "unknown_definition_version",
      detail:
        "KPI tanımının formül metni yok; gözlemlerin hangi hesaplama sürümüyle üretildiği doğrulanamaz.",
    };
  }
  const direction = inferKpiDirection(
    definition.warn,
    definition.critical,
    definition.target
  );
  if (!direction) {
    return {
      status: "insufficient",
      reason: "direction_unknown",
      detail:
        "KPI yönü için en az iki referans (hedef/uyarı/kritik eşik) gerekli; mevcut tanım yönü kanıtlamıyor.",
    };
  }

  const actionResult = await db.query<ActionRow>(
    `SELECT a.id, a.status, a.created_at,
            (SELECT min(ae.created_at) FROM action_events ae
              WHERE ae.org_id = a.org_id AND ae.action_id = a.id) AS started_at,
            (SELECT max(ae.created_at) FROM action_events ae
              WHERE ae.org_id = a.org_id AND ae.action_id = a.id AND ae.to_status = 'done') AS done_at
       FROM actions a
      WHERE a.org_id = $1 AND a.decision_id = $2
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1`,
    [params.orgId, params.decisionId]
  );
  const action = actionResult.rows[0];
  if (!action) {
    return {
      status: "insufficient",
      reason: "no_action",
      detail: "Karara bağlı bir aksiyon yok; yürütme tamamlanmadan sonuç ölçülemez.",
    };
  }
  if (action.status !== "done" || action.done_at === null) {
    return {
      status: "insufficient",
      reason: "action_not_done",
      detail: "Aksiyon henüz tamamlanmadı; KPI yeniden ölçümü için yürütme bitmiş olmalı.",
    };
  }

  const actionStartedAt = iso(action.started_at ?? action.created_at);
  const actionDoneAt = iso(action.done_at);
  if (params.measurementEnd) {
    const end = Date.parse(params.measurementEnd);
    if (!Number.isFinite(end)) {
      return {
        status: "insufficient",
        reason: "invalid_measurement_end",
        detail: "Ölçüm bitiş zamanı geçersiz.",
      };
    }
    if (end < Date.parse(actionDoneAt)) {
      return {
        status: "insufficient",
        reason: "invalid_measurement_end",
        detail: "Ölçüm bitişi aksiyonun tamamlanma zamanından önce olamaz.",
      };
    }
  }

  const beforeRow = await latestObservation(db, {
    orgId: params.orgId,
    label,
    cutoff: actionStartedAt,
    after: false,
  });
  if (!beforeRow) {
    return {
      status: "insufficient",
      reason: "no_baseline_observation",
      detail: `"${label}" için eylem başlangıcından önceki sayısal KPI gözlemi yok.`,
    };
  }
  const afterRow = await latestObservation(db, {
    orgId: params.orgId,
    label,
    cutoff: actionDoneAt,
    after: true,
    measurementEnd: params.measurementEnd,
  });
  if (!afterRow) {
    return {
      status: "insufficient",
      reason: "no_follow_up_observation",
      detail: `"${label}" için aksiyon tamamlandıktan sonraki sayısal KPI gözlemi yok.`,
    };
  }
  if (!beforeRow.definition_hash || !afterRow.definition_hash) {
    return {
      status: "insufficient",
      reason: "unknown_definition_version",
      detail:
        "Gözlemlerden en az biri KPI tanım/formül sürümü taşımıyor; sürümü bilinmeyen değerler karşılaştırılmaz.",
    };
  }
  if (
    beforeRow.definition_hash !== afterRow.definition_hash ||
    beforeRow.definition_id !== afterRow.definition_id
  ) {
    return {
      status: "insufficient",
      reason: "definition_version_mismatch",
      detail:
        "Önceki ve sonraki gözlem farklı KPI tanım/formül sürümüyle üretilmiş; değerler doğrudan karşılaştırılamaz.",
    };
  }
  if (
    beforeRow.definition_hash !== definition.formulaHash ||
    beforeRow.definition_id !== definition.id
  ) {
    return {
      status: "insufficient",
      reason: "definition_changed_since_observation",
      detail:
        "KPI tanımı gözlemden sonra değişmiş; eski gözlem güncel tanımla doğrulanmış sayılmaz.",
    };
  }
  if (beforeRow.dataset_id !== afterRow.dataset_id) {
    return {
      status: "insufficient",
      reason: "source_mismatch",
      detail:
        "Önceki ve sonraki gözlem farklı veri kaynaklarından; kaynak değişimi KPI değişimiyle karıştırılamaz.",
    };
  }
  if (
    beforeRow.sector_id !== afterRow.sector_id ||
    beforeRow.sector_id !== decision.sector_id
  ) {
    return {
      status: "insufficient",
      reason: "scope_mismatch",
      detail:
        "Önceki/sonraki gözlem veya karar farklı kapsamda (sektör); aynı kapsam olmadan karşılaştırma geçersizdir.",
    };
  }

  const beforeValue = Number(beforeRow.value);
  const afterValue = Number(afterRow.value);
  if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue)) {
    return {
      status: "insufficient",
      reason: "no_baseline_observation",
      detail: "KPI gözlemleri sayısal değil.",
    };
  }

  const change = classifyKpiChange(beforeValue, afterValue, direction);
  const measurement: KpiOutcomeMeasurement = {
    kpiLabel: label,
    direction,
    before: {
      value: beforeValue,
      at: iso(beforeRow.created_at),
      datasetId: beforeRow.dataset_id,
      sourceLabel: beforeRow.source_label,
      observationCount: Number(beforeRow.observation_count),
    },
    after: {
      value: afterValue,
      at: iso(afterRow.created_at),
      datasetId: afterRow.dataset_id,
      sourceLabel: afterRow.source_label,
      observationCount: Number(afterRow.observation_count),
    },
    delta: change.delta,
    pctChange: change.pctChange,
    result: change.result,
    actionStartedAt,
    actionDoneAt,
    baselineCutoff: actionStartedAt,
    measurementAt: new Date().toISOString(),
    method: METHOD,
    definition: {
      id: definition.id,
      name: definition.name,
      warn: definition.warn,
      critical: definition.critical,
      target: definition.target,
      unit: definition.unit,
      source: definition.source,
      sourceRef: definition.sourceRef,
      formulaHash: definition.formulaHash,
      versionKnown: definition.versionKnown,
      formulaText: definition.formulaText,
      capturedAt: definition.capturedAt,
    },
  };
  return { status: "ready", measurement };
}

/** Kayıt yazmadan önizleme: aynı deterministik kurallar. */
export async function previewKpiOutcome(params: {
  orgId: string;
  decisionId: string;
  measurementEnd?: string | null;
}): Promise<KpiMeasurementResult> {
  await migrate();
  return computeMeasurement(getDb(), {
    orgId: params.orgId,
    decisionId: params.decisionId,
    measurementEnd: params.measurementEnd ?? null,
  });
}

export interface RecordKpiOutcomeParams {
  orgId: string;
  decisionId: string;
  note?: string;
  lesson?: string;
  measurementEnd?: string | null;
  recordedBy: string;
}

export interface RecordKpiOutcomeResult {
  outcomeId: string;
  measurement: KpiOutcomeMeasurement;
}

/**
 * Doğrulanmış ölçümü ve sonucu tek transaction'da yazar. Aynı karar için
 * ikinci ölçüm reddedilir (idempotency); böylece ledger'da tek kanıt zinciri
 * bulunur. Karar/aksiyon/KPI sahipliği her sorguda org_id ile doğrulanır.
 */
export async function recordVerifiedKpiOutcome(
  params: RecordKpiOutcomeParams
): Promise<RecordKpiOutcomeResult> {
  await migrate();
  return getDb().transaction(async (tx: Transaction) => {
    const existing = await tx.query<{ id: string; outcome_id: string }>(
      `SELECT id, outcome_id FROM decision_kpi_measurements
        WHERE org_id = $1 AND decision_id = $2`,
      [params.orgId, params.decisionId]
    );
    if (existing.rows[0]) {
      throw new KpiOutcomeError(
        "Bu karar için doğrulanmış KPI ölçümü zaten kaydedilmiş.",
        "already_measured",
        existing.rows[0].outcome_id
      );
    }

    const computed = await computeMeasurement(tx, {
      orgId: params.orgId,
      decisionId: params.decisionId,
      measurementEnd: params.measurementEnd ?? null,
    });
    if (computed.status === "insufficient") {
      throw new KpiOutcomeError(computed.detail, computed.reason);
    }
    const measurement = computed.measurement;
    const outcomeId = randomBytes(8).toString("hex");
    const resultLabel =
      measurement.result === "improved"
        ? "iyileşti"
        : measurement.result === "worsened"
          ? "kötüleşti"
          : "değişmedi";
    const note =
      params.note?.trim() ||
      `KPI ile ölçüldü: ${measurement.kpiLabel} ${resultLabel} (${measurement.before.value} → ${measurement.after.value}).`;
    const lesson = params.lesson?.trim() || null;
    const evidence = formatMeasurementEvidence(measurement);

    await tx.query(
      `INSERT INTO outcomes
         (id, org_id, decision_id, result, note, lesson, recorded_by,
          actual_value, value_currency, measurement_start, measurement_end, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9, $10)`,
      [
        outcomeId,
        params.orgId,
        params.decisionId,
        measurement.result,
        note,
        lesson,
        params.recordedBy,
        measurement.actionStartedAt,
        measurement.after.at,
        evidence,
      ]
    );

    try {
      await tx.query(
        `INSERT INTO decision_kpi_measurements
           (id, org_id, decision_id, outcome_id, kpi_label, direction,
            before_value, before_at, before_dataset_id, before_source,
            after_value, after_at, after_dataset_id, after_source,
            delta, pct_change, result, baseline_cutoff, measurement_at, method,
            provenance, definition_snapshot, definition_hash, definition_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                 $21::jsonb, $22::jsonb, $23, $24)`,
        [
          randomBytes(8).toString("hex"),
          params.orgId,
          params.decisionId,
          outcomeId,
          measurement.kpiLabel,
          measurement.direction,
          measurement.before.value,
          measurement.before.at,
          measurement.before.datasetId,
          measurement.before.sourceLabel,
          measurement.after.value,
          measurement.after.at,
          measurement.after.datasetId,
          measurement.after.sourceLabel,
          measurement.delta,
          measurement.pctChange,
          measurement.result,
          measurement.baselineCutoff,
          measurement.measurementAt,
          measurement.method,
          JSON.stringify({
            beforeObservationCount: measurement.before.observationCount,
            afterObservationCount: measurement.after.observationCount,
            actionStartedAt: measurement.actionStartedAt,
            actionDoneAt: measurement.actionDoneAt,
          }),
          JSON.stringify(measurement.definition),
          measurement.definition.formulaHash,
          measurement.definition.sourceRef,
        ]
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new KpiOutcomeError(
          "Bu karar için doğrulanmış KPI ölçümü eşzamanlı olarak kaydedilmiş.",
          "already_measured"
        );
      }
      throw err;
    }

    const updated = await tx.query(
      `UPDATE decision_records
          SET outcome = $3::jsonb
        WHERE id = $1 AND org_id = $2`,
      [
        params.decisionId,
        params.orgId,
        JSON.stringify({
          result: measurement.result,
          note,
          lesson: lesson ?? "",
          actualImpact: null,
          measurement: {
            kpiLabel: measurement.kpiLabel,
            direction: measurement.direction,
            beforeValue: measurement.before.value,
            beforeAt: measurement.before.at,
            afterValue: measurement.after.value,
            afterAt: measurement.after.at,
            delta: measurement.delta,
            pctChange: measurement.pctChange,
            result: measurement.result,
            method: measurement.method,
            verified: true,
          },
        }),
      ]
    );
    if ((updated.affectedRows ?? 0) !== 1) {
      throw new Error("Sonuç bağlanacak karar kaydı bulunamadı.");
    }

    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId,
      actor: params.recordedBy,
      type: "outcome_measured",
      summary: `KPI ile ölçüldü: ${measurement.result}`,
      detail: JSON.stringify({
        decisionId: params.decisionId,
        outcomeId,
        kpiLabel: measurement.kpiLabel,
        before: measurement.before.value,
        after: measurement.after.value,
        delta: measurement.delta,
        result: measurement.result,
      }),
    });

    return { outcomeId, measurement };
  });
}
