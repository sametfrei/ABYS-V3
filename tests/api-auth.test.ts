import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * bkz. tests/tenant-isolation.test.ts için aynı gerekçe. Kendi geçici
 * dizinini kullanır ki dev sunucunun kilidiyle veya diğer test
 * dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-api-auth-test-${process.pid}-${randomUUID()}`
);

/**
 * Route handler'lar `next/headers`'ın `cookies()`'ini oturum çerezini
 * okumak için kullanır; bu fonksiyon gerçek bir Next.js istek bağlamı
 * dışında çağrılırsa hata fırlatır ("called outside a request scope").
 * Testte route'ları doğrudan çağırdığımız için burada sahte bir çerez
 * deposu ile mock'luyoruz — `__setTestCookie` ile istek öncesi ayarlanır.
 */
vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
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
const { createSession } = await import("../src/lib/auth/core");
const { insertCases } = await import("../src/lib/db/repos/decisions");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { POST: decisionsPOST } = await import("../src/app/api/decisions/route");
const { GET: causalGET, POST: causalPOST } = await import("../src/app/api/causal/route");
const { GET: kpiGET } = await import("../src/app/api/kpi-definitions/route");
const { GET: traceGET } = await import("../src/app/api/trace/route");
const { GET: documentsGET, POST: documentsPOST } = await import("../src/app/api/documents/route");
const { GET: actionsGET } = await import("../src/app/api/actions/route");
const { GET: outcomesGET } = await import("../src/app/api/outcomes/route");

function jsonRequest(url: string, method: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function getRequest(url: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${url}`, { method: "GET", headers });
}

function makeCase(title: string) {
  return {
    categoryId: "risk",
    categoryLabel: "Risk",
    severity: "warning" as const,
    title,
    businessImpact: "Test etkisi",
    confidence: 70,
    confidenceRationale: "Test gerekçesi, en az otuz karakter olacak şekilde yazıldı.",
    evidence: [{ source: "test", fact: "test kanıtı", reliability: "verified" as const }],
    assumptions: [],
    historicalComparison: "Test karşılaştırması",
    counterfactual: { narrative: "n/a", projectedImpact: "n/a", timeHorizon: "n/a" },
    options: [
      {
        title: "Seçenek 1",
        detail: "detay",
        feasible: true,
        feasibilityNote: "uygulanabilir",
        tradeoffs: "yok",
        expectedOutcome: "iyileşme",
        rank: 1,
      },
    ],
    recommendedOptionRank: 1,
  };
}

describe("API oturum + izin + org kontrolü", () => {
  const orgA = randomBytes(8).toString("hex");
  const orgB = randomBytes(8).toString("hex");
  let ceoSession: string;
  let dataAdminSession: string;
  let analystSession: string;
  let auditorSession: string;
  let caseIdA: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgA,
      "Org A",
      "aviation",
    ]);
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgB,
      "Org B",
      "aviation",
    ]);

    const users: [string, string, string, string][] = [
      ["ceoUser", orgA, "ceo@org-a.test", "ceo"],
      ["dataAdminUser", orgA, "veri@org-a.test", "data_admin"],
      ["analystUser", orgA, "analist@org-a.test", "analyst"],
      ["auditorUser", orgA, "denetci@org-a.test", "auditor"],
    ];
    for (const [id, orgId, email, role] of users) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, orgId, email, role, role, "x:x"]
      );
    }

    ceoSession = await createSession("ceoUser", orgA);
    dataAdminSession = await createSession("dataAdminUser", orgA);
    analystSession = await createSession("analystUser", orgA);
    auditorSession = await createSession("auditorUser", orgA);

    const [stored] = await insertCases(orgA, "aviation", [makeCase("Org A vakası")]);
    caseIdA = stored.id;
  });

  afterAll(async () => {
    await getDb().close();
  });

  describe("oturum çerezi yokken 401", () => {
    it("POST /api/decisions", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await decisionsPOST(jsonRequest("/api/decisions", "POST", {}));
      expect(res.status).toBe(401);
    });

    it("GET /api/causal", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await causalGET(getRequest("/api/causal?caseId=x"));
      expect(res.status).toBe(401);
    });

    it("GET /api/kpi-definitions", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await kpiGET();
      expect(res.status).toBe(401);
    });

    it("GET /api/trace", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await traceGET(getRequest("/api/trace?caseId=x"));
      expect(res.status).toBe(401);
    });

    it("GET /api/documents", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await documentsGET();
      expect(res.status).toBe(401);
    });

    it("GET /api/actions", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await actionsGET(getRequest("/api/actions"));
      expect(res.status).toBe(401);
    });

    it("GET /api/outcomes", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await outcomesGET();
      expect(res.status).toBe(401);
    });
  });

  describe("oturum var ama rol yetkisiz iken 403", () => {
    it("POST /api/documents — analist rolünde ingest_data izni yok", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, analystSession);
      const res = await documentsPOST(
        jsonRequest("/api/documents", "POST", { title: "Deneme", text: "içerik" }, analystSession)
      );
      expect(res.status).toBe(403);
    });

    it("POST /api/decisions — denetçi rolünde record_decision izni yok", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, auditorSession);
      const res = await decisionsPOST(
        jsonRequest(
          "/api/decisions",
          "POST",
          { caseId: caseIdA, sectorId: "aviation", choice: "accepted" },
          auditorSession
        )
      );
      expect(res.status).toBe(403);
    });
  });

  describe("org_id daima oturumdan gelir, istek gövdesinden ASLA", () => {
    it("POST /api/decisions — gövdedeki sahte orgId yok sayılır, kayıt oturumun orgA'sına yazılır", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await decisionsPOST(
        jsonRequest(
          "/api/decisions",
          "POST",
          { caseId: caseIdA, sectorId: "aviation", choice: "accepted", orgId: orgB },
          ceoSession
        )
      );
      expect(res.status).toBe(200);
      const { recordId } = (await res.json()) as { recordId: string };

      const inOrgA = await getDb().query(
        "SELECT 1 FROM decision_records WHERE id = $1 AND org_id = $2",
        [recordId, orgA]
      );
      expect(inOrgA.rows.length).toBe(1);

      const inOrgB = await getDb().query(
        "SELECT 1 FROM decision_records WHERE id = $1 AND org_id = $2",
        [recordId, orgB]
      );
      expect(inOrgB.rows.length).toBe(0);
    });

    it("POST /api/documents — gövdedeki sahte orgId yok sayılır, belge oturumun orgA'sına yazılır", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await documentsPOST(
        jsonRequest(
          "/api/documents",
          "POST",
          { title: "Sahte org denemesi", text: "içerik metni", orgId: orgB },
          dataAdminSession
        )
      );
      expect(res.status).toBe(200);
      const { documentId } = (await res.json()) as { documentId: string };

      const inOrgA = await getDb().query(
        "SELECT 1 FROM documents WHERE id = $1 AND org_id = $2",
        [documentId, orgA]
      );
      expect(inOrgA.rows.length).toBe(1);

      const inOrgB = await getDb().query(
        "SELECT 1 FROM documents WHERE id = $1 AND org_id = $2",
        [documentId, orgB]
      );
      expect(inOrgB.rows.length).toBe(0);
    });

    it("POST /api/causal — gövdedeki sahte orgId yok sayılır, bağlantı oturumun orgA'sına yazılır", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await causalPOST(
        jsonRequest(
          "/api/causal",
          "POST",
          {
            caseId: caseIdA,
            fromLabel: "A sebebi",
            toLabel: "A sonucu",
            confidence: 60,
            orgId: orgB,
          },
          ceoSession
        )
      );
      expect(res.status).toBe(200);
      const { linkId } = (await res.json()) as { linkId: string };

      const inOrgA = await getDb().query(
        "SELECT 1 FROM causal_links WHERE id = $1 AND org_id = $2",
        [linkId, orgA]
      );
      expect(inOrgA.rows.length).toBe(1);

      const inOrgB = await getDb().query(
        "SELECT 1 FROM causal_links WHERE id = $1 AND org_id = $2",
        [linkId, orgB]
      );
      expect(inOrgB.rows.length).toBe(0);
    });
  });
});
