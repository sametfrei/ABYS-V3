import { createHash } from "node:crypto";
import { getDb, migrate } from "../client";
import type { AiDecisionCase, AssessedSeverity } from "@/lib/ai/provider";
import { computeKpiDefinitionHash } from "@/lib/kpi-definition-provenance";
import {
  ANOMALY_DEFAULT_THRESHOLD,
  ANOMALY_DEFAULT_WINDOW,
  detectAnomalies,
} from "@/lib/anomaly";
import { classifyKpiAnomaly } from "./kpi-signals";
import { recordAuditEventInTransaction } from "./audit";

/**
 * KPI sinyalinden deterministik karar vakası taslağı.
 *
 * Kaynak: `signals` tablosundaki kpi_anomaly / kpi_opportunity satırları.
 * Yalnızca eşik yönüyle risk/fırsat olarak sınıflandırılmış, KPI tanımı ve
 * formülü bulunan, veri seti kökeni olan sinyaller işlenir. Eksik kanıt varsa
 * vaka üretilmez. Aynı sinyal için tekrar vaka oluşmaz: vaka kimliği
 * org+signal'den türetilir ve `decision_case_signals` bağlantısı kontrol edilir.
 *
 * Nedensellik iddia edilmez; sayı uydurulmaz; ekonomik etki yalnızca
 * hesaplanabiliyorsa hesaplanır (bu sürümde para birimi/etki katsayısı yoksa
 * açıkça "hesaplanmadı" denir).
 */

const ELIGIBLE_CATEGORIES = new Set(["kpi_anomaly", "kpi_opportunity"]);

export interface KpiSignalCaseResult {
  scannedSignals: number;
  generated: number;
  existing: number;
  skipped: number;
  skippedReasons: Record<string, number>;
  cases: Array<{ id: string; signalId: string; title: string }>;
}

interface SignalRow {
  id: string;
  sector_id: string;
  category_id: string;
  severity: string;
  title: string;
  payload: {
    kind?: string;
    classification?: string;
    label?: string;
    metricValue?: number;
    baseline?: number;
    score?: number;
    direction?: string;
    timestamp?: string | null;
    observationId?: string;
    scale?: number;
    analysisWindow?: number;
    sampleSize?: number;
    seriesPoints?: number;
    classificationReason?: string;
    series?: {
      datasetId?: string;
      datasetLabel?: string | null;
      sectorId?: string;
      entity?: string | null;
      externalId?: string | null;
      period?: string | null;
      periodKnown?: boolean;
      reportingFrequency?: string | null;
      definitionId?: string | null;
      definitionHash?: string | null;
      definitionVersion?: string | null;
      definitionUnit?: string | null;
      scopeVerified?: boolean;
      definitionVerified?: boolean;
    };
    thresholds?: { warn: number | null; critical: number | null; target: number | null } | null;
    method?: { engine?: string; window?: number; threshold?: number };
    note?: string;
  };
  dataset_id: string | null;
  created_at: string | Date;
  dataset_label: string | null;
  formula_text: string | null;
  definition_id: string | null;
  definition_unit: string | null;
  definition_source: string | null;
  definition_source_ref: string | null;
  warn_threshold: string | number | null;
  critical_threshold: string | number | null;
  target: string | number | null;
  update_frequency?: string | null;
}

function stableCaseId(orgId: string, signalId: string): string {
  return createHash("sha256")
    .update(["kpi-signal-case", orgId, signalId].join("\u001f"))
    .digest("hex")
    .slice(0, 24);
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function num(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

type SignalEligibility =
  | {
      ok: true;
      classification: "risk" | "opportunity";
      warn: number | null;
      critical: number | null;
      target: number | null;
    }
  | { ok: false; reason: string };

/**
 * Vaka üretiminin savunma katmanı. Kalıcı payload'daki `classification`,
 * `scopeVerified` ve `definitionVerified` bayrakları tek başına yeterli
 * sayılmaz: kapsam veri setinden, tanım kimliği ve hash'i güncel
 * `kpi_definitions` satırından yeniden doğrulanır; sınıflandırma güncel
 * eşiklerle yeniden hesaplanır. Uyuşmazlıkta vaka üretilmez.
 */
type Queryable = Pick<ReturnType<typeof getDb>, "query">;

interface SourceObservationRow {
  id: string;
  dataset_id: string;
  label: string;
  value: string;
  created_at: string | Date;
  entity: string | null;
  external_id: string | null;
  period: string | null;
  definition_id: string | null;
  definition_hash: string | null;
  definition_version: string | null;
  dataset_sector_id: string;
  dataset_source_label: string;
}

interface HistoricalObservationRow {
  id: string;
  value: string;
  created_at: string | Date;
}

function sameNumber(left: unknown, right: number): boolean {
  return typeof left === "number" && Number.isFinite(left) && left === right;
}

/**
 * Sinyalin yalnızca kendi payload'ına değil, kaynak KPI gözlemine ve aynı
 * kapsamın geçmiş serisine dayandığını yeniden doğrular. Kaynak kayıt veya
 * hesaplanan anomali değişmişse eski sinyalden karar vakası üretilmez.
 */
async function verifySignalObservation(
  db: Queryable,
  orgId: string,
  signal: SignalRow
): Promise<string | null> {
  const payload = signal.payload ?? {};
  const series = payload.series;
  const observationId = payload.observationId;
  if (!observationId || typeof observationId !== "string") {
    return "missing_observation_reference";
  }

  const observationResult = await db.query<SourceObservationRow>(
    `SELECT v.id, v.dataset_id, v.label, v.value, v.created_at,
            v.entity, v.external_id, v.period,
            v.definition_id, v.definition_hash, v.definition_version,
            d.sector_id AS dataset_sector_id, d.source_label AS dataset_source_label
       FROM kpi_values v
       JOIN datasets d ON d.id = v.dataset_id AND d.org_id = v.org_id
      WHERE v.org_id = $1 AND v.id = $2`,
    [orgId, observationId]
  );
  const observation = observationResult.rows[0];
  if (observationResult.rows.length !== 1 || !observation) {
    return "source_observation_missing";
  }

  const observedValue = Number(observation.value);
  const observedAt = iso(observation.created_at);
  if (
    observation.dataset_id !== signal.dataset_id ||
    observation.dataset_source_label !== signal.dataset_label ||
    observation.dataset_sector_id !== signal.sector_id ||
    observation.dataset_id !== series?.datasetId ||
    observation.dataset_source_label !== series?.datasetLabel ||
    observation.dataset_sector_id !== series?.sectorId ||
    observation.label !== payload.label ||
    observation.entity !== (series?.entity ?? null) ||
    observation.external_id !== (series?.externalId ?? null) ||
    observation.period !== (series?.period ?? null) ||
    observation.definition_id !== (series?.definitionId ?? null) ||
    observation.definition_hash !== (series?.definitionHash ?? null) ||
    observation.definition_version !== (series?.definitionVersion ?? null) ||
    !Number.isFinite(observedValue) ||
    !sameNumber(payload.metricValue, observedValue) ||
    payload.timestamp !== observedAt
  ) {
    return "source_observation_mismatch";
  }

  const window = payload.method?.window;
  const threshold = payload.method?.threshold;
  if (
    !Number.isInteger(window) ||
    (window as number) < 3 ||
    (window as number) !== ANOMALY_DEFAULT_WINDOW ||
    typeof threshold !== "number" ||
    threshold !== ANOMALY_DEFAULT_THRESHOLD ||
    payload.analysisWindow !== window
  ) {
    return "invalid_anomaly_parameters";
  }

  // Sinyal üreticisi en fazla 500 aynı kapsam gözlemi kullanır. Aynı zaman
  // damgasındaki sıralama da dahil olmak üzere hedef gözlemde biten pencereyi
  // yeniden kur; böylece payload'daki baseline/score/direction doğrulanır.
  const historyResult = await db.query<HistoricalObservationRow>(
    `SELECT id, value, created_at
       FROM kpi_values
      WHERE org_id = $1
        AND dataset_id = $2
        AND label = $3
        AND entity IS NOT DISTINCT FROM $4
        AND external_id IS NOT DISTINCT FROM $5
        AND period IS NOT DISTINCT FROM $6
        AND definition_id IS NOT DISTINCT FROM $7
        AND definition_hash IS NOT DISTINCT FROM $8
        AND definition_version IS NOT DISTINCT FROM $9
        AND (created_at < $10 OR (created_at = $10 AND id <= $11))
        AND value ~ $12
      ORDER BY created_at DESC, id DESC
      LIMIT 500`,
    [
      orgId,
      observation.dataset_id,
      observation.label,
      observation.entity,
      observation.external_id,
      observation.period,
      observation.definition_id,
      observation.definition_hash,
      observation.definition_version,
      observation.created_at,
      observation.id,
      "^[+-]?[0-9]+(\\.[0-9]+)?$",
    ]
  );
  const history = historyResult.rows.reverse();
  const values = history.map((row) => Number(row.value));
  const timestamps = history.map((row) => iso(row.created_at));
  const anomalies = detectAnomalies(values, {
    window: window as number,
    threshold,
    timestamps,
    maxResults: 1,
  });
  const latest = anomalies[0];
  if (!latest || latest.index !== values.length - 1) {
    return "anomaly_recalculation_mismatch";
  }

  if (
    history.length !== payload.seriesPoints ||
    payload.sampleSize !== Math.min(window as number, latest.index) ||
    !sameNumber(payload.baseline, latest.baseline) ||
    !sameNumber(payload.scale, latest.scale) ||
    !sameNumber(payload.score, latest.score) ||
    payload.direction !== latest.direction ||
    payload.timestamp !== latest.timestamp
  ) {
    return "anomaly_recalculation_mismatch";
  }
  return null;
}

async function verifySignalProvenance(
  db: Queryable,
  orgId: string,
  signal: SignalRow
): Promise<SignalEligibility> {
  const payload = signal.payload ?? {};
  const classification = payload.classification;
  if (classification !== "risk" && classification !== "opportunity") {
    return { ok: false, reason: "unclassified_signal" };
  }
  const series = payload.series;
  if (!signal.dataset_id || !signal.dataset_label) {
    return { ok: false, reason: "missing_dataset" };
  }

  // Connector kapsamı, payload bayrağına güvenmeden yeniden hesaplanır.
  const isConnector = signal.dataset_label.startsWith("Konnektör:");
  const scopeVerified =
    !isConnector ||
    ((series?.entity ?? null) !== null && (series?.externalId ?? null) !== null);
  if (!scopeVerified || series?.scopeVerified !== true) {
    return { ok: false, reason: "scope_unverified" };
  }
  if (
    series?.datasetId !== signal.dataset_id ||
    series.datasetLabel !== signal.dataset_label ||
    series.sectorId !== signal.sector_id
  ) {
    return { ok: false, reason: "source_observation_mismatch" };
  }
  if (series?.definitionVerified !== true) {
    return { ok: false, reason: "definition_unverified" };
  }
  if (!signal.definition_id || !signal.formula_text || signal.formula_text.trim() === "") {
    return { ok: false, reason: "missing_definition" };
  }

  const warn = num(signal.warn_threshold);
  const critical = num(signal.critical_threshold);
  const target = num(signal.target);
  const currentHash = computeKpiDefinitionHash({
    formulaText: signal.formula_text,
    unit: signal.definition_unit,
    source: signal.definition_source ?? "manual",
    sourceRef: signal.definition_source_ref,
    warn,
    critical,
    target,
  });
  if (
    !currentHash ||
    series.definitionId !== signal.definition_id ||
    series.definitionHash !== currentHash ||
    series.definitionUnit !== signal.definition_unit
  ) {
    return { ok: false, reason: "definition_mismatch" };
  }

  const metricValue = payload.metricValue;
  const direction = payload.direction;
  if (
    typeof metricValue !== "number" ||
    !Number.isFinite(metricValue) ||
    (direction !== "above" && direction !== "below")
  ) {
    return { ok: false, reason: "insufficient_evidence" };
  }

  const recomputed = classifyKpiAnomaly({
    value: metricValue,
    anomalyDirection: direction,
    warn,
    critical,
    target,
    definitionVerified: true,
  });
  const expectedCategory =
    recomputed.classification === "opportunity" ? "kpi_opportunity" : "kpi_anomaly";
  if (
    recomputed.classification !== classification ||
    signal.category_id !== expectedCategory ||
    signal.severity !== recomputed.severity ||
    payload.classificationReason !== recomputed.reason
  ) {
    return { ok: false, reason: "classification_mismatch" };
  }

  const observationError = await verifySignalObservation(db, orgId, signal);
  if (observationError) return { ok: false, reason: observationError };

  return { ok: true, classification, warn, critical, target };
}

function confidenceFor(
  signal: SignalRow,
  seriesPointCount: number
): { value: number; rationale: string } {
  let value = 55;
  const reasons = ["Kanıt zinciri kayıtlı (gözlem + veri seti + KPI tanımı)."];
  if (seriesPointCount >= 10) {
    value += 10;
    reasons.push("Seri en az 10 gözlem içeriyor.");
  }
  if (num(signal.warn_threshold) !== null || num(signal.critical_threshold) !== null) {
    value += 10;
    reasons.push("Tanımlı eşik yönü sınıflandırmayı destekliyor.");
  }
  if (signal.definition_source_ref) {
    value += 5;
    reasons.push(`Sürümlü KPI tanımı: ${signal.definition_source_ref}.`);
  }
  value = Math.min(80, value);
  reasons.push("İstatistiksel aykırılık nedensellik kanıtı değildir.");
  return { value, rationale: reasons.join(" ") };
}

function buildOptions(classification: "risk" | "opportunity"): AiDecisionCase["options"] {
  if (classification === "risk") {
    return [
      {
        title: "Kök nedeni incele ve doğrula",
        detail: `${"KPI değerini etkileyen süreç, olay ve kayıtları inceleyerek aykırılığın nedenini doğrula."}`,
        feasible: true,
        feasibilityNote: "Mevcut veri ve süreç kayıtlarıyla yapılabilir.",
        tradeoffs: "Analiz süresi gerektirir; acil düzeltici aksiyonu geciktirir.",
        expectedOutcome: "Nedensel kanıt veya çürütme; düzeltici aksiyon için güvenilir temel.",
        rank: 1,
      },
      {
        title: "Kök neden doğrulanmadan düzeltici aksiyon başlatma",
        detail: "Aykırılık sürüyorsa süreç sahibiyle acil düzeltici plan başlat.",
        feasible: true,
        feasibilityNote: "Kök neden doğrulanmadığı için etkisiz kalma riski vardır.",
        tradeoffs: "Hızlı müdahale; yanlış nedene müdahale riski.",
        expectedOutcome: "Sapmanın sürmesi durumunda olası etkiyi sınırlar.",
        rank: 2,
      },
      {
        title: "Sonraki gözlemi bekle ve izle",
        detail: "Seriyi bir sonraki ölçüm döneminde yeniden değerlendir.",
        feasible: true,
        feasibilityNote: "Ek veri gerektirmez.",
        tradeoffs: "Sapma sürerse müdahale gecikir.",
        expectedOutcome: "Aykırılığın geçici mi kalıcı mı olduğu netleşir.",
        rank: 3,
      },
    ];
  }
  return [
    {
      title: "Fırsatın sürdürülebilirliğini doğrula",
      detail: "Olumlu aykırılığın tek seferlik mi yoksa sürdürülebilir mi olduğunu sonraki gözlemlerle doğrula.",
      feasible: true,
      feasibilityNote: "Mevcut seri ve KPI tanımıyla yapılabilir.",
      tradeoffs: "Hızlı aksiyon almayı geciktirir.",
      expectedOutcome: "Fırsatın gerçekliği ve kalıcılığı hakkında kanıt.",
      rank: 1,
    },
    {
      title: "Olumlu sonucu besleyen süreci incele",
      detail: "Fırsatı üreten süreç adımlarını ve kaynakları tespit et.",
      feasible: true,
      feasibilityNote: "Süreç ve kaynak kayıtları gerektirir.",
      tradeoffs: "Analiz yükü; nedensellik doğrulanmadan genelleme riski.",
      expectedOutcome: "Tekrarlanabilir iyileştirme için aday süreçler.",
      rank: 2,
    },
    {
      title: "Mevcut performansı koru ve izle",
      detail: "Ek müdahale olmadan seriyi izlemeye devam et.",
      feasible: true,
      feasibilityNote: "Ek veri gerektirmez.",
      tradeoffs: "Fırsat kaçabilir.",
      expectedOutcome: "Mevcut seviyenin kalıcılığı görülür.",
      rank: 3,
    },
  ];
}

function buildCase(signal: SignalRow): AiDecisionCase | null {
  const payload = signal.payload ?? {};
  const label = payload.label;
  const metricValue = payload.metricValue;
  const baseline = payload.baseline;
  const score = payload.score;
  const direction = payload.direction;
  const sampleSize = payload.sampleSize ?? 0;
  // sampleSize yalnızca aykırılık anındaki baz penceresidir; güven kuralındaki
  // "yeterli gözlem" değerlendirmesi serinin toplam gözlem sayısını kullanır.
  const seriesPointCount = payload.seriesPoints ?? sampleSize;
  const classification =
    payload.classification === "risk" || payload.classification === "opportunity"
      ? payload.classification
      : null;
  if (!label || metricValue === undefined || baseline === undefined || score === undefined) {
    return null;
  }
  if (direction !== "above" && direction !== "below") return null;
  if (!classification) return null;
  if (!signal.dataset_id || !signal.dataset_label) return null;
  if (!signal.formula_text || signal.formula_text.trim() === "") return null;

  const formulaVersion =
    signal.definition_source_ref ??
    (signal.definition_source === "manual" ? "manual" : "unknown");
  const warn = num(signal.warn_threshold);
  const critical = num(signal.critical_threshold);
  const target = num(signal.target);
  const confidence = confidenceFor(signal, seriesPointCount);
  const directionLabel = direction === "above" ? "üst" : "alt";
  const categoryLabel = classification === "risk" ? "KPI riski" : "KPI fırsatı";
  const title = `${categoryLabel}: ${label} (${directionLabel} yönde)`;
  const observedAt = payload.timestamp ?? iso(signal.created_at);
  const thresholdText = `uyarı ${warn ?? "—"}, kritik ${critical ?? "—"}, hedef ${target ?? "—"}`;

  return {
    categoryId: signal.category_id,
    categoryLabel,
    severity: (["critical", "warning", "info", "healthy"].includes(signal.severity)
      ? signal.severity
      : "warning") as AssessedSeverity,
    title,
    businessImpact:
      `${label} değeri ${metricValue}; baz çizgi ${baseline}. ` +
      `Aykırılık skoru ${score} (${directionLabel} yönde). Tanımlı eşikler: ${thresholdText}. ` +
      `İstatistiksel olarak ${classification === "risk" ? "risk" : "fırsat"} yönünde sınıflandırıldı. ` +
      "Ekonomik etki hesaplanmadı: para birimi ve etki katsayısı tanımlı değil.",
    confidence: confidence.value,
    confidenceRationale: confidence.rationale,
    evidence: [
      {
        source: `Veri seti: ${signal.dataset_label}`,
        fact:
          `${label} = ${metricValue}; gözlem zamanı ${observedAt}; veri seti ${signal.dataset_id}; ` +
          `kaynak gözlem ${payload.observationId ?? "—"}; ` +
          `entity ${signal.payload.series?.entity ?? "—"}; dış kimlik ${signal.payload.series?.externalId ?? "—"}; ` +
          `gözlem dönemi ${signal.payload.series?.period ?? "bilinmiyor"}; ` +
          `raporlama sıklığı ${signal.payload.series?.reportingFrequency ?? "—"}; ` +
          `tanım hash ${signal.payload.series?.definitionHash ?? "—"}.`,
        reliability: "verified",
      },
      {
        source: "KPI tanımı",
        fact: `Formül: ${signal.formula_text} (sürüm/köken: ${formulaVersion}).`,
        reliability: "verified",
      },
      {
        source: "Anomali motoru",
        fact: `Yöntem: ${payload.method?.engine ?? "median/MAD"}; pencere ${payload.method?.window ?? "—"}; eşik ${payload.method?.threshold ?? "—"}; baz penceresi ${sampleSize}; seri gözlemi ${seriesPointCount}; baz çizgi ${baseline}; skor ${score}.`,
        reliability: "verified",
      },
      {
        source: "Sinyal kaydı",
        fact: `Sinyal ${signal.id} · ${signal.category_id} · ${signal.severity}.`,
        reliability: "verified",
      },
      {
        source: "Nedensellik",
        fact: "Aykırılık tek başına nedensellik kanıtı değildir; kök neden ayrıca doğrulanmalıdır.",
        reliability: "unknown",
      },
    ],
    assumptions: [
      "Aykırılık, önceki gözlemlerin medyanına ve medyan mutlak sapmasına göre ölçüldü.",
      "Risk/fırsat yönü KPI tanımındaki tutarlı eşik konumundan türetildi.",
      "Fırsat sınıflandırması yalnızca tanımlı hedefin iyi yönde aşılmasıyla yapıldı; hedef yoksa fırsat denmedi.",
      "Serinin gelecekte aynı yönde süreceği varsayılmadı.",
    ],
    historicalComparison:
      `Son ${sampleSize} baz gözlemi (seri ${signal.payload.seriesPoints ?? sampleSize} gözlem); ` +
      `baz çizgi ${baseline}; aykırılık skoru ${score}.`,
    counterfactual: {
      narrative:
        "Mevcut gözlem tek başına eğilim kanıtı değildir. Aksiyon alınmazsa serinin eşik dışında kalıp kalmayacağı sonraki gözlemlerle doğrulanmalıdır.",
      projectedImpact: "Ölçülmedi (ekonomik etki için yeterli veri yok).",
      timeHorizon: "Sonraki ölçüm dönemi",
    },
    options: buildOptions(classification),
    recommendedOptionRank: 1,
  };
}

export async function generateDecisionCasesFromKpiSignals(
  orgId: string
): Promise<KpiSignalCaseResult> {
  await migrate();
  const db = getDb();
  const rows = await db.query<SignalRow>(
    `SELECT s.id, s.sector_id, s.category_id, s.severity, s.title, s.payload::jsonb AS payload,
            s.dataset_id, s.created_at,
            d.source_label AS dataset_label,
            kd.id AS definition_id, kd.unit AS definition_unit,
            kd.formula_text, kd.source AS definition_source, kd.source_ref AS definition_source_ref,
            kd.warn_threshold, kd.critical_threshold, kd.target
       FROM signals s
       LEFT JOIN datasets d ON d.id = s.dataset_id AND d.org_id = s.org_id
       LEFT JOIN kpi_definitions kd
         ON kd.org_id = s.org_id AND kd.name = (s.payload->>'label')
      WHERE s.org_id = $1
        AND s.category_id = ANY($2::text[])
      ORDER BY s.created_at ASC, s.id ASC`,
    [orgId, [...ELIGIBLE_CATEGORIES]]
  );

  const result: KpiSignalCaseResult = {
    scannedSignals: rows.rows.length,
    generated: 0,
    existing: 0,
    skipped: 0,
    skippedReasons: {},
    cases: [],
  };
  const skip = (reason: string) => {
    result.skipped++;
    result.skippedReasons[reason] = (result.skippedReasons[reason] ?? 0) + 1;
  };

  return db.transaction(async (tx) => {
    // Aynı org için eşzamanlı üretimi sıraya al.
    await tx.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [orgId]);

    for (const signal of rows.rows) {
      const already = await tx.query<{ case_id: string }>(
        "SELECT case_id FROM decision_case_signals WHERE org_id = $1 AND signal_id = $2 LIMIT 1",
        [orgId, signal.id]
      );
      if (already.rows[0]) {
        result.existing++;
        continue;
      }

      const eligibility = await verifySignalProvenance(tx, orgId, signal);
      if (!eligibility.ok) {
        skip(eligibility.reason);
        continue;
      }

      const decisionCase = buildCase(signal);
      if (!decisionCase) {
        skip("insufficient_evidence");
        continue;
      }

      const caseId = stableCaseId(orgId, signal.id);
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO decision_cases
           (id, org_id, sector_id, category_id, severity, title, confidence, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          caseId,
          orgId,
          signal.sector_id,
          decisionCase.categoryId,
          decisionCase.severity,
          decisionCase.title,
          decisionCase.confidence,
          JSON.stringify({
            ...decisionCase,
            origin: {
              kind: "kpi_signal",
              signalId: signal.id,
              observationId: signal.payload.observationId ?? null,
              label: signal.payload.label,
              datasetId: signal.dataset_id,
              datasetLabel: signal.dataset_label,
              classification: signal.payload.classification,
              classificationReason: signal.payload.classificationReason ?? null,
              metricValue: signal.payload.metricValue,
              baseline: signal.payload.baseline,
              score: signal.payload.score,
              direction: signal.payload.direction,
              sampleSize: signal.payload.sampleSize ?? null,
              seriesPoints: signal.payload.seriesPoints ?? null,
              entity: signal.payload.series?.entity ?? null,
              externalId: signal.payload.series?.externalId ?? null,
              period: signal.payload.series?.period ?? null,
              periodKnown: signal.payload.series?.periodKnown ?? false,
              reportingFrequency: signal.payload.series?.reportingFrequency ?? null,
              definitionHash: signal.payload.series?.definitionHash ?? null,
              definitionVersion: signal.payload.series?.definitionVersion ?? null,
              definitionUnit: signal.payload.series?.definitionUnit ?? null,
              scopeVerified: signal.payload.series?.scopeVerified ?? false,
              definitionVerified: signal.payload.series?.definitionVerified ?? false,
              formulaVersion:
                signal.definition_source_ref ??
                (signal.definition_source === "manual" ? "manual" : "unknown"),
              formulaText: signal.formula_text,
              method: signal.payload.method ?? null,
            },
          }),
        ]
      );
      if (!inserted.rows[0]) {
        result.existing++;
        continue;
      }

      await tx.query(
        `INSERT INTO decision_case_signals
           (id, org_id, case_id, signal_id, link_reason, linked_by_id, linked_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (org_id, case_id, signal_id) DO NOTHING`,
        [
          `${caseId}-${signal.id}`.slice(0, 60),
          orgId,
          caseId,
          signal.id,
          "KPI sinyalinden deterministik olarak üretildi; kanıtlar sinyal ve KPI tanımına bağlıdır.",
          "abys-kpi-engine",
          "ABYS KPI motoru",
        ]
      );

      await recordAuditEventInTransaction(tx, {
        orgId,
        actor: "ABYS KPI motoru",
        type: "decision_case_generated_from_signal",
        summary: `KPI sinyalinden karar taslağı: ${decisionCase.title}`,
        detail: JSON.stringify({
          caseId,
          signalId: signal.id,
          label: signal.payload.label,
          datasetId: signal.dataset_id,
          classification: signal.payload.classification,
        }),
      });

      result.generated++;
      result.cases.push({ id: caseId, signalId: signal.id, title: decisionCase.title });
    }

    return result;
  });
}
