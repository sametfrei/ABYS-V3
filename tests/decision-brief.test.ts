import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-brief-test-${process.pid}-${randomUUID()}`
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
const { GET } = await import("../src/app/api/decision-cases/[id]/intelligence/route");
const { buildDecisionBrief } = await import("../src/lib/decision-brief");

const BASE_CASE = {
  title: "Nakit akışı sıkışması",
  severity: "critical",
  confidence: 80,
  businessImpact: "3 ayda 1,2M TL likidite riski",
  confidenceRationale: "İki bağımsız kaynak aynı eğilimi gösteriyor",
  evidence: [{ fact: "Tahsilat süresi 48 günden 63 güne çıktı", reliability: "high" }],
  assumptions: [],
  options: [
    { label: "Tahsilat kampanyası", description: "Vadesi geçen alacaklara öncelik", projection: "30 günde 400K TL" },
    { label: "Kredi limiti", description: "Kısa vadeli limit artışı", projection: "600K TL" },
  ],
  recommendedOptionRank: 1,
};

describe("Karar brifingi motoru", () => {
  it("kanıtları kaynak ve güvenilirliğe göre birleştirir", () => {
    const brief = buildDecisionBrief({
      case: BASE_CASE,
      caseSignals: [{ severity: "critical", title: "Tahsilat riski" }],
      contextSignals: [{ severity: "high", title: "Kurum geneli risk" }],
      forecast: { label: "Nakit", model: "linear-trend", evidence: "medium", p10: 100, p50: 120, p90: 150, horizon: 1, unit: "bin TL" },
      anomalies: [{ score: 4.2, direction: "below", timestamp: "2026-01-01T00:00:00Z" }],
      causal: [{ fromLabel: "Tahsilat süresi", toLabel: "Nakit", relationStatus: "observed_correlation", confidence: 60 }],
      outcomes: [{ result: "improved", lesson: "Erken arama işe yaradı" }],
    });
    const sources = brief.evidence.map((e) => e.source);
    expect(sources).toContain("vaka");
    expect(sources).toContain("sinyal");
    expect(sources).toContain("tahmin");
    expect(sources).toContain("anomali");
    expect(sources).toContain("nedensel");
    expect(sources).toContain("sonuç");
    const correlationEvidence = brief.evidence.find((e) => e.source === "nedensel");
    expect(correlationEvidence?.reliability).toBe("low");
    expect(correlationEvidence?.summary).toContain("gözlemlenen korelasyon");
    expect(correlationEvidence?.summary).toContain("nedensel sonuç desteklenmiyor");
    expect(brief.context.map((e) => e.source)).toEqual(["bağlam"]);
    expect(brief.context[0].summary).toContain("Kurum geneli risk");
    expect(brief.context[0].summary).toContain("vaka kanıtı sayılmadı");
    expect(brief.whyItMatters).toContain("1,2M");
    expect(brief.whatNext).toContain("100–150");
    expect(brief.recommendation?.label).toBe("Tahsilat kampanyası");
    expect(brief.confidence).toBeGreaterThan(50);
  });

  it("eksik kaynaklarda güven düşer ve sınırlar açıkça yazılır", () => {
    const sparse = buildDecisionBrief({
      case: { ...BASE_CASE, evidence: [] },
      caseSignals: [],
      contextSignals: [],
      forecast: null,
      anomalies: [],
      causal: [],
      outcomes: [],
    });
    const rich = buildDecisionBrief({
      case: BASE_CASE,
      caseSignals: [{ severity: "critical", title: "S" }],
      contextSignals: [],
      forecast: { label: "Nakit", model: "ses", evidence: "high", p10: 1, p50: 2, p90: 3, horizon: 1, unit: "TL" },
      anomalies: [{ score: 5, direction: "above", timestamp: null }],
      causal: [
        {
          fromLabel: "A",
          toLabel: "B",
          relationStatus: "data_confirmed",
          confidence: 90,
          method: "randomized_controlled_trial",
          sampleSize: 240,
          dataQuality: "high",
          uncertainty: "low",
        },
      ],
      outcomes: [{ result: "improved", lesson: null }],
    });
    expect(sparse.confidence).toBeLessThan(rich.confidence);
    expect(sparse.caveats.some((c) => c.includes("tahmin"))).toBe(true);
    expect(sparse.caveats.some((c) => c.includes("nedensel"))).toBe(true);
    expect(sparse.whatNext).toContain("yeterli");
  });

  it("öneri yoksa null döner, uydurma öneri üretmez", () => {
    const brief = buildDecisionBrief({
      case: { ...BASE_CASE, options: [] },
      caseSignals: [],
      contextSignals: [],
      forecast: null,
      anomalies: [],
      causal: [],
      outcomes: [],
    });
    expect(brief.recommendation).toBeNull();
  });

  it("güçlü görünen korelasyonu yüksek kanıt veya nedensel sonuç olarak sunmaz", () => {
    const brief = buildDecisionBrief({
      case: BASE_CASE,
      caseSignals: [],
      contextSignals: [],
      forecast: null,
      anomalies: [],
      causal: [
        {
          fromLabel: "Kampanya",
          toLabel: "Satış",
          relationStatus: "observed_correlation",
          confidence: 99,
          method: "randomized_controlled_trial",
          sampleSize: 5000,
          dataQuality: "high",
          uncertainty: "low",
        },
      ],
      outcomes: [],
    });
    const causalEvidence = brief.evidence.find((e) => e.source === "nedensel");
    expect(causalEvidence?.reliability).toBe("low");
    expect(causalEvidence?.summary).toContain("kanıt düşük");
    expect(causalEvidence?.summary).toContain("nedensel sonuç desteklenmiyor");
    expect(brief.caveats.some((c) => c.includes("korelasyonlar nedensel sonuç olarak sunulmadı"))).toBe(true);
  });
});

const ORG_A = "org-br-a";
const ORG_B = "org-br-b";
const CASE_ID = "case-br-1";
const OTHER_CASE_ID = "case-br-2";

describe("GET /api/decision-cases/[id]/intelligence", () => {
  let ceoA: string;
  let guestA: string;
  let ceoB: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A"],
      [ORG_B, "B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [id, name]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, role] of [
      ["br-ceo-a", ORG_A, "ceo"],
      ["br-guest-a", ORG_A, "guest"],
      ["br-ceo-b", ORG_B, "ceo"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@br.test`, id, role, pw]
      );
    }

    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ($1, $2, 'other', 'risk', 'critical', 'open', $3, 80, $4::jsonb)`,
      [
        CASE_ID,
        ORG_A,
        BASE_CASE.title,
        JSON.stringify({ ...BASE_CASE, metricLabel: "Haftalık gelir" }),
      ]
    );
    await db.query(
      `INSERT INTO signals (id, org_id, sector_id, category_id, severity, title, payload)
       VALUES
         ('sig-br', $1, 'other', 'risk', 'critical', 'Tahsilat riski', '{}'::jsonb),
         ('sig-br-other', $1, 'other', 'risk', 'high', 'Başka vakanın sinyali', '{}'::jsonb),
         ('sig-br-context', $1, 'other', 'risk', 'high', 'Kurum geneli bağlam', '{}'::jsonb)`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, status, title, confidence, payload)
       VALUES ($1, $2, 'other', 'risk', 'high', 'decided', 'Başka vaka', 70, '{}'::jsonb)`,
      [OTHER_CASE_ID, ORG_A]
    );
    await db.query(
      `INSERT INTO decision_case_signals
         (id, org_id, case_id, signal_id, link_reason, linked_by_id, linked_by_name)
       VALUES
         ('link-br', $1, $2, 'sig-br', 'Aynı tahsilat gecikmesi', 'ceo-a', 'CEO A'),
         ('link-br-other', $1, $3, 'sig-br-other', 'Başka vaka bağı', 'ceo-a', 'CEO A')`,
      [ORG_A, CASE_ID, OTHER_CASE_ID]
    );
    await db.query(
      `INSERT INTO causal_links (id, org_id, case_id, from_label, to_label, relation_status, confidence, created_by)
       VALUES ('cl-br', $1, $2, 'Tahsilat süresi', 'Nakit', 'observed_correlation', 60, 'ceo')`,
      [ORG_A, CASE_ID]
    );
    await db.query(
      `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload)
       VALUES ('dec-br', $1, $2, 'other', 'accepted', 'ceo', '{}'::jsonb)`,
      [ORG_A, CASE_ID]
    );
    await db.query(
      `INSERT INTO outcomes (id, org_id, decision_id, result, note, lesson, recorded_by)
       VALUES ('out-br', $1, 'dec-br', 'improved', 'not', 'Erken arama', 'ceo')`,
      [ORG_A]
    );
    await db.query(
      `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload)
       VALUES ('dec-br-other', $1, $2, 'other', 'accepted', 'ceo', '{}'::jsonb)`,
      [ORG_A, OTHER_CASE_ID]
    );
    await db.query(
      `INSERT INTO outcomes (id, org_id, decision_id, result, note, lesson, recorded_by)
       VALUES ('out-br-other', $1, 'dec-br-other', 'worsened', 'not', 'Başka vakanın sonucu', 'ceo')`,
      [ORG_A]
    );

    // KPI serisi (tahmin için 8 nokta)
    const dsId = "ds-br";
    await db.query(
      `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
       VALUES ($1, $2, 'other', 'test', 'raw', 'tester')`,
      [dsId, ORG_A]
    );
    for (let i = 0; i < 8; i++) {
      await db.query(
        `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
         VALUES ($1, $2, $3, 'Haftalık gelir', $4, $5)`,
        [`kv-br-${i}`, ORG_A, dsId, String(100 + i * 10), `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`]
      );
    }

    ceoA = await createSession("br-ceo-a", ORG_A);
    guestA = await createSession("br-guest-a", ORG_A);
    ceoB = await createSession("br-ceo-b", ORG_B);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function req() {
    return GET(new Request("http://localhost"), { params: Promise.resolve({ id: CASE_ID }) });
  }

  it("oturum yoksa 401, izin yoksa 403, başka org 404", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await req()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await req()).status).toBe(403);
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoB);
    expect((await req()).status).toBe(404);
  });

  it("çok kaynaklı brifing döner ve tahmin kullanılır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await req();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      brief: {
        headline: string;
        evidence: { source: string; summary: string }[];
        context: { source: string; summary: string }[];
        recommendation: { label: string } | null;
        confidence: number;
      };
      sources: {
        forecastUsed: boolean;
        metricLabel: string | null;
        anomalyCount: number;
        caseSignalCount: number;
        outcomeCount: number;
        caseSignalScope: string;
        openSignalScope: string;
        outcomeScope: string;
      };
      provenance: { engine: string };
    };
    expect(body.sources.forecastUsed).toBe(true);
    expect(body.sources.metricLabel).toBe("Haftalık gelir");
    expect(body.brief.evidence.some((e) => e.source === "tahmin")).toBe(true);
    const caseSignalEvidence = body.brief.evidence.find((e) => e.source === "sinyal");
    expect(caseSignalEvidence?.summary).toContain("Tahsilat riski");
    expect(caseSignalEvidence?.summary).not.toContain("Başka vakanın sinyali");
    expect(caseSignalEvidence?.summary).not.toContain("Kurum geneli bağlam");
    expect(body.brief.evidence.some((e) => e.source === "bağlam" || e.summary.includes("Başka vakanın"))).toBe(false);
    expect(body.brief.context.some((e) => e.summary.includes("Kurum geneli bağlam"))).toBe(true);
    expect(body.brief.context.some((e) => e.summary.includes("Tahsilat riski"))).toBe(false);
    expect(body.brief.context.some((e) => e.summary.includes("Başka vakanın sinyali"))).toBe(false);
    expect(body.sources.caseSignalCount).toBe(1);
    expect(body.sources.outcomeCount).toBe(1);
    expect(body.sources.caseSignalScope).toBe("case");
    expect(body.sources.openSignalScope).toBe("organization");
    expect(body.sources.outcomeScope).toBe("case");
    expect(body.brief.recommendation?.label).toBe("Tahsilat kampanyası");
    expect(body.brief.confidence).toBeGreaterThan(50);
    expect(body.provenance.engine).toContain("decision-brief.ts");
  });
});
