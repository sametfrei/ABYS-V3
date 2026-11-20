import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-semantic-neighborhood-${process.pid}-${randomUUID()}`
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
const { createConnectorConfig, upsertCanonicalRecords } = await import("../src/lib/db/repos/connectors");
const { GET: neighborhood } = await import(
  "../src/app/api/semantic-graph/neighborhood/route"
);

const ORG = "org-semantic-neighborhood";

describe("semantik grafik komşuluk API'si", () => {
  let sessionId = "";
  let configAId = "";
  let configBId = "";

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Neighborhood', 'other')",
      [ORG]
    );
    await db.query(
      `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
       VALUES ('semantic-user', $1, 'semantic@example.test', 'Semantic User', 'ceo', $2)`,
      [ORG, hashPassword("mevcut-parola-123")]
    );
    sessionId = await createSession("semantic-user", ORG);

    configAId = await createConnectorConfig({
      orgId: ORG,
      connectorId: "rest-generic",
      name: "Semantic A",
      config: {
        kind: "rest",
        baseUrl: "https://a.example.test",
        path: "/",
        authType: "none",
        entity: "customer",
        idField: "id",
        fieldMap: {},
        pagination: { type: "none" },
      },
      createdBy: "semantic-user",
    });
    configBId = await createConnectorConfig({
      orgId: ORG,
      connectorId: "rest-generic",
      name: "Semantic B",
      config: {
        kind: "rest",
        baseUrl: "https://b.example.test",
        path: "/",
        authType: "none",
        entity: "invoice",
        idField: "id",
        fieldMap: {},
        pagination: { type: "none" },
      },
      createdBy: "semantic-user",
    });
    await upsertCanonicalRecords(ORG, configAId, [
      {
        entity: "customer",
        externalId: "c1",
        sourceUpdatedAt: null,
        fields: { name: "Acme", email: "acme@example.test" },
      },
      {
        entity: "order",
        externalId: "o1",
        sourceUpdatedAt: null,
        fields: { amount: 100, customerId: "c1" },
      },
      {
        entity: "invoice",
        externalId: "i1",
        sourceUpdatedAt: null,
        fields: { amount: 100, orderId: "o1" },
      },
    ]);
    await upsertCanonicalRecords(ORG, configBId, [
      {
        entity: "invoice",
        externalId: "i2",
        sourceUpdatedAt: null,
        fields: { amount: 100, orderId: "o1" },
      },
    ]);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("oturum yoksa 401 döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    const res = await neighborhood(new NextRequest("http://localhost/api/semantic-graph/neighborhood?root=c1"));
    expect(res.status).toBe(401);
  });

  it("iki hop komşuluğu ve kaynaklar arası referansı döner", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionId);
    const res = await neighborhood(
      new NextRequest(
        "http://localhost/api/semantic-graph/neighborhood?root=c1&entity=customer&depth=2&direction=both"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      root: { ref: string; entity: string };
      traversal: {
        nodes: Array<{ id: string; entity: string; ref: string; sourceConfigIds: string[] }>;
        edges: Array<{ from: string; to: string; sourceConfigId: string }>;
        truncated: boolean;
      };
    };
    expect(body.root).toMatchObject({ ref: "c1", entity: "customer" });
    expect(body.traversal.nodes).toHaveLength(4);
    expect(body.traversal.edges).toHaveLength(3);
    expect(body.traversal.truncated).toBe(false);
    const order = body.traversal.nodes.find((node) => node.entity === "order");
    const invoiceB = body.traversal.nodes.find(
      (node) => node.entity === "invoice" && node.sourceConfigIds.includes(configBId)
    );
    expect(order).toBeTruthy();
    expect(invoiceB).toBeTruthy();
    expect(
      body.traversal.edges.some(
        (edge) => edge.sourceConfigId === configBId && edge.from === invoiceB?.id && edge.to === order?.id
      )
    ).toBe(true);
  });

  it("tek hop ve yön sınırını uygular", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionId);
    const inbound = await neighborhood(
      new NextRequest(
        "http://localhost/api/semantic-graph/neighborhood?root=c1&entity=customer&depth=1&direction=inbound"
      )
    );
    const inboundBody = (await inbound.json()) as { traversal: { nodes: unknown[] } };
    expect(inboundBody.traversal.nodes).toHaveLength(2);

    const outbound = await neighborhood(
      new NextRequest(
        "http://localhost/api/semantic-graph/neighborhood?root=c1&entity=customer&depth=2&direction=outbound"
      )
    );
    const outboundBody = (await outbound.json()) as { traversal: { nodes: unknown[] } };
    expect(outboundBody.traversal.nodes).toHaveLength(1);
  });
});
