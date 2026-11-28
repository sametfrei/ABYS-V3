import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-causal-links-${process.pid}-${randomUUID()}`
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
const { GET: listCausal, POST: createCausal } = await import("../src/app/api/causal/route");
const { GET: listCausalSuggestions } = await import("../src/app/api/causal/suggestions/route");
const { insertCases } = await import("../src/lib/db/repos/decisions");
const { assessCausalEvidence } = await import("../src/lib/causal-evidence");

const ORG = "org-causal-evidence";
const CASE_ID = "case-causal-evidence";

function makeCase() {
  return {
    categoryId: "risk",
    categoryLabel: "Risk",
    severity: "warning" as const,
    title: "Nedensel kanıt testi",
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

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Kök neden bağlantısı kanıt üst verisi", () => {
  let cookie: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      ORG,
      "Causal Org",
      "aviation",
    ]);
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["user-causal", ORG, "causal@test.local", "Test CEO", "ceo", hashPassword("mevcut-parola-123")]
    );
    cookie = await createSession("user-causal", ORG);
    const inserted = await insertCases(ORG, "aviation", [makeCase() as never]);
    await db.query("UPDATE decision_cases SET id = $1 WHERE id = $2", [
      CASE_ID,
      inserted[0].id,
    ]);
    nextHeaders.__setTestCookie(SESSION_COOKIE, cookie);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("gözlemsel aday uç noktası oturum ve vaka kapsamını zorunlu tutar", async () => {
    const missingCase = await listCausalSuggestions(new NextRequest("http://localhost/api/causal/suggestions"));
    expect(missingCase.status).toBe(400);
    const listed = await listCausalSuggestions(new NextRequest(`http://localhost/api/causal/suggestions?caseId=${CASE_ID}`));
    expect(listed.status).toBe(200);
    expect((await listed.json()).candidates).toEqual([]);
  });

  it("yöntem, örneklem, veri kalitesi ve belirsizliği kaydeder ve geri okur", async () => {
    const res = await createCausal(
      jsonRequest("/api/causal", {
        caseId: CASE_ID,
        fromLabel: "Teslim gecikmesi",
        toLabel: "Müşteri memnuniyeti",
        relationStatus: "data_confirmed",
        confidence: 78,
        method: "randomized_controlled_trial",
        sampleSize: 120,
        dataQuality: "high",
        uncertainty: "low",
      })
    );
    expect(res.status).toBe(200);

    const listed = (await (
      await listCausal(new NextRequest(`http://localhost/api/causal?caseId=${CASE_ID}`))
    ).json()) as {
      links: Array<{
        method: string | null;
        sampleSize: number | null;
        dataQuality: string | null;
        uncertainty: string | null;
        relationStatus: string;
        confidence: number;
      }>;
    };
    expect(listed.links).toHaveLength(1);
    const link = listed.links[0];
    expect(link).toMatchObject({
      method: "randomized_controlled_trial",
      sampleSize: 120,
      dataQuality: "high",
      uncertainty: "low",
    });

    const assessment = assessCausalEvidence({
      relationStatus: link.relationStatus,
      confidence: link.confidence,
      method: link.method,
      sampleSize: link.sampleSize,
      dataQuality: link.dataQuality,
      uncertainty: link.uncertainty,
    });
    expect(assessment.level).toBe("high");
    expect(assessment.causalConclusionSupported).toBe(true);
  });

  it("geçersiz yöntem ve aralık dışı güven reddedilir", async () => {
    const badMethod = await createCausal(
      jsonRequest("/api/causal", {
        caseId: CASE_ID,
        fromLabel: "A",
        toLabel: "B",
        confidence: 50,
        method: "vibes",
      })
    );
    expect(badMethod.status).toBe(400);

    const badConfidence = await createCausal(
      jsonRequest("/api/causal", {
        caseId: CASE_ID,
        fromLabel: "A",
        toLabel: "B",
        confidence: 150,
      })
    );
    expect(badConfidence.status).toBe(400);

    const badQuality = await createCausal(
      jsonRequest("/api/causal", {
        caseId: CASE_ID,
        fromLabel: "A",
        toLabel: "B",
        confidence: 50,
        dataQuality: "excellent",
      })
    );
    expect(badQuality.status).toBe(400);
  });

  it("üst veri verilmezse bağlantı temkinli kalır", async () => {
    const res = await createCausal(
      jsonRequest("/api/causal", {
        caseId: CASE_ID,
        fromLabel: "Stok fazlası",
        toLabel: "Nakit akışı",
        confidence: 40,
      })
    );
    expect(res.status).toBe(200);
    const listed = (await (
      await listCausal(new NextRequest(`http://localhost/api/causal?caseId=${CASE_ID}`))
    ).json()) as {
      links: Array<{ fromLabel: string; method: string | null; sampleSize: number | null }>;
    };
    const link = listed.links.find((item) => item.fromLabel === "Stok fazlası");
    expect(link?.method).toBeNull();
    expect(link?.sampleSize).toBeNull();
  });
});
