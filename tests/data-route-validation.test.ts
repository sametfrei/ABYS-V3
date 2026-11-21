import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * bkz. tests/api-auth.test.ts üstündeki açıklama.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-data-route-validation-test-${process.pid}-${randomUUID()}`
);

/**
 * Route'lar `next/headers` `cookies()` kullanır; gerçek Next.js istek
 * bağlamı dışında hata fırlatır. Sahte çerez deposu (api-auth deseni).
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

/**
 * Bu testler doğrulamayı dosya ayrıştırmasından ÖNCE tetikler; pdf-parse
 * gibi ağır bağımlılıkları yüklememek için extractText sahtelenir.
 */
vi.mock("@/lib/documents/extract", () => ({
  extractText: async () => ({ text: "test metni", sourceType: "txt" }),
}));

const nextHeaders = (await import("next/headers")) as unknown as {
  __setTestCookie: (name: string, value: string | undefined) => void;
};

const { migrate, getDb } = await import("../src/lib/db/client");
const { createSession } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET: auditGET } = await import("../src/app/api/audit/route");
const { POST: documentsPOST } = await import("../src/app/api/documents/route");
const { POST: uploadPOST } = await import("../src/app/api/documents/upload/route");
const { POST: ingestPOST } = await import("../src/app/api/ingest/route");
const { sectorIdSchema } = await import("../src/lib/data/route-schemas");

function getRequest(url: string, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${url}`, { method: "GET", headers });
}

function jsonRequest(url: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function uploadRequest(form: FormData, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new NextRequest("http://localhost/api/documents/upload", {
    method: "POST",
    headers,
    body: form,
  });
}

function uploadForm(params: { title?: string; allowedRoles?: unknown }) {
  const form = new FormData();
  form.set("file", new File(["merhaba dünya"], "test.txt", { type: "text/plain" }));
  if (params.title !== undefined) form.set("title", params.title);
  if (params.allowedRoles !== undefined) {
    form.set("allowedRoles", JSON.stringify(params.allowedRoles));
  }
  return form;
}

describe("veri yolu girdi doğrulaması", () => {
  const org = randomBytes(8).toString("hex");
  let ceoSession: string;
  let dataAdminSession: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      org,
      "Doğrulama Test Org",
      "aviation",
    ]);
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["ceoUser", org, "ceo@validation.test", "CEO", "ceo", "x:x"]
    );
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["dataAdminUser", org, "veri@validation.test", "Veri Yöneticisi", "data_admin", "x:x"]
    );
    ceoSession = await createSession("ceoUser", org);
    dataAdminSession = await createSession("dataAdminUser", org);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  describe("GET /api/audit — limit", () => {
    it.each(["abc", "0", "-5", "1.5", "501", "1e2"])(
      "geçersiz limit %s -> 400",
      async (limit) => {
        nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
        const res = await auditGET(getRequest(`/api/audit?limit=${encodeURIComponent(limit)}`));
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toContain("limit");
      }
    );

    it("geçerli limit kabul edilir ve olay listesi döner", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await auditGET(getRequest("/api/audit?limit=25"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { events?: unknown[] };
      expect(Array.isArray(body.events)).toBe(true);
    });

    it("limit verilmezse varsayılan 100 ile 200 döner", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await auditGET(getRequest("/api/audit"));
      expect(res.status).toBe(200);
    });

    it("hash zinciri alanlarını da döndürür", async () => {
      const { recordAuditEvent } = await import("../src/lib/db/repos/audit");
      await recordAuditEvent({
        orgId: org,
        actor: "Test CEO",
        type: "test_event",
        summary: "Hash alanı testi",
        detail: "detay",
      });
      nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
      const res = await auditGET(getRequest("/api/audit?limit=5"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        events: Array<{ type: string; entry_hash: string | null; prev_hash: string | null }>;
      };
      const event = body.events.find((item) => item.type === "test_event");
      expect(event).toBeDefined();
      expect(event?.entry_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(event?.prev_hash).not.toBeNull();
    });
  });

  describe("POST /api/documents/upload — başlık ve allowedRoles", () => {
    it("bilinmeyen rol -> 400", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await uploadPOST(
        uploadRequest(uploadForm({ title: "Geçerli başlık", allowedRoles: ["hacker"] }))
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("allowedRoles");
    });

    it("200 karakterden uzun başlık -> 400", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await uploadPOST(
        uploadRequest(uploadForm({ title: "x".repeat(201), allowedRoles: ["ceo"] }))
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("başlık");
    });

    it("boş allowedRoles dizisi -> 400 (belge görünmez hale gelmesin)", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await uploadPOST(
        uploadRequest(uploadForm({ title: "Boş roller", allowedRoles: [] }))
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("allowedRoles");
    });

    it("tanımlı rol ve sınırda başlık doğrulamayı geçer (dosya ayrıştırmasına ulaşır)", async () => {
      // Not: insertDocument gerçek DB'ye yazar; burada yalnızca doğrulamanın
      // geçtiğini görmek için 200 beklenir (extractText sahtelenmiştir).
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await uploadPOST(
        uploadRequest(uploadForm({ title: "y".repeat(200), allowedRoles: ["ceo", "auditor"] }))
      );
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/documents — allowedRoles", () => {
    it("boş allowedRoles dizisi -> 400", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await documentsPOST(
        jsonRequest(
          "/api/documents",
          { title: "Belge", text: "Metin", allowedRoles: [] },
          dataAdminSession
        )
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("allowedRoles");
    });

    it("bilinmeyen rol -> 400", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await documentsPOST(
        jsonRequest(
          "/api/documents",
          { title: "Belge", text: "Metin", allowedRoles: ["hacker"] },
          dataAdminSession
        )
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("allowedRoles");
    });
  });

  describe("POST /api/ingest — sectorId", () => {
    it("bilinmeyen sektör -> 400", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await ingestPOST(
        jsonRequest(
          "/api/ingest",
          { rawText: "Etiket: 42\nDeğer: 7", sectorId: "uzay" },
          dataAdminSession
        )
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("sektör");
    });

    it("boş/eksik sektör -> 400 (mevcut davranış)", async () => {
      nextHeaders.__setTestCookie(SESSION_COOKIE, dataAdminSession);
      const res = await ingestPOST(
        jsonRequest("/api/ingest", { rawText: "Etiket: 42" }, dataAdminSession)
      );
      expect(res.status).toBe(400);
    });

    it("şema yalnızca tanımlı sektörleri kabul eder", () => {
      expect(sectorIdSchema.safeParse("aviation").success).toBe(true);
      expect(sectorIdSchema.safeParse("").success).toBe(false);
      expect(sectorIdSchema.safeParse("uzay").success).toBe(false);
    });
  });
});
