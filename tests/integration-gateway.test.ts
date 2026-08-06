import { createHash, randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * bkz. tests/tenant-isolation.test.ts için aynı gerekçe. Kendi geçici
 * dizinini kullanır ki dev sunucunun kilidiyle veya diğer test
 * dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-integration-gateway-test-${process.pid}-${randomUUID()}`
);

/**
 * /api/integration/advisors hem oturum hem API anahtarı kabul eder ve
 * her istekte next/headers'ın cookies()'ini çağırır; gerçek bir Next.js
 * istek bağlamı dışında çağrılırsa hata fırlatır. Testte oturum
 * kullanmasak da (yalnızca API anahtarı yolu test ediliyor) route'un
 * kendisi cookies() çağırdığından mock zorunlu.
 */
import { vi } from "vitest";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { migrate, getDb } = await import("../src/lib/db/client");
const { createApiKey, revokeApiKey } = await import("../src/lib/integrations/api-key");
const { resetRateLimits } = await import("../src/lib/rate-limit");
const { POST: eventsPOST } = await import("../src/app/api/integration/events/route");
const { GET: advisorsGET } = await import("../src/app/api/integration/advisors/route");

function eventsRequest(plainKey: string | undefined, body: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (plainKey) headers.authorization = `Bearer ${plainKey}`;
  return new NextRequest("http://localhost/api/integration/events", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function advisorsRequest(plainKey: string | undefined, query: string = "") {
  const headers: Record<string, string> = {};
  if (plainKey) headers.authorization = `Bearer ${plainKey}`;
  return new NextRequest(`http://localhost/api/integration/advisors${query}`, {
    method: "GET",
    headers,
  });
}

describe("Integration Gateway", () => {
  const orgA = randomBytes(8).toString("hex");
  const orgB = randomBytes(8).toString("hex");

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
  });

  afterAll(async () => {
    await getDb().close();
  });

  afterEach(() => {
    resetRateLimits();
  });

  describe("API anahtarı yaşam döngüsü", () => {
    it("düz metin yalnızca bir kez döner, DB'de sha256 özeti durur", async () => {
      const created = await createApiKey({
        orgId: orgA,
        name: "Yaşam döngüsü anahtarı",
        scopes: ["events:write"],
        createdBy: "test",
      });
      expect(created.plainKey.startsWith("abys_")).toBe(true);
      expect(created.prefix).toBe(created.plainKey.slice(0, 12));

      const r = await getDb().query<{ key_hash: string }>("SELECT key_hash FROM api_keys WHERE id = $1", [
        created.id,
      ]);
      const expectedHash = createHash("sha256").update(created.plainKey).digest("hex");
      expect(r.rows[0].key_hash).toBe(expectedHash);
      // DB'de düz metnin kendisi hiçbir kolonda saklanmıyor.
      expect(r.rows[0].key_hash).not.toBe(created.plainKey);
    });

    it("events:write kapsamı olmayan anahtar olay POST'undan 403 alır", async () => {
      const created = await createApiKey({
        orgId: orgA,
        name: "Yalnız okuma anahtarı",
        scopes: ["read:advisors"],
        createdBy: "test",
      });
      const res = await eventsPOST(
        eventsRequest(created.plainKey, { source: "portal", event_type: "lead.created" })
      );
      expect(res.status).toBe(403);
    });

    it("iptal edilen anahtar 401 alır", async () => {
      const created = await createApiKey({
        orgId: orgA,
        name: "İptal edilecek anahtar",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const ok = await revokeApiKey(orgA, created.id);
      expect(ok).toBe(true);

      const res = await eventsPOST(
        eventsRequest(created.plainKey, { source: "portal", event_type: "lead.created" })
      );
      expect(res.status).toBe(401);
    });

    it("geçersiz/eksik Authorization başlığı 401 alır", async () => {
      const res = await eventsPOST(eventsRequest(undefined, { source: "portal", event_type: "lead.created" }));
      expect(res.status).toBe(401);
    });
  });

  describe("Olay idempotency", () => {
    it("aynı (org, source, external id) ikinci gönderimde duplicate sayılır; farklı org'da aynı external id kabul edilir", async () => {
      const keyA = await createApiKey({
        orgId: orgA,
        name: "İdempotency anahtarı A",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const keyB = await createApiKey({
        orgId: orgB,
        name: "İdempotency anahtarı B",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const externalId = `ext-${randomUUID()}`;
      const body = {
        source: "portal",
        id: externalId,
        event_type: "lead.created",
        advisor_id: "advisor-idem",
        occurred_at: new Date().toISOString(),
      };

      const first = await eventsPOST(eventsRequest(keyA.plainKey, body));
      const firstJson = (await first.json()) as { accepted: number; duplicate: number };
      expect(firstJson.accepted).toBe(1);
      expect(firstJson.duplicate).toBe(0);

      const second = await eventsPOST(eventsRequest(keyA.plainKey, body));
      const secondJson = (await second.json()) as { accepted: number; duplicate: number };
      expect(secondJson.accepted).toBe(0);
      expect(secondJson.duplicate).toBe(1);

      const otherOrg = await eventsPOST(eventsRequest(keyB.plainKey, body));
      const otherOrgJson = (await otherOrg.json()) as { accepted: number; duplicate: number };
      expect(otherOrgJson.accepted).toBe(1);
      expect(otherOrgJson.duplicate).toBe(0);
    });
  });

  describe("Batch kısmi hata", () => {
    it("3 olaydan 1'i geçersizse diğer 2'si kabul edilir, rejectedDetail doğru index'i gösterir", async () => {
      const key = await createApiKey({
        orgId: orgA,
        name: "Batch anahtarı",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const body = {
        source: "portal",
        events: [
          { id: `batch-${randomUUID()}-0`, event_type: "lead.created", advisor_id: "advisor-batch" },
          { id: `batch-${randomUUID()}-1`, advisor_id: "advisor-batch" }, // event_type eksik → geçersiz
          { id: `batch-${randomUUID()}-2`, event_type: "call.completed", advisor_id: "advisor-batch" },
        ],
      };
      const res = await eventsPOST(eventsRequest(key.plainKey, body));
      const json = (await res.json()) as {
        accepted: number;
        rejected: number;
        rejectedDetail: { index: number; reason: string }[];
      };
      expect(json.accepted).toBe(2);
      expect(json.rejected).toBe(1);
      expect(json.rejectedDetail[0]?.index).toBe(1);
    });
  });

  describe("Zaman sınırları", () => {
    it("1 saatten fazla gelecekteki occurred_at reddedilir", async () => {
      const key = await createApiKey({
        orgId: orgA,
        name: "Zaman sınırı anahtarı (gelecek)",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const res = await eventsPOST(
        eventsRequest(key.plainKey, {
          source: "portal",
          event_type: "lead.created",
          advisor_id: "advisor-time",
          occurred_at: future,
        })
      );
      const json = (await res.json()) as { accepted: number; rejected: number };
      expect(json.accepted).toBe(0);
      expect(json.rejected).toBe(1);
    });

    it("2 yıldan eski occurred_at reddedilir", async () => {
      const key = await createApiKey({
        orgId: orgA,
        name: "Zaman sınırı anahtarı (geçmiş)",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const past = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
      const res = await eventsPOST(
        eventsRequest(key.plainKey, {
          source: "portal",
          event_type: "lead.created",
          advisor_id: "advisor-time",
          occurred_at: past,
        })
      );
      const json = (await res.json()) as { accepted: number; rejected: number };
      expect(json.accepted).toBe(0);
      expect(json.rejected).toBe(1);
    });
  });

  describe("Org izolasyonu", () => {
    it("orgA anahtarıyla gönderilen olaylar orgB'nin advisors çıktısında görünmez", async () => {
      const advisorRef = `advisor-iso-${randomUUID()}`;
      const keyA = await createApiKey({
        orgId: orgA,
        name: "İzolasyon anahtarı A",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const keyB = await createApiKey({
        orgId: orgB,
        name: "İzolasyon anahtarı B",
        scopes: ["events:write"],
        createdBy: "test",
      });
      const readKeyB = await createApiKey({
        orgId: orgB,
        name: "İzolasyon okuma anahtarı B",
        scopes: ["read:advisors"],
        createdBy: "test",
      });

      // Aynı danışman referansı hem orgA hem orgB'de kullanılıyor —
      // izolasyon org_id üzerinden sağlanmalı, actor_ref üzerinden değil.
      await eventsPOST(
        eventsRequest(keyA.plainKey, {
          source: "portal",
          id: `iso-a-${randomUUID()}`,
          event_type: "lead.created",
          advisor_id: advisorRef,
          occurred_at: new Date().toISOString(),
        })
      );
      await eventsPOST(
        eventsRequest(keyB.plainKey, {
          source: "portal",
          id: `iso-b-${randomUUID()}`,
          event_type: "call.completed",
          advisor_id: advisorRef,
          occurred_at: new Date().toISOString(),
        })
      );

      const res = await advisorsGET(advisorsRequest(readKeyB.plainKey, `?advisor=${advisorRef}`));
      const json = (await res.json()) as { advisors: { advisorRef: string; eventCount: number }[] };
      const entry = json.advisors.find((a) => a.advisorRef === advisorRef);
      expect(entry).toBeTruthy();
      // orgB'de yalnızca orgB'nin gönderdiği 1 olay olmalı; orgA'nın olayı sızmamalı.
      expect(entry?.eventCount).toBe(1);
    });
  });
});
