import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
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
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET: ledger } = await import("../src/app/api/decision-ledger/route");

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
      `INSERT INTO outcomes (id, org_id, decision_id, result, note, lesson, recorded_by)
       VALUES ('out-1', $1, 'rec-1', 'improved', 'Satış toparlandı', 'Hızlı aksiyon işe yaradı', 'ceo')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO outcomes (id, org_id, decision_id, result, note, recorded_by)
       VALUES ('out-2', $1, 'rec-2', 'worsened', 'Nakit sıkıştı', 'ceo')`,
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
    expect((await ledger()).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await ledger()).status).toBe(403);
  });

  it("özet: toplam karar ve sonuç dağılımı doğru", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = (await (await ledger()).json()) as {
      summary: { totalDecisions: number; withOutcome: number; improved: number; worsened: number; unchanged: number };
    };
    expect(body.summary).toEqual({
      totalDecisions: 3,
      withOutcome: 2,
      improved: 1,
      worsened: 1,
      unchanged: 0,
    });
  });

  it("kararlar sonuç ve dersleriyle birlikte, yeniden eskiye döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = (await (await ledger()).json()) as {
      entries: Array<{
        decisionId: string;
        title: string;
        businessImpact: string;
        outcome: { result: string; lesson: string | null } | null;
      }>;
    };
    expect(body.entries.map((e) => e.decisionId)).toEqual(["rec-3", "rec-2", "rec-1"]);
    expect(body.entries[0].outcome).toBeNull();
    const rec1 = body.entries.find((e) => e.decisionId === "rec-1")!;
    expect(rec1.businessImpact).toContain("Satış düşüşü");
    expect(rec1.outcome).toMatchObject({
      result: "improved",
      lesson: "Hızlı aksiyon işe yaradı",
    });
    const rec2 = body.entries.find((e) => e.decisionId === "rec-2")!;
    expect(rec2.outcome?.result).toBe("worsened");
  });

  it("başka kurumun kararları görünmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    const body = (await (await ledger()).json()) as {
      summary: { totalDecisions: number };
      entries: unknown[];
    };
    expect(body.summary.totalDecisions).toBe(0);
    expect(body.entries).toHaveLength(0);
  });
});
