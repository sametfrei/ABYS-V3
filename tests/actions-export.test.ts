import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiDecisionCase } from "../src/lib/ai/provider";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-actions-export-${process.pid}-${randomUUID()}`
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
const { GET: exportActions } = await import("../src/app/api/actions/export/route");
const { insertCases, recordDecision } = await import("../src/lib/db/repos/decisions");
const { createAction } = await import("../src/lib/db/repos/actions");
const { ACTIONS_CSV_HEADER } = await import("../src/lib/actions-csv");

const ORG_A = "org-actions-export-a";
const ORG_B = "org-actions-export-b";
const SECTOR = "aviation";

function decisionCase(title: string): AiDecisionCase {
  return {
    categoryId: "test:actions-csv",
    categoryLabel: "Test",
    title,
    severity: "warning",
    confidence: 60,
    businessImpact: "test",
    confidenceRationale: "test",
    evidence: [],
    assumptions: [],
    historicalComparison: "",
    counterfactual: { narrative: "", projectedImpact: "", timeHorizon: "" },
    options: [],
    recommendedOptionRank: 1,
  };
}

async function seedAction(orgId: string, title: string): Promise<string> {
  const [stored] = await insertCases(orgId, SECTOR, [decisionCase(title)]);
  const decisionId = await recordDecision({
    orgId,
    caseId: stored.id,
    sectorId: SECTOR,
    choice: "accepted",
    decidedBy: "ceo",
    payload: { reason: title },
  });
  return createAction({
    orgId,
    decisionId,
    caseId: stored.id,
    title,
    owner: "ops",
  });
}

function get(query = "", cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost/api/actions/export${query}`, { headers });
}

describe("aksiyon CSV dışa aktarımı", () => {
  let ceoA: string;
  let noPermA: string;
  let ceoB: string;
  let actionA: string;
  let actionB: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "Actions Export A"],
      [ORG_B, "Actions Export B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        name,
        SECTOR,
      ]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, role] of [
      ["act-export-ceo-a", ORG_A, "ceo"],
      ["act-export-none-a", ORG_A, "contractor"],
      ["act-export-ceo-b", ORG_B, "ceo"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@test.local`, id, role, pw]
      );
    }

    actionA = await seedAction(ORG_A, 'Geciken "yenileme" araması, acil');
    actionB = await seedAction(ORG_B, "B kurumu gizli aksiyonu");

    ceoA = await createSession("act-export-ceo-a", ORG_A);
    noPermA = await createSession("act-export-none-a", ORG_A);
    ceoB = await createSession("act-export-ceo-b", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    expect((await exportActions(get())).status).toBe(401);
  });

  it("view_decisions izni olmayan rol 403 alır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, noPermA);
    const res = await exportActions(get());
    expect(res.status).toBe(403);
    await res.text();
  });

  it("geçersiz durum filtresi 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await exportActions(get("?status=bogus"));
    expect(res.status).toBe(400);
    await res.text();
  });

  it("kendi kurumunun aksiyonunu kaçışlı CSV olarak döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await exportActions(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv.split("\r\n")[0]).toBe(ACTIONS_CSV_HEADER.join(","));
    expect(csv).toContain(actionA);
    expect(csv).not.toContain(actionB);
    expect(csv).toContain('"Geciken ""yenileme"" araması, acil"');
  });

  it("durum filtresi ve kurum kapsamı birlikte uygulanır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    expect((await (await exportActions(get("?status=open"))).text())).toContain(actionA);
    expect((await (await exportActions(get("?status=succeeded"))).text())).not.toContain(actionA);

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    const other = await (await exportActions(get())).text();
    expect(other).toContain(actionB);
    expect(other).not.toContain(actionA);
  });
});
