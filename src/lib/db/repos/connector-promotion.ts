import { createHash } from "node:crypto";
import type { Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import type { CanonicalRecord, RestConnectorConfig } from "@/lib/connectors/types";
import { canonicalFieldName } from "@/lib/connectors/contracts";
import { calculateKpiSpec, hasKpiCalculator } from "@/lib/industry/kpi-calculators";
import { getPack, listKpiSpecCandidates, resolveKpiSpec } from "@/lib/industry/packs";
import type { KpiSpec } from "@/lib/industry/types";
import { getConfirmedBusinessProfile, getConfirmedBusinessProfileInTx } from "./business-context";
import { listKpiDefinitionSnapshots } from "./kpi-definition-provenance";

export interface ConnectorPromotionResult {
  kpiObservationCount: number;
  processEventCount: number;
  computedKpiObservationCount: number;
  /** Onaylanmış iş profilinden otomatik seçilip hesaplanan KPI gözlemleri. */
  autoComputedKpiObservationCount: number;
  /** Otomatik seçim için uygun bulunan KPI tanımı sayısı. */
  autoSelectedKpiCount: number;
  skippedKpiCount: number;
  skippedComputedKpiCount: number;
  skippedEventCount: number;
  warnings: string[];
}

export interface ConnectorPromotionCounts {
  kpiObservations: number;
  processEvents: number;
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32);
}

function asText(value: CanonicalRecord["fields"][string]): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: CanonicalRecord["fields"][string]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asIso(value: CanonicalRecord["fields"][string] | null): string | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function warn(warnings: string[], message: string): void {
  if (warnings.length < 25) warnings.push(message);
}

export function connectorPromotionSource(configId: string): string {
  return `connector:${configId}`;
}

export async function promoteConnectorRecords(params: {
  orgId: string;
  configId: string;
  configName: string;
  config: RestConnectorConfig;
  records: CanonicalRecord[];
  runId: string;
  tx?: Transaction;
}): Promise<ConnectorPromotionResult> {
  if (!params.tx) await migrate();
  const db = params.tx ?? getDb();
  const definitionSnapshots = await listKpiDefinitionSnapshots(db, params.orgId);
  const warnings: string[] = [];
  let kpiObservationCount = 0;
  let processEventCount = 0;
  let computedKpiObservationCount = 0;
  let autoComputedKpiObservationCount = 0;
  let autoSelectedKpiCount = 0;
  let skippedKpiCount = 0;
  let skippedComputedKpiCount = 0;
  let skippedEventCount = 0;

  if (params.records.length === 0) {
    return {
      kpiObservationCount,
      processEventCount,
      computedKpiObservationCount,
      autoComputedKpiObservationCount,
      autoSelectedKpiCount,
      skippedKpiCount,
      skippedComputedKpiCount,
      skippedEventCount,
      warnings,
    };
  }

  const datasetId = stableId("connector-dataset", params.orgId, params.configId);
  const org = await db.query<{ sector_id: string }>(
    "SELECT sector_id FROM organizations WHERE id = $1",
    [params.orgId]
  );
  const provenance = {
    connectorId: params.configId,
    connectorName: params.configName,
    connectorType: params.config.kind,
    entity: params.config.entity,
    lastRunId: params.runId,
  };
  await db.query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
       SET sector_id = EXCLUDED.sector_id,
           source_label = EXCLUDED.source_label,
           raw_content = EXCLUDED.raw_content,
           ingested_by = EXCLUDED.ingested_by`,
    [
      datasetId,
      params.orgId,
      org.rows[0]?.sector_id ?? "other",
      `Konnektör: ${params.configName}`,
      JSON.stringify(provenance),
      "connector-sync",
    ]
  );

  const kpiEntries = Object.entries(params.config.kpiFieldMap ?? {});
  const configuredFields = [
    ...new Set(
      Object.keys(params.config.fieldMap ?? {}).map((field) =>
        canonicalFieldName(params.config.entity, field)
      )
    ),
  ];
  interface ComputedKpiEntry {
    key: string;
    label: string;
    spec: KpiSpec;
    automatic: boolean;
  }

  const explicitComputedEntries: ComputedKpiEntry[] = Object.entries(
    params.config.computedKpiMap ?? {}
  ).flatMap(([key, label]) => {
    const located = resolveKpiSpec(key, configuredFields);
    if (!located) {
      const [packId, id] = key.includes(":") ? key.split(":", 2) : [undefined, key];
      const candidates = listKpiSpecCandidates(id).filter(
        (candidate) => !packId || candidate.packId === packId
      );
      warn(
        warnings,
        candidates.length > 1
          ? `Hesaplanan KPI '${key}' belirsiz; packId:kpiId biçimi gerekli, atlandı.`
          : `Hesaplanan KPI '${key}' katalogda bulunamadı; atlandı.`
      );
      return [];
    }
    return [{ key, label, spec: located.spec, automatic: false }];
  });

  /**
   * Onaylanmış iş profili varsa ve operatör açık bir `computedKpiMap`
   * tanımlamadıysa, paket KPI'ları otomatik seçilir. Seçim yalnızca gerekli
   * alanların TAMAMI aynı varlığın kayıtlarında birlikte bulunduğunda yapılır;
   * alanlar varlıklara dağılmışsa KPI hesaplanabilir sayılmaz.
   */
  const autoEntriesByEntity = new Map<string, ComputedKpiEntry[]>();
  const hasExplicitComputedMap = Object.keys(params.config.computedKpiMap ?? {}).length > 0;
  if (!hasExplicitComputedMap) {
    const profile = params.tx
      ? await getConfirmedBusinessProfileInTx(params.tx, params.orgId)
      : await getConfirmedBusinessProfile(params.orgId);
    const pack = profile ? getPack(profile.industryPackId) : undefined;
    if (pack) {
      // Operatörün elle yazdığı tanım korunur. Aynı adda bir KPI'ı paket
      // formülüyle otomatik hesaplamak, kaydedilen değerin formül kökenini
      // yanlış gösterir; bu yüzden otomatik seçimde atlanır.
      const manualNames = new Set(
        [...definitionSnapshots.values()]
          .filter((definition) => definition.source === "manual")
          .map((definition) => definition.name)
      );
      const manuallyOwned = pack.kpis.filter((spec) => manualNames.has(spec.name));
      if (manuallyOwned.length > 0) {
        warn(
          warnings,
          `Manuel tanımlı KPI'lar otomatik hesaplanmadı: ${manuallyOwned
            .map((spec) => spec.name)
            .join(", ")}.`
        );
      }

      const entityFields = new Map<string, Set<string>>();
      for (const record of params.records) {
        const fields = entityFields.get(record.entity) ?? new Set<string>();
        for (const field of Object.keys(record.fields)) fields.add(field);
        entityFields.set(record.entity, fields);
      }
      for (const [entity, fields] of entityFields) {
        const entries: ComputedKpiEntry[] = pack.kpis
          .filter((spec) => !manualNames.has(spec.name))
          .filter((spec) => hasKpiCalculator(spec.functionName))
          .filter((spec) => spec.requiredFields.every((field) => fields.has(field)))
          .map((spec) => ({
            key: `${pack.id}:${spec.id}`,
            label: spec.name,
            spec,
            automatic: true,
          }));
        if (entries.length === 0) continue;
        autoEntriesByEntity.set(entity, entries);
        autoSelectedKpiCount += entries.length;
      }
      if (autoSelectedKpiCount > 0) {
        warn(
          warnings,
          `Onaylanmış iş profili (${pack.id} v${pack.version}): ${autoSelectedKpiCount} KPI otomatik hesaplama için seçildi.`
        );
      }
    }
  }
  for (const record of params.records) {
    for (const [field, label] of kpiEntries) {
      const canonicalField = canonicalFieldName(params.config.entity, field);
      const value = asNumber(record.fields[canonicalField]);
      if (value === null) {
        skippedKpiCount++;
        warn(warnings, `${record.entity}/${record.externalId}: '${field}' sayısal değil, KPI atlandı.`);
        continue;
      }
      const observedRaw = params.config.kpiObservedAtField
        ? record.fields[canonicalFieldName(params.config.entity, params.config.kpiObservedAtField)]
        : record.sourceUpdatedAt;
      const observedAt = asIso(observedRaw);
      if (!observedAt) {
        skippedKpiCount++;
        warn(warnings, `${record.entity}/${record.externalId}: KPI gözlem zamanı yok, atlandı.`);
        continue;
      }

      const id = stableId(
        "connector-kpi",
        params.orgId,
        params.configId,
        record.entity,
        record.externalId,
        field,
        observedAt
      );
      const definition = definitionSnapshots.get(label);
      await db.query(
        `INSERT INTO kpi_values
           (id, org_id, dataset_id, label, value, created_at,
            definition_id, definition_hash, definition_version,
            entity, external_id, period)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE
           SET dataset_id = EXCLUDED.dataset_id,
               label = EXCLUDED.label,
               value = EXCLUDED.value,
               created_at = EXCLUDED.created_at,
               definition_id = EXCLUDED.definition_id,
               definition_hash = EXCLUDED.definition_hash,
               definition_version = EXCLUDED.definition_version,
               entity = EXCLUDED.entity,
               external_id = EXCLUDED.external_id,
               period = EXCLUDED.period
         RETURNING id`,
        [
          id,
          params.orgId,
          datasetId,
          label,
          String(value),
          observedAt,
          definition?.id ?? null,
          definition?.formulaHash ?? null,
          definition?.sourceRef ?? null,
          record.entity,
          record.externalId,
          // Gözlem dönemi connector kaydında yoksa NULL kalır; tanımın
          // update_frequency değeri raporlama sıklığıdır, dönem değildir.
          null,
        ]
      );
      kpiObservationCount++;
    }

    const recordComputedEntries = [
      ...explicitComputedEntries,
      ...(autoEntriesByEntity.get(record.entity) ?? []),
    ];
    for (const entry of recordComputedEntries) {
      const calculation = calculateKpiSpec(entry.spec, record.fields);
      if (calculation.value === null) {
        skippedComputedKpiCount++;
        const reason =
          calculation.missingFields.length > 0
            ? `eksik alanlar: ${calculation.missingFields.join(", ")}`
            : "payda sıfır veya geçersiz girdi";
        warn(warnings, `${record.entity}/${record.externalId}: '${entry.key}' hesaplanamadı (${reason}).`);
        continue;
      }
      const observedRaw = params.config.kpiObservedAtField
        ? record.fields[canonicalFieldName(params.config.entity, params.config.kpiObservedAtField)]
        : record.sourceUpdatedAt;
      const observedAt = asIso(observedRaw);
      if (!observedAt) {
        skippedComputedKpiCount++;
        warn(
          warnings,
          `${record.entity}/${record.externalId}: hesaplanan KPI gözlem zamanı yok, atlandı.`
        );
        continue;
      }

      const id = stableId(
        "connector-computed-kpi",
        params.orgId,
        params.configId,
        record.entity,
        record.externalId,
        entry.key,
        observedAt
      );
      const definition = definitionSnapshots.get(entry.label);
      await db.query(
        `INSERT INTO kpi_values
           (id, org_id, dataset_id, label, value, created_at,
            definition_id, definition_hash, definition_version,
            entity, external_id, period)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE
           SET dataset_id = EXCLUDED.dataset_id,
               label = EXCLUDED.label,
               value = EXCLUDED.value,
               created_at = EXCLUDED.created_at,
               definition_id = EXCLUDED.definition_id,
               definition_hash = EXCLUDED.definition_hash,
               definition_version = EXCLUDED.definition_version,
               entity = EXCLUDED.entity,
               external_id = EXCLUDED.external_id,
               period = EXCLUDED.period`,
        [
          id,
          params.orgId,
          datasetId,
          entry.label,
          String(calculation.value),
          observedAt,
          definition?.id ?? null,
          definition?.formulaHash ?? null,
          definition?.sourceRef ?? null,
          record.entity,
          record.externalId,
          // Gözlem dönemi connector kaydında yoksa NULL kalır; tanımın
          // update_frequency değeri raporlama sıklığıdır, dönem değildir.
          null,
        ]
      );
      computedKpiObservationCount++;
      if (entry.automatic) autoComputedKpiObservationCount++;
      kpiObservationCount++;
    }

    if (!params.config.eventTypeField) continue;
    const eventType = asText(
      record.fields[canonicalFieldName(params.config.entity, params.config.eventTypeField)]
    );
    const occurredRaw = params.config.eventTimeField
      ? record.fields[canonicalFieldName(params.config.entity, params.config.eventTimeField)]
      : record.sourceUpdatedAt;
    const occurredAt = asIso(occurredRaw);
    const subjectRef = params.config.eventSubjectField
      ? asText(
          record.fields[canonicalFieldName(params.config.entity, params.config.eventSubjectField)]
        )
      : record.externalId;
    if (!eventType || !occurredAt || !subjectRef) {
      skippedEventCount++;
      warn(warnings, `${record.entity}/${record.externalId}: süreç olayı alanları eksik, atlandı.`);
      continue;
    }

    const source = connectorPromotionSource(params.configId);
    const externalEventId = stableId(
      "connector-event",
      params.configId,
      record.entity,
      record.externalId,
      eventType,
      occurredAt,
      subjectRef
    );
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO integration_events
         (id, org_id, event_type, subject_ref, occurred_at, payload, source, external_event_id, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '1.0')
       ON CONFLICT (org_id, source, external_event_id) DO NOTHING
       RETURNING id`,
      [
        stableId("connector-event-row", params.orgId, externalEventId),
        params.orgId,
        eventType,
        subjectRef,
        occurredAt,
        JSON.stringify({
          connectorConfigId: params.configId,
          connectorRecordExternalId: record.externalId,
          canonicalEntity: record.entity,
          fields: record.fields,
          runId: params.runId,
        }),
        source,
        externalEventId,
      ]
    );
    if (inserted.rows.length > 0) processEventCount++;
  }

  return {
    kpiObservationCount,
    processEventCount,
    computedKpiObservationCount,
    autoComputedKpiObservationCount,
    autoSelectedKpiCount,
    skippedKpiCount,
    skippedComputedKpiCount,
    skippedEventCount,
    warnings,
  };
}

export async function getConnectorPromotionCounts(
  orgId: string,
  configId: string
): Promise<ConnectorPromotionCounts> {
  await migrate();
  const db = getDb();
  const datasetId = stableId("connector-dataset", orgId, configId);
  const [kpis, events] = await Promise.all([
    db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM kpi_values WHERE org_id = $1 AND dataset_id = $2",
      [orgId, datasetId]
    ),
    db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM integration_events WHERE org_id = $1 AND source = $2",
      [orgId, connectorPromotionSource(configId)]
    ),
  ]);
  return {
    kpiObservations: Number(kpis.rows[0]?.count ?? 0),
    processEvents: Number(events.rows[0]?.count ?? 0),
  };
}
