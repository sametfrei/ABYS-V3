import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-action-governance-${process.pid}-${randomUUID()}`
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
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { PATCH: patchAction } = await import("../src/app/api/actions/route");
const { createAction, listActionEvents, listActions, transitionAction } = await import(
  "../src/lib/db/repos/actions"
);
const { verifyAuditChain } = await import("../src/lib/db/repos/audit");

const ORG_A = "org-action-a";
const ORG_B = "org-action-b";

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/actions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("aksiyon yönetişimi ve karar-yürütme bağlantısı", () => {
  let sessionA: string;
  let actionA: string;
  let actionB: string;
  let decisionA: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    const passwordHash = hashPassword("mevcut-parola-123");
    for (const [orgId, name, sectorId] of [
      [ORG_A, "A Org", "aviation"],
      [ORG_B, "B Org", "aviation"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        orgId,
        name,
        sectorId,
      ]);
    }
    for (const [userId, orgId, email, role] of [
      ["action-ceo-a", ORG_A, "ceo@action-a.test", "ceo"],
      ["action-ceo-b", ORG_B, "ceo@action-b.test", "ceo"],
    ] as const) {
      await db.query(
        `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, orgId, email, userId, role, passwordHash]
      );
    }
    for (const [caseId, orgId, title] of [
      ["case-action-a", ORG_A, "Aksiyon vakası A"],
      ["case-action-b", ORG_B, "Aksiyon vakası B"],
    ] as const) {
      await db.query(
        `INSERT INTO decision_cases
           (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
         VALUES ($1, $2, 'aviation', 'risk', 'high', 'decided', $3, 80, '{}'::jsonb)`,
        [caseId, orgId, title]
      );
    }
    await db.query(
      `INSERT INTO decision_records
         (id, org_id, case_id, sector_id, choice, decided_by, payload, state)
       VALUES
         ('decision-action-a', $1, 'case-action-a', 'aviation', 'accepted', 'ceo-a', '{}'::jsonb, 'approved'),
         ('decision-action-b', $2, 'case-action-b', 'aviation', 'accepted', 'ceo-b', '{}'::jsonb, 'approved')`,
      [ORG_A, ORG_B]
    );
    decisionA = "decision-action-a";
    await db.query(
      `UPDATE decision_records
          SET expected_value = 120000, value_currency = 'TRY', value_basis = 'yıllık maliyet tasarrufu'
        WHERE id = $1 AND org_id = $2`,
      [decisionA, ORG_A]
    );
    actionA = await createAction({
      orgId: ORG_A,
      decisionId: decisionA,
      caseId: "case-action-a",
      title: "Envanteri yeniden tahsis et",
      owner: "CEO A",
      actorId: "action-ceo-a",
      actorName: "CEO A",
    });
    actionB = await createAction({
      orgId: ORG_B,
      decisionId: "decision-action-b",
      caseId: "case-action-b",
      title: "B kurumu aksiyonu",
      owner: "CEO B",
      actorId: "action-ceo-b",
      actorName: "CEO B",
    });
    sessionA = await createSession("action-ceo-a", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("aksiyon oluşturma ilk açık durumu değişmez olay olarak kaydeder", async () => {
    const events = await listActionEvents(ORG_A, actionA);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action_id: actionA,
      decision_id: decisionA,
      from_status: null,
      to_status: "open",
      actor_id: "action-ceo-a",
      actor_name: "CEO A",
    });
    const actions = await listActions(ORG_A);
    expect(actions.find((row) => row.id === actionA)).toMatchObject({
      status: "open",
      decision_state: "approved",
      expected_impact: {
        value: 120000,
        currency: "TRY",
        basis: "yıllık maliyet tasarrufu",
      },
      event_count: 1,
    });
  });

  it("aksiyon listesi kararın en son sonucunu finansal kanıtıyla döndürür", async () => {
    const db = getDb();
    await db.query(
      `INSERT INTO outcomes
         (id, org_id, decision_id, result, note, lesson, recorded_by,
          actual_value, value_currency, measurement_start, measurement_end, evidence, created_at)
       VALUES
         ('out-action-old', $1, $2, 'unchanged', 'Eski ölçüm', NULL, 'CEO A',
          NULL, NULL, NULL, NULL, NULL, '2026-01-01T00:00:00Z'),
         ('out-action-new', $1, $2, 'improved', 'Gecikme 34 dakikadan 12 dakikaya indi',
          'Vardiya öncesi önceliklendirme işe yaradı', 'CEO A', 230000, 'TRY',
          '2026-01-15T00:00:00Z', '2026-02-15T00:00:00Z', 'finans mutabakatı',
          '2026-02-20T00:00:00Z')`,
      [ORG_A, decisionA]
    );

    const actions = await listActions(ORG_A);
    expect(actions.find((row) => row.id === actionA)?.latest_outcome).toEqual({
      result: "improved",
      note: "Gecikme 34 dakikadan 12 dakikaya indi",
      lesson: "Vardiya öncesi önceliklendirme işe yaradı",
      recorded_by: "CEO A",
      recorded_at: "2026-02-20T00:00:00.000Z",
      actual_impact: {
        value: 230000,
        currency: "TRY",
        measurement_start: "2026-01-15T00:00:00.000Z",
        measurement_end: "2026-02-15T00:00:00.000Z",
        evidence: "finans mutabakatı",
      },
    });
  });

  it("açık aksiyon doğrudan tamamlandı yapılamaz; denetim izi değişmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await patchAction(patchRequest({ actionId: actionA, status: "done" }));
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { reason: string; currentStatus: string };
    expect(payload).toMatchObject({ reason: "invalid_transition", currentStatus: "open" });

    const row = await getDb().query<{ status: string }>(
      "SELECT status FROM actions WHERE id = $1 AND org_id = $2",
      [actionA, ORG_A]
    );
    expect(row.rows[0]?.status).toBe("open");
    expect(await listActionEvents(ORG_A, actionA)).toHaveLength(1);
  });

  it("yürütmeye alma kararı in_execution yapar ve atomik audit/olay yazar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await patchAction(
      patchRequest({ actionId: actionA, status: "in_progress", progressNote: "Saha ekibi görevlendirildi" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "in_progress", changed: true });

    const db = getDb();
    const action = await db.query<{ status: string; progress_note: string }>(
      "SELECT status, progress_note FROM actions WHERE id = $1 AND org_id = $2",
      [actionA, ORG_A]
    );
    expect(action.rows[0]).toMatchObject({ status: "in_progress", progress_note: "Saha ekibi görevlendirildi" });
    const decision = await db.query<{ state: string }>(
      "SELECT state FROM decision_records WHERE id = $1 AND org_id = $2",
      [decisionA, ORG_A]
    );
    expect(decision.rows[0]?.state).toBe("in_execution");

    const events = await listActionEvents(ORG_A, actionA);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      from_status: "open",
      to_status: "in_progress",
      progress_note: "Saha ekibi görevlendirildi",
      actor_id: "action-ceo-a",
    });
    const audit = await db.query<{ type: string }>(
      "SELECT type FROM audit_events WHERE org_id = $1 AND type = 'action_transition'",
      [ORG_A]
    );
    expect(audit.rows).toHaveLength(1);
    expect(await verifyAuditChain(ORG_A)).toMatchObject({ valid: true });
  });

  it("tamamlama kararı sonuç incelemesine taşır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await patchAction(patchRequest({ actionId: actionA, status: "done" }));
    expect(response.status).toBe(200);
    const db = getDb();
    const decision = await db.query<{ state: string }>(
      "SELECT state FROM decision_records WHERE id = $1 AND org_id = $2",
      [decisionA, ORG_A]
    );
    expect(decision.rows[0]?.state).toBe("outcome_review");
    expect(await listActionEvents(ORG_A, actionA)).toHaveLength(3);
  });

  it("başka kurumun aksiyonu güncellenemez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const response = await patchAction(
      patchRequest({ actionId: actionB, status: "in_progress" })
    );
    expect(response.status).toBe(404);
    const events = await listActionEvents(ORG_B, actionB);
    expect(events).toHaveLength(1);
  });

  it("audit yazımı başarısız olursa aksiyon, karar ve olay birlikte geri alınır", async () => {
    const beforeAction = await getDb().query<{ status: string }>(
      "SELECT status FROM actions WHERE id = $1 AND org_id = $2",
      [actionB, ORG_B]
    );
    await expect(
      transitionAction({
        orgId: ORG_B,
        actionId: actionB,
        status: "in_progress",
        progressNote: "Rollback testi",
        actorId: "action-ceo-b",
        actorName: "CEO B",
        auditWriter: async () => {
          throw new Error("kasıtlı audit hatası");
        },
      })
    ).rejects.toThrow("kasıtlı audit hatası");
    const afterAction = await getDb().query<{ status: string }>(
      "SELECT status FROM actions WHERE id = $1 AND org_id = $2",
      [actionB, ORG_B]
    );
    const decision = await getDb().query<{ state: string }>(
      "SELECT state FROM decision_records WHERE id = 'decision-action-b' AND org_id = $1",
      [ORG_B]
    );
    expect(afterAction.rows[0]?.status).toBe(beforeAction.rows[0]?.status);
    expect(decision.rows[0]?.state).toBe("approved");
    expect(await listActionEvents(ORG_B, actionB)).toHaveLength(1);
  });

  it("yürütme olayları append-only kalır", async () => {
    await expect(
      getDb().query("UPDATE action_events SET actor_name = 'değiştirildi' WHERE org_id = $1", [ORG_A])
    ).rejects.toThrow(/append-only/);
  });
});
