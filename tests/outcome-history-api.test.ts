import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-outcome-history-${process.pid}-${randomUUID()}`
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
const { GET: outcomesGET } = await import("../src/app/api/outcomes/route");

const ORG_A = "org-history-a";
const ORG_B = "org-history-b";

function historyRequest(decisionId?: string, rawLength = 0) {
  const query = decisionId === undefined ? "" : `?decisionId=${decisionId}`;
  const url = `http://localhost/api/outcomes${query}${rawLength ? `&pad=${"x".repeat(rawLength)}` : ""}`;
  return new NextRequest(url);
}

describe("karar sonuç geçmişi API'si", () => {
  let ceoA: string;
  let guestA: string;
  let ceoB: string;

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
      ["hist-ceo-a", ORG_A, "ceo@hist-a.test", "ceo"],
      ["hist-guest-a", ORG_A, "guest@hist-a.test", "guest"],
      ["hist-ceo-b", ORG_B, "ceo@hist-b.test", "ceo"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, email, id, role, pw]
      );
    }
    for (const [caseId, org, title] of [
      ["hist-case-a", ORG_A, "Satış düşüşü"],
      ["hist-case-b", ORG_B, "B kurumu vakası"],
    ]) {
      await db.query(
        `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
         VALUES ($1, $2, 'aviation', 'risk', 'high', 'decided', $3, 80, '{}'::jsonb)`,
        [caseId, org, title]
      );
    }
    for (const [id, caseId, org] of [
      ["hist-rec-a", "hist-case-a", ORG_A],
      ["hist-rec-b", "hist-case-b", ORG_B],
    ]) {
      await db.query(
        `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload)
         VALUES ($1, $2, $3, 'aviation', 'accepted', 'ceo', '{}'::jsonb)`,
        [id, org, caseId]
      );
    }
    await db.query(
      `INSERT INTO outcomes
         (id, org_id, decision_id, result, note, lesson, recorded_by, created_at,
          actual_value, value_currency, measurement_start, measurement_end, evidence)
       VALUES
         ('hist-out-old', $1, 'hist-rec-a', 'improved', 'İlk ölçüm', 'Öncelik işe yaradı', 'ceo', '2026-01-10T10:00:00Z',
          100000, 'TRY', '2025-12-01T00:00:00Z', '2026-01-05T00:00:00Z', 'finans raporu'),
         ('hist-out-new', $1, 'hist-rec-a', 'unchanged', 'İkinci ölçüm', NULL, 'analyst', '2026-02-10T10:00:00Z',
          NULL, NULL, NULL, NULL, NULL),
         ('hist-out-b', $2, 'hist-rec-b', 'worsened', 'B gizli sonucu', NULL, 'ceo-b', '2026-03-10T10:00:00Z',
          NULL, NULL, NULL, NULL, NULL)`,
      [ORG_A, ORG_B]
    );

    ceoA = await createSession("hist-ceo-a", ORG_A);
    guestA = await createSession("hist-guest-a", ORG_A);
    ceoB = await createSession("hist-ceo-b", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401, görüntüleme izni yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await outcomesGET(historyRequest("hist-rec-a"))).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await outcomesGET(historyRequest("hist-rec-a"))).status).toBe(403);
  });

  it("başka kurumun karar geçmişini 404 ile gizler", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    const res = await outcomesGET(historyRequest("hist-rec-a"));
    expect(res.status).toBe(404);
  });

  it("kararın ölçümlerini yeniden eskiye ve etki kanıtıyla döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await outcomesGET(historyRequest("hist-rec-a"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      outcomes: Array<{
        id: string;
        result: string;
        note: string;
        lesson: string | null;
        recorded_by: string;
        recorded_at: string;
        actual_impact: { value: number; currency: string; evidence: string | null } | null;
      }>;
    };
    expect(body.outcomes.map((item) => item.id)).toEqual(["hist-out-new", "hist-out-old"]);
    expect(body.outcomes[0]).toMatchObject({
      result: "unchanged",
      note: "İkinci ölçüm",
      recorded_by: "analyst",
      recorded_at: "2026-02-10T10:00:00.000Z",
      actual_impact: null,
    });
    expect(body.outcomes[1]).toMatchObject({
      result: "improved",
      lesson: "Öncelik işe yaradı",
      actual_impact: {
        value: 100000,
        currency: "TRY",
        measurement_start: "2025-12-01T00:00:00.000Z",
        measurement_end: "2026-01-05T00:00:00.000Z",
        evidence: "finans raporu",
      },
    });
    expect(JSON.stringify(body)).not.toContain("B gizli sonucu");
  });

  it("aşırı uzun karar kimliğini 400 ile reddeder", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await outcomesGET(historyRequest("a".repeat(301)));
    expect(res.status).toBe(400);
  });

  it("limit uygular ve daha eski kayıtları truncated ile bildirir", async () => {
    const db = getDb();
    for (let index = 0; index < 21; index += 1) {
      const day = String(index + 1).padStart(2, "0");
      await db.query(
        `INSERT INTO outcomes
           (id, org_id, decision_id, result, note, recorded_by, created_at)
         VALUES ($1, $2, 'hist-rec-a', 'unchanged', $3, 'bulk', $4)`,
        [`hist-bulk-${index}`, ORG_A, `Toplu ölçüm ${index}`, `2026-04-${day}T10:00:00Z`]
      );
    }

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await outcomesGET(
      new NextRequest("http://localhost/api/outcomes?decisionId=hist-rec-a&limit=5")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      outcomes: Array<{ id: string }>;
      limit: number;
      truncated: boolean;
    };
    expect(body.limit).toBe(5);
    expect(body.truncated).toBe(true);
    expect(body.outcomes).toHaveLength(5);
    expect(body.outcomes[0]?.id).toBe("hist-bulk-20");
    expect(body.outcomes.at(-1)?.id).toBe("hist-bulk-16");

    expect(
      (await outcomesGET(new NextRequest("http://localhost/api/outcomes?decisionId=hist-rec-a&limit=0")))
        .status
    ).toBe(400);
    expect(
      (await outcomesGET(new NextRequest("http://localhost/api/outcomes?decisionId=hist-rec-a&limit=abc")))
        .status
    ).toBe(400);
    expect(
      (await outcomesGET(new NextRequest("http://localhost/api/outcomes?decisionId=hist-rec-a&limit=101")))
        .status
    ).toBe(400);
  });
});
