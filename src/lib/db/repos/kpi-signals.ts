import { createHash } from "node:crypto";
import { getDb, migrate } from "../client";
import { computeKpiDefinitionHash } from "@/lib/kpi-definition-provenance";
import {
  inferKpiDirectionWithBasis,
  type KpiDirection,
  type KpiDirectionBasis,
} from "@/lib/kpi-direction";
import {
  ANOMALY_DEFAULT_THRESHOLD,
  ANOMALY_DEFAULT_WINDOW,
  detectAnomalies,
} from "@/lib/anomaly";

/**
 * Hesaplanmış KPI serilerinden deterministik aykırılık sinyali üretimi.
 *
 * Seri kimliği yalnızca etiket değildir: aynı etiketli farklı veri seti,
 * varlık, dış kimlik, dönem veya KPI tanım sürümü ayrı seri olarak tutulur.
 * Connector kaynaklı eski satırlarda kapsam (entity + external_id) yoksa
 * istatistiksel analiz yapılmaz; bu seriler "kapsamı doğrulanmamış" sayılır.
 *
 * İstatistiksel yön tek başına iş etkisi değildir. Risk/fırsat sınıflandırması
 * yalnızca gözlemle eşleşen KPI tanımının yönü + eşik/hedef aşımıyla yapılır.
 * Kanıt yetersizse sınıflandırma "unclassified" kalır; nedensellik iddia
 * edilmez.
 */

const NUMERIC_VALUE_REGEX = "^[+-]?[0-9]+(\\.[0-9]+)?$";
const MAX_POINTS_PER_SERIES = 500;
const CONNECTOR_SOURCE_PREFIX = "Konnektör:";

export type KpiSignalClassification = "risk" | "opportunity" | "unclassified";
export type KpiSignalDirection = KpiDirection;
export type KpiSignalSeverity = "critical" | "warning" | "info";

export interface KpiSignalScope {
  label: string;
  datasetId: string;
  datasetLabel: string;
  sectorId: string;
  entity: string | null;
  externalId: string | null;
  /** Gözlem dönemi. Bilinmiyorsa null; raporlama sıklığı ile karıştırılmaz. */
  period: string | null;
  definitionId: string | null;
  definitionHash: string | null;
  definitionVersion: string | null;
  definitionUnit: string | null;
  /** Tanımın raporlama sıklığı (update_frequency); gözlem dönemi değildir. */
  reportingFrequency: string | null;
}

export interface KpiAnomalySignal {
  id: string;
  observationId: string;
  label: string;
  severity: KpiSignalSeverity;
  title: string;
  datasetId: string;
  datasetLabel: string;
  entity: string | null;
  externalId: string | null;
  period: string | null;
  reportingFrequency: string | null;
  definitionId: string | null;
  definitionVersion: string | null;
  definitionHash: string | null;
  definitionUnit: string | null;
  observedAt: string | null;
  score: number;
  direction: "above" | "below";
  classification: KpiSignalClassification;
  classificationReason: string;
  sampleSize: number;
  seriesPoints: number;
  analysisWindow: number;
}

export interface KpiSeriesCounts {
  /** Yüklenen farklı KPI etiketleri (doğrulanmış + doğrulanmamış). */
  scannedLabels: number;
  /** Kapsamı doğrulanmış/doğrulanmamış tüm seriler. */
  scannedSeries: number;
  /** Ölçüm kapsamı doğrulanmış seriler. */
  verifiedSeries: number;
  /** Kapsamı doğrulanamadığı için analiz edilmeyen seriler. */
  skippedUnverifiedSeries: number;
  /** Doğrulanmış ve dedektör için yeterli gözlemi olan seriler. */
  analyzedSeries: number;
  /** Doğrulanmış ancak minimum gözlem sayısının altındaki seriler. */
  insufficientSeries: number;
}

export interface KpiAnomalyGenerationResult extends KpiSeriesCounts {
  generated: number;
  existing: number;
  signals: KpiAnomalySignal[];
}

export interface KpiSeriesPoint {
  id: string;
  value: number;
  timestamp: string;
}

export interface KpiScopedSeries {
  scope: KpiSignalScope;
  points: KpiSeriesPoint[];
  scopeVerified: boolean;
}

export interface KpiDefinitionInfo {
  id: string;
  formulaHash: string | null;
  version: string | null;
  unit: string | null;
  updateFrequency: string | null;
  warn: number | null;
  critical: number | null;
  target: number | null;
}

export interface KpiSeriesLoadResult extends KpiSeriesCounts {
  series: KpiScopedSeries[];
  definitions: Map<string, KpiDefinitionInfo>;
}

export interface SignalDirectionInference {
  direction: KpiSignalDirection;
  basis: KpiDirectionBasis;
}

export interface KpiSignalClassificationResult {
  classification: KpiSignalClassification;
  severity: KpiSignalSeverity;
  reason: string;
  direction: KpiSignalDirection | null;
  directionBasis: Array<"warn" | "critical" | "target">;
  crossed: "critical" | "warning" | "target" | null;
}

interface SignalRow {
  id: string;
  label: string;
  value: string;
  created_at: string | Date;
  dataset_id: string;
  sector_id: string;
  source_label: string;
  entity: string | null;
  external_id: string | null;
  period: string | null;
  definition_id: string | null;
  definition_hash: string | null;
  definition_version: string | null;
}

interface DefinitionRow {
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
  governance_state?: string;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function numberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function seriesKey(scope: KpiSignalScope): string {
  return JSON.stringify([
    scope.label,
    scope.datasetId,
    scope.sectorId,
    scope.entity,
    scope.externalId,
    scope.period,
    scope.definitionId,
    scope.definitionHash,
    scope.definitionVersion,
  ]);
}

/**
 * Sinyal kimliği tüm ölçüm-kapsamı bileşenlerini taşır: aynı etiket/zaman/skor
 * farklı dataset veya entity'de aynı kimliği üretmez. Aynı gözlem tekrar
 * işlendiğinde kimlik değişmez (idempotency).
 */
function signalId(
  orgId: string,
  key: string,
  timestamp: string | null,
  score: number,
  value: number,
  direction: "above" | "below"
): string {
  return createHash("sha256")
    .update(
      ["kpi-anomaly", orgId, key, timestamp ?? "", String(score), String(value), direction].join(
        "\u001f"
      )
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * Geriye dönük ad: tek kanonik yön çıkarımının (`kpi-direction.ts`) sinyal
 * tarafındaki takma adı. Ayrı bir uygulama yoktur.
 */
export { inferKpiDirectionWithBasis as inferSignalDirection };

function isBadSide(value: number, threshold: number, direction: KpiSignalDirection): boolean {
  // lower_is_better: yüksek değer kötü; higher_is_better: düşük değer kötü.
  return direction === "lower_is_better" ? value >= threshold : value <= threshold;
}

function isGoodSide(value: number, target: number, direction: KpiSignalDirection): boolean {
  return direction === "lower_is_better" ? value <= target : value >= target;
}

/**
 * İstatistiksel aykırılığı iş etkisiyle karıştırmadan sınıflandırır:
 * - Risk: kötü yönde ve tanımlı uyarı/kritik eşiği aşılmış.
 * - Fırsat: iyi yönde ve tanımlı hedef aşılmış.
 * - Aksi halde unclassified. Hedef yoksa fırsat üretilmez.
 */
export function classifyKpiAnomaly(params: {
  value: number;
  anomalyDirection: "above" | "below";
  warn: number | null;
  critical: number | null;
  target: number | null;
  definitionVerified: boolean;
}): KpiSignalClassificationResult {
  if (!params.definitionVerified) {
    return {
      classification: "unclassified",
      severity: "info",
      reason:
        "Gözlem, güncel KPI tanımı ve formül sürümüyle eşleşmiyor; iş etkisi sınıflandırılmadı.",
      direction: null,
      directionBasis: [],
      crossed: null,
    };
  }

  const inferred = inferKpiDirectionWithBasis(params.warn, params.critical, params.target);
  if (!inferred) {
    return {
      classification: "unclassified",
      severity: "info",
      reason:
        "KPI yönü için en az iki tutarlı referans (uyarı/kritik/hedef) yok; iş etkisi sınıflandırılmadı.",
      direction: null,
      directionBasis: [],
      crossed: null,
    };
  }

  const { direction, basis } = inferred;
  const badDirection = direction === "lower_is_better" ? "above" : "below";

  if (params.anomalyDirection === badDirection) {
    if (params.critical !== null && isBadSide(params.value, params.critical, direction)) {
      return {
        classification: "risk",
        severity: "critical",
        reason: "Kötü yönde aykırılık ve tanımlı kritik eşik aşıldı.",
        direction,
        directionBasis: basis,
        crossed: "critical",
      };
    }
    if (params.warn !== null && isBadSide(params.value, params.warn, direction)) {
      return {
        classification: "risk",
        severity: "warning",
        reason: "Kötü yönde aykırılık ve tanımlı uyarı eşiği aşıldı.",
        direction,
        directionBasis: basis,
        crossed: "warning",
      };
    }
    return {
      classification: "unclassified",
      severity: "info",
      reason:
        "Aykırılık kötü yönde ancak tanımlı uyarı/kritik eşik aşılmadı; iş etkisi sınıflandırılmadı.",
      direction,
      directionBasis: basis,
      crossed: null,
    };
  }

  if (params.target === null) {
    return {
      classification: "unclassified",
      severity: "info",
      reason: "Tanımlı hedef yok; iyi yöndeki aykırılık fırsat olarak sınıflandırılmadı.",
      direction,
      directionBasis: basis,
      crossed: null,
    };
  }
  if (isGoodSide(params.value, params.target, direction)) {
    return {
      classification: "opportunity",
      severity: "info",
      reason: "İyi yönde aykırılık ve tanımlı hedef aşıldı.",
      direction,
      directionBasis: basis,
      crossed: "target",
    };
  }
  return {
    classification: "unclassified",
    severity: "info",
    reason: "İyi yönde aykırılık var ancak tanımlı hedef aşılmadı; fırsat denmedi.",
    direction,
    directionBasis: basis,
    crossed: null,
  };
}

async function loadDefinitions(orgId: string): Promise<Map<string, KpiDefinitionInfo>> {
  const result = await getDb().query<DefinitionRow>(
    `SELECT id, name, unit, formula_text, source, source_ref,
            warn_threshold, critical_threshold, target, update_frequency
       FROM kpi_definitions
      WHERE org_id = $1 AND governance_state = 'approved'`,
    [orgId]
  );
  return new Map(
    result.rows.map((row) => {
      const warn = numberOrNull(row.warn_threshold);
      const critical = numberOrNull(row.critical_threshold);
      const target = numberOrNull(row.target);
      return [
        row.name,
        {
          id: row.id,
          formulaHash: computeKpiDefinitionHash({
            formulaText: row.formula_text,
            unit: row.unit,
            source: row.source,
            sourceRef: row.source_ref,
            warn,
            critical,
            target,
          }),
          version: row.source_ref,
          unit: row.unit,
          updateFrequency: row.update_frequency,
          warn,
          critical,
          target,
        },
      ];
    })
  );
}

/**
 * Seri sayım sözleşmesi: yüklenen, kapsamı doğrulanmış, atlanan, analiz
 * edilebilir ve yetersiz seriler birbirinden ayrı raporlanır. `analyzedSeries`
 * yalnızca doğrulanmış ve dedektörün minimum gözlem eşiğini karşılayan
 * serileri sayar; `flaggedSeries` bunların yalnızca aykırılık bulunan alt
 * kümesidir.
 */
export function summarizeKpiSeries(
  series: KpiScopedSeries[],
  window = ANOMALY_DEFAULT_WINDOW
): KpiSeriesCounts {
  const normalizedWindow = Math.max(3, Math.round(window));
  const minPoints = normalizedWindow + 2;
  const verified = series.filter((item) => item.scopeVerified);
  const analyzed = verified.filter((item) => item.points.length >= minPoints);
  return {
    scannedLabels: new Set(series.map((item) => item.scope.label)).size,
    scannedSeries: series.length,
    verifiedSeries: verified.length,
    skippedUnverifiedSeries: series.length - verified.length,
    analyzedSeries: analyzed.length,
    insufficientSeries: verified.length - analyzed.length,
  };
}

/**
 * Org kapsamlı, seri kimliğine göre sınırlı gözlem yükleyici. Aynı etiketli
 * farklı dataset/entity/external_id/dönem/tanım sürümleri ayrı tutulur.
 * Connector kaynaklı ve entity/external_id'si eksik seriler doğrulanmamış
 * sayılır; GET önizlemesi ve POST üretimi aynı kapsamı kullanır.
 */
export async function loadKpiSeriesScopes(
  orgId: string,
  limitPerSeries = MAX_POINTS_PER_SERIES
): Promise<KpiSeriesLoadResult> {
  await migrate();
  const limit = Math.min(2000, Math.max(1, Math.round(limitPerSeries)));
  const definitions = await loadDefinitions(orgId);

  const rows = await getDb().query<SignalRow>(
    `SELECT id, label, value, created_at, dataset_id, sector_id, source_label,
            entity, external_id, period, definition_id, definition_hash, definition_version
       FROM (
         SELECT v.id, v.label, v.value, v.created_at, v.dataset_id,
                d.sector_id, d.source_label,
                v.entity, v.external_id, v.period,
                v.definition_id, v.definition_hash, v.definition_version,
                row_number() OVER (
                  PARTITION BY v.label, v.dataset_id, v.entity, v.external_id,
                               v.period, v.definition_id, v.definition_hash,
                               v.definition_version
                  ORDER BY v.created_at DESC, v.id DESC
                ) AS rn
           FROM kpi_values v
           JOIN datasets d ON d.id = v.dataset_id AND d.org_id = v.org_id
          WHERE v.org_id = $1 AND v.value ~ $2
       ) recent
      WHERE rn <= $3
      ORDER BY label ASC, dataset_id ASC, entity ASC NULLS FIRST, external_id ASC NULLS FIRST,
               period ASC NULLS FIRST, definition_id ASC NULLS FIRST,
               definition_hash ASC NULLS FIRST, definition_version ASC NULLS FIRST,
               created_at ASC, id ASC`,
    [orgId, NUMERIC_VALUE_REGEX, limit]
  );

  const buckets = new Map<
    string,
    { scope: KpiSignalScope; points: KpiSeriesPoint[]; scopeVerified: boolean }
  >();

  for (const row of rows.rows) {
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    const definition = definitions.get(row.label);
    const scope: KpiSignalScope = {
      label: row.label,
      datasetId: row.dataset_id,
      datasetLabel: row.source_label,
      sectorId: row.sector_id,
      entity: row.entity,
      externalId: row.external_id,
      period: row.period,
      definitionId: row.definition_id,
      definitionHash: row.definition_hash,
      definitionVersion: row.definition_version,
      definitionUnit: definition?.unit ?? null,
      reportingFrequency: definition?.updateFrequency ?? null,
    };
    const key = seriesKey(scope);
    const isConnector = row.source_label.startsWith(CONNECTOR_SOURCE_PREFIX);
    const scopeVerified =
      !isConnector || (row.entity !== null && row.external_id !== null);
    const bucket = buckets.get(key) ?? {
      scope,
      points: [],
      scopeVerified,
    };
    bucket.scopeVerified = bucket.scopeVerified && scopeVerified;
    bucket.points.push({
      id: row.id,
      value,
      timestamp: iso(row.created_at),
    });
    buckets.set(key, bucket);
  }

  const series = [...buckets.values()].map((bucket) => ({
    scope: bucket.scope,
    points: bucket.points,
    scopeVerified: bucket.scopeVerified,
  }));

  return {
    series,
    definitions,
    ...summarizeKpiSeries(series),
  };
}

export async function generateKpiAnomalySignals(
  orgId: string,
  options: { window?: number; threshold?: number } = {}
): Promise<KpiAnomalyGenerationResult> {
  const window = Math.max(3, Math.round(options.window ?? ANOMALY_DEFAULT_WINDOW));
  const threshold = options.threshold ?? ANOMALY_DEFAULT_THRESHOLD;
  const loaded = await loadKpiSeriesScopes(orgId);

  let generated = 0;
  let existing = 0;
  const signals: KpiAnomalySignal[] = [];

  for (const bucket of loaded.series) {
    if (!bucket.scopeVerified) continue;
    const { scope, points } = bucket;
    const anomalies = detectAnomalies(
      points.map((point) => point.value),
      {
        window,
        threshold,
        timestamps: points.map((point) => point.timestamp),
        maxResults: 1,
      }
    );
    const latest = anomalies[0];
    if (!latest) continue;
    const point = points[latest.index];
    if (!point) continue;

    const definition = loaded.definitions.get(scope.label);
    const definitionVerified =
      definition !== undefined &&
      scope.definitionId !== null &&
      scope.definitionHash !== null &&
      scope.definitionId === definition.id &&
      scope.definitionHash === definition.formulaHash;

    const classified = classifyKpiAnomaly({
      value: point.value,
      anomalyDirection: latest.direction,
      warn: definitionVerified && definition ? definition.warn : null,
      critical: definitionVerified && definition ? definition.critical : null,
      target: definitionVerified && definition ? definition.target : null,
      definitionVerified,
    });

    const categoryId =
      classified.classification === "opportunity" ? "kpi_opportunity" : "kpi_anomaly";
    const key = seriesKey(scope);
    const id = signalId(
      orgId,
      key,
      latest.timestamp,
      latest.score,
      point.value,
      latest.direction
    );
    const heading =
      classified.classification === "opportunity"
        ? "KPI fırsatı"
        : classified.classification === "risk"
          ? "KPI riski"
          : "KPI aykırısı";
    const title = `${heading}: ${scope.label} (${
      latest.direction === "above" ? "üst" : "alt"
    } yönde, skor ${latest.score})`;
    const sampleSize = Math.min(window, latest.index);
    const payload = {
      kind: categoryId,
      observationId: point.id,
      classification: classified.classification,
      classificationReason: classified.reason,
      label: scope.label,
      series: {
        datasetId: scope.datasetId,
        datasetLabel: scope.datasetLabel,
        sectorId: scope.sectorId,
        entity: scope.entity,
        externalId: scope.externalId,
        period: scope.period,
        periodKnown: scope.period !== null,
        reportingFrequency: scope.reportingFrequency,
        definitionId: scope.definitionId,
        definitionHash: scope.definitionHash,
        definitionVersion: scope.definitionVersion,
        definitionUnit: scope.definitionUnit,
        scopeVerified: bucket.scopeVerified,
        definitionVerified,
      },
      metricValue: point.value,
      baseline: latest.baseline,
      scale: latest.scale,
      score: latest.score,
      direction: latest.direction,
      timestamp: latest.timestamp,
      sampleSize,
      seriesPoints: points.length,
      analysisWindow: window,
      thresholds: definition
        ? { warn: definition.warn, critical: definition.critical, target: definition.target }
        : null,
      directionBasis: classified.directionBasis,
      crossed: classified.crossed,
      method: {
        engine: "anomaly.ts (median/MAD robust z-score)",
        window,
        threshold,
      },
      note:
        "İstatistiksel erken uyarı sinyalidir; nedensellik iddiası değildir. " +
        classified.reason,
    };

    const inserted = await getDb().query<{ id: string }>(
      `INSERT INTO signals
         (id, org_id, sector_id, dataset_id, category_id, severity, title, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        id,
        orgId,
        scope.sectorId,
        scope.datasetId,
        categoryId,
        classified.severity,
        title,
        JSON.stringify(payload),
      ]
    );
    const signal: KpiAnomalySignal = {
      id,
      observationId: point.id,
      label: scope.label,
      severity: classified.severity,
      title,
      datasetId: scope.datasetId,
      datasetLabel: scope.datasetLabel,
      entity: scope.entity,
      externalId: scope.externalId,
      period: scope.period,
      reportingFrequency: scope.reportingFrequency,
      definitionId: scope.definitionId,
      definitionVersion: scope.definitionVersion,
      definitionHash: scope.definitionHash,
      definitionUnit: scope.definitionUnit,
      observedAt: latest.timestamp,
      score: latest.score,
      direction: latest.direction,
      classification: classified.classification,
      classificationReason: classified.reason,
      sampleSize,
      seriesPoints: points.length,
      analysisWindow: window,
    };
    if (inserted.rows.length > 0) {
      generated++;
      signals.push(signal);
    } else {
      existing++;
    }
  }

  return {
    ...summarizeKpiSeries(loaded.series, window),
    generated,
    existing,
    signals,
  };
}
