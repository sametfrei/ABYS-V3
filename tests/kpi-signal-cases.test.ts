import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-signal-cases-${process.pid}-${randomUUID()}`
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
const { POST } = await import("../src/app/api/decision-cases/from-signals/route");
const { generateKpiAnomalySignals } = await import("../src/lib/db/repos/kpi-signals");
const { generateDecisionCasesFromKpiSignals } = await import(
  "../src/lib/db/repos/kpi-signal-cases"
);
const { recordHumanDecision, DecisionLifecycleError } = await import(
  "../src/lib/db/repos/decision-lifecycle"
);
const { computeKpiDefinitionHash } = await import("../src/lib/kpi-definition-provenance");

const ORG = "org-case-gen";
const ORG_NO_FORMULA = "org-case-noformula";
const ORG_UNCLASSIFIED = "org-case-unclassified";
const ORG_API = "org-case-api";
const ORG_TAMPERED = "org-case-tampered";
const ORG_CONCURRENT = "org-case-concurrent";

const SPIKE = [90, 91, 90, 92, 89, 91, 90, 90, 91, 90, 150];
const FIRE_SPIKE = [5, 5.2, 4.9, 5.1, 5, 5.2, 5, 5.1, 5, 5, 15];

let ceoSession = "";
let guestSession = "";

async function insertOrg(orgId: string) {
  await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [
    orgId,
    orgId,
  ]);
}

async function insertDataset(orgId: string): Promise<string> {
  const id = `ds-${orgId}`;
  await getDb().query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ($1, $2, 'other', $3, '{}', 'test')`,
    [id, orgId, `Konnektör: ${orgId}`]
  );
  return id;
}

async function insertSeries(
  orgId: string,
  datasetId: string,
  label: string,
  values: number[],
  month: number,
  definition: { id: string; hash: string | null } | null,
  observationPeriod: string | null = null
) {
  for (let i = 0; i < values.length; i++) {
    await getDb().query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, period, entity, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'product', 'P-1')`,
      [
        `kv-${orgId}-${month}-${i}`,
        orgId,
        datasetId,
        label,
        String(values[i]),
        `2026-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        definition?.id ?? null,
        definition?.hash ?? null,
        observationPeriod,
      ]
    );
  }
}

async function insertDefinition(
  orgId: string,
  name: string,
  params: {
    formula: string | null;
    source: "manual" | "industry-pack";
    sourceRef: string | null;
    warn: number | null;
    critical: number | null;
    target?: number | null;
  }
): Promise<{ id: string; hash: string | null }> {
  const id = `kd-${orgId}-${name}`;
  const target = params.target ?? null;
  // Raporlama sıklığı; gözlem dönemi değildir.
  const updateFrequency = "daily";
  await getDb().query(
    `INSERT INTO kpi_definitions
       (id, org_id, name, unit, formula_text, source, source_ref,
        warn_threshold, critical_threshold, target, update_frequency, governance_state)
     VALUES ($1, $2, $3, 'ratio', $4, $5, $6, $7, $8, $9, $10, 'approved')`,
    [
      id,
      orgId,
      name,
      params.formula,
      params.source,
      params.sourceRef,
      params.warn,
      params.critical,
      target,
      updateFrequency,
    ]
  );
  return {
    id,
    hash: computeKpiDefinitionHash({
      formulaText: params.formula,
      unit: "ratio",
      source: params.source,
      sourceRef: params.sourceRef,
      warn: params.warn,
      critical: params.critical,
      target,
    }),
  };
}

beforeAll(async () => {
  await migrate();
  for (const org of [
    ORG,
    ORG_NO_FORMULA,
    ORG_UNCLASSIFIED,
    ORG_API,
    ORG_TAMPERED,
    ORG_CONCURRENT,
  ]) {
    await insertOrg(org);
  }

  const dataset = await insertDataset(ORG);
  const fpyDefinition = await insertDefinition(ORG, "İlk geçiş verimi", {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "industry-pack",
    sourceRef: "manufacturing@2",
    warn: 95,
    critical: 90,
    target: 100,
  });
  const fireDefinition = await insertDefinition(ORG, "Fire oranı", {
    formula: "fire birim / toplam üretim",
    source: "manual",
    sourceRef: null,
    warn: 8,
    critical: 12,
    target: 5,
  });
  await insertSeries(ORG, dataset, "İlk geçiş verimi", SPIKE, 1, fpyDefinition);
  await insertSeries(ORG, dataset, "Fire oranı", FIRE_SPIKE, 2, fireDefinition);
  expect((await generateKpiAnomalySignals(ORG)).generated).toBe(2);

  const noFormulaDataset = await insertDataset(ORG_NO_FORMULA);
  const noFormulaDefinition = await insertDefinition(ORG_NO_FORMULA, "İlk geçiş verimi", {
    formula: null,
    source: "manual",
    sourceRef: null,
    warn: 95,
    critical: 90,
    target: 100,
  });
  await insertSeries(
    ORG_NO_FORMULA,
    noFormulaDataset,
    "İlk geçiş verimi",
    SPIKE,
    3,
    noFormulaDefinition
  );
  expect((await generateKpiAnomalySignals(ORG_NO_FORMULA)).generated).toBe(1);

  const unclassifiedDataset = await insertDataset(ORG_UNCLASSIFIED);
  await insertSeries(
    ORG_UNCLASSIFIED,
    unclassifiedDataset,
    "İlk geçiş verimi",
    SPIKE,
    4,
    null
  );
  expect((await generateKpiAnomalySignals(ORG_UNCLASSIFIED)).generated).toBe(1);

  const apiDataset = await insertDataset(ORG_API);
  const apiDefinition = await insertDefinition(ORG_API, "İlk geçiş verimi", {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "industry-pack",
    sourceRef: "manufacturing@2",
    warn: 95,
    critical: 90,
    target: 100,
  });
  await insertSeries(ORG_API, apiDataset, "İlk geçiş verimi", SPIKE, 5, apiDefinition);
  expect((await generateKpiAnomalySignals(ORG_API)).generated).toBe(1);

  const tamperedDataset = await insertDataset(ORG_TAMPERED);
  const tamperedDefinition = await insertDefinition(ORG_TAMPERED, "İlk geçiş verimi", {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "industry-pack",
    sourceRef: "manufacturing@2",
    warn: 95,
    critical: 90,
    target: 100,
  });
  await insertSeries(
    ORG_TAMPERED,
    tamperedDataset,
    "İlk geçiş verimi",
    SPIKE,
    6,
    tamperedDefinition
  );
  expect((await generateKpiAnomalySignals(ORG_TAMPERED)).generated).toBe(1);

  const concurrentDataset = await insertDataset(ORG_CONCURRENT);
  const concurrentDefinition = await insertDefinition(ORG_CONCURRENT, "İlk geçiş verimi", {
    formula: "ilk seferde hatasız birim / toplam birim",
    source: "industry-pack",
    sourceRef: "manufacturing@2",
    warn: 95,
    critical: 90,
    target: 100,
  });
  await insertSeries(
    ORG_CONCURRENT,
    concurrentDataset,
    "İlk geçiş verimi",
    SPIKE,
    7,
    concurrentDefinition
  );
  expect((await generateKpiAnomalySignals(ORG_CONCURRENT)).generated).toBe(1);

  const password = hashPassword("mevcut-parola-123");
  for (const [id, org, role] of [
    ["case-ceo", ORG_API, "ceo"],
    ["case-guest", ORG_API, "guest"],
  ] as const) {
    await getDb().query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, org, `${id}@case.test`, id, role, password]
    );
  }
  ceoSession = await createSession("case-ceo", ORG_API);
  guestSession = await createSession("case-guest", ORG_API);
});

afterAll(async () => {
  nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  await getDb().close();
});

describe("KPI sinyalinden karar vakası", () => {
  it("risk ve fırsat sinyallerinden kanıtlı, yaşam döngüsüne hazır taslak üretir", async () => {
    const result = await generateDecisionCasesFromKpiSignals(ORG);
    expect(result).toMatchObject({ scannedSignals: 2, generated: 2, existing: 0, skipped: 0 });
    expect(result.cases).toHaveLength(2);

    const rows = await getDb().query<{
      id: string;
      status: string;
      category_id: string;
      severity: string;
      confidence: number;
      payload: {
        title: string;
        evidence: Array<{ reliability: string }>;
        options: Array<{ rank: number }>;
        recommendedOptionRank: number;
        origin: {
          kind: string;
          signalId: string;
          observationId: string;
          label: string;
          datasetId: string;
          classification: string;
          formulaVersion: string;
          method: { engine: string };
        };
      };
    }>("SELECT id, status, category_id, severity, confidence, payload FROM decision_cases WHERE org_id = $1", [
      ORG,
    ]);
    expect(rows.rows).toHaveLength(2);

    const opportunity = rows.rows.find((row) => row.category_id === "kpi_opportunity");
    expect(opportunity).toMatchObject({ status: "open", severity: "info" });
    expect(opportunity?.confidence).toBeGreaterThanOrEqual(55);
    expect(opportunity?.confidence).toBeLessThanOrEqual(80);
    expect(opportunity?.payload.origin).toMatchObject({
      kind: "kpi_signal",
      observationId: expect.any(String),
      label: "İlk geçiş verimi",
      classification: "opportunity",
      formulaVersion: "manufacturing@2",
    });
    expect(opportunity?.payload.origin.method.engine).toContain("anomaly.ts");
    expect(opportunity?.payload.evidence).toHaveLength(5);
    expect(opportunity?.payload.evidence.some((item) => item.reliability === "unknown")).toBe(
      true
    );
    expect(opportunity?.payload.options).toHaveLength(3);
    expect(opportunity?.payload.recommendedOptionRank).toBe(1);

    const risk = rows.rows.find((row) => row.category_id === "kpi_anomaly");
    expect(risk).toMatchObject({ status: "open", severity: "critical" });
    expect(risk?.payload.origin).toMatchObject({
      label: "Fire oranı",
      classification: "risk",
      formulaVersion: "manual",
    });

    const links = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_case_signals WHERE org_id = $1",
      [ORG]
    );
    expect(links.rows[0].n).toBe(2);
    const audit = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_events WHERE org_id = $1 AND type = 'decision_case_generated_from_signal'",
      [ORG]
    );
    expect(audit.rows[0].n).toBe(2);
  });

  it("aynı sinyaller ikinci kez mükerrer vaka üretmez", async () => {
    const result = await generateDecisionCasesFromKpiSignals(ORG);
    expect(result).toMatchObject({ generated: 0, existing: 2, skipped: 0 });
    const cases = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1",
      [ORG]
    );
    expect(cases.rows[0].n).toBe(2);
  });

  it("KPI formülü/doğrulanmış tanımı yoksa vaka üretmez ve nedenini raporlar", async () => {
    const result = await generateDecisionCasesFromKpiSignals(ORG_NO_FORMULA);
    expect(result).toMatchObject({ generated: 0, skipped: 1 });
    expect(result.skippedReasons.unclassified_signal).toBe(1);
    const cases = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1",
      [ORG_NO_FORMULA]
    );
    expect(cases.rows[0].n).toBe(0);
  });

  it("eşik sınıflandırması olmayan sinyalden vaka üretmez", async () => {
    const result = await generateDecisionCasesFromKpiSignals(ORG_UNCLASSIFIED);
    expect(result).toMatchObject({ generated: 0, skipped: 1 });
    expect(result.skippedReasons.unclassified_signal).toBe(1);
  });

  it("başka organizasyonun vakalarına karışmaz", async () => {
    const other = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1",
      [ORG_NO_FORMULA]
    );
    expect(other.rows[0].n).toBe(0);
    const own = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1",
      [ORG]
    );
    expect(own.rows[0].n).toBe(2);
  });

  it("üretilen vakalar mevcut onay/ret yaşam döngüsüyle çalışır", async () => {
    const rows = await getDb().query<{ id: string; category_id: string }>(
      "SELECT id, category_id FROM decision_cases WHERE org_id = $1",
      [ORG]
    );
    const opportunity = rows.rows.find((row) => row.category_id === "kpi_opportunity")!;
    const risk = rows.rows.find((row) => row.category_id === "kpi_anomaly")!;

    const accepted = await recordHumanDecision({
      orgId: ORG,
      caseId: opportunity.id,
      choice: "accepted",
      chosenAction: "Kök nedeni incele ve doğrula",
      actorId: "case-ceo",
      actorName: "Test CEO",
    });
    expect(accepted.actionId).not.toBeNull();

    const rejected = await recordHumanDecision({
      orgId: ORG,
      caseId: risk.id,
      choice: "rejected",
      reason: "Kanıt yetersiz",
      actorId: "case-ceo",
      actorName: "Test CEO",
    });
    expect(rejected.actionId).toBeNull();

    const statuses = await getDb().query<{ id: string; status: string }>(
      "SELECT id, status FROM decision_cases WHERE org_id = $1",
      [ORG]
    );
    expect(statuses.rows.every((row) => row.status === "decided")).toBe(true);

    const records = await getDb().query<{ choice: string }>(
      "SELECT choice FROM decision_records WHERE org_id = $1 ORDER BY created_at ASC",
      [ORG]
    );
    expect(records.rows.map((row) => row.choice).sort()).toEqual(["accepted", "rejected"]);

    await expect(
      recordHumanDecision({
        orgId: ORG,
        caseId: opportunity.id,
        choice: "accepted",
        actorId: "case-ceo",
        actorName: "Test CEO",
      })
    ).rejects.toBeInstanceOf(DecisionLifecycleError);
  });
});

describe("eşzamanlı KPI karar vakası üretimi", () => {
  it("aynı organizasyondaki eşzamanlı istekler tek vaka, tek bağlantı ve tek audit üretir", async () => {
    const results = await Promise.all([
      generateDecisionCasesFromKpiSignals(ORG_CONCURRENT),
      generateDecisionCasesFromKpiSignals(ORG_CONCURRENT),
    ]);
    expect(results.reduce((sum, result) => sum + result.generated, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.existing, 0)).toBe(1);

    const cases = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1",
      [ORG_CONCURRENT]
    );
    const links = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_case_signals WHERE org_id = $1",
      [ORG_CONCURRENT]
    );
    const audits = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_events WHERE org_id = $1 AND type = 'decision_case_generated_from_signal'",
      [ORG_CONCURRENT]
    );
    expect(cases.rows[0].n).toBe(1);
    expect(links.rows[0].n).toBe(1);
    expect(audits.rows[0].n).toBe(1);
  });
});

describe("vaka üretiminde savunma katmanı", () => {
  type SignalPayload = {
    classification: string;
    observationId: string;
    metricValue: number;
    baseline: number;
    scale: number;
    score: number;
    timestamp: string;
    sampleSize: number;
    seriesPoints: number;
    analysisWindow: number;
    method: { window: number; threshold: number };
    series: {
      entity: string | null;
      externalId: string | null;
      scopeVerified: boolean;
      definitionVerified: boolean;
      definitionId: string;
      definitionHash: string;
    };
  };

  async function readPayload(): Promise<SignalPayload> {
    const row = await getDb().query<{ payload: SignalPayload }>(
      "SELECT payload FROM signals WHERE org_id = $1",
      [ORG_TAMPERED]
    );
    return row.rows[0].payload;
  }

  it("payload bayrağına ve kalıcı sınıflandırmaya güvenmeden kökeni yeniden doğrular", async () => {
    const original = await readPayload();
    async function writePayload(mutate: (payload: SignalPayload) => void): Promise<void> {
      // Her senaryo orijinal payload'dan türetilir; önceki tamper birikmez.
      const payload = structuredClone(original);
      mutate(payload);
      await getDb().query("UPDATE signals SET payload = $1::jsonb WHERE org_id = $2", [
        JSON.stringify(payload),
        ORG_TAMPERED,
      ]);
    }

    await writePayload((payload) => {
      payload.series.definitionVerified = false;
    });
    const unverified = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(unverified).toMatchObject({ generated: 0, skipped: 1 });
    expect(unverified.skippedReasons.definition_unverified).toBe(1);

    await writePayload((payload) => {
      payload.classification = "risk";
    });
    const mismatch = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(mismatch).toMatchObject({ generated: 0, skipped: 1 });
    expect(mismatch.skippedReasons.classification_mismatch).toBe(1);

    await writePayload((payload) => {
      payload.series.definitionHash = "deadbeef";
    });
    const hashMismatch = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(hashMismatch).toMatchObject({ generated: 0, skipped: 1 });
    expect(hashMismatch.skippedReasons.definition_mismatch).toBe(1);

    await writePayload((payload) => {
      payload.series.scopeVerified = false;
    });
    const scopeFlag = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(scopeFlag).toMatchObject({ generated: 0, skipped: 1 });
    expect(scopeFlag.skippedReasons.scope_unverified).toBe(1);

    // Bayrak true kalsa bile connector kapsamı veriden yeniden doğrulanır.
    await writePayload((payload) => {
      payload.series.entity = null;
    });
    const scopeData = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(scopeData).toMatchObject({ generated: 0, skipped: 1 });
    expect(scopeData.skippedReasons.scope_unverified).toBe(1);

    await writePayload((payload) => {
      payload.observationId = `kv-${ORG_TAMPERED}-6-0`;
    });
    const observationTamper = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(observationTamper).toMatchObject({ generated: 0, skipped: 1 });
    expect(observationTamper.skippedReasons.source_observation_mismatch).toBe(1);

    await writePayload((payload) => {
      payload.metricValue += 1;
    });
    const metricTamper = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(metricTamper).toMatchObject({ generated: 0, skipped: 1 });
    expect(metricTamper.skippedReasons.source_observation_mismatch).toBe(1);

    await writePayload((payload) => {
      payload.score += 100;
    });
    const scoreTamper = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(scoreTamper).toMatchObject({ generated: 0, skipped: 1 });
    expect(scoreTamper.skippedReasons.anomaly_recalculation_mismatch).toBe(1);

    await writePayload((payload) => {
      payload.baseline += 100;
    });
    const baselineTamper = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(baselineTamper).toMatchObject({ generated: 0, skipped: 1 });
    expect(baselineTamper.skippedReasons.anomaly_recalculation_mismatch).toBe(1);

    await writePayload((payload) => {
      payload.method.threshold = 2;
    });
    const methodTamper = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(methodTamper).toMatchObject({ generated: 0, skipped: 1 });
    expect(methodTamper.skippedReasons.invalid_anomaly_parameters).toBe(1);

    await writePayload(() => {});
    await getDb().query(
      "UPDATE signals SET category_id = 'kpi_anomaly' WHERE org_id = $1",
      [ORG_TAMPERED]
    );
    const categoryTamper = await generateDecisionCasesFromKpiSignals(ORG_TAMPERED);
    expect(categoryTamper).toMatchObject({ generated: 0, skipped: 1 });
    expect(categoryTamper.skippedReasons.classification_mismatch).toBe(1);

    const cases = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1",
      [ORG_TAMPERED]
    );
    expect(cases.rows[0].n).toBe(0);
  });
});

describe("POST /api/decision-cases/from-signals", () => {
  it("oturum ve izin denetimi uygular", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await POST()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestSession);
    expect((await POST()).status).toBe(403);
  });

  it("vakaları üretir, tekrarında mükerrer oluşturmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const first = await POST();
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { generated: number; existing: number };
    expect(firstBody.generated).toBe(1);

    const second = await POST();
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { generated: number; existing: number };
    expect(secondBody.generated).toBe(0);
    expect(secondBody.existing).toBe(1);

    const audit = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_events WHERE org_id = $1 AND type = 'decision_case_generated_from_signal'",
      [ORG_API]
    );
    expect(audit.rows[0].n).toBe(1);
  });
});
