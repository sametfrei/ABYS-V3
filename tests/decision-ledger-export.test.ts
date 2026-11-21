import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiDecisionCase } from "../src/lib/ai/provider";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-decision-ledger-export-${process.pid}-${randomUUID()}`
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
const { hasPermission, permissionError } = await import("../src/lib/auth/permissions");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET: exportLedger } = await import("../src/app/api/decision-ledger/export/route");
const { insertCases, recordDecision } = await import("../src/lib/db/repos/decisions");

const ORG_A = "org-ledger-export-a";
const ORG_B = "org-ledger-export-b";
const ORG_EMPTY = "org-ledger-export-empty";
const SECTOR = "aviation";

const CSV_HEADER =
  "decision_id,case_id,title,severity,confidence,business_impact,choice,decided_by,decided_at,decision_state,action_id,action_title,action_owner,action_status,action_due_at,expected_value,expected_currency,actual_value,actual_currency,variance_value,variance_pct,outcome,outcome_note,lesson,recorded_by,recorded_at";

function decisionCase(title: string, categoryId: string): AiDecisionCase {
  return {
    categoryId,
    categoryLabel: "Gelir riski",
    severity: "critical",
    title,
    businessImpact: `${title} için gelir etkisi`,
    confidence: 80,
    confidenceRationale: "Test fixture",
    evidence: [],
    assumptions: [],
    historicalComparison: "",
    counterfactual: { narrative: "", projectedImpact: "", timeHorizon: "" },
    options: [],
    recommendedOptionRank: 1,
  };
}

async function seedDecision(orgId: string, title: string): Promise<string> {
  const [stored] = await insertCases(orgId, SECTOR, [decisionCase(title, `test:${orgId}`)]);
  return recordDecision({
    orgId,
    caseId: stored.id,
    sectorId: SECTOR,
    choice: "accepted",
    decidedBy: "ceo",
    payload: { reason: title },
  });
}

describe("karar defteri CSV dışa aktarımı", () => {
  let ceoA: string;
  let guestA: string;
  let decisionA: string;
  let decisionB: string;
  const titleA = "A kurumu gelir riski";
  const titleB = "B kurumu gizli riski";

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    const password = hashPassword("mevcut-parola-123");

    for (const [orgId, name] of [
      [ORG_A, "Ledger Export A"],
      [ORG_B, "Ledger Export B"],
      [ORG_EMPTY, "Ledger Export Empty"],
    ] as const) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        orgId,
        name,
        SECTOR,
      ]);
    }

    for (const [userId, orgId, email, role] of [
      ["ledger-export-ceo-a", ORG_A, "ceo@ledger-export-a.test", "ceo"],
      ["ledger-export-ceo-b", ORG_B, "ceo@ledger-export-b.test", "ceo"],
      ["ledger-export-guest-a", ORG_A, "guest@ledger-export-a.test", "guest"],
      ["ledger-export-ceo-empty", ORG_EMPTY, "ceo@ledger-export-empty.test", "ceo"],
    ] as const) {
      await db.query(
        `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, orgId, email, userId, role, password]
      );
    }

    decisionA = await seedDecision(ORG_A, titleA);
    decisionB = await seedDecision(ORG_B, titleB);

    ceoA = await createSession("ledger-export-ceo-a", ORG_A);
    guestA = await createSession("ledger-export-guest-a", ORG_A);
  });

  beforeEach(() => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 JSON döndürür", async () => {
    const response = await exportLedger();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Oturum gerekli." });
  });

  it("view_decisions izni olmayan rol için 403 döndürür", async () => {
    // Tanımlı Roller'in tamamı view_decisions içeriyor; bu yüzden matriste
    // bulunmayan ve mevcut API testlerinde kullanılan "guest" rolünü seçtik.
    expect(hasPermission("guest", "view_decisions")).toBe(false);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    const response = await exportLedger();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: permissionError("view_decisions") });
  });

  it("yetkili kullanıcı için CSV indirme başlıklarını döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const response = await exportLedger();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="decision-ledger-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("CSV başlığı, CRLF satır sonları ve kurum kaydını içerir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const body = await (await exportLedger()).text();

    const lines = body.split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines.at(-1)).toBe("");
    expect(lines.filter(Boolean)).toHaveLength(2);
    expect(body.endsWith("\r\n")).toBe(true);
    expect(body.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

    const recordLine = lines[1];
    expect(recordLine).toContain(decisionA);
    expect(recordLine).toContain(titleA);
    expect(recordLine).not.toContain(titleB);
  });

  it("boş defterde yalnızca başlık satırını döndürür", async () => {
    const emptySession = await createSession("ledger-export-ceo-empty", ORG_EMPTY);
    nextHeaders.__setTestCookie(SESSION_COOKIE, emptySession);
    const response = await exportLedger();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`${CSV_HEADER}\r\n`);
  });

  it("A kurumunun CSV'sinde B kurumunun kaydı görünmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const bodyA = await (await exportLedger()).text();
    expect(bodyA).toContain(decisionA);
    expect(bodyA).toContain(titleA);
    expect(bodyA).not.toContain(decisionB);
    expect(bodyA).not.toContain(titleB);
  });

  it("her dışa aktarım kurum kapsamlı denetim kaydı bırakır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    await (await exportLedger()).text();

    const own = await getDb().query<{ summary: string; prev_hash: string | null }>(
      "SELECT summary, prev_hash FROM audit_events WHERE org_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1",
      [ORG_A, "decision_ledger_exported"]
    );
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].summary).toContain("CSV");
    expect(own.rows[0].prev_hash).not.toBeNull();

    const foreign = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = $2",
      [ORG_B, "decision_ledger_exported"]
    );
    expect(foreign.rows).toHaveLength(0);
  });
});
