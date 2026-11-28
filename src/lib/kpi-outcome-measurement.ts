/**
 * KPI tabanlı sonuç ölçümünün saf kuralları.
 *
 * Amaç: "iyileşti" iddiasını insan beyanından çıkarıp, aynı KPI etiketinin
 * eylem öncesi ve eylem sonrası gerçek gözlemlerine bağlamak. Yön (artış mı
 * azalış mı iyidir?) yalnızca kurumun kayıtlı KPI eşiklerinden türetilir;
 * varsayılan yön uydurulmaz. Belirsizlik varsa ölçüm "yetersiz" döner.
 */

import type { KpiDirection } from "./kpi-direction";

export type { KpiDirection };
export { inferKpiDirection } from "./kpi-direction";

export type KpiMeasurementInsufficientReason =
  | "not_found"
  | "not_accepted"
  | "not_human_approved"
  | "approval_provenance_missing"
  | "unauthorized_approver"
  | "no_action"
  | "action_not_done"
  | "no_kpi_origin"
  | "no_definition"
  | "definition_not_approved"
  | "direction_unknown"
  | "unknown_definition_version"
  | "definition_version_mismatch"
  | "definition_changed_since_observation"
  | "no_baseline_observation"
  | "no_follow_up_observation"
  | "source_mismatch"
  | "scope_mismatch"
  | "invalid_measurement_end";

export interface KpiObservation {
  value: number;
  at: string;
  datasetId: string;
  sourceLabel: string;
  observationCount: number;
}

export interface KpiOutcomeMeasurement {
  kpiLabel: string;
  direction: KpiDirection;
  before: KpiObservation;
  after: KpiObservation;
  delta: number;
  pctChange: number | null;
  result: "improved" | "unchanged" | "worsened";
  actionStartedAt: string;
  actionDoneAt: string;
  baselineCutoff: string;
  measurementAt: string;
  method: string;
  definition: {
    id: string;
    name: string;
    warn: number | null;
    critical: number | null;
    target: number | null;
    unit: string | null;
    source: string;
    sourceRef: string | null;
    /** formül metninin deterministik parmak izi; sürüm izlenebilirliği. */
    formulaHash: string | null;
    /** İnsan-okur sürüm etiketi (source_ref) var mı? */
    versionKnown: boolean;
    formulaText: string | null;
    capturedAt: string;
  };
}

export type KpiMeasurementResult =
  | { status: "ready"; measurement: KpiOutcomeMeasurement }
  | {
      status: "insufficient";
      reason: KpiMeasurementInsufficientReason;
      detail: string;
    };

/** Değişimin yuvarlama gürültüsü sayılması için göreli tolerans. */
export const KPI_CHANGE_TOLERANCE_RATIO = 0.001;

export interface KpiChange {
  delta: number;
  pctChange: number | null;
  result: "improved" | "unchanged" | "worsened";
}

/**
 * İki gerçek gözlem arasındaki değişimi yöne göre sınıflandırır.
 * Göreli tolerans içindeki değişim "unchanged" sayılır; sıfıra bölme yoktur.
 */
export function classifyKpiChange(
  before: number,
  after: number,
  direction: KpiDirection,
  toleranceRatio = KPI_CHANGE_TOLERANCE_RATIO
): KpiChange {
  const delta = after - before;
  const tolerance = Math.max(Math.abs(before) * toleranceRatio, 1e-9);
  const pctChange = before === 0 ? null : (delta / Math.abs(before)) * 100;
  if (Math.abs(delta) <= tolerance) {
    return { delta, pctChange, result: "unchanged" };
  }
  const improved = direction === "higher_is_better" ? delta > 0 : delta < 0;
  return { delta, pctChange, result: improved ? "improved" : "worsened" };
}

export function formatKpiValue(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString("tr-TR", { maximumFractionDigits: 4 })
    : "—";
}

/**
 * Ledger ve denetim için insan-okur, deterministik kanıt metni.
 * Terminoloji: bu metin nedensel etki iddiası değil, gözlenen değişimdir.
 */
export function formatMeasurementEvidence(measurement: KpiOutcomeMeasurement): string {
  const pct =
    measurement.pctChange === null
      ? "yüzde değişim hesaplanamadı (başlangıç 0)"
      : `yüzde ${measurement.pctChange.toFixed(2)}`;
  return [
    `KPI "${measurement.kpiLabel}"`,
    `birim ${measurement.definition.unit ?? "tanımsız"}`,
    `önce ${formatKpiValue(measurement.before.value)} (${measurement.before.at.slice(0, 10)}, ${measurement.before.sourceLabel})`,
    `sonra ${formatKpiValue(measurement.after.value)} (${measurement.after.at.slice(0, 10)}, ${measurement.after.sourceLabel})`,
    `fark ${formatKpiValue(measurement.delta)}, ${pct}`,
    `yön ${measurement.direction === "lower_is_better" ? "düşük daha iyi" : "yüksek daha iyi"}`,
    `sonuç ${measurement.result}`,
    `tanım kaynağı ${measurement.definition.source}${measurement.definition.sourceRef ? ` (${measurement.definition.sourceRef})` : ""}`,
    `formül hash ${measurement.definition.formulaHash ?? "yok"}${measurement.definition.versionKnown ? "" : " (sürüm etiketi yok; hash ile doğrulandı)"}`,
    `tanım snapshot zamanı ${measurement.definition.capturedAt}`,
    `yöntem ${measurement.method}`,
    "bu bir gözlenen değişim ölçümüdür; eylemin nedensel etkisi kanıtlanmamıştır",
  ].join("; ");
}
