import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * bkz. tests/api-auth.test.ts için aynı gerekçe. Kendi geçici dizinini
 * kullanır ki dev sunucunun kilidiyle veya diğer test dosyalarıyla
 * çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-bitrix24-api-test-${process.pid}-${randomUUID()}`
);

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
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET: statusGET } = await import("../src/app/api/integrations/bitrix24/status/route");
const { POST: testPOST } = await import("../src/app/api/integrations/bitrix24/test/route");
const { POST: syncPOST } = await import("../src/app/api/integrations/bitrix24/sync/route");
const { POST: eventsPOST } = await import("../src/app/api/integrations/bitrix24/events/route");
const { POST: resetPOST } = await import("../src/app/api/demo/tais/reset/route");
const { TAIS_ORG_CODE } = await import("../src/lib/demo/tais/seed");

function req(url: string, method: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("Bitrix24 entegrasyon uçları", () => {
  const orgA = randomBytes(8).toString("hex");
  const taisOrg = randomBytes(8).toString("hex");
  let dataAdminSession: string;
  let ceoSession: string;
  let auditorSessionOrgA: string;
  let taisCeoSession: string;
  let taisAuditorSession: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgA,
      "Org A",
      "aviation",
    ]);
    await db.query("INSERT INTO organizations (id, name, sector_id, code) VALUES ($1, $2, $3, $4)", [
      taisOrg,
      "TAIS Test",
      "other",
      TAIS_ORG_CODE,
    ]);

    const users: [string, string, string, string][] = [
      ["dataAdminUser", orgA, "veri@org-a.test", "data_admin"],
      ["ceoUserOrgA", orgA, "ceo@org-a.test", "ceo"],
      ["auditorUserOrgA", orgA, "denetci@org-a.test", "auditor"],
      ["ceoUserTais", taisOrg, "ceo@tais-test.test", "ceo"],
      ["auditorUserTais", taisOrg, "denetci@tais-test.test", "auditor"],
    ];
    for (const [id, orgId, email, role] of users) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, orgId, email, role, role, "x:x"]
      );
    }

    dataAdminSession = await createSession("dataAdminUser", orgA);
    ceoSession = await createSession("ceoUserOrgA", orgA);
    auditorSessionOrgA = await createSession("auditorUserOrgA", orgA);
    taisCeoSession = await createSession("ceoUserTais", taisOrg);
    taisAuditorSession = await createSession("auditorUserTais", taisOrg);
  });

  afterAll(async () => {
    await getDb().close();
  });

  describe("GET /api/integrations/bitrix24/status", () => {
    it("oturum yokken 401", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await statusGET();
      expect(res.status).toBe(401);
    });

    it("oturum varken 200 ve hassas alan içermiyor", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await statusGET();
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        ["configured", "connected", "demoRecordCounts", "importedRecordCounts", "lastError", "lastSyncAt", "mode"].sort()
      );
      const serialized = JSON.stringify(body).toLowerCase();
      expect(serialized).not.toContain("token");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("baseurl");
    });
  });

  describe("POST /api/integrations/bitrix24/test", () => {
    it("oturum yokken 401", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await testPOST();
      expect(res.status).toBe(401);
    });

    it("ceo rolünde ingest_data izni yok — 403", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await testPOST();
      expect(res.status).toBe(403);
    });

    it("demo mod'da (varsayılan) sahte başarı DÖNMEZ", async () => {
      delete process.env.BITRIX24_MODE;
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await testPOST();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; reason?: string };
      expect(body.ok).toBe(false);
      expect(body.reason).toBe("credentials_missing");
    });
  });

  describe("POST /api/integrations/bitrix24/sync", () => {
    it("oturum yokken 401", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await syncPOST();
      expect(res.status).toBe(401);
    });

    it("demo modda sentetik veriyi mapper zincirinden geçirip içe alır", async () => {
      delete process.env.BITRIX24_MODE;
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await syncPOST();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { mode: string; status: string; importedCounts: Record<string, number> };
      expect(body.mode).toBe("demo");
      expect(body.status).toBe("ok");
      expect(body.importedCounts.companies).toBeGreaterThan(0);

      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const statusRes = await statusGET();
      const statusBody = (await statusRes.json()) as { lastSyncAt: string | null; connected: boolean };
      expect(statusBody.lastSyncAt).not.toBeNull();
       expect(statusBody.connected).toBe(false);
    });
  });

  describe("POST /api/integrations/bitrix24/events", () => {
    beforeAll(() => {
      process.env.BITRIX24_WEBHOOK_TOKEN = "test-webhook-token";
    });

    it("orgId eksikken 400", async () => {
      const res = await eventsPOST(req("/api/integrations/bitrix24/events", "POST"));
      expect(res.status).toBe(400);
    });

    it("geçersiz application_token ile 401", async () => {
      const res = await eventsPOST(
        req(`/api/integrations/bitrix24/events?orgId=${orgA}`, "POST", undefined, {
          event: "ONCRMDEALUPDATE",
          data: { FIELDS: { ID: "1" } },
          auth: { application_token: "yanlis" },
        })
      );
      expect(res.status).toBe(401);
    });

    it("bilinmeyen kurum için 404", async () => {
      const res = await eventsPOST(
        req(`/api/integrations/bitrix24/events?orgId=bilinmeyen`, "POST", undefined, {
          event: "ONCRMDEALUPDATE",
          data: { FIELDS: { ID: "1" } },
          auth: { application_token: "test-webhook-token" },
        })
      );
      expect(res.status).toBe(404);
    });

    it("geçerli istek kabul edilir, aynı olay tekrar gönderilince idempotent döner", async () => {
      const body = {
        event: "ONCRMDEALUPDATE",
        data: { FIELDS: { ID: "42" } },
        ts: "1700000000",
        auth: { application_token: "test-webhook-token" },
      };
      const first = await eventsPOST(req(`/api/integrations/bitrix24/events?orgId=${orgA}`, "POST", undefined, body));
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { ok: boolean; duplicate?: boolean };
      expect(firstBody.ok).toBe(true);
      expect(firstBody.duplicate).toBeUndefined();

      const second = await eventsPOST(req(`/api/integrations/bitrix24/events?orgId=${orgA}`, "POST", undefined, body));
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { ok: boolean; duplicate?: boolean };
      expect(secondBody.duplicate).toBe(true);
    });
  });

  describe("POST /api/demo/tais/reset", () => {
    it("oturum yokken 401", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
      const res = await resetPOST();
      expect(res.status).toBe(401);
    });

    it("TAIS dışı kurumda 403", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await resetPOST();
      expect(res.status).toBe(403);
    });

    it("TAIS kurumunda ama record_decision izni olmayan rolde (auditor) 403", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, taisAuditorSession);
      const res = await resetPOST();
      expect(res.status).toBe(403);
    });

    it("TAIS kurumunda yetkili rolde (ceo) sıfırlama çalışır", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, taisCeoSession);
      const res = await resetPOST();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; orgId: string };
      expect(body.ok).toBe(true);
      expect(body.orgId).toBe(taisOrg);
    }, 30_000);
  });

  describe("org izolasyonu: senkron kaydı diğer kuruma sızmaz", () => {
    it("orgA senkron sonucu auditorSessionOrgA'nın statüsünde görünür, farklı org'da görünmez", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, auditorSessionOrgA);
      const res = await statusGET();
      expect(res.status).toBe(200);
      const body = (await res.json()) as { lastSyncAt: string | null };
      expect(body.lastSyncAt).not.toBeNull();

      nextHeaders.__setTestCookie(SESSION_COOKIE, taisAuditorSession);
      const taisRes = await statusGET();
      const taisBody = (await taisRes.json()) as { lastSyncAt: string | null };
      expect(taisBody.lastSyncAt).toBeNull();
    });
  });
});
