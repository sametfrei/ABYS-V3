import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { pinnedFetch } = vi.hoisted(() => ({ pinnedFetch: vi.fn() }));

vi.mock("../src/lib/net/pinned-fetch", () => ({ fetchPinned: pinnedFetch }));

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-connectors-test-${process.pid}-${randomUUID()}`
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

vi.mock("dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

const nextHeaders = (await import("next/headers")) as unknown as {
  __setTestCookie: (name: string, value: string | undefined) => void;
};
const { migrate, getDb } = await import("../src/lib/db/client");
const {
  ConnectorSyncBusyError,
  approveConnectorMapping,
  claimScheduledSyncRun,
  createConnectorConfig,
  finishSyncRun,
  listSyncRuns,
  startSyncRun,
  upsertCanonicalRecords,
} = await import("../src/lib/db/repos/connectors");
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/lib/auth/core");
const { restAdapter, validateRestConfig } = await import("../src/lib/connectors/rest-adapter");
const { listDefinitions, getAdapter, getDefinition } = await import("../src/lib/connectors/registry");
const connectorsRoute = await import("../src/app/api/connectors/route");
const connectorPatchRoute = await import("../src/app/api/connectors/[id]/route");
const connectorMappingRoute = await import("../src/app/api/connectors/[id]/mapping/route");
const syncRoute = await import("../src/app/api/connectors/[id]/sync/route");
const runsRoute = await import("../src/app/api/connectors/[id]/runs/route");
const schedulerRoute = await import("../src/app/api/connectors/scheduler/run/route");
const testRoute = await import("../src/app/api/connectors/[id]/test/route");
const { runDueConnectorSyncs } = await import("../src/lib/connectors/scheduler");
const forecastRoute = await import("../src/app/api/forecast/route");
const anomalyRoute = await import("../src/app/api/anomalies/route");
const { getProcessEvents } = await import("../src/lib/db/repos/process-events");
const { SsrfError } = await import("../src/lib/net/ssrf");

function ctx(overrides: Partial<Parameters<typeof restAdapter.sync>[1]> = {}) {
  return {
    orgId: "org-test",
    configId: "cfg-test",
    checkpoint: null,
    fetchImpl: (async () => new Response("{}")) as typeof fetch,
    resolveHost: async () => ["93.184.216.34"],
    resolveSecret: () => "secret-value",
    now: () => new Date("2026-01-01T00:00:00Z"),
    sleep: async () => {},
    ...overrides,
  };
}

const BASE_CONFIG = {
  kind: "rest" as const,
  baseUrl: "https://api.example.com",
  path: "/v1/customers",
  authType: "none" as const,
  entity: "customer" as const,
  idField: "id",
  updatedAtField: "updated_at",
  recordsPath: "data",
  fieldMap: { name: "name", email: "contact.email" },
  pagination: { type: "none" as const },
};

describe("REST konnektör adaptörü", () => {
  it("alan eşlemesi yapar, geçersiz kayıtları sayar ve checkpoint üretir", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: URL | RequestInfo) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          data: [
            { id: 1, name: "Acme", contact: { email: "a@acme.test" }, updated_at: "2026-01-02T00:00:00Z" },
            { id: 2, name: "Beta", contact: { email: null }, updated_at: "2026-01-03T00:00:00Z" },
            { name: "Kimliksiz" },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const out = await restAdapter.sync(BASE_CONFIG, ctx({ fetchImpl }));
    expect(calls[0]).toContain("/v1/customers");
    expect(out.records).toHaveLength(2);
    expect(out.records[0]).toMatchObject({ externalId: "1", entity: "customer" });
    expect(out.records[0].fields).toEqual({ name: "Acme", email: "a@acme.test" });
    expect(out.records[1].fields.email).toBeNull();
    expect(out.skipped).toBe(1);
    expect(out.checkpoint).toBe("2026-01-03T00:00:00.000Z");
  });

  it("sayfa numaralı sayfalamada limit dolunca durur", async () => {
    const pagesSeen: number[] = [];
    const fetchImpl = (async (url: URL | RequestInfo) => {
      const u = new URL(String(url));
      const page = Number(u.searchParams.get("page"));
      pagesSeen.push(page);
      const rows =
        page === 1
          ? [{ id: "a" }, { id: "b" }]
          : page === 2
            ? [{ id: "c" }]
            : [];
      return new Response(JSON.stringify({ data: rows, updated_at: null }), { status: 200 });
    }) as typeof fetch;

    const out = await restAdapter.sync(
      {
        ...BASE_CONFIG,
        pagination: { type: "page", pageParam: "page", limitParam: "limit", pageSize: 2 },
      },
      ctx({ fetchImpl })
    );
    expect(pagesSeen).toEqual([1, 2]);
    expect(out.pages).toBe(2);
    expect(out.records.map((r) => r.externalId)).toEqual(["a", "b", "c"]);
  });

  it("cursor sayfalaması next yoksa durur ve checkpoint gönderir", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: URL | RequestInfo) => {
      const u = new URL(String(url));
      urls.push(u.search);
      const cursor = u.searchParams.get("after");
      const body = cursor
        ? { data: [{ id: "2" }], next: null }
        : { data: [{ id: "1" }], next: "abc" };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

    const out = await restAdapter.sync(
      {
        ...BASE_CONFIG,
        updatedSinceParam: "updated_since",
        pagination: { type: "cursor", cursorParam: "after", cursorPath: "next" },
      },
      ctx({ fetchImpl, checkpoint: "2025-12-31T00:00:00.000Z" })
    );
    expect(urls[0]).toContain("updated_since=2025-12-31");
    expect(urls[1]).toContain("after=abc");
    expect(out.records).toHaveLength(2);
  });

  it("kimlik bilgisi ortam değişkeni yoksa açıklayıcı hata verir", async () => {
    await expect(
      restAdapter.sync(
        { ...BASE_CONFIG, authType: "bearer_token", secretEnvVar: "MISSING_TOKEN" },
        ctx({ resolveSecret: () => undefined })
      )
    ).rejects.toThrow(/MISSING_TOKEN/);
  });

  it("OAuth2 client-credentials tokenını bir kez alır ve tüm sayfalara Bearer ekler", async () => {
    const tokenCalls: RequestInit[] = [];
    const pageHeaders: Headers[] = [];
    const fetchTokenImpl = (async (_url: URL | RequestInfo, init?: RequestInit) => {
      tokenCalls.push(init ?? {});
      return new Response(
        JSON.stringify({ access_token: "oauth-access-token", token_type: "Bearer", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    const fetchImpl = (async (url: URL | RequestInfo, init?: RequestInit) => {
      pageHeaders.push(new Headers(init?.headers));
      const page = Number(new URL(String(url)).searchParams.get("page"));
      return new Response(
        JSON.stringify({ data: page === 1 ? [{ id: "1" }] : [] }),
        { status: 200 }
      );
    }) as typeof fetch;

    const out = await restAdapter.sync(
      {
        ...BASE_CONFIG,
        authType: "oauth2_client_credentials",
        secretEnvVar: "OAUTH_CLIENT_SECRET",
        oauth2ClientIdEnvVar: "OAUTH_CLIENT_ID",
        oauth2TokenUrl: "https://login.example.com/oauth2/token",
        oauth2Scope: "data.read",
        pagination: { type: "page", pageParam: "page", pageSize: 1 },
      },
      ctx({
        fetchImpl,
        fetchTokenImpl,
        resolveSecret: (name) => (name === "OAUTH_CLIENT_ID" ? "client-id" : "client-secret"),
      })
    );

    expect(tokenCalls).toHaveLength(1);
    expect((tokenCalls[0].method ?? "").toUpperCase()).toBe("POST");
    const tokenBody = new URLSearchParams(String(tokenCalls[0].body));
    expect(Object.fromEntries(tokenBody)).toMatchObject({
      grant_type: "client_credentials",
      client_id: "client-id",
      client_secret: "client-secret",
      scope: "data.read",
    });
    expect(pageHeaders).toHaveLength(2);
    expect(pageHeaders.every((headers) => headers.get("authorization") === "Bearer oauth-access-token")).toBe(true);
    expect(out.records.map((record) => record.externalId)).toEqual(["1"]);
    expect(JSON.stringify(out)).not.toContain("client-secret");
    expect(JSON.stringify(out)).not.toContain("oauth-access-token");
  });

  it("OAuth2 yapılandırmasını ve Bearer token türünü doğrular", async () => {
    expect(
      validateRestConfig({
        ...BASE_CONFIG,
        authType: "oauth2_client_credentials",
        secretEnvVar: "OAUTH_CLIENT_SECRET",
        oauth2ClientIdEnvVar: "OAUTH_CLIENT_ID",
      })
    ).toContain("OAuth2 için oauth2TokenUrl gerekli.");
    expect(
      validateRestConfig({
        ...BASE_CONFIG,
        authType: "oauth2_client_credentials",
        secretEnvVar: "OAUTH_CLIENT_SECRET",
        oauth2ClientIdEnvVar: "OAUTH_CLIENT_ID",
        oauth2TokenUrl: "http://login.example.com/oauth2/token",
      })
    ).toContain("OAuth2 token endpoint'i HTTPS olmalı.");

    await expect(
      restAdapter.sync(
        {
          ...BASE_CONFIG,
          authType: "oauth2_client_credentials",
          secretEnvVar: "OAUTH_CLIENT_SECRET",
          oauth2ClientIdEnvVar: "OAUTH_CLIENT_ID",
          oauth2TokenUrl: "https://login.example.com/oauth2/token",
        },
        ctx({
          fetchTokenImpl: (async () =>
            new Response(JSON.stringify({ access_token: "token", token_type: "mac" }), {
              status: 200,
            })) as typeof fetch,
        })
      )
    ).rejects.toThrow(/Bearer/);
  });

  it("429/5xx durumunda yeniden dener", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ data: [{ id: "x" }] }), { status: 200 });
    }) as typeof fetch;

    const out = await restAdapter.sync(BASE_CONFIG, ctx({ fetchImpl }));
    expect(calls).toBe(2);
    expect(out.records).toHaveLength(1);
    expect(out.warnings[0]).toContain("503");
  });

  it("iç ağ adresine istek reddedilir (SSRF)", async () => {
    await expect(
      restAdapter.sync(BASE_CONFIG, ctx({ resolveHost: async () => ["127.0.0.1"] }))
    ).rejects.toBeInstanceOf(SsrfError);
  });

describe("Bağlantı testi (probe)", () => {
  it("veri yazmadan kayıtları ve şemayı raporlar", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(
        JSON.stringify({
          data: [
            { id: 1, name: "Acme", contact: { email: "a@acme.test" } },
            { id: 2, name: "Beta" },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await restAdapter.probe!(BASE_CONFIG, ctx({ fetchImpl }));
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.recordsSeen).toBe(2);
    expect(result.missingMappedFields).toEqual([]);
    expect(result.observedFields.some((field) => field.path === "contact.email")).toBe(true);
  });

  it("eşlenen alan kaynakta yoksa raporlar", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ id: 1, ad: "Acme" }] }), { status: 200 })) as typeof fetch;
    const result = await restAdapter.probe!(BASE_CONFIG, ctx({ fetchImpl }));
    expect(result.ok).toBe(true);
    expect([...result.missingMappedFields].sort()).toEqual(["email", "name"]);
  });

  it("kimlik bilgisi ortam değişkeni yoksa başarısız döner", async () => {
    const result = await restAdapter.probe!(
      { ...BASE_CONFIG, authType: "bearer_token" as const, secretEnvVar: "MISSING_ENV_VAR" },
      ctx({ resolveSecret: () => undefined })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Kimlik bilgisi");
  });

  it("iç ağ adresini reddeder (SSRF)", async () => {
    const result = await restAdapter.probe!(
      BASE_CONFIG,
      ctx({ resolveHost: async () => ["127.0.0.1"] })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("JSON olmayan yanıtı hata olarak raporlar", async () => {
    const fetchImpl = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    const result = await restAdapter.probe!(BASE_CONFIG, ctx({ fetchImpl }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("JSON");
  });
});

  it("kayıt defteri durumları dürüsttür", () => {
    const defs = listDefinitions();
    expect(defs.find((d) => d.id === "rest-generic")?.status).toBe("ready");
    expect(defs.find((d) => d.id === "infor")?.status).toBe("requires-credentials");
    expect(defs.find((d) => d.id === "ifs")?.status).toBe("requires-credentials");
    expect(defs.find((d) => d.id === "sage")?.status).toBe("requires-credentials");
    expect(getAdapter("sap")).toBeTruthy();
    expect(getAdapter("infor")).toBeTruthy();
    expect(getAdapter("ifs")).toBeTruthy();
    expect(getAdapter("sage")).toBeTruthy();
    expect(getDefinition("soap-legacy")).toBeUndefined();
    expect(getAdapter("soap-legacy")).toBeUndefined();
  });
});

const ORG_A = "org-cn-a";
const ORG_B = "org-cn-b";

describe("Konnektör API'si", () => {
  let adminA: string;
  let adminB: string;
  let ceoA: string;
  let configId = "";
  let promotedConfigId = "";

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "A"],
      [ORG_B, "B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [id, name]);
    }
    const pw = hashPassword("mevcut-parola-123");
    for (const [id, org, role] of [
      ["cn-admin-a", ORG_A, "data_admin"],
      ["cn-ceo-a", ORG_A, "ceo"],
      ["cn-admin-b", ORG_B, "data_admin"],
    ] as const) {
      await db.query(
        "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, org, `${id}@cn.test`, id, role, pw]
      );
    }
    adminA = await createSession("cn-admin-a", ORG_A);
    adminB = await createSession("cn-admin-b", ORG_B);
    ceoA = await createSession("cn-ceo-a", ORG_A);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    pinnedFetch.mockReset();
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  function jsonReq(body: unknown) {
    return new Request("http://localhost/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Parameters<typeof connectorsRoute.POST>[0];
  }

  async function createDueConfig(orgId: string, name: string, requestPath: string) {
    const id = await createConnectorConfig({
      orgId,
      connectorId: "rest-generic",
      name,
      config: { ...BASE_CONFIG, path: requestPath },
      createdBy: "scheduler-test",
      scheduleIntervalMinutes: 60,
    });
    await getDb().query(
      "UPDATE connector_configs SET next_run_at = $3 WHERE org_id = $1 AND id = $2",
      [orgId, id, "2026-01-01T00:00:00.000Z"]
    );
    return id;
  }

  it("tanım oluşturur ve listeler (sır değeri dönmez)", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const res = await connectorsRoute.POST(
      jsonReq({ connectorId: "rest-generic", name: "CRM", config: BASE_CONFIG })
    );
    const body = (await res.json()) as { id: string };
    expect(res.status).toBe(200);
    configId = body.id;

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const list = await connectorsRoute.GET(new NextRequest("http://localhost/api/connectors"));
    const listBody = (await list.json()) as {
      configs: { id: string; config: Record<string, unknown> }[];
      definitions: unknown[];
    };
    expect(listBody.definitions.length).toBeGreaterThan(5);
    expect(listBody.configs).toHaveLength(1);
    expect(JSON.stringify(listBody.configs[0].config)).not.toContain("secret-value");
  });

  it("OAuth2 konfigürasyonunu yalnızca ortam değişkeni adlarıyla saklar", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const res = await connectorsRoute.POST(
      jsonReq({
        connectorId: "dynamics",
        name: "Dynamics OAuth",
        config: {
          ...BASE_CONFIG,
          authType: "oauth2_client_credentials",
          secretEnvVar: "DYNAMICS_CLIENT_SECRET",
          oauth2ClientIdEnvVar: "DYNAMICS_CLIENT_ID",
          oauth2TokenUrl: "https://login.microsoftonline.com/tenant/oauth2/v2.0/token",
          oauth2Scope: "https://graph.microsoft.com/.default",
        },
      })
    );
    expect(res.status).toBe(200);

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const list = await connectorsRoute.GET(new NextRequest("http://localhost/api/connectors"));
    const body = (await list.json()) as {
      configs: { name: string; config: Record<string, unknown> }[];
    };
    const saved = body.configs.find((item) => item.name === "Dynamics OAuth");
    expect(saved?.config).toMatchObject({
      authType: "oauth2_client_credentials",
      secretEnvVar: "DYNAMICS_CLIENT_SECRET",
      oauth2ClientIdEnvVar: "DYNAMICS_CLIENT_ID",
    });
    expect(JSON.stringify(saved?.config)).not.toContain("client-secret-value");
  });

  it("senkron çalışır, idempotent yazar ve geçmiş döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ data: [{ id: "c1", name: "Acme", updated_at: "2026-01-05T00:00:00Z" }] }),
        { status: 200 }
      )) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    pinnedFetch.mockImplementation(fakeFetch);

    const res = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: configId }),
    });
    const body = (await res.json()) as { status: string; writtenCount: number };
    expect(res.status).toBe(200);
    expect(body.status).toBe("success");
    expect(body.writtenCount).toBe(1);

    // İkinci çalıştırma aynı kaydı çoğaltmaz.
    const again = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: configId }),
    });
    expect(((await again.json()) as { writtenCount: number }).writtenCount).toBe(1);

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const runs = await runsRoute.GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: configId }),
    });
    const runsBody = (await runs.json()) as {
      runs: { status: string }[];
      records: { entity: string; count: number }[];
      health: { consecutiveFailures: number; retryRecommended: boolean; failureKind: string };
    };
    expect(runsBody.runs).toHaveLength(2);
    expect(runsBody.records[0]).toEqual({ entity: "customer", count: 1 });
    expect(runsBody.health).toMatchObject({
      consecutiveFailures: 0,
      retryRecommended: false,
      failureKind: "unknown",
    });
  });

  it("aynı konnektör için ikinci eşzamanlı run başlatmaz", async () => {
    const lockConfigId = await createConnectorConfig({
      orgId: ORG_A,
      connectorId: "rest-generic",
      name: "Kilit testi",
      config: BASE_CONFIG,
      createdBy: "cn-admin-a",
    });
    const firstRun = await startSyncRun(ORG_A, lockConfigId);
    await expect(startSyncRun(ORG_A, lockConfigId)).rejects.toBeInstanceOf(
      ConnectorSyncBusyError
    );
    await finishSyncRun({
      orgId: ORG_A,
      runId: firstRun,
      status: "success",
      pages: 0,
      readCount: 0,
      writtenCount: 0,
      skippedCount: 0,
      checkpoint: null,
    });
    const nextRun = await startSyncRun(ORG_A, lockConfigId);
    expect(nextRun).not.toBe(firstRun);
    await finishSyncRun({
      orgId: ORG_A,
      runId: nextRun,
      status: "success",
      pages: 0,
      readCount: 0,
      writtenCount: 0,
      skippedCount: 0,
      checkpoint: null,
    });
  });

  it("eşzamanlı HTTP sync isteklerinden birini 409 ile reddeder", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const overlapConfigId = await createConnectorConfig({
      orgId: ORG_A,
      connectorId: "rest-generic",
      name: "Overlap testi",
      config: BASE_CONFIG,
      createdBy: "cn-admin-a",
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fakeFetch = (async () => {
      await gate;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;
    pinnedFetch.mockImplementation(fakeFetch);

    const first = syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: overlapConfigId }),
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: overlapConfigId }),
    });
    expect(second.status).toBe(409);
    release();
    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);
  });

  it("konnektör zamanlamasını org sınırı içinde ayarlar ve kapatır", async () => {
    const scheduleId = await createConnectorConfig({
      orgId: ORG_A,
      connectorId: "rest-generic",
      name: "Zamanlama API",
      config: BASE_CONFIG,
      createdBy: "cn-admin-a",
    });
    const patch = (body: unknown) =>
      new NextRequest(`http://localhost/api/connectors/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const enabled = await connectorPatchRoute.PATCH(
      patch({ scheduleIntervalMinutes: 60 }),
      { params: Promise.resolve({ id: scheduleId }) }
    );
    const enabledBody = (await enabled.json()) as {
      scheduleIntervalMinutes: number;
      nextRunAt: string;
    };
    expect(enabled.status).toBe(200);
    expect(enabledBody.scheduleIntervalMinutes).toBe(60);
    expect(new Date(enabledBody.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    nextHeaders.__setTestCookie(SESSION_COOKIE, adminB);
    const crossTenant = await connectorPatchRoute.PATCH(
      patch({ scheduleIntervalMinutes: 30 }),
      { params: Promise.resolve({ id: scheduleId }) }
    );
    expect(crossTenant.status).toBe(404);

    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const disabled = await connectorPatchRoute.PATCH(
      patch({ scheduleIntervalMinutes: null }),
      { params: Promise.resolve({ id: scheduleId }) }
    );
    expect(await disabled.json()).toMatchObject({
      scheduleIntervalMinutes: null,
      nextRunAt: null,
    });
  });

  it("şema önerilerini sürümlü ve iyimser kilitli eşleme onayına dönüştürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const create = await connectorsRoute.POST(
      jsonReq({
        connectorId: "rest-generic",
        name: "Eşleme onayı",
        config: {
          ...BASE_CONFIG,
          path: "/mapping-customers",
          fieldMap: { name: "name" },
        },
      })
    );
    expect(create.status).toBe(200);
    const mappingConfigId = ((await create.json()) as { id: string }).id;

    const initial = await connectorMappingRoute.GET(
      new NextRequest(`http://localhost/api/connectors/${mappingConfigId}/mapping`),
      { params: Promise.resolve({ id: mappingConfigId }) }
    );
    const initialBody = (await initial.json()) as {
      currentVersion: number;
      versions: { version: number; changeSummary: string }[];
      currentFieldMap: Record<string, string>;
    };
    expect(initial.status).toBe(200);
    expect(initialBody.currentVersion).toBe(1);
    expect(initialBody.currentFieldMap).toEqual({ name: "name" });
    expect(initialBody.versions).toHaveLength(1);

    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "m-1", name: "Acme", contact: { email: "buyer@acme.test" } }],
        }),
        { status: 200 }
      )) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    pinnedFetch.mockImplementation(fakeFetch);
    const synced = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: mappingConfigId }),
    });
    expect(synced.status).toBe(200);

    const reviewed = await connectorMappingRoute.GET(
      new NextRequest(`http://localhost/api/connectors/${mappingConfigId}/mapping`),
      { params: Promise.resolve({ id: mappingConfigId }) }
    );
    const reviewedBody = (await reviewed.json()) as {
      latestRun: { id: string } | null;
      suggestions: { canonicalField: string; sourcePath: string }[];
      proposedFieldMap: Record<string, string>;
    };
    expect(reviewedBody.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalField: "email", sourcePath: "contact.email" }),
      ])
    );
    expect(reviewedBody.proposedFieldMap).toMatchObject({
      name: "name",
      email: "contact.email",
    });

    const approve = (expectedVersion: number) =>
      connectorMappingRoute.POST(
        new NextRequest(`http://localhost/api/connectors/${mappingConfigId}/mapping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion,
            fieldMap: { name: "name", email: "contact.email" },
            sourceRunId: reviewedBody.latestRun?.id,
            note: "E-posta eşlemesi veri yöneticisi tarafından onaylandı.",
          }),
        }),
        { params: Promise.resolve({ id: mappingConfigId }) }
      );

    const approved = await approve(1);
    const approvedBody = (await approved.json()) as {
      configVersion: number;
      approvedSuggestionCount: number;
      fieldMap: Record<string, string>;
    };
    expect(approved.status).toBe(200);
    expect(approvedBody.configVersion).toBe(2);
    expect(approvedBody.approvedSuggestionCount).toBeGreaterThanOrEqual(1);
    expect(approvedBody.fieldMap).toEqual({ name: "name", email: "contact.email" });

    const stale = await approve(1);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "CONNECTOR_MAPPING_CONFLICT", currentVersion: 2 });

    const history = await getDb().query<{ version: number; config: { fieldMap: Record<string, string> } }>(
      `SELECT version, config FROM connector_config_versions
        WHERE org_id = $1 AND config_id = $2 ORDER BY version`,
      [ORG_A, mappingConfigId]
    );
    expect(history.rows.map((row) => Number(row.version))).toEqual([1, 2]);
    expect(history.rows[0].config.fieldMap).toEqual({ name: "name" });
    expect(history.rows[1].config.fieldMap).toEqual({ name: "name", email: "contact.email" });

    const audit = await getDb().query<{ actor: string; detail: string }>(
      `SELECT actor, detail FROM audit_events
        WHERE org_id = $1 AND type = 'connector_mapping_approved'
        ORDER BY created_at DESC LIMIT 1`,
      [ORG_A]
    );
    expect(audit.rows[0]?.actor).toBe("cn-admin-a");
    expect(JSON.parse(audit.rows[0]?.detail ?? "{}")).toMatchObject({
      configId: mappingConfigId,
      actorRef: "cn-admin-a",
      approvedBy: "cn-admin-a",
      mappingHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    await expect(
      getDb().query(
        `UPDATE connector_config_versions SET change_summary = 'kurcalandi'
          WHERE org_id = $1 AND config_id = $2 AND version = 2`,
        [ORG_A, mappingConfigId]
      )
    ).rejects.toThrow(/append-only/i);

    nextHeaders.__setTestCookie(SESSION_COOKIE, adminB);
    const crossTenant = await connectorMappingRoute.GET(
      new NextRequest(`http://localhost/api/connectors/${mappingConfigId}/mapping`),
      { params: Promise.resolve({ id: mappingConfigId }) }
    );
    expect(crossTenant.status).toBe(404);
  });

  it("audit yazımı başarısızsa eşleme sürümünü ve konfigürasyonu geri alır", async () => {
    const configId = await createConnectorConfig({
      orgId: ORG_A,
      connectorId: "rest-generic",
      name: "Atomik audit",
      config: BASE_CONFIG,
      createdBy: "cn-admin-a",
    });
    await expect(
      approveConnectorMapping({
        orgId: ORG_A,
        configId,
        expectedVersion: 1,
        config: { ...BASE_CONFIG, fieldMap: { name: "full_name" } },
        changeSummary: "Audit hata testi",
        actor: "cn-admin-a",
        audit: {
          type: "connector_mapping_approved",
          summary: "Hata enjekte edilmiş audit",
          detail: "{}",
        },
        auditWriter: async () => {
          throw new Error("audit insert failed");
        },
      })
    ).rejects.toThrow("audit insert failed");

    const state = await getDb().query<{
      config_version: number;
      field_map: Record<string, string>;
      version_count: number;
    }>(
      `SELECT c.config_version,
              c.config->'fieldMap' AS field_map,
              (SELECT count(*)::int FROM connector_config_versions v
                WHERE v.org_id = c.org_id AND v.config_id = c.id) AS version_count
         FROM connector_configs c WHERE c.org_id = $1 AND c.id = $2`,
      [ORG_A, configId]
    );
    expect(state.rows[0]).toMatchObject({
      config_version: 1,
      field_map: BASE_CONFIG.fieldMap,
      version_count: 1,
    });
  });

  it("due konnektörü atomik sahiplenir, ikinci sahiplenmeyi ve aktif run'ı reddeder", async () => {
    const now = new Date("2026-03-01T00:00:00.000Z");
    const orgId = `org-scheduler-claim-${randomUUID()}`;
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')",
      [orgId, "Scheduler Claim"]
    );
    const id = await createDueConfig(orgId, "Claim", "/claim");

    const first = await claimScheduledSyncRun({ orgId, configId: id, now });
    expect(first.runId).toBeTruthy();
    expect(first.skippedReason).toBeNull();
    expect(new Date(first.nextRunAt ?? 0).getTime()).toBeGreaterThan(now.getTime());
    const second = await claimScheduledSyncRun({ orgId, configId: id, now });
    expect(second).toMatchObject({ runId: null, skippedReason: "not_due" });
    await finishSyncRun({
      orgId,
      runId: first.runId!,
      status: "success",
      pages: 0,
      readCount: 0,
      writtenCount: 0,
      skippedCount: 0,
      checkpoint: null,
    });

    await getDb().query(
      "UPDATE connector_configs SET next_run_at = $3 WHERE org_id = $1 AND id = $2",
      [orgId, id, now.toISOString()]
    );
    const manualRun = await startSyncRun(orgId, id);
    const busy = await claimScheduledSyncRun({ orgId, configId: id, now });
    expect(busy).toMatchObject({ runId: null, skippedReason: "busy" });
    expect(new Date(busy.nextRunAt ?? 0).getTime()).toBeGreaterThan(now.getTime());
    await finishSyncRun({
      orgId,
      runId: manualRun,
      status: "success",
      pages: 0,
      readCount: 0,
      writtenCount: 0,
      skippedCount: 0,
      checkpoint: null,
    });
    await getDb().query(
      "UPDATE connector_configs SET next_run_at = $3 WHERE org_id = $1 AND id = $2",
      [orgId, id, "2099-01-01T00:00:00.000Z"]
    );
  });

  it("zamanlayıcı başarılı ve başarısız konnektörleri birbirinden bağımsız işler", async () => {
    const orgId = `org-scheduler-run-${randomUUID()}`;
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')",
      [orgId, "Scheduler Run"]
    );
    const okId = await createDueConfig(orgId, "Scheduled OK", "/scheduled-ok");
    const failId = await createDueConfig(orgId, "Scheduled Fail", "/scheduled-fail");
    pinnedFetch.mockImplementation((async (input: URL | RequestInfo) => {
      if (String(input).includes("/scheduled-fail")) {
        return new Response("bad request", { status: 400 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "scheduled-customer-1",
              name: "Scheduled Customer",
              updated_at: "2026-04-01T00:00:00.000Z",
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch);

    const now = new Date("2026-04-02T00:00:00.000Z");
    const summary = await runDueConnectorSyncs({ orgId, now, limit: 10 });
    expect(summary).toMatchObject({
      scope: "organization",
      dueCount: 2,
      succeeded: 1,
      failed: 1,
      skipped: 0,
    });
    const ok = summary.outcomes.find((outcome) => outcome.configId === okId);
    const failed = summary.outcomes.find((outcome) => outcome.configId === failId);
    expect(ok).toMatchObject({ status: "success", writtenCount: 1 });
    expect(failed).toMatchObject({ status: "failed" });
    expect(failed?.error).toContain("400");

    const okRuns = await listSyncRuns(orgId, okId);
    const failedRuns = await listSyncRuns(orgId, failId);
    expect(okRuns[0]).toMatchObject({ status: "success", trigger: "scheduled" });
    expect(failedRuns[0]).toMatchObject({ status: "failed", trigger: "scheduled" });
    const next = await runDueConnectorSyncs({ orgId, now: new Date(now.getTime() + 1_000), limit: 10 });
    expect(next.dueCount).toBe(0);
    await getDb().query(
      `UPDATE connector_configs
          SET next_run_at = '2099-01-01T00:00:00.000Z'
        WHERE org_id = $1 AND id = ANY($2::text[])`,
      [orgId, [okId, failId]]
    );
  });

  it("zamanlayıcı rotası geçersiz token'ı reddeder, geçerli sistem token'ını kabul eder", async () => {
    const invalid = await schedulerRoute.POST(
      new NextRequest("http://localhost/api/connectors/scheduler/run", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
      })
    );
    expect(invalid.status).toBe(401);

    process.env.ABYS_SCHEDULER_TOKEN = "scheduler-test-token";
    try {
      const valid = await schedulerRoute.POST(
        new NextRequest("http://localhost/api/connectors/scheduler/run?limit=1", {
          method: "POST",
          headers: { Authorization: "Bearer scheduler-test-token" },
        })
      );
      expect(valid.status).toBe(200);
      expect(await valid.json()).toMatchObject({ scope: "all" });
    } finally {
      delete process.env.ABYS_SCHEDULER_TOKEN;
    }
  });

  it("kanonik kayıt ve kimlik bağlantıları transaction geri alınınca yazılmaz", async () => {
    const rollbackConfigId = await createConnectorConfig({
      orgId: ORG_A,
      connectorId: "rest-generic",
      name: "Rollback testi",
      config: BASE_CONFIG,
      createdBy: "cn-admin-a",
    });
    await expect(
      getDb().transaction(async (tx) => {
        await upsertCanonicalRecords(
          ORG_A,
          rollbackConfigId,
          [
            {
              entity: "customer",
              externalId: "rollback-customer",
              sourceUpdatedAt: null,
              fields: { name: "Rollback", email: "rollback@example.test" },
            },
          ],
          tx
        );
        throw new Error("test rollback");
      })
    ).rejects.toThrow("test rollback");

    const records = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM connector_records WHERE org_id = $1 AND config_id = $2",
      [ORG_A, rollbackConfigId]
    );
    const links = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM canonical_entity_links WHERE org_id = $1 AND source_config_id = $2",
      [ORG_A, rollbackConfigId]
    );
    expect(Number(records.rows[0].count)).toBe(0);
    expect(Number(links.rows[0].count)).toBe(0);
  });

  it("alias kanonik alanı KPI gözlemine kaybetmeden aktarır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const create = await connectorsRoute.POST(
      jsonReq({
        connectorId: "rest-generic",
        name: "Maliyet alias",
        config: {
          ...BASE_CONFIG,
          path: "/products",
          entity: "product",
          updatedAtField: "observed_at",
          fieldMap: {
            name: "name",
            unitCost: "cost",
            observedAt: "observed_at",
          },
          kpiFieldMap: { unitCost: "Alias birim maliyet" },
          kpiObservedAtField: "observedAt",
        },
      })
    );
    expect(create.status).toBe(200);
    const aliasConfigId = ((await create.json()) as { id: string }).id;

    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "alias-product-1",
              name: "Motor",
              cost: "8.5",
              observed_at: "2026-02-01T00:00:00Z",
            },
          ],
        }),
        { status: 200 }
      )) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    pinnedFetch.mockImplementation(fakeFetch);

    const synced = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: aliasConfigId }),
    });
    const body = (await synced.json()) as { kpiObservationCount: number; skippedCount: number };
    expect(synced.status).toBe(200);
    expect(body).toMatchObject({ kpiObservationCount: 1, skippedCount: 0 });

    const stored = await getDb().query<{
      data: { contractVersion: string; fields: Record<string, unknown> };
    }>(
      "SELECT data FROM connector_records WHERE org_id = $1 AND config_id = $2",
      [ORG_A, aliasConfigId]
    );
    expect(stored.rows[0].data.contractVersion).toBe("1.0");
    expect(stored.rows[0].data.fields).toMatchObject({ unit_cost: 8.5 });
    expect(stored.rows[0].data.fields).not.toHaveProperty("unitCost");
  });

  it("kanonik kayıtları KPI ve süreç olayına aktarır; tahmin, anomali ve süreç zekâsı tüketir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const values = [95, 105, 100, 110, 90, 105, 95, 100, 105, 95, 500];
    const rows = values.map((amount, index) => {
      const observedAt = new Date(Date.now() - (values.length - index) * 86_400_000).toISOString();
      return {
        id: `order-${index}`,
        amount,
        customer_id: "customer-1",
        stage: index === values.length - 1 ? "order.approved" : "order.created",
        observed_at: observedAt,
      };
    });
    const create = await connectorsRoute.POST(
      jsonReq({
        connectorId: "rest-generic",
        name: "Sipariş akışı",
        config: {
          ...BASE_CONFIG,
          entity: "order",
          idField: "id",
          updatedAtField: "observed_at",
          recordsPath: "data",
          fieldMap: {
            amount: "amount",
            customerId: "customer_id",
            stage: "stage",
            observedAt: "observed_at",
          },
          kpiFieldMap: { amount: "Sipariş Tutarı" },
          kpiObservedAtField: "observedAt",
          eventTypeField: "stage",
          eventSubjectField: "customerId",
          eventTimeField: "observedAt",
        },
      })
    );
    expect(create.status).toBe(200);
    promotedConfigId = ((await create.json()) as { id: string }).id;

    const fakeFetch = (async () =>
      new Response(JSON.stringify({ data: rows }), { status: 200 })) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    pinnedFetch.mockImplementation(fakeFetch);
    const synced = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: promotedConfigId }),
    });
    const body = (await synced.json()) as {
      status: string;
      fetchedCount: number;
      canonicalizedCount: number;
      kpiObservationCount: number;
      processEventCount: number;
    };
    expect(synced.status).toBe(200);
    expect(body).toMatchObject({
      status: "success",
      fetchedCount: 11,
      canonicalizedCount: 11,
      kpiObservationCount: 11,
      processEventCount: 11,
    });

    const repeated = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: promotedConfigId }),
    });
    expect(((await repeated.json()) as { processEventCount: number }).processEventCount).toBe(0);

    const runs = await runsRoute.GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: promotedConfigId }),
    });
    expect(((await runs.json()) as { promotion: unknown }).promotion).toEqual({
      kpiObservations: 11,
      processEvents: 11,
    });

    const forecast = await forecastRoute.GET(
      new NextRequest(
        `http://localhost/api/forecast?label=${encodeURIComponent("Sipariş Tutarı")}&horizon=2`
      )
    );
    const forecastBody = (await forecast.json()) as {
      forecast: { points: unknown[] } | null;
      provenance: { numericPoints: number };
    };
    expect(forecast.status).toBe(200);
    expect(forecastBody.forecast?.points).toHaveLength(2);
    expect(forecastBody.provenance.numericPoints).toBe(11);

    const anomalies = await anomalyRoute.GET();
    const anomalyBody = (await anomalies.json()) as {
      results: { label: string; entity: string | null; externalId: string | null }[];
    };
    expect(anomalies.status).toBe(200);
    // Her sipariş ayrı bir varlıktır (order-0 … order-10); 11 siparişi tek
    // etiket altında birleştirmek yapay bir "500" aykırılığı üretirdi. Kapsamlı
    // seri kimliği bunu engeller: her sipariş tek noktalık ayrı seridir.
    expect(anomalyBody.results.map((result) => result.label)).not.toContain("Sipariş Tutarı");
    const orderSeries = await getDb().query<{ series: number; points: number }>(
      `SELECT count(DISTINCT external_id)::int AS series,
              count(*)::int AS points
         FROM kpi_values
        WHERE org_id = $1 AND label = 'Sipariş Tutarı'`,
      [ORG_A]
    );
    expect(orderSeries.rows[0]).toMatchObject({ series: 11, points: 11 });

    const process = await getProcessEvents(ORG_A, 90);
    expect(process.rows.filter((event) => event.subject === "customer-1")).toHaveLength(11);
    expect(process.rows.map((event) => event.type)).toContain("order.approved");
  });

  it("paket formülüyle hesaplanan KPI'yı idempotent üretip tahmin hattına aktarır", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const create = await connectorsRoute.POST(
      jsonReq({
        connectorId: "rest-generic",
        name: "Üretim verimi",
        config: {
          ...BASE_CONFIG,
          path: "/production",
          entity: "product",
          updatedAtField: "observedAt",
          fieldMap: {
            good_units: "good_units",
            total_units: "total_units",
            observedAt: "observed_at",
          },
          computedKpiMap: { "manufacturing:first_pass_yield": "Hesaplanan FPY" },
          kpiObservedAtField: "observedAt",
        },
      })
    );
    expect(create.status).toBe(200);
    const computedConfigId = ((await create.json()) as { id: string }).id;

    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `p-${index}`,
      good_units: 90 + (index % 3),
      total_units: 100,
      observed_at: new Date(Date.now() - (12 - index) * 86_400_000).toISOString(),
    }));
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ data: rows }), { status: 200 })) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    pinnedFetch.mockImplementation(fakeFetch);

    const synced = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: computedConfigId }),
    });
    const body = (await synced.json()) as {
      kpiObservationCount: number;
      computedKpiObservationCount: number;
      processEventCount: number;
    };
    expect(synced.status).toBe(200);
    expect(body).toMatchObject({
      kpiObservationCount: 12,
      computedKpiObservationCount: 12,
      processEventCount: 0,
    });

    const stored = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM kpi_values WHERE org_id = $1 AND label = $2",
      [ORG_A, "Hesaplanan FPY"]
    );
    expect(Number(stored.rows[0].count)).toBe(12);

    const repeated = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: computedConfigId }),
    });
    expect(repeated.status).toBe(200);
    const after = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM kpi_values WHERE org_id = $1 AND label = $2",
      [ORG_A, "Hesaplanan FPY"]
    );
    expect(Number(after.rows[0].count)).toBe(12);

    const forecast = await forecastRoute.GET(
      new NextRequest(
        `http://localhost/api/forecast?label=${encodeURIComponent("Hesaplanan FPY")}&horizon=2`
      )
    );
    const forecastBody = (await forecast.json()) as {
      forecast: { points: unknown[] } | null;
      provenance: { numericPoints: number };
    };
    expect(forecast.status).toBe(200);
    expect(forecastBody.provenance.numericPoints).toBe(12);
    expect(forecastBody.forecast?.points).toHaveLength(2);
  });

  it("kanonik sözleşme ihlallerini karantinaya alır ve geçerli kayıtları zekâ hattına geçirir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const create = await connectorsRoute.POST(
      jsonReq({
        connectorId: "rest-generic",
        name: "Ürün kalitesi",
        config: {
          ...BASE_CONFIG,
          path: "/products",
          entity: "product",
          updatedAtField: "observed_at",
          recordsPath: "data",
          fieldMap: {
            name: "profile.name",
            price: "price",
            unit_cost: "unit_cost",
          },
          pagination: { type: "none" },
        },
      })
    );
    expect(create.status).toBe(200);
    const qualityConfigId = ((await create.json()) as { id: string }).id;

    const rows = [
      {
        id: "p-1",
        profile: { name: "Motor" },
        price: "12.50",
        unit_cost: "8",
        contact: { email: "buyer@example.test" },
        observed_at: "2026-02-01T00:00:00Z",
      },
      { id: "p-2", profile: { name: "Bozuk fiyat" }, price: "abc", observed_at: "2026-02-02T00:00:00Z" },
      { id: "p-3", profile: { name: "Bozuk tarih" }, price: "10", observed_at: "geçersiz" },
      { profile: { name: "Kimliksiz" }, price: "10", observed_at: "2026-02-03T00:00:00Z" },
    ];
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ data: rows }), { status: 200 })) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    pinnedFetch.mockImplementation(fakeFetch);

    const synced = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: qualityConfigId }),
    });
    const body = (await synced.json()) as {
      fetchedCount: number;
      canonicalizedCount: number;
      rejectedCount: number;
      quarantinedCount: number;
      skippedCount: number;
      sourceSchema: { path: string }[];
      mappingSuggestions: { canonicalField: string; sourcePath: string }[];
    };
    expect(synced.status).toBe(200);
    expect(body).toMatchObject({
      fetchedCount: 4,
      canonicalizedCount: 1,
      rejectedCount: 3,
      quarantinedCount: 3,
      skippedCount: 3,
    });
    expect(body.sourceSchema.map((field) => field.path)).toEqual(
      expect.arrayContaining(["profile.name", "price", "contact.email"])
    );
    expect(body.mappingSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalField: "name", sourcePath: "profile.name" }),
        expect.objectContaining({ canonicalField: "price", sourcePath: "price" }),
      ])
    );

    const stored = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM connector_records WHERE org_id = $1 AND config_id = $2",
      [ORG_A, qualityConfigId]
    );
    expect(Number(stored.rows[0].count)).toBe(1);

    const issues = await getDb().query<{ code: string; connector_run_id: string }>(
      `SELECT code, connector_run_id FROM data_quality_issues
        WHERE org_id = $1 AND source = $2 ORDER BY code`,
      [ORG_A, `connector:${qualityConfigId}`]
    );
    expect(issues.rows.map((row) => row.code)).toEqual(
      expect.arrayContaining(["INVALID_FIELD_TYPE", "INVALID_SOURCE_UPDATED_AT", "MISSING_EXTERNAL_ID"])
    );
    expect(issues.rows.every((row) => row.connector_run_id.length > 0)).toBe(true);

    const runs = await runsRoute.GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: qualityConfigId }),
    });
    const runBody = (await runs.json()) as {
      runs: {
        rejectedCount: number;
        sourceSchema: { path: string }[];
        mappingSuggestions: { canonicalField: string }[];
      }[];
    };
    expect(runBody.runs[0]).toMatchObject({ rejectedCount: 3 });
    expect(runBody.runs[0].sourceSchema.map((field) => field.path)).toContain("contact.email");
    expect(runBody.runs[0].mappingSuggestions.map((suggestion) => suggestion.canonicalField)).toContain(
      "price"
    );
  });

  it("başka org konfigürasyona erişemez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminB);
    const list = await connectorsRoute.GET(new NextRequest("http://localhost/api/connectors"));
    expect(((await list.json()) as { configs: unknown[] }).configs).toHaveLength(0);

    const sync = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: configId }),
    });
    expect(sync.status).toBe(404);
  });

  it("bilinmeyen konnektör ve geçersiz konfig 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    expect(
      (await connectorsRoute.POST(jsonReq({ connectorId: "soap-legacy", name: "X", config: BASE_CONFIG }))).status
    ).toBe(400);
    expect(
      (
        await connectorsRoute.POST(
          jsonReq({
            connectorId: "rest-generic",
            name: "Bozuk",
            config: { ...BASE_CONFIG, fieldMap: {} },
          })
        )
      ).status
    ).toBe(400);
  });

  it("bağlantı testi veri yazmadan çalışır, izin ve org sınırını uygular", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const forbidden = await testRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: configId }),
    });
    expect(forbidden.status).toBe(403);

    nextHeaders.__setTestCookie(SESSION_COOKIE, adminB);
    const notFound = await testRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: configId }),
    });
    expect(notFound.status).toBe(404);

    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ data: [{ id: "c1", name: "Acme", updated_at: "2026-01-05T00:00:00Z" }] }),
        { status: 200 }
      )) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    pinnedFetch.mockImplementation(fakeFetch);

    const runsBefore = await listSyncRuns(ORG_A, configId);
    const res = await testRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: configId }),
    });
    const body = (await res.json()) as { ok: boolean; recordsSeen: number; httpStatus: number };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.recordsSeen).toBe(1);
    expect(body.httpStatus).toBe(200);

    // Test hiçbir senkron çalıştırması/kanonik kaydı oluşturmaz.
    const runsAfter = await listSyncRuns(ORG_A, configId);
    expect(runsAfter.length).toBe(runsBefore.length);

    const auditRows = await getDb().query<{ type: string; detail: string }>(
      "SELECT type, detail FROM audit_events WHERE org_id = $1 AND type = 'connector_connection_tested'",
      [ORG_A]
    );
    expect(auditRows.rows.some((row) => row.detail === configId)).toBe(true);
  });

});
