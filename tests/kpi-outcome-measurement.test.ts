import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-outcome-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { verifyAuditChain } = await import("../src/lib/db/repos/audit");
const { generateKpiAnomalySignals } = await import("../src/lib/db/repos/kpi-signals");
const { generateDecisionCasesFromKpiSignals } = await import(
  "../src/lib/db/repos/kpi-signal-cases"
);
const { recordHumanDecision } = await import("../src/lib/db/repos/decision-lifecycle");
const { transitionAction } = await import("../src/lib/db/repos/actions");
const {
  KpiOutcomeError,
  previewKpiOutcome,
  recordVerifiedKpiOutcome,
} = await import("../src/lib/db/repos/kpi-outcomes");
const { getLedgerEntries, getLedgerSummary } = await import(
  "../src/lib/db/repos/decision-ledger"
);
const { buildServerMemory } = await import("../src/lib/db/repos/decisions");
const {
  classifyKpiChange,
  formatMeasurementEvidence,
  inferKpiDirection,
} = await import("../src/lib/kpi-outcome-measurement");
const { ledgerEntryToRow, LEDGER_CSV_HEADER } = await import("../src/lib/ledger-csv");
const { computeKpiDefinitionHash } = await import("../src/lib/kpi-definition-provenance");

const ORG_A = "org-kpi-outcome-a";
const ORG_B = "org-kpi-outcome-b";
const SECTOR = "retail";
const LABEL = "Gecikme Süresi";
const FOLLOW_UP_AT = "2026-01-10T09:00:00.000Z";
const ACTION_OPENED_AT = "2026-01-06T08:00:00.000Z";
const ACTION_STARTED_AT = "2026-01-06T09:00:00.000Z";
const ACTION_DONE_AT = "2026-01-08T17:00:00.000Z";
const DELAY_DEFINITION_ID = "kpi-def-delay";
const DELAY_DEFINITION = {
  formulaText: "ortalama(bitis - planlanan_bitis)",
  unit: "dk",
  source: "manual",
  sourceRef: null,
  warn: 15,
  critical: 20,
  target: 10,
};
const DELAY_HASH = computeKpiDefinitionHash(DELAY_DEFINITION)!;
const COUNT_HASH = computeKpiDefinitionHash({
  formulaText: "count(*)",
  unit: "adet",
  source: "manual",
  sourceRef: null,
  warn: 15,
  critical: 20,
  target: 10,
})!;

async function seedOrg(orgId: string, name: string): Promise<void> {
  await getDb().query(
    "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)",
    [orgId, name, SECTOR]
  );
}

async function seedSeries(): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ('ds-kpi-outcome', $1, $2, 'ERP gecikme aktarımı', '{}', 'test')`,
    [ORG_A, SECTOR]
  );
  await db.query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ('ds-kpi-outcome-after', $1, $2, 'Operasyon ölçüm aktarımı', '{}', 'test')`,
    [ORG_A, SECTOR]
  );
  await db.query(
    `INSERT INTO kpi_definitions
       (id, org_id, name, description, unit, formula_text, target, warn_threshold, critical_threshold)
     VALUES ($1, $2, $3, 'Ortalama gecikme', 'dk',
             'ortalama(bitis - planlanan_bitis)', 10, 15, 20)`,
    [DELAY_DEFINITION_ID, ORG_A, LABEL]
  );

  const baseline = [10, 11, 10, 12, 11, 10, 11, 10, 12, 11, 10, 40];
  const firstObservation = Date.parse("2025-12-25T09:00:00.000Z");
  for (let i = 0; i < baseline.length; i += 1) {
    await db.query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version)
       VALUES ($1, $2, 'ds-kpi-outcome', $3, $4, $5, $6, $7, NULL)`,
      [
        `kpi-value-${i + 1}`,
        ORG_A,
        LABEL,
        String(baseline[i]),
        new Date(firstObservation + i * 86_400_000).toISOString(),
        DELAY_DEFINITION_ID,
        DELAY_HASH,
      ]
    );
  }
}

async function seedAfterObservation(at: string): Promise<void> {
  await getDb().query(
    `INSERT INTO kpi_values
       (id, org_id, dataset_id, label, value, created_at,
        definition_id, definition_hash, definition_version)
     VALUES ('kpi-value-after', $1, 'ds-kpi-outcome', $2, '12', $3, $4, $5, NULL)`,
    [ORG_A, LABEL, at, DELAY_DEFINITION_ID, DELAY_HASH]
  );
}

async function seedDirectDecision(options: {
  caseId: string;
  decisionId: string;
  actionId?: string;
  orgId?: string;
  sectorId?: string;
  choice?: "accepted" | "rejected" | "modified";
  decidedBy?: string;
  approvalComplete?: boolean;
  payload?: unknown;
  actionStatus?: "open" | "done";
  startedAt?: string;
  doneAt?: string;
}): Promise<void> {
  const db = getDb();
  const orgId = options.orgId ?? ORG_A;
  const sectorId = options.sectorId ?? SECTOR;
  const choice = options.choice ?? "accepted";
  const decidedBy = options.decidedBy ?? "test";
  const human = decidedBy.trim().toLocaleLowerCase("tr") !== "sistem";
  const approvalComplete = options.approvalComplete ?? true;
  const approvalAuditId =
    human && approvalComplete ? `approval-${options.decisionId}` : null;
  const decidedById = human && approvalComplete ? "test-user" : null;
  const decidedRole = human && approvalComplete ? "ceo" : null;
  const approvalPermission = human && approvalComplete ? "record_decision" : null;
  const approvalSource = human ? "human" : "system";
  const approvedAt = human && approvalComplete ? new Date().toISOString() : null;
  await db.query(
    `INSERT INTO decision_cases
       (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
     VALUES ($1, $2, $3, 'kpi_anomaly', 'high', 'decided', $1, 70, $4::jsonb)`,
    [options.caseId, orgId, sectorId, JSON.stringify(options.payload ?? {})]
  );
  await db.query(
    `INSERT INTO decision_records
       (id, org_id, case_id, sector_id, choice, decided_by, payload,
        decided_by_id, decided_role, approval_permission, approval_source,
        approved_at, approval_audit_id)
     VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7, $8, $9, $10, $11, $12)`,
    [
      options.decisionId,
      orgId,
      options.caseId,
      sectorId,
      choice,
      decidedBy,
      decidedById,
      decidedRole,
      approvalPermission,
      approvalSource,
      approvedAt,
      approvalAuditId,
    ]
  );
  if (approvalAuditId) {
    await db.query(
      `INSERT INTO audit_events (id, org_id, actor, type, summary, detail)
       VALUES ($1, $2, 'test', 'decision_made', 'Test onayı', $3)`,
      [
        approvalAuditId,
        orgId,
        JSON.stringify({ caseId: options.caseId, decisionId: options.decisionId }),
      ]
    );
  }
  if (!options.actionId) return;
  const status = options.actionStatus ?? "open";
  await db.query(
    `INSERT INTO actions (id, org_id, decision_id, case_id, title, owner, status, created_at)
     VALUES ($1, $2, $3, $4, 'Test aksiyonu', 'test', $5, $6)`,
    [
      options.actionId,
      orgId,
      options.decisionId,
      options.caseId,
      status,
      options.startedAt ?? ACTION_OPENED_AT,
    ]
  );
  if (status === "done") {
    await db.query(
      `INSERT INTO action_events
         (id, org_id, action_id, decision_id, from_status, to_status, actor_id, actor_name, created_at)
       VALUES ('evt-open-' || $1, $2, $1, $3, NULL, 'open', 'test', 'test', $4)`,
      [options.actionId, orgId, options.decisionId, options.startedAt ?? ACTION_OPENED_AT]
    );
    await db.query(
      `INSERT INTO action_events
         (id, org_id, action_id, decision_id, from_status, to_status, actor_id, actor_name, created_at)
       VALUES ('evt-done-' || $1, $2, $1, $3, 'in_progress', 'done', 'test', 'test', $4)`,
      [options.actionId, orgId, options.decisionId, options.doneAt ?? ACTION_DONE_AT]
    );
  }
}

describe("KPI yönü ve değişim sınıflandırması (saf)", () => {
  it("eşik konumundan yön türetir; tek referansla yön uydurmaz", () => {
    expect(inferKpiDirection(15, 20, 10)).toBe("lower_is_better");
    expect(inferKpiDirection(800, 700, 1000)).toBe("higher_is_better");
    expect(inferKpiDirection(null, 20, null)).toBeNull();
    expect(inferKpiDirection(null, null, null)).toBeNull();
  });

  it("düşük daha iyiyse azalışı iyileşme sayar", () => {
    expect(classifyKpiChange(40, 12, "lower_is_better")).toMatchObject({
      delta: -28,
      result: "improved",
    });
    expect(classifyKpiChange(40, 55, "lower_is_better").result).toBe("worsened");
  });

  it("yüksek daha iyiyse artışı iyileşme sayar", () => {
    expect(classifyKpiChange(900, 1200, "higher_is_better").result).toBe("improved");
    expect(classifyKpiChange(900, 800, "higher_is_better").result).toBe("worsened");
  });

  it("göreli tolerans içindeki değişimi değişmedi sayar ve sıfıra bölmez", () => {
    expect(classifyKpiChange(1000, 1000.5, "higher_is_better").result).toBe("unchanged");
    expect(classifyKpiChange(0, 0, "higher_is_better")).toMatchObject({
      delta: 0,
      pctChange: null,
      result: "unchanged",
    });
    expect(classifyKpiChange(0, 5, "higher_is_better").pctChange).toBeNull();
  });
});

describe("KPI tabanlı gerçekleşen sonuç ölçümü", () => {
  beforeAll(async () => {
    await migrate();
    // This suite tests outcome measurement, not the approval UI. Its KPI fixtures
    // represent pre-approved definitions; the dedicated governance suite tests
    // the actual approval transaction, role check and immutable audit trail.
    await getDb().exec(`
      CREATE OR REPLACE FUNCTION test_mark_kpi_definition_approved()
      RETURNS trigger AS $$ BEGIN
        NEW.governance_state := 'approved';
        NEW.approved_revision := 1;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_kpi_definition_approved BEFORE INSERT ON kpi_definitions
        FOR EACH ROW EXECUTE FUNCTION test_mark_kpi_definition_approved();
    `);
    await seedOrg(ORG_A, "KPI Outcome A");
    await seedOrg(ORG_B, "KPI Outcome B");
    await seedSeries();
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("sinyal → vaka → karar → aksiyon → KPI ölçümü → sonuç → ledger → hafıza zincirini kurar", async () => {
    const generated = await generateKpiAnomalySignals(ORG_A);
    expect(generated.generated).toBeGreaterThan(0);
    expect(generated.signals[0]).toMatchObject({
      label: LABEL,
      classification: "risk",
      direction: "above",
    });

    const cases = await generateDecisionCasesFromKpiSignals(ORG_A);
    expect(cases.generated).toBe(1);
    const caseId = cases.cases[0]!.id;

    const decision = await recordHumanDecision({
      orgId: ORG_A,
      caseId,
      choice: "accepted",
      reason: "Gecikme müşteri kaybına yol açıyor",
      chosenAction: "Operasyon planını düzelt",
      actorId: "user-a",
      actorName: "CEO A",
      actorRole: "ceo",
    });
    expect(decision.actionId).toBeTruthy();

    await transitionAction({
      orgId: ORG_A,
      actionId: decision.actionId!,
      status: "in_progress",
      actorId: "user-a",
      actorName: "CEO A",
    });
    await transitionAction({
      orgId: ORG_A,
      actionId: decision.actionId!,
      status: "done",
      progressNote: "Plan düzeltildi",
      actorId: "user-a",
      actorName: "CEO A",
    });
    // Gerçek yaşam döngüsü olayları append-only'dir; takip ölçümü tamamlanma
    // anından sonraki gerçek bir zaman damgasıyla eklenir.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const afterAt = new Date().toISOString();
    await seedAfterObservation(afterAt);

    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: decision.recordId,
    });
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") return;
    expect(preview.measurement).toMatchObject({
      kpiLabel: LABEL,
      direction: "lower_is_better",
      result: "improved",
    });
    expect(preview.measurement.before).toMatchObject({
      value: 40,
      at: "2026-01-05T09:00:00.000Z",
      datasetId: "ds-kpi-outcome",
      sourceLabel: "ERP gecikme aktarımı",
    });
    expect(preview.measurement.after).toMatchObject({
      value: 12,
      at: afterAt,
      datasetId: "ds-kpi-outcome",
      sourceLabel: "ERP gecikme aktarımı",
    });
    expect(Date.parse(preview.measurement.after.at)).toBeGreaterThan(
      Date.parse(preview.measurement.actionDoneAt)
    );
    expect(preview.measurement.delta).toBe(-28);
    expect(preview.measurement.pctChange).toBe(-70);
    expect(formatMeasurementEvidence(preview.measurement)).toContain(
      'KPI "Gecikme Süresi"'
    );

    const recorded = await recordVerifiedKpiOutcome({
      orgId: ORG_A,
      decisionId: decision.recordId,
      note: "Gecikme 40 dakikadan 12 dakikaya indi",
      lesson: "Plan düzeltmesi gecikmeyi düşürdü",
      recordedBy: "CEO A",
    });
    expect(recorded.outcomeId).toBeTruthy();

    const db = getDb();
    const outcome = await db.query<{
      result: string;
      note: string;
      lesson: string | null;
      evidence: string | null;
      actual_value: string | null;
    }>(
      `SELECT result, note, lesson, evidence, actual_value FROM outcomes
        WHERE id = $1 AND org_id = $2`,
      [recorded.outcomeId, ORG_A]
    );
    expect(outcome.rows[0]).toMatchObject({
      result: "improved",
      note: "Gecikme 40 dakikadan 12 dakikaya indi",
      lesson: "Plan düzeltmesi gecikmeyi düşürdü",
      actual_value: null,
    });
    expect(outcome.rows[0]?.evidence).toContain("40");
    expect(outcome.rows[0]?.evidence).toContain("12");

    const measurementRow = await db.query<{
      decision_id: string;
      outcome_id: string;
      kpi_label: string;
      result: string;
      before_value: string;
      after_value: string;
    }>(
      `SELECT decision_id, outcome_id, kpi_label, result, before_value, after_value
         FROM decision_kpi_measurements
        WHERE org_id = $1 AND decision_id = $2`,
      [ORG_A, decision.recordId]
    );
    expect(measurementRow.rows[0]).toMatchObject({
      decision_id: decision.recordId,
      outcome_id: recorded.outcomeId,
      kpi_label: LABEL,
      result: "improved",
    });
    expect(Number(measurementRow.rows[0]?.before_value)).toBe(40);
    expect(Number(measurementRow.rows[0]?.after_value)).toBe(12);

    expect(await verifyAuditChain(ORG_A)).toMatchObject({ valid: true });

    const entries = await getLedgerEntries(ORG_A);
    const entry = entries.find((row) => row.decisionId === decision.recordId);
    expect(entry?.measurement).toMatchObject({
      kpiLabel: LABEL,
      result: "improved",
      delta: -28,
      verified: true,
    });
    expect(entry?.measurement?.before.sourceLabel).toBe("ERP gecikme aktarımı");
    expect(entry?.measurement?.after.sourceLabel).toBe("ERP gecikme aktarımı");
    expect(entry?.measurement?.definition).toMatchObject({
      id: DELAY_DEFINITION_ID,
      unit: "dk",
      versionKnown: false,
      formulaHash: DELAY_HASH,
    });
    expect(entry?.approval).toMatchObject({
      decidedById: "user-a",
      decidedRole: "ceo",
      permission: "record_decision",
      source: "human",
    });

    const csvRow = ledgerEntryToRow(entry!);
    expect(csvRow).toHaveLength(LEDGER_CSV_HEADER.length);
    const measurementColumns = csvRow.slice(-25, -6);
    expect(measurementColumns.slice(0, 11)).toEqual([
      LABEL,
      "40",
      "2026-01-05T09:00:00.000Z",
      "12",
      afterAt,
      "-28",
      "-70",
      "improved",
      "ERP gecikme aktarımı",
      "ERP gecikme aktarımı",
      "true",
    ]);
    expect(measurementColumns[11]).toBe("dk");
    expect(measurementColumns[12]).toBe("manual");
    expect(measurementColumns[13]).toBe("");
    expect(measurementColumns[14]).toMatch(/^[0-9a-f]{32}$/);
    expect(measurementColumns[15]).toBe(DELAY_DEFINITION_ID);
    expect(measurementColumns[16]).toBe("ortalama(bitis - planlanan_bitis)");
    expect(measurementColumns[17]).toBe("false");
    expect(Date.parse(measurementColumns[18]!)).not.toBeNaN();
    expect(csvRow.slice(-6)).toEqual([
      "user-a",
      "ceo",
      "record_decision",
      "human",
      entry?.approval?.approvedAt,
      entry?.approval?.auditId,
    ]);

    const summary = await getLedgerSummary(ORG_A);
    expect(summary.withVerifiedMeasurement).toBe(1);

    const memory = await buildServerMemory(ORG_A, SECTOR);
    expect(memory).toContain("[VERIFIED]");
    expect(memory).toContain(LABEL);
    expect(memory).toContain("40 → 12");
    expect(memory).toContain("iyileşme sağlandı");
    expect(memory).toContain("1 doğrulanmış");
    expect(memory).toContain("nedensel etki iddiası değil");
    expect(memory).not.toContain("[REPORTED]");
  });

  it("aynı karar için ikinci ölçümü reddeder; mükerrer kanıt oluşmaz", async () => {
    const decision = await getDb().query<{ id: string }>(
      `SELECT id FROM decision_records WHERE org_id = $1 AND outcome IS NOT NULL LIMIT 1`,
      [ORG_A]
    );
    const decisionId = decision.rows[0]!.id;
    await expect(
      recordVerifiedKpiOutcome({
        orgId: ORG_A,
        decisionId,
        recordedBy: "CEO A",
      })
    ).rejects.toMatchObject({ reason: "already_measured" });
  });

  it("başka kurumun kararını ölçmez", async () => {
    const decision = await getDb().query<{ id: string }>(
      `SELECT id FROM decision_records WHERE org_id = $1 LIMIT 1`,
      [ORG_A]
    );
    const decisionId = decision.rows[0]!.id;
    const preview = await previewKpiOutcome({ orgId: ORG_B, decisionId });
    expect(preview).toMatchObject({ status: "insufficient", reason: "not_found" });
    await expect(
      recordVerifiedKpiOutcome({ orgId: ORG_B, decisionId, recordedBy: "CEO B" })
    ).rejects.toBeInstanceOf(KpiOutcomeError);
    await expect(
      recordVerifiedKpiOutcome({ orgId: ORG_B, decisionId, recordedBy: "CEO B" })
    ).rejects.toMatchObject({ reason: "not_found" });
  });

  it("KPI kökeni olmayan kararda ölçüm yapmaz", async () => {
    await seedDirectDecision({
      caseId: "case-no-origin",
      decisionId: "rec-no-origin",
      actionId: "action-no-origin",
      actionStatus: "done",
      payload: { title: "Köken yok" },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-no-origin",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "no_kpi_origin" });
  });

  it("yalnızca sistem önerisi olan kararı ölçmez", async () => {
    await seedDirectDecision({
      caseId: "case-system-approved",
      decisionId: "rec-system-approved",
      decidedBy: "sistem",
      actionId: "action-system-approved",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: LABEL } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-system-approved",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "not_human_approved" });
  });

  it("onay provenance'ı eksikse doğrulanmış ölçüm yapmaz", async () => {
    await seedDirectDecision({
      caseId: "case-approval-missing",
      decisionId: "rec-approval-missing",
      approvalComplete: false,
      actionId: "action-approval-missing",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: LABEL } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-approval-missing",
    });
    expect(preview).toMatchObject({
      status: "insufficient",
      reason: "approval_provenance_missing",
    });
  });

  it("tanım sürümü bilinmeyen gözlemleri karşılaştırmaz", async () => {
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('kpi-def-unknown-version', $1, 'Sürümsüz KPI', 'adet', 'count(*)', 10, 15, 20)`,
      [ORG_A]
    );
    await getDb().query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ('kpi-unknown-before', $1, 'ds-kpi-outcome', 'Sürümsüz KPI', '30', $2),
              ('kpi-unknown-after', $1, 'ds-kpi-outcome', 'Sürümsüz KPI', '10', $3)`,
      [ORG_A, ACTION_OPENED_AT, FOLLOW_UP_AT]
    );
    await seedDirectDecision({
      caseId: "case-unknown-version",
      decisionId: "rec-unknown-version",
      actionId: "action-unknown-version",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Sürümsüz KPI" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-unknown-version",
    });
    expect(preview).toMatchObject({
      status: "insufficient",
      reason: "unknown_definition_version",
    });
  });

  it("farklı formül/birim sürümündeki gözlemleri karşılaştırmaz", async () => {
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('kpi-def-version-mismatch', $1, 'Sürüm Uyuşmazlığı', 'adet', 'count(*)', 10, 15, 20)`,
      [ORG_A]
    );
    const hashAdet = computeKpiDefinitionHash({
      formulaText: "count(*)",
      unit: "adet",
      source: "manual",
      sourceRef: null,
      warn: 15,
      critical: 20,
      target: 10,
    })!;
    const hashSaat = computeKpiDefinitionHash({
      formulaText: "count(*)",
      unit: "saat",
      source: "manual",
      sourceRef: null,
      warn: 15,
      critical: 20,
      target: 10,
    })!;
    await getDb().query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version)
       VALUES ('kpi-version-before', $1, 'ds-kpi-outcome', 'Sürüm Uyuşmazlığı', '30', $2, $4, $5, NULL),
              ('kpi-version-after', $1, 'ds-kpi-outcome', 'Sürüm Uyuşmazlığı', '10', $3, $4, $6, NULL)`,
      [
        ORG_A,
        ACTION_OPENED_AT,
        FOLLOW_UP_AT,
        "kpi-def-version-mismatch",
        hashAdet,
        hashSaat,
      ]
    );
    await seedDirectDecision({
      caseId: "case-version-mismatch",
      decisionId: "rec-version-mismatch",
      actionId: "action-version-mismatch",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Sürüm Uyuşmazlığı" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-version-mismatch",
    });
    expect(preview).toMatchObject({
      status: "insufficient",
      reason: "definition_version_mismatch",
    });
  });

  it("gözlemden sonra değişen KPI tanımını doğrulanmış saymaz", async () => {
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('kpi-def-changed', $1, 'Değişen Tanım', 'adet', 'count(*)', 10, 15, 20)`,
      [ORG_A]
    );
    const oldHash = computeKpiDefinitionHash({
      formulaText: "count(*)",
      unit: "adet",
      source: "manual",
      sourceRef: null,
      warn: 15,
      critical: 20,
      target: 10,
    })!;
    await getDb().query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version)
       VALUES ('kpi-changed-before', $1, 'ds-kpi-outcome', 'Değişen Tanım', '30', $2, $4, $5, NULL),
              ('kpi-changed-after', $1, 'ds-kpi-outcome', 'Değişen Tanım', '10', $3, $4, $5, NULL)`,
      [ORG_A, ACTION_OPENED_AT, FOLLOW_UP_AT, "kpi-def-changed", oldHash]
    );
    await getDb().query(
      "UPDATE kpi_definitions SET formula_text = 'sum(x)' WHERE id = 'kpi-def-changed'"
    );
    await seedDirectDecision({
      caseId: "case-definition-changed",
      decisionId: "rec-definition-changed",
      actionId: "action-definition-changed",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Değişen Tanım" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-definition-changed",
    });
    expect(preview).toMatchObject({
      status: "insufficient",
      reason: "definition_not_approved",
    });
  });

  it("farklı veri kaynağındaki gözlemleri karşılaştırmaz", async () => {
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('kpi-def-source-mismatch', $1, 'Kaynak Uyuşmazlığı', 'adet', 'count(*)', 10, 15, 20)`,
      [ORG_A]
    );
    await getDb().query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version)
       VALUES ('kpi-source-before', $1, 'ds-kpi-outcome', 'Kaynak Uyuşmazlığı', '30', $2, $4, $5, NULL),
              ('kpi-source-after', $1, 'ds-kpi-outcome-after', 'Kaynak Uyuşmazlığı', '10', $3, $4, $5, NULL)`,
      [ORG_A, ACTION_OPENED_AT, FOLLOW_UP_AT, "kpi-def-source-mismatch", COUNT_HASH]
    );
    await seedDirectDecision({
      caseId: "case-source-mismatch",
      decisionId: "rec-source-mismatch",
      actionId: "action-source-mismatch",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Kaynak Uyuşmazlığı" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-source-mismatch",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "source_mismatch" });
  });

  it("karar kapsamı dışındaki KPI gözlemlerini karşılaştırmaz", async () => {
    await getDb().query(
      `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
       VALUES ('ds-logistics', $1, 'logistics', 'Lojistik sistem', '{}', 'test')`,
      [ORG_A]
    );
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('kpi-def-scope-mismatch', $1, 'Kapsam Uyuşmazlığı', 'adet', 'count(*)', 10, 15, 20)`,
      [ORG_A]
    );
    await getDb().query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version)
       VALUES ('kpi-scope-before', $1, 'ds-logistics', 'Kapsam Uyuşmazlığı', '30', $2, $4, $5, NULL),
              ('kpi-scope-after', $1, 'ds-logistics', 'Kapsam Uyuşmazlığı', '10', $3, $4, $5, NULL)`,
      [ORG_A, ACTION_OPENED_AT, FOLLOW_UP_AT, "kpi-def-scope-mismatch", COUNT_HASH]
    );
    await seedDirectDecision({
      caseId: "case-scope-mismatch",
      decisionId: "rec-scope-mismatch",
      actionId: "action-scope-mismatch",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Kapsam Uyuşmazlığı" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-scope-mismatch",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "scope_mismatch" });
  });

  it("eşzamanlı iki ölçüm isteği tek doğrulanmış kayıt üretir", async () => {
    await seedDirectDecision({
      caseId: "case-concurrent",
      decisionId: "rec-concurrent",
      actionId: "action-concurrent",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: LABEL } },
    });
    const results = await Promise.allSettled([
      recordVerifiedKpiOutcome({
        orgId: ORG_A,
        decisionId: "rec-concurrent",
        recordedBy: "CEO A",
      }),
      recordVerifiedKpiOutcome({
        orgId: ORG_A,
        decisionId: "rec-concurrent",
        recordedBy: "CEO A",
      }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(
      (item): item is PromiseRejectedResult => item.status === "rejected"
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(KpiOutcomeError);
    expect(rejected[0]!.reason).toMatchObject({ reason: "already_measured" });
    const count = await getDb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM decision_kpi_measurements
        WHERE org_id = $1 AND decision_id = 'rec-concurrent'`,
      [ORG_A]
    );
    expect(Number(count.rows[0]?.n)).toBe(1);
  });

  it("reddedilen kararda ölçüm yapmaz", async () => {
    await seedDirectDecision({
      caseId: "case-rejected",
      decisionId: "rec-rejected",
      choice: "rejected",
      actionId: "action-rejected",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: LABEL } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-rejected",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "not_accepted" });
  });

  it("tanımsız KPI'da yön uydurmaz", async () => {
    await seedDirectDecision({
      caseId: "case-no-definition",
      decisionId: "rec-no-definition",
      actionId: "action-no-definition",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Tanımsız KPI" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-no-definition",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "no_definition" });
  });

  it("tek eşikli KPI'da yön belirsizse ölçüm yapmaz", async () => {
    await getDb().query(
      `INSERT INTO kpi_definitions (id, org_id, name, unit, formula_text, critical_threshold)
       VALUES ('kpi-def-one-threshold', $1, 'Tek Eşik KPI', 'adet', 'count(*)', 100)`,
      [ORG_A]
    );
    await getDb().query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ('kpi-one-before', $1, 'ds-kpi-outcome', 'Tek Eşik KPI', '200', $2)`,
      [ORG_A, ACTION_STARTED_AT]
    );
    await seedDirectDecision({
      caseId: "case-one-threshold",
      decisionId: "rec-one-threshold",
      actionId: "action-one-threshold",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Tek Eşik KPI" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-one-threshold",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "direction_unknown" });
  });

  it("aksiyon tamamlanmadan ölçüm yapmaz", async () => {
    await seedDirectDecision({
      caseId: "case-open-action",
      decisionId: "rec-open-action",
      actionId: "action-open-action",
      actionStatus: "open",
      payload: { origin: { kind: "kpi_signal", label: LABEL } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-open-action",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "action_not_done" });
  });

  it("eylem öncesi gözlem yoksa ölçüm yapmaz", async () => {
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('kpi-def-no-baseline', $1, 'Öncesiz KPI', 'adet', 'count(*)', 10, 15, 20)`,
      [ORG_A]
    );
    await getDb().query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ('kpi-no-baseline-after', $1, 'ds-kpi-outcome', 'Öncesiz KPI', '9', $2)`,
      [ORG_A, FOLLOW_UP_AT]
    );
    await seedDirectDecision({
      caseId: "case-no-baseline",
      decisionId: "rec-no-baseline",
      actionId: "action-no-baseline",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Öncesiz KPI" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-no-baseline",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "no_baseline_observation" });
  });

  it("eylem sonrası gözlem yoksa ölçüm yapmaz", async () => {
    await getDb().query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold)
       VALUES ('kpi-def-no-after', $1, 'Sonrasız KPI', 'adet', 'count(*)', 10, 15, 20)`,
      [ORG_A]
    );
    await getDb().query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ('kpi-no-after-before', $1, 'ds-kpi-outcome', 'Sonrasız KPI', '30', $2)`,
      [ORG_A, ACTION_OPENED_AT]
    );
    await seedDirectDecision({
      caseId: "case-no-after",
      decisionId: "rec-no-after",
      actionId: "action-no-after",
      actionStatus: "done",
      payload: { origin: { kind: "kpi_signal", label: "Sonrasız KPI" } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-no-after",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "no_follow_up_observation" });
  });

  it("aksiyonsuz kararda ölçüm yapmaz", async () => {
    await seedDirectDecision({
      caseId: "case-no-action",
      decisionId: "rec-no-action",
      payload: { origin: { kind: "kpi_signal", label: LABEL } },
    });
    const preview = await previewKpiOutcome({
      orgId: ORG_A,
      decisionId: "rec-no-action",
    });
    expect(preview).toMatchObject({ status: "insufficient", reason: "no_action" });
  });

  it("doğrulanmamış insan sonucunu REPORTED sınıfında, verified'dan ayrı tutar", async () => {
    await seedDirectDecision({
      caseId: "case-manual-outcome",
      decisionId: "rec-manual-outcome",
      sectorId: "logistics",
    });
    await getDb().query(
      `INSERT INTO outcomes (id, org_id, decision_id, result, note, recorded_by)
       VALUES ('outcome-manual', $1, 'rec-manual-outcome', 'improved', 'Beyan edildi', 'CEO A')`,
      [ORG_A]
    );
    const memory = await buildServerMemory(ORG_A, "logistics");
    expect(memory).toContain("[REPORTED]");
    expect(memory).toContain("bağımsız veriyle doğrulanmadı");
    expect(memory).toContain("Beyan edildi");
    expect(memory).not.toContain("[VERIFIED]");
  });

  it("sistem çıkarımını INFERRED sınıfında, insan doğrulaması olmadan sunar", async () => {
    await getDb().query(
      `INSERT INTO signals
         (id, org_id, sector_id, category_id, severity, title, status, payload)
       VALUES ('signal-inferred', $1, 'logistics', 'kpi_anomaly', 'warning',
               'KPI riski: Teslim Süresi', 'open', $2::jsonb)`,
      [
        ORG_A,
        JSON.stringify({
          label: "Teslim Süresi",
          metricValue: 99,
          baseline: 50,
          score: 5.5,
          direction: "above",
          classification: "risk",
        }),
      ]
    );
    const memory = await buildServerMemory(ORG_A, "logistics");
    expect(memory).toContain("[INFERRED]");
    expect(memory).toContain("Teslim Süresi");
    expect(memory).toContain("İnsan doğrulaması yok");
    expect(memory).toContain("[REPORTED]");
    expect(memory).not.toContain("[VERIFIED]");
  });
});
