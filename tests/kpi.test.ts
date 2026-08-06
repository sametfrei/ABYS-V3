import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * ABYS_DB_DIR bu dosyanın herhangi bir db importundan ÖNCE ayarlanmalı —
 * client.ts DB_DIR'i modül üst seviyesinde okur. Kendi geçici dizinini
 * kullanır ki dev sunucunun .data/abys-db kilidiyle veya diğer test
 * dosyalarıyla çakışmasın.
 */
process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-kpi-test-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { upsertDefinition, evaluateAgainstThresholds } = await import(
  "../src/lib/db/repos/kpi-registry"
);
const { parseKpis } = await import("../src/lib/kpi");

describe("evaluateAgainstThresholds (deterministik eşik karşılaştırması)", () => {
  const orgId = randomBytes(8).toString("hex");

  beforeAll(async () => {
    await migrate();
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
      orgId,
      "Eşik Test Org",
      "aviation",
    ]);

    // Düşük değer kötü: hedef 99, uyarı 95, kritik 90 (kritik <= uyarı).
    await upsertDefinition({
      orgId,
      name: "Zamanında Teslimat Oranı",
      target: 99,
      warnThreshold: 95,
      criticalThreshold: 90,
    });

    // Yüksek değer kötü: hedef 10, uyarı 20, kritik 30 (kritik > uyarı).
    await upsertDefinition({
      orgId,
      name: "Şikayet Oranı",
      target: 10,
      warnThreshold: 20,
      criticalThreshold: 30,
    });

    // Yalnızca kritik eşik + hedef ile yön çıkarımı: kritik(90) <= hedef(99) -> düşük kötü.
    await upsertDefinition({
      orgId,
      name: "Sadece Kritik Eşik",
      target: 99,
      criticalThreshold: 90,
    });

    // Eşiği olmayan tanım (yalnızca hedef var).
    await upsertDefinition({
      orgId,
      name: "Eşiksiz KPI",
      target: 50,
    });
  });

  afterAll(async () => {
    await getDb().close();
  });

  it("tanım bulunamazsa 'unknown' döner", async () => {
    const r = await evaluateAgainstThresholds(orgId, "Var Olmayan KPI", 42);
    expect(r.status).toBe("unknown");
    expect(r.definition).toBeNull();
  });

  it("tanım var ama eşik yoksa 'unknown' döner", async () => {
    const r = await evaluateAgainstThresholds(orgId, "Eşiksiz KPI", 10);
    expect(r.status).toBe("unknown");
    expect(r.definition).not.toBeNull();
  });

  describe("düşük değer kötü (kritik <= uyarı)", () => {
    it("kritik eşiğin tam altı -> critical", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Zamanında Teslimat Oranı", 89);
      expect(r.status).toBe("critical");
    });
    it("kritik eşiğin tam kendisi -> critical (dahil)", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Zamanında Teslimat Oranı", 90);
      expect(r.status).toBe("critical");
    });
    it("kritik ile uyarı arası -> warning", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Zamanında Teslimat Oranı", 92);
      expect(r.status).toBe("warning");
    });
    it("uyarı eşiğinin tam kendisi -> warning (dahil)", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Zamanında Teslimat Oranı", 95);
      expect(r.status).toBe("warning");
    });
    it("uyarı eşiğinin tam üstü -> healthy", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Zamanında Teslimat Oranı", 96);
      expect(r.status).toBe("healthy");
    });
  });

  describe("yüksek değer kötü (kritik > uyarı)", () => {
    it("kritik eşiğin tam üstü -> critical", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Şikayet Oranı", 31);
      expect(r.status).toBe("critical");
    });
    it("kritik eşiğin tam kendisi -> critical (dahil)", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Şikayet Oranı", 30);
      expect(r.status).toBe("critical");
    });
    it("uyarı ile kritik arası -> warning", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Şikayet Oranı", 25);
      expect(r.status).toBe("warning");
    });
    it("uyarı eşiğinin tam kendisi -> warning (dahil)", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Şikayet Oranı", 20);
      expect(r.status).toBe("warning");
    });
    it("uyarı eşiğinin tam altı -> healthy", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Şikayet Oranı", 19);
      expect(r.status).toBe("healthy");
    });
  });

  describe("yalnızca kritik eşik + hedeften yön çıkarımı", () => {
    it("kritik eşiğin tam kendisi -> critical", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Sadece Kritik Eşik", 90);
      expect(r.status).toBe("critical");
    });
    it("kritik eşiğin üstü -> healthy", async () => {
      const r = await evaluateAgainstThresholds(orgId, "Sadece Kritik Eşik", 95);
      expect(r.status).toBe("healthy");
    });
  });

  it("modele sayı ürettirmez: girdi org kaydındaki sayısal eşiklerden saf hesapla belirlenir (mock/ağ çağrısı yok)", async () => {
    // Aynı girdiyle art arda çağrılar hep aynı sonucu verir (deterministik, yan etkisiz karşılaştırma).
    const r1 = await evaluateAgainstThresholds(orgId, "Zamanında Teslimat Oranı", 90);
    const r2 = await evaluateAgainstThresholds(orgId, "Zamanında Teslimat Oranı", 90);
    expect(r1.status).toBe(r2.status);
    expect(r1.status).toBe("critical");
  });
});

describe("parseKpis (KPI ayıklama — AI gerektirmez)", () => {
  it("normal metin girdisinden 'Etiket: değer' çiftlerini çıkarır", () => {
    const kpis = parseKpis("Dönüşüm Oranı: 24 (%4.5)\nToplam Data: 1200\nSatış Tutarı: 350000 TL");
    expect(kpis).toEqual([
      { label: "Dönüşüm Oranı", value: "24 (%4.5)" },
      { label: "Toplam Data", value: "1200" },
      { label: "Satış Tutarı", value: "350000 TL" },
    ]);
  });

  it("CSV başlık+değer satırından KPI çiftleri çıkarır", () => {
    const kpis = parseKpis("Data,Dönüşüm,Satış\n120,%12,45000");
    expect(kpis).toEqual([
      { label: "Data", value: "120" },
      { label: "Dönüşüm", value: "%12" },
      { label: "Satış", value: "45000" },
    ]);
  });

  it("bozuk/sayısız satırı çökmeden atlar", () => {
    const kpis = parseKpis("Bu satır sayı içermiyor\nAma bu: 42\nYalnızca metin");
    expect(kpis).toEqual([{ label: "Ama bu", value: "42" }]);
  });

  it("boş girdide boş sonuç döner (çökme yok)", () => {
    expect(parseKpis("")).toEqual([]);
    expect(parseKpis("   \n  \n")).toEqual([]);
  });
});
