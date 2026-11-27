import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-anomaly-test-${process.pid}-${randomUUID()}`
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
const { GET } = await import("../src/app/api/anomalies/route");
const { detectAnomalies, median } = await import("../src/lib/anomaly");

describe("Aykırı değer tespiti (median/MAD)", () => {
  it("medyanı tek ve çift uzunlukta doğru hesaplar", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("yetersiz seride uyarı üretmez", () => {
    expect(detectAnomalies([1, 2, 3])).toEqual([]);
  });

  it("sabit seride sıfır ölçek nedeniyle uyarı üretmez", () => {
    expect(detectAnomalies([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5])).toEqual([]);
  });

  it("belirgin sıçramayı işaretler", () => {
    const series = [10, 10.5, 9.8, 10.2, 10.1, 9.9, 10.3, 10, 10.1, 30];
    const found = detectAnomalies(series);
    expect(found).toHaveLength(1);
    expect(found[0].index).toBe(9);
    expect(found[0].direction).toBe("above");
    expect(found[0].score).toBeGreaterThan(3.5);
  });

  it("eşik ve zaman damgası seçenekleri uygulanır", () => {
    const series = [10, 10.5, 9.8, 10.2, 10.1, 9.9, 10.3, 10, 10.1, 30];
    const strict = detectAnomalies(series, { threshold: 1000 });
    expect(strict).toEqual([]);
    const dates = series.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const withDates = detectAnomalies(series, { timestamps: dates });
    expect(withDates[0].timestamp).toBe("2026-01-10");
  });
});

const ORG_A = "org-an-a";
const ORG_B = "org-an-b";

async function seed(orgId: string, datasetId: string, label: string, values: string[]) {
  const db = getDb();
  await db.query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ($1, $2, 'aviation', 'test', 'raw', 'tester')`,
    [datasetId, orgId]
  );
  for (let i = 0; i < values.length; i++) {
    await db.query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `${datasetId}-${i}`,
        orgId,
        datasetId,
        label,
        values[i],
        `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      ]
    );
  }
}

describe("GET /api/anomalies", () => {
  let ceoA: string;
  let guestA: string;

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A"],
      [ORG_B, "B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'aviation')", [id, name]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, role] of [
      ["an-ceo", "ceo"],
      ["an-guest", "guest"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, ORG_A, `${id}@an.test`, id, role, pw]
      );
    }
    await seed(ORG_A, "ds-an-a", "Gecikme", ["10", "10.5", "9.8", "10.2", "10.1", "9.9", "10.3", "10", "10.1", "30"]);
    await seed(ORG_A, "ds-an-const", "Sabit", Array(12).fill("5"));
    await seed(ORG_B, "ds-an-b", "Başka", ["1", "2", "3", "4", "5", "6", "7", "8", "9", "999"]);
    ceoA = await createSession("an-ceo", ORG_A);
    guestA = await createSession("an-guest", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await GET()).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await GET()).status).toBe(403);
  });

  it("yalnızca sapma olan seriyi işaretler ve org dışına çıkmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scannedLabels: number;
      flaggedLabels: number;
      results: { label: string; anomalies: { score: number }[] }[];
    };
    expect(body.scannedLabels).toBe(2);
    expect(body.flaggedLabels).toBe(1);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].label).toBe("Gecikme");
    expect(body.results[0].anomalies[0].score).toBeGreaterThan(3.5);
  });
});
