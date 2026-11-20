import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-forecast-test-${process.pid}-${randomUUID()}`
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
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { GET } = await import("../src/app/api/forecast/route");
const { forecastSeries, MIN_FORECAST_POINTS } = await import("../src/lib/forecasting");
const { getKpiSeries } = await import("../src/lib/db/repos/forecast");
const {
  computeIntervalAdjustment,
  applyIntervalAdjustment,
  MIN_CALIBRATION_EVALUATIONS,
  INTERVAL_TARGET_COVERAGE,
} = await import("../src/lib/forecast-calibration");

describe("Tahmin motoru", () => {
  it("yetersiz veride tahmin üretmez", () => {
    expect(forecastSeries([1, 2, 3, 4, 5])).toBeNull();
    expect(forecastSeries([])).toBeNull();
    expect(forecastSeries([1, 2, 3, 4, 5, 6])).not.toBeNull();
  });

  it("doğrusal seride trendi yakalar", () => {
    const series = Array.from({ length: 10 }, (_, i) => 10 + i * 2);
    const r = forecastSeries(series, 2)!;
    expect(r.model).toBe("linear-trend");
    expect(r.points[0].value).toBeCloseTo(30, 1);
    expect(r.points[1].value).toBeCloseTo(32, 1);
    expect(r.points[0].p10).toBeLessThanOrEqual(r.points[0].value + 0.01);
    expect(r.points[0].p90).toBeGreaterThanOrEqual(r.points[0].value - 0.01);
  });

  it("sabit seride naif model sabit tahmin verir", () => {
    const r = forecastSeries([5, 5, 5, 5, 5, 5, 5], 1)!;
    expect(r.points[0].value).toBe(5);
    expect(r.points[0].p10).toBe(5);
    expect(r.points[0].p90).toBe(5);
  });

  it("model karşılaştırması ve metrikler tutarlıdır", () => {
    const series = [10, 12, 11, 13, 12, 14, 15, 14, 16, 17];
    const r = forecastSeries(series, 3)!;
    expect(r.backtest.map((b) => b.model).sort()).toEqual(["linear-trend", "naive", "ses"]);
    for (const b of r.backtest) {
      expect(b.mae).toBeGreaterThanOrEqual(0);
      expect(b.rmse).toBeGreaterThanOrEqual(b.mae);
      expect(b.points).toBe(series.length - 3);
    }
    expect(r.points).toHaveLength(3);
    expect(["low", "medium", "high"]).toContain(r.evidence);
  });

  it("ufuk ve örnek sınırları uygulanır", () => {
    const series = Array.from({ length: 8 }, (_, i) => i + 1);
    expect(forecastSeries(series, 99)?.points).toHaveLength(12);
    expect(forecastSeries(series, 0)?.points).toHaveLength(1);
  });
});

const ORG_A = "org-fc-a";
const ORG_B = "org-fc-b";

async function seedSeries(orgId: string, datasetId: string, label: string, values: string[]) {
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
      [`${datasetId}-${i}`, orgId, datasetId, label, values[i], `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`]
    );
  }
}

describe("GET /api/forecast", () => {
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
    for (const [id, org, role] of [
      ["fc-ceo", ORG_A, "ceo"],
      ["fc-guest", ORG_A, "guest"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@fc.test`, id, role, pw]
      );
    }
    await seedSeries(ORG_A, "ds-a", "Gecikme oranı", ["10", "12", "11", "13", "14", "15", "yaklaşık 16"]);
    await seedSeries(ORG_B, "ds-b", "Gecikme oranı", ["99", "98", "97", "96", "95", "94"]);
    ceoA = await createSession("fc-ceo", ORG_A);
    guestA = await createSession("fc-guest", ORG_A);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function req(url: string) {
    return GET({ nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0]);
  }

  it("oturum yoksa 401, izin yoksa 403", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await req("http://localhost/api/forecast")).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestA);
    expect((await req("http://localhost/api/forecast")).status).toBe(403);
  });

  it("etiket listesi sayısal/dışlanan noktaları raporlar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await req("http://localhost/api/forecast");
    const body = (await res.json()) as {
      labels: { label: string; numericPoints: number; totalPoints: number; forecastable: boolean }[];
      minRequired: number;
    };
    expect(body.minRequired).toBe(MIN_FORECAST_POINTS);
    const row = body.labels.find((l) => l.label === "Gecikme oranı")!;
    expect(row.numericPoints).toBe(6);
    expect(row.totalPoints).toBe(7);
    expect(row.forecastable).toBe(true);
  });

  it("sayısal seri için geriye dönük testli tahmin döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await req("http://localhost/api/forecast?label=Gecikme%20oran%C4%B1&horizon=2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      history: { values: number[] };
      forecast: { points: unknown[]; backtest: unknown[] } | null;
      insufficientData: boolean;
      provenance: { numericPoints: number; excludedPoints: number; engine: string };
    };
    expect(body.insufficientData).toBe(false);
    expect(body.history.values).toEqual([10, 12, 11, 13, 14, 15]);
    expect(body.forecast?.points).toHaveLength(2);
    expect(body.forecast?.backtest).toHaveLength(3);
    expect(body.provenance.numericPoints).toBe(6);
    expect(body.provenance.engine).toContain("forecasting.ts");
  });

  it("başka kurumun serisi görünmez (tenant izolasyonu)", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await req("http://localhost/api/forecast");
    const body = (await res.json()) as { labels: { label: string; numericPoints: number }[] };
    // Farklı org'un aynı etiketi kendi serimizle karışmamalı.
    expect(body.labels).toHaveLength(1);
    expect(body.labels[0].numericPoints).toBe(6);
  });

  it("KPI serisi limitte en güncel gözlemleri kronolojik döndürür", async () => {
    const db = getDb();
    const label = "Uzun geçmiş";
    await db.query(
      `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
       VALUES ('ds-long', $1, 'aviation', 'test', 'raw', 'tester')`,
      [ORG_A]
    );
    const base = Date.parse("2026-02-01T00:00:00Z");
    for (let i = 0; i < 125; i++) {
      await db.query(
        `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
         VALUES ($1, $2, 'ds-long', $3, $4, $5)`,
        [`kv-long-${i}`, ORG_A, label, String(i), new Date(base + i * 60_000).toISOString()]
      );
    }

    const series = await getKpiSeries(ORG_A, label, 120);
    expect(series.values).toHaveLength(120);
    expect(series.values[0]).toBe(5);
    expect(series.values[series.values.length - 1]).toBe(124);
    expect(series.timestamps[0]).toBe(new Date(base + 5 * 60_000).toISOString());
    expect(series.timestamps[series.timestamps.length - 1]).toBe(
      new Date(base + 124 * 60_000).toISOString()
    );
  });

  it("geçmiş kapsama yetersizse aralık ayarı uygulanmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await req(`http://localhost/api/forecast?label=${encodeURIComponent("Gecikme oranı")}`);
    const body = (await res.json()) as {
      intervalAdjustment: { status: string; evaluated: number; factor: number };
      adjustedPoints: unknown;
    };
    expect(body.intervalAdjustment.status).toBe("insufficient_evidence");
    expect(body.intervalAdjustment.factor).toBe(1);
    expect(body.adjustedPoints).toBeNull();
  });

  it("ölçülmüş tahminler kapsama hedefinin altındaysa aralıkları genişletir", async () => {
    const db = getDb();
    const label = "Gecikme oranı";
    for (let i = 0; i < MIN_CALIBRATION_EVALUATIONS; i++) {
      await db.query(
        `INSERT INTO forecast_snapshots
           (id, org_id, label, model, evidence, horizon, series_points, p10, p50, p90, last_observed_at, created_by)
         VALUES ($1, $2, $3, 'naive', 'low', 3, 6, 0, 1, 2, '2025-12-01T00:00:00Z', 'tester')`,
        [`snap-${i}`, ORG_A, label]
      );
    }
    // Anlık görüntülerden sonra gelen ilk gözlem (16) aralığın dışında kalır.
    await db.query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ('kv-realized', $1, 'ds-a', $2, '16', '2026-01-20T00:00:00Z')`,
      [ORG_A, label]
    );

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const res = await req(`http://localhost/api/forecast?label=${encodeURIComponent(label)}`);
    const body = (await res.json()) as {
      forecast: { points: Array<{ value: number; p10: number; p90: number }> };
      intervalAdjustment: { status: string; factor: number; observedHitRate: number };
      adjustedPoints: Array<{ value: number; p10: number; p90: number }> | null;
    };
    expect(body.intervalAdjustment.status).toBe("applied");
    expect(body.intervalAdjustment.observedHitRate).toBe(0);
    expect(body.intervalAdjustment.factor).toBe(3);
    expect(body.adjustedPoints).not.toBeNull();
    const raw = body.forecast.points[0];
    const adjusted = body.adjustedPoints![0];
    expect(adjusted.value).toBe(raw.value);
    expect(Math.abs(adjusted.p90 - adjusted.value)).toBeGreaterThan(Math.abs(raw.p90 - raw.value));
  });

  it("aralık ayarı hedefin üzerinde kapsamada daraltır ve sınırlara uyar", () => {
    const tight = computeIntervalAdjustment(
      Array.from({ length: MIN_CALIBRATION_EVALUATIONS }, () => ({
        status: "evaluated" as const,
        actual: 1,
        insideRange: true,
        absError: 0,
        rangeWidth: 10,
      }))
    );
    expect(tight.status).toBe("applied");
    expect(tight.observedHitRate).toBe(1);
    expect(tight.factor).toBe(Math.round(INTERVAL_TARGET_COVERAGE * 100) / 100);

    const points = [
      { step: 1, value: 100, p10: 90, p90: 110 },
      { step: 2, value: 100, p10: 80, p90: 120 },
    ];
    const scaled = applyIntervalAdjustment(points, 2);
    expect(scaled[0].p10).toBe(80);
    expect(scaled[0].p90).toBe(120);
    expect(scaled[1].p10).toBe(60);
    expect(scaled[1].p90).toBe(140);
    expect(applyIntervalAdjustment(points, 1)).toBe(points);
  });
});
