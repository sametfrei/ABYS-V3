import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/analyze ve POST /api/decision-cases girdi doğrulaması.
 *
 * Ağır AI/DB bağımlılıkları sahtelenir: burada test edilen tek şey route'un
 * zod doğrulaması (geçersiz gövde -> 400) ve doğrulamayı geçen gövdenin
 * iş mantığına ulaşmasıdır. Gerçek model çağrısı veya DB yazımı yapılmaz.
 */

process.env.ABYS_DB_DIR = "/tmp/abys-decision-cases-validation-unused";

const mocks = vi.hoisted(() => ({
  generateBriefing: vi.fn(),
  analyzeDecisionCases: vi.fn(),
  insertCases: vi.fn(),
  logModelRun: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ name: "abys_session", value: "test-session" }),
  }),
}));

// Oturumda sektör ve kurum vardır: org_id daima buradan gelmelidir.
vi.mock("@/lib/auth/core", () => ({
  SESSION_COOKIE: "abys_session",
  getSession: async () => ({
    userId: "user-1",
    orgId: "org-from-session",
    orgCode: "TST",
    orgName: "Test Org",
    sectorId: "aviation",
    role: "ceo",
    displayName: "Test CEO",
  }),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth/permissions")>();
  return { ...actual, hasPermission: () => true };
});

vi.mock("@/app/api/auth/login/route", () => ({ SESSION_COOKIE: "abys_session" }));

vi.mock("@/lib/ai/provider", () => ({
  getActiveProvider: async () => ({
    id: "test-provider",
    generateBriefing: mocks.generateBriefing,
    analyzeDecisionCases: mocks.analyzeDecisionCases,
  }),
}));

// NDJSON akışı yerine işi hemen çalıştırıp JSON döner (test kolaylığı).
vi.mock("@/lib/ai/stream-route", () => ({
  streamedJsonResponse: async (work: () => Promise<unknown>) => {
    try {
      return Response.json(await work());
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Bilinmeyen hata." },
        { status: 502 }
      );
    }
  },
}));

vi.mock("@/lib/db/repos/decisions", () => ({
  insertCases: mocks.insertCases,
  listCasesForOrg: async () => [],
  buildServerMemory: async () => "sunucu hafızası",
}));

vi.mock("@/lib/db/repos/model-runs", () => ({ logModelRun: mocks.logModelRun }));

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({ query: async () => ({ rows: [] }) }),
  migrate: async () => {},
}));

const { POST: analyzePOST } = await import("../src/app/api/analyze/route");
const { POST: decisionCasesPOST } = await import("../src/app/api/decision-cases/route");

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function errorOf(res: Response): Promise<string> {
  const body = (await res.json()) as { error?: string };
  return body.error ?? "";
}

const briefings = { status: "ok", problem: "problem", action: "aksiyon" };

const oneCase = {
  categoryId: "operational",
  categoryLabel: "Operasyonel Risk",
  severity: "warning" as const,
  title: "Test vakası",
  businessImpact: "Etki",
  confidence: 50,
  confidenceRationale: "gerekçe",
  evidence: [],
  assumptions: [],
  historicalComparison: "Geçmiş veri yok.",
  counterfactual: { narrative: "", projectedImpact: "", timeHorizon: "" },
  options: [],
  recommendedOptionRank: 1,
};

beforeEach(() => {
  mocks.generateBriefing.mockReset().mockResolvedValue(briefings);
  mocks.analyzeDecisionCases.mockReset().mockResolvedValue([oneCase]);
  mocks.insertCases.mockReset().mockResolvedValue([]);
  mocks.logModelRun.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/analyze — girdi doğrulaması", () => {
  it("geçersiz JSON -> 400", async () => {
    const res = await analyzePOST(post("/api/analyze", "{bu bir json değil"));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toContain("Geçersiz istek gövdesi");
  });

  it.each([
    ["scenario", { roleId: "ceo", scenario: 42 }],
    ["roleId", { roleId: 42, scenario: "Gelir düştü" }],
  ])("yanlış tipli %s -> 400", async (_field, body) => {
    const res = await analyzePOST(post("/api/analyze", body));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/Senaryo|rol/i);
  });

  it.each([
    ["boş", ""],
    ["yalnızca boşluk", "   \n\t "],
  ])("boş senaryo (%s) -> 400", async (_label, scenario) => {
    const res = await analyzePOST(post("/api/analyze", { roleId: "ceo", scenario }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toContain("Senaryo metni boş olamaz");
  });

  it("eksik senaryo -> 400", async () => {
    const res = await analyzePOST(post("/api/analyze", { roleId: "ceo" }));
    expect(res.status).toBe(400);
  });

  it("tanımsız rol -> 400", async () => {
    const res = await analyzePOST(post("/api/analyze", { roleId: "hacker", scenario: "Gelir düştü" }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toContain("Geçersiz rol");
  });

  it("4000 karakter sınırı korunur: 4001 -> 400, 4000 -> geçer", async () => {
    const tooLong = await analyzePOST(
      post("/api/analyze", { roleId: "ceo", scenario: "x".repeat(4001) })
    );
    expect(tooLong.status).toBe(400);
    expect(await errorOf(tooLong)).toContain("4000");

    const atLimit = await analyzePOST(
      post("/api/analyze", { roleId: "ceo", scenario: "x".repeat(4000) })
    );
    expect(atLimit.status).toBe(200);
  });

  it("geçerli gövde doğrulamayı geçer; metin trim edilir, org_id yok sayılır", async () => {
    const res = await analyzePOST(
      post("/api/analyze", {
        roleId: "ceo",
        scenario: "  Gelir %8 düştü  ",
        org_id: "saldirgan-org",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(briefings);
    expect(mocks.generateBriefing).toHaveBeenCalledWith({
      roleLabel: "CEO",
      roleFocus: expect.any(String),
      scenario: "Gelir %8 düştü",
    });
  });

  it("doğrulamayı geçen gövdede downstream hata 400 değil 502 olur", async () => {
    mocks.generateBriefing.mockRejectedValueOnce(new Error("model kapalı"));
    const res = await analyzePOST(
      post("/api/analyze", { roleId: "ceo", scenario: "Geçerli senaryo" })
    );
    expect(res.status).toBe(502);
    expect(await errorOf(res)).toContain("model kapalı");
  });
});

describe("POST /api/decision-cases — girdi doğrulaması", () => {
  it("geçersiz JSON -> 400", async () => {
    const res = await decisionCasesPOST(post("/api/decision-cases", "[] bozuk"));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toContain("Geçersiz istek gövdesi");
  });

  it.each([
    ["data", { data: 123, sectorId: "aviation" }, /Operasyonel veri/i],
    ["constraints", { data: "geçerli veri", constraints: 7 }, /Kısıtlar/i],
    ["decisionMemory", { data: "geçerli veri", decisionMemory: {} }, /Karar hafızası/i],
  ])("yanlış tipli %s -> 400", async (_field, body, pattern) => {
    const res = await decisionCasesPOST(post("/api/decision-cases", body));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(pattern);
  });

  it.each([
    ["boş", ""],
    ["yalnızca boşluk", "  \n "],
  ])("boş operasyonel veri (%s) -> 400", async (_label, data) => {
    const res = await decisionCasesPOST(post("/api/decision-cases", { data }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toContain("Operasyonel veri boş olamaz");
  });

  it("12000 karakter sınırı korunur: 12001 -> 400, 12000 -> geçer", async () => {
    const tooLong = await decisionCasesPOST(post("/api/decision-cases", { data: "x".repeat(12001) }));
    expect(tooLong.status).toBe(400);
    expect(await errorOf(tooLong)).toContain("12000");

    const atLimit = await decisionCasesPOST(post("/api/decision-cases", { data: "x".repeat(12000) }));
    expect(atLimit.status).toBe(200);
  });

  it("geçerli gövde doğrulamayı geçer; varsayılan kısıt korunur, org_id yok sayılır", async () => {
    const res = await decisionCasesPOST(
      post("/api/decision-cases", {
        data: "  Turnaround 52 dk  ",
        constraints: "   ",
        org_id: "saldirgan-org",
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.analyzeDecisionCases).toHaveBeenCalledWith(
      expect.objectContaining({
        data: "Turnaround 52 dk",
        constraints:
          "Kısıt bildirilmedi — seçenekleri genel operasyonel makullük içinde değerlendir.",
      })
    );
    // Kurum kimliği gövdeden değil oturumdan gelir.
    expect(mocks.insertCases).toHaveBeenCalledWith(
      "org-from-session",
      "aviation",
      expect.any(Array)
    );
    expect(mocks.insertCases).not.toHaveBeenCalledWith(
      "saldirgan-org",
      expect.anything(),
      expect.anything()
    );
  });

  it("oturum varsa istemci decisionMemory'si yok sayılır", async () => {
    await decisionCasesPOST(
      post("/api/decision-cases", { data: "geçerli veri", decisionMemory: "istemci hafızası" })
    );
    expect(mocks.analyzeDecisionCases).toHaveBeenCalledWith(
      expect.objectContaining({ decisionMemory: "sunucu hafızası" })
    );
  });

  it("doğrulamayı geçen gövdede downstream hata 400 değil 502 olur", async () => {
    mocks.analyzeDecisionCases.mockRejectedValueOnce(new Error("model kapalı"));
    const res = await decisionCasesPOST(post("/api/decision-cases", { data: "geçerli veri" }));
    expect(res.status).toBe(502);
    expect(await errorOf(res)).toContain("model kapalı");
  });
});
