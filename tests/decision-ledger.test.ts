import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-decision-ledger-test-${process.pid}-${randomUUID()}`
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
const { verifyAuditChain } = await import("../src/lib/db/repos/audit");
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET: ledger } = await import("../src/app/api/decision-ledger/route");
const { GET: listDecisionCases } = await import("../src/app/api/decision-cases/route");
const { GET: commandCenter } = await import("../src/app/api/command-center/route");
const { POST: recordDecisionRoute } = await import("../src/app/api/decisions/route");
const { POST: recordOutcomeRoute } = await import("../src/app/api/outcomes/route");

const ORG_A = "org-ledger-a";
const ORG_B = "org-ledger-b";

describe("Decision Value Ledger API'si", () => {
  let ceoA: string;
  let ceoB: string;
  let guestA: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A Org"],
      [ORG_B, "B Org"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        name,
        "aviation",
      ]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, email, role] of [
      ["led-ceo-a", ORG_A, "ceo@led-a.test", "ceo"],
      ["led-ceo-b", ORG_B, "ceo@led-b.test", "ceo"],
      ["led-guest-a", ORG_A, "guest@led-a.test", "guest"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, id, role, pw]
      );
    }

    const cases: Array<[string, string, string, string]> = [
      ["case-1", ORG_A, "Satış düşüşü", "high"],
      ["case-2", ORG_A, "Nakit akışı", "critical"],
      ["case-3", ORG_A, "Müşteri kaybı", "medium"],
    ];
    for (const [id, org, title, severity] of cases) {
      await db.query(
        `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
         VALUES ($1, $2, 'aviation', 'risk', $3, 'decided', $4, 80, $5::jsonb)`,
        [id, org, severity, title, JSON.stringify({ businessImpact: `${title} etkisi` })]
      );
    }

    const decisions: Array<[string, string, string, string, string]> = [
      ["rec-1", "case-1", ORG_A, "accepted", "2026-01-01T10:00:00Z"],
      ["rec-2", "case-2", ORG_A, "modified", "2026-01-02T10:00:00Z"],
      ["rec-3", "case-3", ORG_A, "rejected", "2026-01-03T10:00:00Z"],
    ];
    for (const [id, caseId, org, choice, createdAt] of decisions) {
      await db.query(
        `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload, created_at)
         VALUES ($1, $2, $3, 'aviation', $4, 'ceo', '{}'::jsonb, $5)`,
        [id, org, caseId, choice, createdAt]
      );
    }

    await db.query(
      `UPDATE decision_records
          SET expected_value = $1, expected_value_low = $2, expected_value_high = $3,
              value_currency = $4, value_basis = $5, value_assumptions = $6::jsonb
        WHERE id = $7`,
      [100_000, 80_000, 130_000, "USD", "yıllık brüt kazanç", JSON.stringify(["2 hafta içinde devreye alınır"]), "rec-1"]
    );
    await db.query(
      `UPDATE decision_records
          SET expected_value = $1, value_currency = $2, value_basis = $3
        WHERE id = $4`,
      [50_000, "EUR", "yıllık nakit tasarrufu", "rec-2"]
    );
    await db.query(
      `UPDATE decision_records
          SET expected_value = $1, value_currency = $2, value_basis = $3
        WHERE id = $4`,
      [80_000, "USD", "yıllık ciro koruması", "rec-3"]
    );

    await db.query(
      `INSERT INTO outcomes
         (id, org_id, decision_id, result, note, lesson, recorded_by,
          actual_value, value_currency, measurement_start, measurement_end, evidence)
       VALUES ('out-1', $1, 'rec-1', 'improved', 'Satış toparlandı', 'Hızlı aksiyon işe yaradı', 'ceo',
               120000, 'USD', '2026-01-01T00:00:00Z', '2026-03-31T00:00:00Z', 'muhasebe mutabakatı')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO outcomes
         (id, org_id, decision_id, result, note, recorded_by, actual_value, value_currency)
       VALUES ('out-2', $1, 'rec-2', 'worsened', 'Nakit sıkıştı', 'ceo', 60000, 'USD')`,
      [ORG_A]
    );

    await db.query(
      `INSERT INTO actions (id, org_id, decision_id, case_id, title, owner, status)
       VALUES ('action-rec-1', $1, 'rec-1', 'case-1', 'Satış planını uygula', 'CEO A', 'open')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO action_events
         (id, org_id, action_id, decision_id, from_status, to_status, actor_id, actor_name)
       VALUES ('event-rec-1', $1, 'action-rec-1', 'rec-1', NULL, 'open', 'led-ceo-a', 'CEO A')`,
      [ORG_A]
    );

    ceoA = await createSession("led-ceo-a", ORG_A);
    ceoB = await createSession("led-ceo-b", ORG_B);
    guestA = await createSession("led-guest-a", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await ledger(new Request("http://localhost/api/decision-ledger"))).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await ledger(new Request("http://localhost/api/decision-ledger"))).status).toBe(403);
  });

  it("özet: toplam karar ve sonuç dağılımı doğru", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = (await (await ledger(new Request("http://localhost/api/decision-ledger"))).json()) as {
      summary: {
        totalDecisions: number;
        withOutcome: number;
        improved: number;
        worsened: number;
        unchanged: number;
        economics: {
          expectedValueCount: number;
          actualValueCount: number;
          reconciledCount: number;
          byCurrency: unknown[];
        };
        learning: {
          rangeAccuracy: {
            evaluableCount: number;
            hitCount: number;
            missCount: number;
            missingRangeCount: number;
            currencyMismatchCount: number;
            hitRate: number | null;
          };
          confidenceBuckets: Array<{
            key: string;
            total: number;
            withOutcome: number;
            improvedRate: number | null;
            rangeEvaluable: number;
            rangeHitRate: number | null;
          }>;
          choices: {
            total: number;
            accepted: number;
            rejected: number;
            modified: number;
            other: number;
            acceptanceRate: number | null;
          };
        };
        execution: {
          totalActions: number;
          open: number;
          inProgress: number;
          done: number;
          cancelled: number;
        };
      };
    };
    expect(body.summary).toMatchObject({
      totalDecisions: 3,
      withOutcome: 2,
      improved: 1,
      worsened: 1,
      unchanged: 0,
      economics: {
        expectedValueCount: 3,
        actualValueCount: 2,
        reconciledCount: 1,
        byCurrency: [
          {
            currency: "EUR",
            expectedTotal: 50_000,
            actualTotal: 0,
            varianceTotal: 0,
            expectedCount: 1,
            actualCount: 0,
            reconciledCount: 0,
          },
          {
            currency: "USD",
            expectedTotal: 180_000,
            actualTotal: 180_000,
            varianceTotal: 20_000,
            expectedCount: 2,
            actualCount: 2,
            reconciledCount: 1,
          },
        ],
      },
      learning: {
        rangeAccuracy: {
          evaluableCount: 1,
          hitCount: 1,
          missCount: 0,
          missingRangeCount: 0,
          currencyMismatchCount: 1,
          hitRate: 1,
        },
        confidenceBuckets: [
          expect.objectContaining({ key: "0-49", total: 0 }),
          expect.objectContaining({ key: "50-69", total: 0 }),
          expect.objectContaining({ key: "70-84", total: 3, withOutcome: 2, improvedRate: 0.5 }),
          expect.objectContaining({ key: "85-100", total: 0 }),
        ],
        choices: {
          total: 3,
          accepted: 1,
          rejected: 1,
          modified: 1,
          other: 0,
          acceptanceRate: 1 / 3,
        },
      },
      calibration: {
        status: "insufficient_evidence",
        totalWithOutcome: 2,
        threshold: 5,
        buckets: [
          expect.objectContaining({ key: "0-49", status: "insufficient_evidence" }),
          expect.objectContaining({ key: "50-69", status: "insufficient_evidence" }),
          expect.objectContaining({
            key: "70-84",
            withOutcome: 2,
            improvedRate: 0.5,
            status: "insufficient_evidence",
            samplesNeeded: 3,
            adjustedConfidence: null,
          }),
          expect.objectContaining({ key: "85-100", status: "insufficient_evidence" }),
        ],
      },
      execution: {
        totalActions: 1,
        open: 1,
        inProgress: 0,
        done: 0,
        cancelled: 0,
      },
    });
  });

  it("kararlar sonuç ve dersleriyle birlikte, yeniden eskiye döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = (await (await ledger(new Request("http://localhost/api/decision-ledger"))).json()) as {
      entries: Array<{
        decisionId: string;
        title: string;
        businessImpact: string;
        expectedImpact: { value: number; currency: string; assumptions: string[] } | null;
        actualImpact: { value: number; currency: string; evidence: string | null } | null;
        economicVariance: { amount: number; percent: number | null; currency: string } | null;
        decisionState: string;
        execution: {
          actionId: string;
          title: string;
          status: string;
          eventCount: number;
        } | null;
        outcome: { result: string; lesson: string | null } | null;
      }>;
    };
    expect(body.entries.map((e) => e.decisionId)).toEqual(["rec-3", "rec-2", "rec-1"]);
    expect(body.entries[0].outcome).toBeNull();
    const rec1 = body.entries.find((e) => e.decisionId === "rec-1")!;
    expect(rec1.businessImpact).toContain("Satış düşüşü");
    expect(rec1.expectedImpact).toMatchObject({
      value: 100_000,
      currency: "USD",
      assumptions: ["2 hafta içinde devreye alınır"],
    });
    expect(rec1.actualImpact).toMatchObject({
      value: 120_000,
      currency: "USD",
      evidence: "muhasebe mutabakatı",
    });
    expect(rec1.economicVariance).toEqual({ amount: 20_000, percent: 20, currency: "USD" });
    expect(rec1.outcome).toMatchObject({
      result: "improved",
      lesson: "Hızlı aksiyon işe yaradı",
    });
    expect(rec1.decisionState).toBe("approved");
    expect(rec1.execution).toMatchObject({
      actionId: "action-rec-1",
      title: "Satış planını uygula",
      status: "open",
      eventCount: 1,
    });
    const rec2 = body.entries.find((e) => e.decisionId === "rec-2")!;
    expect(rec2.outcome?.result).toBe("worsened");
    expect(rec2.economicVariance).toBeNull();
  });

  it("sayısal beklenen/gerçekleşen etkiyi doğrulayarak kaydeder ve defterde mutabık kılar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const db = getDb();
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ('case-economics', $1, 'aviation', 'risk', 'high', 'open', 'Ekonomik karar', 90, '{}'::jsonb)`,
      [ORG_A]
    );

    const invalidRange = await recordDecisionRoute(
      new NextRequest("http://localhost/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: "case-economics",
          sectorId: "aviation",
          choice: "accepted",
          expectedImpact: { value: 10, low: 20, currency: "USD" },
        }),
      })
    );
    expect(invalidRange.status).toBe(400);

    const decision = await recordDecisionRoute(
      new NextRequest("http://localhost/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: "case-economics",
          sectorId: "aviation",
          choice: "accepted",
          expectedImpact: {
            value: 200_000,
            low: 150_000,
            high: 240_000,
            currency: "TRY",
            basis: "yıllık maliyet tasarrufu",
            assumptions: ["kur sabit"],
          },
        }),
      })
    );
    expect(decision.status).toBe(200);
    const decisionId = ((await decision.json()) as { recordId: string }).recordId;

    const outcome = await recordOutcomeRoute(
      new NextRequest("http://localhost/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId,
          result: "improved",
          note: "Tasarruf gerçekleşti",
          actualImpact: {
            value: 230_000,
            currency: "TRY",
            measurementStart: "2026-01-01T00:00:00Z",
            measurementEnd: "2026-06-30T00:00:00Z",
            evidence: "finans raporu",
          },
        }),
      })
    );
    expect(outcome.status).toBe(200);

    const audit = await getDb().query<{ detail: string | null; actor: string }>(
      `SELECT detail, actor FROM audit_events
        WHERE org_id = $1 AND type = 'outcome_recorded' AND detail = $2
        ORDER BY created_at DESC LIMIT 1`,
      [ORG_A, decisionId]
    );
    expect(audit.rows[0]?.detail).toBe(decisionId);
    expect((await verifyAuditChain(ORG_A)).valid).toBe(true);

    const body = (await (await ledger(new Request("http://localhost/api/decision-ledger"))).json()) as {
      entries: Array<{
        decisionId: string;
        expectedImpact: { value: number; currency: string } | null;
        actualImpact: { value: number; currency: string } | null;
        economicVariance: { amount: number; percent: number; currency: string } | null;
      }>;
    };
    const entry = body.entries.find((item) => item.decisionId === decisionId);
    expect(entry?.expectedImpact).toMatchObject({ value: 200_000, currency: "TRY" });
    expect(entry?.actualImpact).toMatchObject({ value: 230_000, currency: "TRY" });
    expect(entry?.economicVariance).toEqual({ amount: 30_000, percent: 15, currency: "TRY" });
  });

  it("vaka listesi güven kalibrasyonunu kurum kapsamlı döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = (await (
      await listDecisionCases(new NextRequest("http://localhost/api/decision-cases"))
    ).json()) as {
      cases: Array<{ id: string; case: { title: string } }>;
      calibration: {
        status: string;
        totalWithOutcome: number;
        threshold: number;
        buckets: Array<{ key: string; withOutcome: number; status: string }>;
      };
    };
    expect(body.cases.length).toBeGreaterThan(0);
    expect(body.calibration).toMatchObject({
      status: "insufficient_evidence",
      threshold: 5,
    });
    expect(body.calibration.totalWithOutcome).toBeGreaterThanOrEqual(2);
    const bucket = body.calibration.buckets.find((item) => item.key === "70-84");
    expect(bucket?.status).toBe("insufficient_evidence");
    expect(bucket!.withOutcome).toBeGreaterThanOrEqual(2);

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    const other = (await (
      await listDecisionCases(new NextRequest("http://localhost/api/decision-cases"))
    ).json()) as { calibration: { totalWithOutcome: number } };
    expect(other.calibration.totalWithOutcome).toBe(0);
  });

  it("komuta merkezi brifingi güven kalibrasyonuyla birlikte döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = (await (await commandCenter()).json()) as {
      brief: { confidence: number } | null;
      calibration: { threshold: number; totalWithOutcome: number; buckets: unknown[] };
      actions: { overdueCount: number; open: Array<{ overdue: boolean; overdueDays: number | null }> };
    };
    // Bu fixture'da açık vaka yok; brifing null olabilir ama kalibrasyon her
    // durumda dönmeli ki yönetici ekranı güveni bağlamlandırabilsin.
    expect(body.calibration.threshold).toBe(5);
    expect(body.calibration.buckets.length).toBe(4);
    expect(body.calibration.totalWithOutcome).toBeGreaterThanOrEqual(2);
    if (body.brief) expect(body.brief.confidence).toBeGreaterThanOrEqual(0);
    // Fixture'daki aksiyonun vadesi yok; geciken sayısı 0 ve bayrak false olmalı.
    expect(body.actions.overdueCount).toBe(0);
    expect(body.actions.open.every((item) => item.overdue === false)).toBe(true);
  });

  it("vadesi geçmiş açık aksiyon geciken olarak işaretlenir", async () => {
    const db = getDb();
    await db.query("UPDATE actions SET due_at = '2026-01-01T00:00:00Z' WHERE id = 'action-rec-1'");
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = (await (await commandCenter()).json()) as {
      actions: { overdueCount: number; open: Array<{ overdue: boolean; overdueDays: number | null }> };
    };
    expect(body.actions.overdueCount).toBe(1);
    const overdue = body.actions.open.find((item) => item.overdue);
    expect(overdue).toBeTruthy();
    expect(overdue!.overdueDays).toBeGreaterThan(0);
  });

  it("başka kurumun kararları görünmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    const body = (await (await ledger(new Request("http://localhost/api/decision-ledger"))).json()) as {
      summary: { totalDecisions: number };
      entries: unknown[];
    };
    expect(body.summary.totalDecisions).toBe(0);
    expect(body.entries).toHaveLength(0);
  });

  it("geçersiz limit 400 döner, geçerli limit kabul edilir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    for (const bad of ["abc", "0", "-3", "1.5", "201", "1e2"]) {
      const res = await ledger(
        new Request(`http://localhost/api/decision-ledger?limit=${encodeURIComponent(bad)}`)
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("limit");
    }

    const ok = await ledger(new Request("http://localhost/api/decision-ledger?limit=1"));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { entries: unknown[] };
    expect(body.entries.length).toBeLessThanOrEqual(1);
  });
});
