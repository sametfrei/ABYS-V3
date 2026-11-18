import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
const { createSession, hashPassword } = await import("../src/lib/auth/core");
const { SESSION_COOKIE } = await import("../src/app/api/auth/login/route");
const { restAdapter } = await import("../src/lib/connectors/rest-adapter");
const { listDefinitions, getAdapter } = await import("../src/lib/connectors/registry");
const connectorsRoute = await import("../src/app/api/connectors/route");
const syncRoute = await import("../src/app/api/connectors/[id]/sync/route");
const runsRoute = await import("../src/app/api/connectors/[id]/runs/route");
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

  it("kayıt defteri durumları dürüsttür", () => {
    const defs = listDefinitions();
    expect(defs.find((d) => d.id === "rest-generic")?.status).toBe("ready");
    expect(defs.find((d) => d.id === "infor")?.status).toBe("planned");
    expect(getAdapter("sap")).toBeTruthy();
    expect(getAdapter("infor")).toBeUndefined();
  });
});

const ORG_A = "org-cn-a";
const ORG_B = "org-cn-b";

describe("Konnektör API'si", () => {
  let adminA: string;
  let adminB: string;
  let ceoA: string;
  let configId = "";

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

  it("tanım oluşturur ve listeler (sır değeri dönmez)", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const res = await connectorsRoute.POST(
      jsonReq({ connectorId: "rest-generic", name: "CRM", config: BASE_CONFIG })
    );
    const body = (await res.json()) as { id: string };
    expect(res.status).toBe(200);
    configId = body.id;

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoA);
    const list = await connectorsRoute.GET();
    const listBody = (await list.json()) as {
      configs: { id: string; config: Record<string, unknown> }[];
      definitions: unknown[];
    };
    expect(listBody.definitions.length).toBeGreaterThan(5);
    expect(listBody.configs).toHaveLength(1);
    expect(JSON.stringify(listBody.configs[0].config)).not.toContain("secret-value");
  });

  it("senkron çalışır, idempotent yazar ve geçmiş döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ data: [{ id: "c1", name: "Acme", updated_at: "2026-01-05T00:00:00Z" }] }),
        { status: 200 }
      )) as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);

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
    };
    expect(runsBody.runs).toHaveLength(2);
    expect(runsBody.records[0]).toEqual({ entity: "customer", count: 1 });
  });

  it("başka org konfigürasyona erişemez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminB);
    const list = await connectorsRoute.GET();
    expect(((await list.json()) as { configs: unknown[] }).configs).toHaveLength(0);

    const sync = await syncRoute.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: configId }),
    });
    expect(sync.status).toBe(404);
  });

  it("planned konnektör ve geçersiz konfig 400 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, adminA);
    expect(
      (await connectorsRoute.POST(jsonReq({ connectorId: "infor", name: "X", config: BASE_CONFIG }))).status
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
});
