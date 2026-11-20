import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-forecast-snapshots-${process.pid}-${randomUUID()}`
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
const { GET, POST } = await import("../src/app/api/forecast/snapshots/route");
const { evaluateForecastSnapshot, summarizeForecastCalibration } = await import(
  "../src/lib/forecast-calibration"
);

const ORG = "org-forecast-snap";
const ORG_B = "org-forecast-snap-b";
const LABEL = "Günlük ciro";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/forecast/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(label?: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/forecast/snapshots${label ? `?label=${encodeURIComponent(label)}` : ""}`
  );
}

describe("Tahmin anlık görüntüsü kalibrasyonu", () => {
  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG, "Forecast Org"],
      [ORG_B, "Forecast Org B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [
        id,
        name,
        "aviation",
      ]);
    }
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["user-forecast", ORG, "forecast@test.local", "Forecast CEO", "ceo", hashPassword("mevcut-parola-123")]
    );
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["user-forecast-b", ORG_B, "forecast-b@test.local", "Forecast B", "ceo", hashPassword("mevcut-parola-123")]
    );
    await db.query(
      "INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by) VALUES ($1, $2, $3, $4, $5, $6)",
      ["ds-forecast", ORG, "aviation", "test.csv", "kpi", "tester"]
    );
    // 8 geçmiş gözlem, artan zaman damgaları.
    for (let i = 0; i < 8; i++) {
      await db.query(
        "INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [`kpi-${i}`, ORG, "ds-forecast", LABEL, String(100 + i * 10), `2026-01-0${i + 1}T00:00:00Z`]
      );
    }
    nextHeaders.__setTestCookie(SESSION_COOKIE, await createSession("user-forecast", ORG));
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("değerlendirme aralık isabetini ve hatayı doğru hesaplar", () => {
    const trip = evaluateForecastSnapshot({ p10: 150, p50: 170, p90: 190 }, 180);
    expect(trip).toMatchObject({ status: "evaluated", actual: 180, insideRange: true, absError: 10, rangeWidth: 40 });
    const miss = evaluateForecastSnapshot({ p10: 150, p50: 170, p90: 190 }, 220);
    expect(miss.insideRange).toBe(false);
    expect(miss.absError).toBe(50);
    const pending = evaluateForecastSnapshot({ p10: 150, p50: 170, p90: 190 }, null);
    expect(pending.status).toBe("pending");
    expect(pending.insideRange).toBeNull();

    const summary = summarizeForecastCalibration([trip, miss, pending]);
    expect(summary).toMatchObject({
      total: 3,
      evaluated: 2,
      pending: 1,
      hits: 1,
      misses: 1,
      hitRate: 0.5,
      meanAbsError: 30,
    });
  });

  it("tahmini kaydeder, sonraki gözlemle ölçer ve özet döndürür", async () => {
    const created = await POST(postRequest({ label: LABEL }));
    expect(created.status).toBe(200);

    const before = (await (await GET(getRequest(LABEL))).json()) as {
      snapshots: Array<{ evaluation: { status: string } }>;
      summary: { evaluated: number; pending: number };
    };
    expect(before.snapshots).toHaveLength(1);
    expect(before.summary).toMatchObject({ evaluated: 0, pending: 1 });

    // Snapshot'tan sonra gelen ilk gözlem gerçek değer olur.
    await getDb().query(
      "INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      ["kpi-later", ORG, "ds-forecast", LABEL, "175", "2026-02-01T00:00:00Z"]
    );

    const after = (await (await GET(getRequest(LABEL))).json()) as {
      snapshots: Array<{
        model: string;
        p10: number;
        p50: number;
        p90: number;
        evaluation: { status: string; actual: number; insideRange: boolean; absError: number };
      }>;
      summary: { evaluated: number; hitRate: number; meanAbsError: number };
    };
    expect(after.snapshots[0].evaluation).toMatchObject({
      status: "evaluated",
      actual: 175,
    });
    expect(after.snapshots[0].evaluation.absError).toBeCloseTo(
      Math.abs(175 - after.snapshots[0].p50),
      6
    );
    expect(after.summary.evaluated).toBe(1);
    expect(after.summary.hitRate).toBe(after.snapshots[0].evaluation.insideRange ? 1 : 0);
    const audited = await getDb().query<{ summary: string; prev_hash: string | null }>(
      "SELECT summary, prev_hash FROM audit_events WHERE org_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1",
      [ORG, "forecast_snapshot_created"]
    );
    expect(audited.rows).toHaveLength(1);
    expect(audited.rows[0].summary).toContain(LABEL);
    expect(audited.rows[0].prev_hash).not.toBeNull();
  });

  it("yetersiz gözlemde 422 döner ve kayıt oluşmaz", async () => {
    const res = await POST(postRequest({ label: "Hiç olmayan metrik" }));
    expect(res.status).toBe(422);
    const listed = (await (await GET(getRequest("Hiç olmayan metrik"))).json()) as { snapshots: unknown[] };
    expect(listed.snapshots).toHaveLength(0);
  });

  it("başka kurumun anlık görüntüleri görünmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, await createSession("user-forecast-b", ORG_B));
    const other = (await (await GET(getRequest())).json()) as { snapshots: unknown[] };
    expect(other.snapshots).toHaveLength(0);
  });
  it("ilk çağrıda yakalar, tekrar çağrıda atlar ve yetersiz veriyi raporlar", async () => {
    const { POST: capture } = await import("../src/app/api/forecast/snapshots/capture/route");
    const { migrate: mig, getDb: gdb } = await import("../src/lib/db/client");
    const { createSession: cs, hashPassword: hp } = await import("../src/lib/auth/core");
    await mig();
    const db = gdb();
    const org = "org-capture";
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)", [org, "Capture", "aviation"]);
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      ["user-capture", org, "capture@test.local", "Capture CEO", "ceo", hp("mevcut-parola-123")]
    );
    await db.query(
      "INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by) VALUES ('ds-cap', $1, 'aviation', 't', 'r', 't')",
      [org]
    );
    for (let i = 0; i < 8; i++) {
      await db.query(
        "INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at) VALUES ($1, $2, 'ds-cap', 'Ciro', $3, $4)",
        [`cap-${i}`, org, String(200 + i * 5), `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`]
      );
    }
    await db.query(
      "INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at) VALUES ('cap-x', $1, 'ds-cap', 'Az veri', '1', '2026-03-01T00:00:00Z')",
      [org]
    );
    nextHeaders.__setTestCookie(SESSION_COOKIE, await cs("user-capture", org));

    const first = (await (await capture()).json()) as {
      captured: number;
      skipped: number;
      results: Array<{ label: string; status: string }>;
    };
    expect(first.captured).toBe(1);
    expect(first.skipped).toBe(0);
    expect(first.results.find((r) => r.label === "Ciro")?.status).toBe("captured");
    expect(first.results.find((r) => r.label === "Az veri")?.status).toBe("insufficient_data");
    const audited = await db.query<{ summary: string }>(
      "SELECT summary FROM audit_events WHERE org_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1",
      [org, "forecast_snapshots_captured"]
    );
    expect(audited.rows).toHaveLength(1);
    expect(audited.rows[0].summary).toContain("1");

    const second = (await (await capture()).json()) as {
      captured: number;
      skipped: number;
      results: Array<{ label: string; status: string }>;
    };
    expect(second.captured).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.results.find((r) => r.label === "Ciro")?.status).toBe("skipped_recent");
  });

  it("saklama planı yalnızca raporlar, kayıt silmez ve kurum kapsamlıdır", async () => {
    const { GET: retention } = await import("../src/app/api/forecast/snapshots/retention/route");
    const db = getDb();
    const rows: Array<[string, string, string]> = [
      ["ret-old", ORG, "2024-01-01T00:00:00Z"],
      ["ret-new", ORG, "2026-11-20T00:00:00Z"],
      ["ret-other", ORG_B, "2024-01-01T00:00:00Z"],
    ];
    for (const [id, org, createdAt] of rows) {
      await db.query(
        `INSERT INTO forecast_snapshots
           (id, org_id, label, model, evidence, horizon, series_points, p10, p50, p90, last_observed_at, created_by, created_at)
         VALUES ($1, $2, 'Saklama', 'naive', 'test', 1, 8, 1, 2, 3, $3, 'Test', $3)`,
        [id, org, createdAt]
      );
    }

    nextHeaders.__setTestCookie(SESSION_COOKIE, await createSession("user-forecast", ORG));
    const res = await retention(
      new Request("http://localhost/api/forecast/snapshots/retention?maxAgeDays=365&maxPerLabel=60")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      policy: { maxAgeDays: number; maxPerLabel: number };
      archiveIds: string[];
      reasons: Record<string, string>;
      dryRun: boolean;
    };
    expect(body.policy).toEqual({ maxAgeDays: 365, maxPerLabel: 60 });
    expect(body.dryRun).toBe(true);
    expect(body.archiveIds).toContain("ret-old");
    expect(body.archiveIds).not.toContain("ret-new");
    expect(body.archiveIds).not.toContain("ret-other");
    expect(body.reasons["ret-old"]).toBe("expired");

    const stillThere = await db.query("SELECT id FROM forecast_snapshots WHERE org_id = $1", [ORG]);
    expect(stillThere.rows.map((row) => (row as { id: string }).id).sort()).toEqual(
      expect.arrayContaining(["ret-old", "ret-new"])
    );
  });
});
