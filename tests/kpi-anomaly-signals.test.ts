import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-anomaly-signals-${process.pid}-${randomUUID()}`
);

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => store.set(name, value),
      delete: (name: string) => store.delete(name),
    }),
    __setTestCookie: (name: string, value: string | undefined) => {
      if (value === undefined) store.delete(name);
      else store.set(name, value);
    },
  };
});

const nextHeaders = (await import("next/headers")) as unknown as {
  __setTestCookie: (name: string, value: string | undefined) => void;
};
const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const { GET, POST } = await import("../src/app/api/anomalies/route");
const {
  generateKpiAnomalySignals,
  inferSignalDirection,
  classifyKpiAnomaly,
} = await import("../src/lib/db/repos/kpi-signals");
const { computeKpiDefinitionHash } = await import("../src/lib/kpi-definition-provenance");

const LABEL = "İlk geçiş verimi";
const FIRE_LABEL = "Fire oranı";
const SPIKE = [90, 91, 90, 92, 89, 91, 90, 90, 91, 90, 150];
const DROP = [90, 91, 90, 92, 89, 91, 90, 90, 91, 90, 20];
const FIRE_SPIKE = [5, 5.2, 4.9, 5.1, 5, 5.2, 5, 5.1, 5, 5, 15];
const FLAT = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50];

const ORG_A = "org-anom-a";
const ORG_B = "org-anom-b";
const ORG_API = "org-anom-api";
const ORG_OPP = "org-anom-opp";
const ORG_RISK = "org-anom-risk";
const ORG_NO_TARGET = "org-anom-no-target";
const ORG_SINGLE_THRESHOLD = "org-anom-single";
const ORG_AMBIGUOUS = "org-anom-ambiguous";
const ORG_DEFECT = "org-anom-defect";
const ORG_MULTI_DS = "org-anom-multi-ds";
const ORG_MULTI_ENTITY = "org-anom-multi-entity";
const ORG_LEGACY = "org-anom-legacy";
const ORG_CONCURRENT = "org-anom-concurrent";
const ORG_COUNTS = "org-anom-counts";
const ORG_PERIOD = "org-anom-period";
const ORG_MANUAL = "org-anom-manual";
const ORG_CSV = "org-anom-csv";

type DefinitionParams = {
  formula: string | null;
  source: "manual" | "industry-pack";
  sourceRef: string | null;
  warn: number | null;
  critical: number | null;
  target: number | null;
  unit?: string | null;
  /** Raporlama sıklığı; gözlem dönemi değildir. */
  updateFrequency?: string | null;
};

interface DefinitionRef {
  id: string;
  hash: string | null;
}

async function insertDefinition(
  orgId: string,
  name: string,
  params: DefinitionParams
): Promise<DefinitionRef> {
  const id = `kd-${orgId}-${name}`;
  const updateFrequency = params.updateFrequency ?? "daily";
  await getDb().query(
    `INSERT INTO kpi_definitions
       (id, org_id, name, unit, formula_text, source, source_ref,
        warn_threshold, critical_threshold, target, update_frequency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      orgId,
      name,
      params.unit ?? "ratio",
      params.formula,
      params.source,
      params.sourceRef,
      params.warn,
      params.critical,
      params.target,
      updateFrequency,
    ]
  );
  return {
    id,
    hash: computeKpiDefinitionHash({
      formulaText: params.formula,
      unit: params.unit ?? "ratio",
      source: params.source,
      sourceRef: params.sourceRef,
      warn: params.warn,
      critical: params.critical,
      target: params.target,
    }),
  };
}

async function seedSeries(
  orgId: string,
  values: number[],
  options: {
    datasetId?: string;
    label?: string;
    entity?: string | null;
    externalId?: string | null;
    sourceLabel?: string;
    definition?: DefinitionRef | null;
    /** Gözlem dönemi; verilmezse NULL (bilinmiyor) kalır. */
    observationPeriod?: string | null;
  } = {}
): Promise<void> {
  const db = getDb();
  const datasetId = options.datasetId ?? `ds-${orgId}`;
  const label = options.label ?? LABEL;
  const entity = options.entity === undefined ? "product" : options.entity;
  const externalId = options.externalId === undefined ? `P-${orgId}` : options.externalId;
  const sourceLabel = options.sourceLabel ?? `Konnektör: ${orgId}`;
  const observationPeriod = options.observationPeriod ?? null;
  await db.query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ($1, $2, 'other', $3, '{}', 'test')
     ON CONFLICT (id) DO NOTHING`,
    [datasetId, orgId, sourceLabel]
  );
  for (let i = 0; i < values.length; i++) {
    await db.query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, period, entity, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        `kv-${orgId}-${datasetId}-${label}-${entity ?? "null"}-${externalId ?? "null"}-${
          options.definition?.id ?? "none"
        }-${observationPeriod ?? "null"}-${i}`,
        orgId,
        datasetId,
        label,
        String(values[i]),
        `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        options.definition?.id ?? null,
        options.definition?.hash ?? null,
        observationPeriod,
        entity,
        externalId,
      ]
    );
  }
}

let ceoSession = "";
let guestSession = "";

beforeAll(async () => {
  await migrate();
  const db = getDb();
  for (const [id, name] of [
    [ORG_A, "A"],
    [ORG_B, "B"],
    [ORG_API, "API"],
    [ORG_OPP, "Opportunity"],
    [ORG_RISK, "Risk"],
    [ORG_NO_TARGET, "No target"],
    [ORG_SINGLE_THRESHOLD, "Single threshold"],
    [ORG_AMBIGUOUS, "Ambiguous"],
    [ORG_DEFECT, "Defect"],
    [ORG_MULTI_DS, "Multi dataset"],
    [ORG_MULTI_ENTITY, "Multi entity"],
    [ORG_LEGACY, "Legacy"],
    [ORG_CONCURRENT, "Concurrent"],
    [ORG_COUNTS, "Counts"],
    [ORG_PERIOD, "Period"],
    [ORG_MANUAL, "Manual"],
    [ORG_CSV, "CSV"],
  ]) {
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [
      id,
      name,
    ]);
  }

  await seedSeries(ORG_A, SPIKE);
  await seedSeries(ORG_B, [42]);

  const apiDefinition = await insertDefinition(ORG_API, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "industry-pack",
    sourceRef: "manufacturing@2",
    warn: 95,
    critical: 90,
    target: 100,
  });
  await seedSeries(ORG_API, SPIKE, { definition: apiDefinition });

  const oppDefinition = await insertDefinition(ORG_OPP, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "manual",
    sourceRef: null,
    warn: 95,
    critical: 90,
    target: 100,
  });
  await seedSeries(ORG_OPP, SPIKE, { definition: oppDefinition });

  const riskDefinition = await insertDefinition(ORG_RISK, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "manual",
    sourceRef: null,
    warn: 95,
    critical: 90,
    target: 100,
  });
  await seedSeries(ORG_RISK, DROP, { definition: riskDefinition });

  const noTargetDefinition = await insertDefinition(ORG_NO_TARGET, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "manual",
    sourceRef: null,
    warn: 95,
    critical: 90,
    target: null,
  });
  await seedSeries(ORG_NO_TARGET, SPIKE, { definition: noTargetDefinition });

  const singleDefinition = await insertDefinition(ORG_SINGLE_THRESHOLD, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "manual",
    sourceRef: null,
    warn: 90,
    critical: null,
    target: null,
  });
  await seedSeries(ORG_SINGLE_THRESHOLD, SPIKE, { definition: singleDefinition });

  const ambiguousDefinition = await insertDefinition(ORG_AMBIGUOUS, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "manual",
    sourceRef: null,
    warn: 90,
    critical: 90,
    target: 100,
  });
  await seedSeries(ORG_AMBIGUOUS, SPIKE, { definition: ambiguousDefinition });

  const defectDefinition = await insertDefinition(ORG_DEFECT, FIRE_LABEL, {
    formula: "fire birim / toplam üretim",
    source: "manual",
    sourceRef: null,
    warn: 8,
    critical: 12,
    target: 5,
  });
  await seedSeries(ORG_DEFECT, FIRE_SPIKE, { label: FIRE_LABEL, definition: defectDefinition });

  // Aynı etiket, aynı entity/external_id, farklı dataset: iki ayrı seri.
  await seedSeries(ORG_MULTI_DS, SPIKE, {
    datasetId: "ds-multi-a",
    entity: "product",
    externalId: "P-1",
    sourceLabel: "Konnektör: multi A",
  });
  await seedSeries(ORG_MULTI_DS, SPIKE, {
    datasetId: "ds-multi-b",
    entity: "product",
    externalId: "P-1",
    sourceLabel: "Konnektör: multi B",
  });

  // Aynı etiket ve dataset, farklı entity: iki ayrı seri.
  await seedSeries(ORG_MULTI_ENTITY, SPIKE, {
    datasetId: "ds-multi-entity",
    entity: "product",
    externalId: "P-1",
    sourceLabel: "Konnektör: multi entity",
  });
  await seedSeries(ORG_MULTI_ENTITY, FLAT, {
    datasetId: "ds-multi-entity",
    entity: "product",
    externalId: "P-2",
    sourceLabel: "Konnektör: multi entity",
  });

  // Connector kaynaklı fakat kapsamı (entity/external_id) olmayan eski satırlar.
  await seedSeries(ORG_LEGACY, SPIKE, {
    entity: null,
    externalId: null,
    sourceLabel: "Konnektör: legacy",
  });

  await seedSeries(ORG_CONCURRENT, SPIKE);

  // Karışık sayım: doğrulanmış uzun seri + doğrulanmış kısa seri + kapsamsız
  // legacy connector serisi aynı org'da birlikte raporlanır.
  await seedSeries(ORG_COUNTS, SPIKE, {
    entity: "product",
    externalId: "P-1",
    sourceLabel: "Konnektör: counts",
  });
  await seedSeries(ORG_COUNTS, [1, 2], {
    datasetId: "ds-counts",
    entity: "product",
    externalId: "P-2",
    sourceLabel: "Konnektör: counts",
  });
  await seedSeries(ORG_COUNTS, SPIKE, {
    datasetId: "ds-counts",
    entity: null,
    externalId: null,
    sourceLabel: "Konnektör: counts legacy",
  });

  // Aynı ölçüm kimliği, farklı gözlem dönemleri: üç ayrı seri. NULL dönem
  // legacy/bilinmeyen olarak ayrı kalır ve bilinen dönemlerle birleştirilmez.
  const periodDefinition = await insertDefinition(ORG_PERIOD, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "manual",
    sourceRef: null,
    warn: 95,
    critical: 90,
    target: 100,
    updateFrequency: "daily",
  });
  await seedSeries(ORG_PERIOD, SPIKE, {
    datasetId: "ds-period",
    definition: periodDefinition,
    observationPeriod: "2026-Q1",
  });
  await seedSeries(ORG_PERIOD, SPIKE, {
    datasetId: "ds-period",
    definition: periodDefinition,
    observationPeriod: "2026-Q2",
  });
  await seedSeries(ORG_PERIOD, FLAT, {
    datasetId: "ds-period",
    definition: periodDefinition,
    observationPeriod: null,
  });

  // Manuel giriş: tanım provenance'ı yok; sınıflandırma yapılmamalı.
  await seedSeries(ORG_MANUAL, SPIKE, { sourceLabel: "Manuel KPI girişi" });

  // CSV: etiketle eşleşen tanım var ama gözlem tanım kimliği/hash'i taşımıyor.
  await insertDefinition(ORG_CSV, LABEL, {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "manual",
    sourceRef: null,
    warn: 95,
    critical: 90,
    target: 100,
  });
  await seedSeries(ORG_CSV, SPIKE, { sourceLabel: "CSV: üretim", definition: null });

  const password = hashPassword("mevcut-parola-123");
  for (const [id, org, role] of [
    ["anom-ceo", ORG_API, "ceo"],
    ["anom-guest", ORG_API, "guest"],
  ] as const) {
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, org, `${id}@anom.test`, id, role, password]
    );
  }
  ceoSession = await createSession("anom-ceo", ORG_API);
  guestSession = await createSession("anom-guest", ORG_API);
});

afterAll(async () => {
  nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  await getDb().close();
});

describe("KPI aykırılık sinyali üretimi", () => {
  it("tanım provenance'ı olmayan seride istatistiksel sinyal üretir ama iş etkisi sınıflandırmaz", async () => {
    const result = await generateKpiAnomalySignals(ORG_A);
    expect(result.scannedLabels).toBe(1);
    expect(result.scannedSeries).toBe(1);
    expect(result.verifiedSeries).toBe(1);
    expect(result.skippedUnverifiedSeries).toBe(0);
    expect(result.analyzedSeries).toBe(1);
    expect(result.insufficientSeries).toBe(0);
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({
      label: LABEL,
      severity: "info",
      direction: "above",
      classification: "unclassified",
      datasetId: `ds-${ORG_A}`,
      entity: "product",
      externalId: `P-${ORG_A}`,
      sampleSize: 8,
      seriesPoints: SPIKE.length,
      analysisWindow: 8,
      definitionHash: null,
      reportingFrequency: null,
    });
    expect(result.signals[0]?.classificationReason).toContain("tanım");

    const row = await getDb().query<{
      org_id: string;
      sector_id: string;
      dataset_id: string;
      category_id: string;
      payload: {
        metricValue: number;
        baseline: number;
        score: number;
        sampleSize: number;
        seriesPoints: number;
        analysisWindow: number;
        classificationReason: string;
        series: {
          entity: string;
          externalId: string;
          definitionVerified: boolean;
          scopeVerified: boolean;
        };
        method: { window: number; threshold: number };
        note: string;
      };
    }>(
      "SELECT org_id, sector_id, dataset_id, category_id, payload FROM signals WHERE id = $1",
      [result.signals[0].id]
    );
    expect(row.rows[0]).toMatchObject({
      org_id: ORG_A,
      sector_id: "other",
      dataset_id: `ds-${ORG_A}`,
      category_id: "kpi_anomaly",
    });
    expect(row.rows[0].payload.metricValue).toBe(150);
    expect(row.rows[0].payload.score).toBeGreaterThan(3.5);
    expect(row.rows[0].payload.sampleSize).toBe(8);
    expect(row.rows[0].payload.seriesPoints).toBe(SPIKE.length);
    expect(row.rows[0].payload.analysisWindow).toBe(8);
    expect(row.rows[0].payload.series).toMatchObject({
      entity: "product",
      externalId: `P-${ORG_A}`,
      definitionVerified: false,
      scopeVerified: true,
    });
    expect(row.rows[0].payload.method).toMatchObject({ window: 8, threshold: 3.5 });
    expect(row.rows[0].payload.note).toContain("nedensellik");
    expect(row.rows[0].payload.classificationReason).toContain("tanım");
  });

  it("hedef aşılmış iyi yönlü aykırılığı fırsat olarak sınıflandırır", async () => {
    const result = await generateKpiAnomalySignals(ORG_OPP);
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({
      classification: "opportunity",
      severity: "info",
      direction: "above",
    });
    expect(result.signals[0]?.classificationReason).toContain("hedef");
    const row = await getDb().query<{
      category_id: string;
      severity: string;
      title: string;
      payload: {
        classification: string;
        crossed: string;
        thresholds: { warn: number; critical: number; target: number };
      };
    }>(
      "SELECT category_id, severity, title, payload FROM signals WHERE id = $1",
      [result.signals[0].id]
    );
    expect(row.rows[0]).toMatchObject({ category_id: "kpi_opportunity", severity: "info" });
    expect(row.rows[0].title).toContain("KPI fırsatı");
    expect(row.rows[0].payload.classification).toBe("opportunity");
    expect(row.rows[0].payload.crossed).toBe("target");
    expect(row.rows[0].payload.thresholds).toMatchObject({ warn: 95, critical: 90, target: 100 });
  });

  it("kötü yönde kritik eşik aşımını risk olarak sınıflandırır", async () => {
    const result = await generateKpiAnomalySignals(ORG_RISK);
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({
      classification: "risk",
      severity: "critical",
      direction: "below",
    });
    const row = await getDb().query<{ category_id: string; title: string }>(
      "SELECT category_id, title FROM signals WHERE id = $1",
      [result.signals[0].id]
    );
    expect(row.rows[0].category_id).toBe("kpi_anomaly");
    expect(row.rows[0].title).toContain("KPI riski");
  });

  it("düşük değer daha iyi olan KPI'da yukarı aykırılığı risk sayar", async () => {
    const result = await generateKpiAnomalySignals(ORG_DEFECT);
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({
      label: FIRE_LABEL,
      classification: "risk",
      severity: "critical",
      direction: "above",
    });
  });

  it("hedef yoksa iyi yönlü aykırılığı fırsat saymaz", async () => {
    const result = await generateKpiAnomalySignals(ORG_NO_TARGET);
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({ classification: "unclassified", severity: "info" });
    expect(result.signals[0]?.classificationReason).toContain("hedef");
  });

  it("tek veya çelişkili eşikte yön uydurmaz", async () => {
    const single = await generateKpiAnomalySignals(ORG_SINGLE_THRESHOLD);
    expect(single.signals[0]).toMatchObject({
      classification: "unclassified",
      severity: "info",
    });
    expect(single.signals[0]?.classificationReason).toContain("tutarlı referans");

    const ambiguous = await generateKpiAnomalySignals(ORG_AMBIGUOUS);
    expect(ambiguous.signals[0]).toMatchObject({
      classification: "unclassified",
      severity: "info",
    });
    expect(ambiguous.signals[0]?.classificationReason).toContain("tutarlı referans");
  });

  it("saf yön/sınıflandırma yardımcıları belirsizlikte unclassified döner", () => {
    expect(inferSignalDirection(90, 90, 100)).toBeNull();
    expect(inferSignalDirection(90, null, null)).toBeNull();
    expect(inferSignalDirection(95, 90, 100)).toMatchObject({
      direction: "higher_is_better",
    });
    expect(inferSignalDirection(8, 12, 5)).toMatchObject({
      direction: "lower_is_better",
    });
    expect(
      classifyKpiAnomaly({
        value: 150,
        anomalyDirection: "above",
        warn: 95,
        critical: 90,
        target: null,
        definitionVerified: true,
      }).classification
    ).toBe("unclassified");
  });

  it("aynı etiketli farklı datasetleri ayrı seri tutar ve kimlikleri çakıştırmaz", async () => {
    const result = await generateKpiAnomalySignals(ORG_MULTI_DS);
    expect(result.scannedSeries).toBe(2);
    expect(result.generated).toBe(2);
    expect(new Set(result.signals.map((signal) => signal.datasetId))).toEqual(
      new Set(["ds-multi-a", "ds-multi-b"])
    );
    expect(new Set(result.signals.map((signal) => signal.id)).size).toBe(2);
  });

  it("aynı dataset içindeki farklı entity'leri ayrı seri tutar", async () => {
    const result = await generateKpiAnomalySignals(ORG_MULTI_ENTITY);
    expect(result.scannedSeries).toBe(2);
    // P-2 düz seri; yalnız P-1 aykırı.
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({ entity: "product", externalId: "P-1" });
    expect(result.signals[0]?.seriesPoints).toBe(SPIKE.length);
  });

  it("kapsamı doğrulanamayan connector serilerini analiz etmez", async () => {
    const result = await generateKpiAnomalySignals(ORG_LEGACY);
    expect(result.scannedSeries).toBe(1);
    expect(result.verifiedSeries).toBe(0);
    expect(result.skippedUnverifiedSeries).toBe(1);
    expect(result.analyzedSeries).toBe(0);
    expect(result.insufficientSeries).toBe(0);
    expect(result.generated).toBe(0);
    const count = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM signals WHERE org_id = $1",
      [ORG_LEGACY]
    );
    expect(count.rows[0].n).toBe(0);
  });

  it("aynı gözlem için ikinci kez mükerrer sinyal üretmez", async () => {
    const result = await generateKpiAnomalySignals(ORG_A);
    expect(result.generated).toBe(0);
    expect(result.existing).toBe(1);
    const count = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM signals WHERE org_id = $1",
      [ORG_A]
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("eşzamanlı üretimde tek sinyal yazar", async () => {
    const results = await Promise.all([
      generateKpiAnomalySignals(ORG_CONCURRENT),
      generateKpiAnomalySignals(ORG_CONCURRENT),
    ]);
    expect(results.reduce((sum, item) => sum + item.generated, 0)).toBe(1);
    expect(results.reduce((sum, item) => sum + item.existing, 0)).toBe(1);
    const count = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM signals WHERE org_id = $1",
      [ORG_CONCURRENT]
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("yetersiz seride sinyal üretmez", async () => {
    const result = await generateKpiAnomalySignals(ORG_B);
    expect(result.scannedSeries).toBe(1);
    expect(result.verifiedSeries).toBe(1);
    expect(result.analyzedSeries).toBe(0);
    expect(result.insufficientSeries).toBe(1);
    expect(result.generated).toBe(0);
    const count = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM signals WHERE org_id = $1",
      [ORG_B]
    );
    expect(count.rows[0].n).toBe(0);
  });

  it("seri sayımlarını doğrulanmış, atlanan, analiz edilen ve yetersiz olarak ayırır", async () => {
    const result = await generateKpiAnomalySignals(ORG_COUNTS);
    expect(result).toMatchObject({
      scannedLabels: 1,
      scannedSeries: 3,
      verifiedSeries: 2,
      skippedUnverifiedSeries: 1,
      analyzedSeries: 1,
      insufficientSeries: 1,
      generated: 1,
    });
  });

  it("aynı ölçüm kimliğinde farklı gözlem dönemlerini ayrı seri tutar", async () => {
    const result = await generateKpiAnomalySignals(ORG_PERIOD);
    expect(result.scannedSeries).toBe(3);
    expect(result.verifiedSeries).toBe(3);
    expect(result.skippedUnverifiedSeries).toBe(0);
    expect(result.analyzedSeries).toBe(3);
    expect(result.generated).toBe(2);
    expect(new Set(result.signals.map((signal) => signal.id)).size).toBe(2);
    expect(new Set(result.signals.map((signal) => signal.period))).toEqual(
      new Set(["2026-Q1", "2026-Q2"])
    );
  });

  it("manuel giriş tanım provenance'ı taşımıyorsa iş etkisi sınıflandırmaz", async () => {
    const result = await generateKpiAnomalySignals(ORG_MANUAL);
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({
      classification: "unclassified",
      severity: "info",
      definitionHash: null,
    });
  });

  it("CSV gözlemi tanım kimliği/hash'i taşımıyorsa eşleşen etikete rağmen sınıflandırmaz", async () => {
    const result = await generateKpiAnomalySignals(ORG_CSV);
    expect(result.generated).toBe(1);
    expect(result.signals[0]).toMatchObject({
      classification: "unclassified",
      severity: "info",
      definitionHash: null,
    });
    expect(result.signals[0]?.classificationReason).toContain("tanım");
  });
});

describe("GET /api/anomalies", () => {
  it("oturum ve izin denetimi uygular", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await GET()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestSession);
    expect((await GET()).status).toBe(403);
  });

  it("kapsamlı seri önizlemesi döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      scannedLabels: number;
      scannedSeries: number;
      verifiedSeries: number;
      skippedUnverifiedSeries: number;
      analyzedSeries: number;
      insufficientSeries: number;
      flaggedSeries: number;
      flaggedLabels: number;
      results: Array<{
        datasetId: string;
        entity: string | null;
        externalId: string | null;
        period: string | null;
        periodKnown: boolean;
        reportingFrequency: string | null;
        definitionUnit: string | null;
        sampleSize: number;
        seriesPoints: number;
      }>;
    };
    expect(body).toMatchObject({
      scannedLabels: 1,
      scannedSeries: 1,
      verifiedSeries: 1,
      skippedUnverifiedSeries: 0,
      analyzedSeries: 1,
      insufficientSeries: 0,
      flaggedSeries: 1,
      flaggedLabels: 1,
    });
    expect(body.results[0]).toMatchObject({
      datasetId: `ds-${ORG_API}`,
      entity: "product",
      externalId: `P-${ORG_API}`,
      // Gözlem dönemi verilmedi; raporlama sıklığı ayrı alandır.
      period: null,
      periodKnown: false,
      reportingFrequency: "daily",
      definitionUnit: "ratio",
      sampleSize: 8,
      seriesPoints: SPIKE.length,
    });
  });
});

describe("POST /api/anomalies", () => {
  it("oturum ve izin denetimi uygular", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await POST()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestSession);
    expect((await POST()).status).toBe(403);
  });

  it("sinyalleri üretir ve denetim kaydı yazar, tekrarında mükerrer üretmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const first = await POST();
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      generated: number;
      scannedLabels: number;
      scannedSeries: number;
      skippedUnverifiedSeries: number;
      decisionCases: { generated: number; existing: number };
    };
    expect(body.generated).toBe(1);
    expect(body.scannedLabels).toBe(1);
    expect(body.scannedSeries).toBe(1);
    expect(body.skippedUnverifiedSeries).toBe(0);
    expect(body.decisionCases.generated).toBe(1);

    const audit = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = 'kpi_anomaly_signals_generated'",
      [ORG_API]
    );
    expect(audit.rows).toHaveLength(1);
    const caseAudit = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = 'decision_case_generated_from_signal'",
      [ORG_API]
    );
    expect(caseAudit.rows).toHaveLength(1);

    const second = await POST();
    const secondBody = (await second.json()) as {
      generated: number;
      existing: number;
      decisionCases: { generated: number; existing: number };
    };
    expect(secondBody.generated).toBe(0);
    expect(secondBody.existing).toBe(1);
    expect(secondBody.decisionCases.generated).toBe(0);
    expect(secondBody.decisionCases.existing).toBe(1);

    const auditAfter = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = 'kpi_anomaly_signals_generated'",
      [ORG_API]
    );
    expect(auditAfter.rows).toHaveLength(1);
  });
});
