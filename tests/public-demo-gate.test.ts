import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * bkz. tests/api-auth.test.ts için aynı gerekçe. Kendi geçici dizinini
 * kullanır ki dev sunucunun kilidiyle veya diğer test dosyalarıyla
 * çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-public-demo-gate-test-${process.pid}-${randomUUID()}`
);
// Sağlayıcı çağrıları gerçek Ollama/Gemini gerektirmesin — kurallarla
// yapısal çıktı üreten deterministik sağlayıcı (master plan md.4).
process.env.AI_POLICY = "DEMO_DETERMINISTIC";

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
const { resetRateLimits } = await import("../src/lib/rate-limit");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { POST: analyzePOST } = await import("../src/app/api/analyze/route");
const { POST: briefingPOST } = await import("../src/app/api/briefing/route");
const { POST: ingestPOST } = await import("../src/app/api/ingest/route");
const { POST: assessRiskPOST } = await import("../src/app/api/assess-risk/route");
const { POST: decisionCasesPOST } = await import("../src/app/api/decision-cases/route");

function jsonRequest(url: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function readNdjsonType(res: Response): Promise<string | null> {
  const text = await res.text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const msg = JSON.parse(trimmed) as { type?: string };
    if (msg.type === "result" || msg.type === "error") return msg.type ?? null;
  }
  return null;
}

const ANALYZE_BODY = { roleId: "ceo", scenario: "Bu çeyrek gelir arttı ama nakit akışı daralıyor." };
const BRIEFING_BODY = { companyName: "Test A.Ş.", sectorId: "aviation", roleId: "ceo" };
const INGEST_BODY = { rawText: "Etiket: 42\nDiğer: 7", sectorId: "aviation" };
const ASSESS_RISK_BODY = { sectorId: "aviation", data: "Gecikme oranı %12, kritik arıza bildirildi." };
const DECISION_CASES_BODY = { sectorId: "aviation", data: "Gecikme oranı %12, kritik arıza bildirildi." };

describe("oturumsuz AI/veri uçları — ABYS_PUBLIC_DEMO kapısı", () => {
  const orgA = randomBytes(8).toString("hex");
  let ceoSession: string;
  let analystSession: string;
  let auditorSession: string;
  let dataAdminSession: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgA,
      "Org A",
      "aviation",
    ]);
    const users: [string, string, string][] = [
      ["ceoUser", "ceo@org-a.test", "ceo"],
      ["analystUser", "analist@org-a.test", "analyst"],
      ["auditorUser", "denetci@org-a.test", "auditor"],
      ["dataAdminUser", "veri@org-a.test", "data_admin"],
    ];
    for (const [id, email, role] of users) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, orgA, email, role, role, "x:x"]
      );
    }
    ceoSession = await createSession("ceoUser", orgA);
    analystSession = await createSession("analystUser", orgA);
    auditorSession = await createSession("auditorUser", orgA);
    dataAdminSession = await createSession("dataAdminUser", orgA);
  });

  afterAll(async () => {
    delete process.env.ABYS_PUBLIC_DEMO;
    delete process.env.AI_POLICY;
    await getDb().close();
  });

  afterEach(() => {
    delete process.env.ABYS_PUBLIC_DEMO;
    resetRateLimits();
  });

  describe("oturum yok, ABYS_PUBLIC_DEMO ayarlı değil (varsayılan) → 401", () => {
    it("POST /api/analyze", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await analyzePOST(jsonRequest("/api/analyze", ANALYZE_BODY));
      expect(res.status).toBe(401);
    });

    it("POST /api/briefing", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await briefingPOST(jsonRequest("/api/briefing", BRIEFING_BODY));
      expect(res.status).toBe(401);
    });

    it("POST /api/ingest", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await ingestPOST(jsonRequest("/api/ingest", INGEST_BODY));
      expect(res.status).toBe(401);
    });

    it("POST /api/assess-risk", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await assessRiskPOST(jsonRequest("/api/assess-risk", ASSESS_RISK_BODY));
      expect(res.status).toBe(401);
    });

    it("POST /api/decision-cases", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await decisionCasesPOST(jsonRequest("/api/decision-cases", DECISION_CASES_BODY));
      expect(res.status).toBe(401);
    });
  });

  describe("oturum yok, ABYS_PUBLIC_DEMO=1 → prototip akışı geri açılır", () => {
    it("POST /api/analyze 200 döner", async () => {
      process.env.ABYS_PUBLIC_DEMO = "1";
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await analyzePOST(jsonRequest("/api/analyze", ANALYZE_BODY));
      expect(res.status).toBe(200);
    });

    it("POST /api/ingest sonucu NDJSON 'result' ile biter", async () => {
      process.env.ABYS_PUBLIC_DEMO = "1";
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await ingestPOST(jsonRequest("/api/ingest", INGEST_BODY));
      expect(res.status).toBe(200);
      expect(await readNdjsonType(res)).toBe("result");
    });

    it("POST /api/decision-cases sonucu NDJSON 'result' ile biter, kayıt kalıcılaşmaz (persisted:false)", async () => {
      process.env.ABYS_PUBLIC_DEMO = "1";
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await decisionCasesPOST(jsonRequest("/api/decision-cases", DECISION_CASES_BODY));
      expect(res.status).toBe(200);
      const text = await res.text();
      const resultLine = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((m) => m.type === "result");
      expect(resultLine?.data?.persisted).toBe(false);
    });
  });

  describe("oturum var ama izin yok → 403", () => {
    it("POST /api/ingest — analist rolünde ingest_data izni yok", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, analystSession);
      const res = await ingestPOST(jsonRequest("/api/ingest", INGEST_BODY, analystSession));
      expect(res.status).toBe(403);
    });

    it("POST /api/assess-risk — analist rolünde ingest_data izni yok", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, analystSession);
      const res = await assessRiskPOST(jsonRequest("/api/assess-risk", ASSESS_RISK_BODY, analystSession));
      expect(res.status).toBe(403);
    });

    it("POST /api/decision-cases — denetçi rolünde run_analysis izni yok", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, auditorSession);
      const res = await decisionCasesPOST(
        jsonRequest("/api/decision-cases", DECISION_CASES_BODY, auditorSession)
      );
      expect(res.status).toBe(403);
    });
  });

  describe("oturum var, izin var → normal akış çalışır", () => {
    it("POST /api/analyze — ceo rolünde 200", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await analyzePOST(jsonRequest("/api/analyze", ANALYZE_BODY, ceoSession));
      expect(res.status).toBe(200);
    });

    it("POST /api/briefing — ceo rolünde 200", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await briefingPOST(jsonRequest("/api/briefing", BRIEFING_BODY, ceoSession));
      expect(res.status).toBe(200);
    });

    it("POST /api/ingest — veri yöneticisi rolünde 'result' ile biter", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await ingestPOST(jsonRequest("/api/ingest", INGEST_BODY, dataAdminSession));
      expect(res.status).toBe(200);
      expect(await readNdjsonType(res)).toBe("result");
    });

    it("POST /api/decision-cases — analist rolünde kayıt kuruma kalıcılaşır (persisted:true)", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, analystSession);
      const res = await decisionCasesPOST(
        jsonRequest("/api/decision-cases", DECISION_CASES_BODY, analystSession)
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      const resultLine = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((m) => m.type === "result");
      expect(resultLine?.data?.persisted).toBe(true);
    });
  });
});
