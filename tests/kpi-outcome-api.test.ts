import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-outcome-api-${process.pid}-${randomUUID()}`
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
const { GET: measurePreview, POST: measureRecord } = await import(
  "../src/app/api/outcomes/measure/route"
);
const { POST: recordOutcomeRoute } = await import("../src/app/api/outcomes/route");
const { GET: ledgerRoute } = await import("../src/app/api/decision-ledger/route");
const { computeKpiDefinitionHash } = await import("../src/lib/kpi-definition-provenance");

const ORG_A = "org-kpi-api-a";
const ORG_B = "org-kpi-api-b";
const LABEL = "Teslim Süresi";
const API_HASH = computeKpiDefinitionHash({
  formulaText: "ortalama(teslim - sipariş)",
  unit: "saat",
  source: "manual",
  sourceRef: null,
  warn: 36,
  critical: 48,
  target: 24,
})!;

function request(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

describe("KPI sonuç ölçümü API sınırı", () => {
  let ceoA: string;
  let ceoB: string;
  let guestA: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "KPI API A"],
      [ORG_B, "KPI API B"],
    ]) {
      await db.query(
        "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'retail')",
        [id, name]
      );
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, email, role] of [
      ["kpi-ceo-a", ORG_A, "ceo@kpi-a.test", "ceo"],
      ["kpi-ceo-b", ORG_B, "ceo@kpi-b.test", "ceo"],
      ["kpi-guest-a", ORG_A, "guest@kpi-a.test", "guest"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, id, role, pw]
      );
    }

    await db.query(
      `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
       VALUES ('ds-kpi-api', $1, 'retail', 'Sipariş sistemi', '{}', 'test')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO kpi_definitions
         (id, org_id, name, unit, formula_text, target, warn_threshold, critical_threshold, governance_state)
       VALUES ('kpi-api-def', $1, $2, 'saat', 'ortalama(teslim - sipariş)', 24, 36, 48, 'approved')`,
      [ORG_A, LABEL]
    );
    await db.query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version)
       VALUES ('kpi-api-before', $1, 'ds-kpi-api', $2, '60', '2025-12-19T09:00:00Z', $3, $4, NULL)`,
      [ORG_A, LABEL, "kpi-api-def", API_HASH]
    );
    await db.query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value, created_at,
          definition_id, definition_hash, definition_version)
       VALUES ('kpi-api-after', $1, 'ds-kpi-api', $2, '30', '2026-01-10T09:00:00Z', $3, $4, NULL)`,
      [ORG_A, LABEL, "kpi-api-def", API_HASH]
    );

    await db.query(
      `INSERT INTO decision_cases
         (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ('case-api-ready', $1, 'retail', 'kpi_anomaly', 'high', 'decided',
               'Teslim süresi riski', 80, $2::jsonb)`,
      [ORG_A, JSON.stringify({ origin: { kind: "kpi_signal", label: LABEL } })]
    );
    await db.query(
      `INSERT INTO decision_records
         (id, org_id, case_id, sector_id, choice, decided_by, payload,
          expected_value, value_currency, value_basis,
          decided_by_id, decided_role, approval_permission, approval_source,
          approved_at, approval_audit_id)
       VALUES ('rec-api-ready', $1, 'case-api-ready', 'retail', 'accepted', 'CEO A',
               '{}'::jsonb, 4000, 'TRY', 'yıllık tasarruf',
               'kpi-ceo-a', 'ceo', 'record_decision', 'human',
               '2025-12-19T10:00:00Z', 'audit-api-ready')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO audit_events (id, org_id, actor, type, summary, detail)
       VALUES ('audit-api-ready', $1, 'CEO A', 'decision_made', 'Test onayı', $2)`,
      [ORG_A, JSON.stringify({ decisionId: "rec-api-ready" })]
    );
    await db.query(
      `INSERT INTO actions (id, org_id, decision_id, case_id, title, owner, status, created_at)
       VALUES ('action-api-ready', $1, 'rec-api-ready', 'case-api-ready',
               'Rota planını düzelt', 'CEO A', 'done', '2025-12-20T08:00:00Z')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO action_events
         (id, org_id, action_id, decision_id, from_status, to_status, actor_id, actor_name, created_at)
       VALUES ('evt-api-open', $1, 'action-api-ready', 'rec-api-ready', NULL, 'open',
               'kpi-ceo-a', 'CEO A', '2025-12-20T08:00:00Z')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO action_events
         (id, org_id, action_id, decision_id, from_status, to_status, actor_id, actor_name, created_at)
       VALUES ('evt-api-done', $1, 'action-api-ready', 'rec-api-ready', 'in_progress', 'done',
               'kpi-ceo-a', 'CEO A', '2026-01-05T17:00:00Z')`,
      [ORG_A]
    );

    await db.query(
      `INSERT INTO decision_cases
         (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ('case-api-no-origin', $1, 'retail', 'risk', 'high', 'decided',
               'Köken yok', 70, '{}'::jsonb)`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO decision_records
         (id, org_id, case_id, sector_id, choice, decided_by, payload,
          decided_by_id, decided_role, approval_permission, approval_source,
          approved_at, approval_audit_id)
       VALUES ('rec-api-no-origin', $1, 'case-api-no-origin', 'retail', 'accepted', 'CEO A',
               '{}'::jsonb, 'kpi-ceo-a', 'ceo', 'record_decision', 'human',
               '2025-12-19T10:00:00Z', 'audit-api-no-origin')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO audit_events (id, org_id, actor, type, summary, detail)
       VALUES ('audit-api-no-origin', $1, 'CEO A', 'decision_made', 'Test onayı', $2)`,
      [ORG_A, JSON.stringify({ decisionId: "rec-api-no-origin" })]
    );

    ceoA = await createSession("kpi-ceo-a", ORG_A);
    ceoB = await createSession("kpi-ceo-b", ORG_B);
    guestA = await createSession("kpi-guest-a", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect(
      (await measurePreview(request("http://localhost/api/outcomes/measure?decisionId=rec-api-ready")))
        .status
    ).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect(
      (await measurePreview(request("http://localhost/api/outcomes/measure?decisionId=rec-api-ready")))
        .status
    ).toBe(403);
    expect(
      (await measureRecord(request("http://localhost/api/outcomes/measure", { decisionId: "rec-api-ready" })))
        .status
    ).toBe(403);
  });

  it("başka kurumun kararını 404 ile gizler", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    const res = await measurePreview(
      request("http://localhost/api/outcomes/measure?decisionId=rec-api-ready")
    );
    expect(res.status).toBe(404);
  });

  it("hazır ölçümü önizler ve doğrulanmış sonucu bir kez kaydeder", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const preview = await measurePreview(
      request("http://localhost/api/outcomes/measure?decisionId=rec-api-ready")
    );
    expect(preview.status).toBe(200);
    const body = (await preview.json()) as {
      status: string;
      measurement: { result: string; before: { value: number }; after: { value: number } };
    };
    expect(body.status).toBe("ready");
    expect(body.measurement).toMatchObject({
      result: "improved",
      before: { value: 60 },
      after: { value: 30 },
    });

    const created = await measureRecord(
      request("http://localhost/api/outcomes/measure", {
        decisionId: "rec-api-ready",
        note: "Teslim süresi 60 saatten 30 saate indi",
        lesson: "Rota planı düzeltmesi etkili oldu",
      })
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { outcomeId: string };
    expect(createdBody.outcomeId).toBeTruthy();

    const duplicate = await measureRecord(
      request("http://localhost/api/outcomes/measure", { decisionId: "rec-api-ready" })
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ reason: "already_measured" });
  });

  it("doğrulanmış sonuçla çelişen insan beyanını reddeder, aynı sonuçla ekonomik gerçekleşmeyi kabul eder", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const conflict = await recordOutcomeRoute(
      request("http://localhost/api/outcomes", {
        decisionId: "rec-api-ready",
        result: "worsened",
        note: "Kötüleşti iddiası",
      })
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      reason: "verified_result_mismatch",
      verifiedResult: "improved",
    });

    const same = await recordOutcomeRoute(
      request("http://localhost/api/outcomes", {
        decisionId: "rec-api-ready",
        result: "improved",
        note: "Muhasebe gerçekleşmesi",
        actualImpact: { value: 5000, currency: "TRY", evidence: "finans mutabakatı" },
      })
    );
    expect(same.status).toBe(200);

    const ledger = await ledgerRoute(
      new NextRequest("http://localhost/api/decision-ledger")
    );
    const body = (await ledger.json()) as {
      entries: Array<{
        decisionId: string;
        measurement: {
          kpiLabel: string;
          result: string;
          definition: { unit: string | null; formulaHash: string | null } | null;
        } | null;
        approval: {
          decidedById: string;
          decidedRole: string | null;
          permission: string | null;
          source: string;
          auditId: string | null;
        } | null;
        actualImpact: { value: number; currency: string } | null;
        economicVariance: { amount: number; currency: string } | null;
      }>;
      summary: { withVerifiedMeasurement: number };
    };
    const entry = body.entries.find((row) => row.decisionId === "rec-api-ready");
    expect(entry?.measurement).toMatchObject({
      kpiLabel: LABEL,
      result: "improved",
      definition: { unit: "saat", formulaHash: API_HASH },
    });
    expect(entry?.approval).toMatchObject({
      decidedById: "kpi-ceo-a",
      decidedRole: "ceo",
      permission: "record_decision",
      source: "human",
      auditId: "audit-api-ready",
    });
    expect(entry?.actualImpact).toMatchObject({ value: 5000, currency: "TRY" });
    expect(entry?.economicVariance).toMatchObject({ amount: 1000, currency: "TRY" });
    expect(body.summary.withVerifiedMeasurement).toBe(1);
  });

  it("yetersiz veride 422 döner ve sonuç yazmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await measureRecord(
      request("http://localhost/api/outcomes/measure", { decisionId: "rec-api-no-origin" })
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: "no_kpi_origin" });
    const count = await getDb().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM outcomes WHERE org_id = $1 AND decision_id = $2",
      [ORG_A, "rec-api-no-origin"]
    );
    expect(Number(count.rows[0]?.n)).toBe(0);
  });
});
