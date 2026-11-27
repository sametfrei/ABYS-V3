import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-scenario-real-${process.pid}-${randomUUID()}`
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
const { GET, POST } = await import("../src/app/api/scenarios/route");

const ORG_A = "org-scenario-a";
const ORG_B = "org-scenario-b";

let ceoSession = "";
let guestSession = "";

function getRequest(sectorId: string) {
  return new NextRequest(`http://localhost/api/scenarios?sectorId=${sectorId}`);
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

async function seedKpi(orgId: string, datasetId: string, values: Array<[string, string]>) {
  for (let i = 0; i < values.length; i++) {
    const [createdAt, value] = values[i];
    await getDb().query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ($1, $2, $3, 'Duruş süresi (saat)', $4, $5)`,
      [`kv-${orgId}-${randomUUID()}`, orgId, datasetId, value, createdAt]
    );
  }
}

beforeAll(async () => {
  await migrate();
  for (const [id, name] of [
    [ORG_A, "A"],
    [ORG_B, "B"],
  ]) {
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [
      id,
      name,
    ]);
    await getDb().query(
      `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
       VALUES ($1, $2, 'manufacturing', $3, '{}', 'test')`,
      [`ds-${id}`, id, `Konnektör: ${name}`]
    );
  }
  await seedKpi(ORG_A, `ds-${ORG_A}`, [
    ["2026-01-01T00:00:00Z", "3"],
    ["2026-01-02T00:00:00Z", "5"],
    ["2026-01-03T00:00:00Z", "abc"],
  ]);
  await seedKpi(ORG_B, `ds-${ORG_B}`, [["2026-01-02T00:00:00Z", "999"]]);

  const password = hashPassword("mevcut-parola-123");
  for (const [id, role] of [
    ["scenario-ceo", "ceo"],
    ["scenario-guest", "guest"],
  ] as const) {
    await getDb().query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, ORG_A, `${id}@scenario.test`, id, role, password]
    );
  }
  ceoSession = await createSession("scenario-ceo", ORG_A);
  guestSession = await createSession("scenario-guest", ORG_A);
});

afterAll(async () => {
  nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  await getDb().close();
});

describe("senaryo değişkenlerinin gerçek KPI ile beslenmesi", () => {
  it("oturum ve izin denetimi uygular", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await GET(getRequest("manufacturing"))).status).toBe(401);
    nextHeaders.__setTestCookie(SESSION_COOKIE, guestSession);
    expect((await GET(getRequest("manufacturing"))).status).toBe(403);
    expect(
      (await POST(postRequest({ sectorId: "manufacturing", templateId: "line-downtime" }))).status
    ).toBe(403);
  });

  it("GET yalnızca birebir eşleşen gerçek KPI bağlantısını döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await GET(getRequest("manufacturing"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      templates: Array<{
        id: string;
        bindings: Record<string, { value: number; kpiLabel: string } | null>;
      }>;
    };
    const template = body.templates.find((item) => item.id === "line-downtime");
    expect(template?.bindings.downtimeHours).toMatchObject({
      value: 5,
      kpiLabel: "Duruş süresi (saat)",
    });
    expect(template?.bindings.contractValue).toBeNull();
  });

  it("açık istek olmadan ölçülen değeri girdi olarak kullanmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await POST(
      postRequest({ sectorId: "manufacturing", templateId: "line-downtime" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs: Array<{ inputs: Record<string, number> }>;
      inputOrigins: Record<string, { kind: string }>;
    };
    expect(body.runs[0].inputs.downtimeHours).toBe(4);
    expect(body.inputOrigins.downtimeHours.kind).toBe("template_default");
  });

  it("açık istekte gerçek KPI değerini ve kökenini kullanır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await POST(
      postRequest({
        sectorId: "manufacturing",
        templateId: "line-downtime",
        useMeasuredValues: true,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs: Array<{ inputs: Record<string, number> }>;
      inputOrigins: Record<
        string,
        { kind: string; kpiLabel?: string; sourceLabels?: string[] }
      >;
    };
    expect(body.runs[0].inputs.downtimeHours).toBe(5);
    expect(body.inputOrigins.downtimeHours).toMatchObject({
      kind: "measured_kpi",
      kpiLabel: "Duruş süresi (saat)",
      sourceLabels: ["Konnektör: A"],
    });
    expect(body.inputOrigins.contractValue).toMatchObject({ kind: "template_default" });
  });

  it("şablon sınırını aşan ölçümü kırpar ve bunu bildirir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    await seedKpi(ORG_A, `ds-${ORG_A}`, [["2026-02-01T00:00:00Z", "1000"]]);
    const res = await POST(
      postRequest({
        sectorId: "manufacturing",
        templateId: "line-downtime",
        useMeasuredValues: true,
      })
    );
    const body = (await res.json()) as {
      runs: Array<{ inputs: Record<string, number> }>;
      inputOrigins: Record<string, { kind: string; clamped?: boolean }>;
    };
    expect(body.runs[0].inputs.downtimeHours).toBe(72);
    expect(body.inputOrigins.downtimeHours).toMatchObject({
      kind: "measured_kpi",
      clamped: true,
    });
  });

  it("başka kurumun KPI değerini kullanmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await GET(getRequest("manufacturing"));
    const body = (await res.json()) as {
      templates: Array<{ id: string; bindings: Record<string, { value: number } | null> }>;
    };
    const template = body.templates.find((item) => item.id === "line-downtime");
    expect(template?.bindings.downtimeHours?.value).toBe(1000);
  });
});
