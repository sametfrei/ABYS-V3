import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * client.ts DB_DIR'i modül üst seviyesinde okur. Kendi geçici dizinini
 * kullanır ki dev sunucunun .data/abys-db kilidiyle veya diğer test
 * dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-document-access-test-${process.pid}-${randomUUID()}`
);

/**
 * Embedding erişimi bu makinede Ollama çalışıyorsa gerçekten mevcut olabilir
 * (flaky test riski). Erişim kontrolünün deterministik anahtar-kelime yoluyla
 * test edilmesi için embedding'i bilinçli olarak kapalı say — kod zaten bu
 * durumda anahtar-kelime yoluna döner (embeddings.ts'teki tasarım ilkesi).
 */
vi.mock("@/lib/ai/embeddings", () => ({
  isEmbeddingAvailable: async () => false,
  embed: async () => null,
  cosineSimilarity: () => 0,
}));

const { migrate, getDb } = await import("../src/lib/db/client");
const { insertDocument, listDocuments, retrieveChunks } = await import(
  "../src/lib/db/repos/documents"
);

describe("belge izni (allowed_roles) — erişim yetki-farkındalıklı ve org-izolasyonlu", () => {
  const orgA = randomBytes(8).toString("hex");
  const orgB = randomBytes(8).toString("hex");
  let openDocId: string;
  let restrictedDocId: string;

  beforeAll(async () => {
    await migrate();
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgA,
      "Belge Test Org A",
      "aviation",
    ]);
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgB,
      "Belge Test Org B",
      "aviation",
    ]);

    // orgA: herkese açık belge (allowed_roles NULL)
    const open = await insertDocument({
      orgId: orgA,
      title: "Herkese Açık Politika",
      sourceType: "policy",
      text: "Bu belge herkesebelgekelimesi içerir ve tüm rollere açıktır.",
      uploadedBy: "test-user",
    });
    openDocId = open.documentId;

    // orgA: yalnızca ceo rolüne kısıtlı belge
    const restricted = await insertDocument({
      orgId: orgA,
      title: "Yönetim Kurulu Gizli Raporu",
      sourceType: "report",
      text: "Bu belge gizlibelgekelimesi içerir ve yalnızca ceo rolüne açıktır.",
      uploadedBy: "test-user",
      allowedRoles: ["ceo"],
    });
    restrictedDocId = restricted.documentId;

    // orgB: farklı organizasyona ait belge (org izolasyonu testi için)
    await insertDocument({
      orgId: orgB,
      title: "Diğer Org Belgesi",
      sourceType: "policy",
      text: "Bu belge digerorgbelgekelimesi içerir ve orgB'ye aittir.",
      uploadedBy: "test-user",
    });
  });

  afterAll(async () => {
    await getDb().close();
  });

  interface DocRow {
    id: string;
    title: string;
  }

  describe("listDocuments", () => {
    it("ceo rolü orgA'daki her iki belgeyi de görür", async () => {
      const docs = (await listDocuments(orgA, "ceo")) as DocRow[];
      const ids = docs.map((d) => d.id);
      expect(ids).toContain(openDocId);
      expect(ids).toContain(restrictedDocId);
      expect(docs.length).toBe(2);
    });

    it("analyst rolü yalnızca açık belgeyi görür", async () => {
      const docs = (await listDocuments(orgA, "analyst")) as DocRow[];
      const ids = docs.map((d) => d.id);
      expect(ids).toEqual([openDocId]);
    });

    it("orgB'nin belgesi orgA listesinde hiçbir rolde görünmez", async () => {
      const asCeo = (await listDocuments(orgA, "ceo")) as DocRow[];
      const asAnalyst = (await listDocuments(orgA, "analyst")) as DocRow[];
      const allTitles = [...asCeo, ...asAnalyst].map((d) => d.title);
      expect(allTitles).not.toContain("Diğer Org Belgesi");
    });
  });

  describe("retrieveChunks", () => {
    it("ceo rolü kısıtlı belgedeki kelimeyle arama yapınca sonuç bulur", async () => {
      const results = await retrieveChunks({ orgId: orgA, role: "ceo", query: "gizlibelgekelimesi" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.documentId === restrictedDocId)).toBe(true);
    });

    it("analyst rolü kısıtlı belgedeki kelimeyle arama yapsa bile o parça sonuçlarda ASLA yer almaz", async () => {
      const results = await retrieveChunks({ orgId: orgA, role: "analyst", query: "gizlibelgekelimesi" });
      expect(results.some((r) => r.documentId === restrictedDocId)).toBe(false);
      expect(results).toEqual([]);
    });

    it("analyst rolü açık belgedeki kelimeyle arama yapınca sonuç bulur", async () => {
      const results = await retrieveChunks({ orgId: orgA, role: "analyst", query: "herkesebelgekelimesi" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.documentId === openDocId)).toBe(true);
    });

    it("başka orga ait belgenin kelimesiyle arama yapınca hiçbir rolde sonuç dönmez (org izolasyonu)", async () => {
      const asCeo = await retrieveChunks({ orgId: orgA, role: "ceo", query: "digerorgbelgekelimesi" });
      const asAnalyst = await retrieveChunks({ orgId: orgA, role: "analyst", query: "digerorgbelgekelimesi" });
      expect(asCeo).toEqual([]);
      expect(asAnalyst).toEqual([]);
    });

    it("hiçbir eşleşme olmadığında boş dizi döner (uydurma atıf yok)", async () => {
      const results = await retrieveChunks({ orgId: orgA, role: "ceo", query: "hicbiryerdegecmeyenterimxyz" });
      expect(results).toEqual([]);
    });
  });
});
