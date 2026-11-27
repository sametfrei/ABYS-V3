import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-enterprise-state-${process.pid}-${randomUUID()}`
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
const { createConnectorConfig, upsertCanonicalRecords } = await import(
  "../src/lib/db/repos/connectors"
);
const { getEnterpriseState } = await import("../src/lib/db/repos/enterprise-state");
const { GET: digitalTwin } = await import("../src/app/api/digital-twin/route");

const ORG = "org-enterprise-state";
const OTHER_ORG = "org-enterprise-state-other";
const NOW = new Date("2026-08-01T12:00:00.000Z");

function config(entity: "customer" | "order" | "invoice" | "payment" | "account" | "project" | "inventory" | "event") {
  return {
    kind: "rest" as const,
    baseUrl: `https://${entity}.example.test`,
    path: "/",
    authType: "none" as const,
    entity,
    idField: "id",
    fieldMap: {},
    pagination: { type: "none" as const },
  };
}

describe("kurumsal dijital ikiz mevcut durum projeksiyonu", () => {
  let session = "";

  beforeAll(async () => {
    await migrate();
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'State', 'other'), ($2, 'Other State', 'other')",
      [ORG, OTHER_ORG]
    );
    const password = hashPassword("mevcut-parola-123");
    await getDb().query(
      `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
       VALUES ('state-admin', $1, 'state@example.test', 'State Admin', 'ceo', $2)`,
      [ORG, password]
    );
    session = await createSession("state-admin", ORG);

    const crm = await createConnectorConfig({
      orgId: ORG,
      connectorId: "rest-generic",
      name: "CRM",
      config: config("customer"),
      createdBy: "state-admin",
    });
    const erp = await createConnectorConfig({
      orgId: ORG,
      connectorId: "rest-generic",
      name: "ERP",
      config: config("customer"),
      createdBy: "state-admin",
    });
    await upsertCanonicalRecords(ORG, crm, [
      { entity: "customer", externalId: "crm-c1", sourceUpdatedAt: null, fields: { name: "Acme", email: "acme@state.test" } },
    ]);
    await upsertCanonicalRecords(ORG, erp, [
      { entity: "customer", externalId: "erp-c1", sourceUpdatedAt: null, fields: { name: "Acme ERP", email: "acme@state.test" } },
      { entity: "order", externalId: "o1", sourceUpdatedAt: null, fields: { total_amount: 100, currency: "USD", customerId: "crm-c1" } },
      { entity: "order", externalId: "o2", sourceUpdatedAt: null, fields: { total_amount: 200, currency: "TRY" } },
      { entity: "order", externalId: "o3", sourceUpdatedAt: null, fields: { total_amount: 30 } },
      { entity: "invoice", externalId: "i1", sourceUpdatedAt: null, fields: { amount: 50, currency: "USD" } },
      { entity: "payment", externalId: "p1", sourceUpdatedAt: null, fields: { amount: 20, currency: "USD" } },
      { entity: "account", externalId: "a1", sourceUpdatedAt: null, fields: { balance: -10, currency: "USD" } },
      { entity: "project", externalId: "pr1", sourceUpdatedAt: null, fields: { name: "Project", budget: 1000, currency: "USD" } },
      { entity: "inventory", externalId: "inv1", sourceUpdatedAt: null, fields: { productId: "sku-1", quantity: 4 } },
      { entity: "event", externalId: "e1", sourceUpdatedAt: null, fields: { event_type: "fulfillment" } },
    ]);

    await getDb().query(
      "UPDATE connector_records SET synced_at = $1 WHERE org_id = $2",
      ["2026-08-01T10:00:00.000Z", ORG]
    );
    await getDb().query(
      `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
       VALUES ('state-ds', $1, 'other', 'test', '{}', 'state-admin')`,
      [ORG]
    );
    await getDb().query(
      `INSERT INTO kpi_values (id, org_id, dataset_id, label, value, created_at)
       VALUES ('kpi-old', $1, 'state-ds', 'Operating Margin', '12', '2026-07-01T00:00:00.000Z'),
              ('kpi-new', $1, 'state-ds', 'Operating Margin', '18.5', '2026-08-01T09:00:00.000Z')`,
      [ORG]
    );

    const foreign = await createConnectorConfig({
      orgId: OTHER_ORG,
      connectorId: "rest-generic",
      name: "Foreign",
      config: config("order"),
      createdBy: "foreign",
    });
    await upsertCanonicalRecords(OTHER_ORG, foreign, [
      { entity: "order", externalId: "foreign-o", sourceUpdatedAt: null, fields: { total_amount: 999, currency: "USD" } },
    ]);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("varlık, para birimi, bağımlılık ve KPI durumunu kanonik kayıtlardan türetir", async () => {
    const state = await getEnterpriseState(ORG, { now: NOW });
    expect(state.coverage).toMatchObject({
      recordsRead: 11,
      canonicalEntities: 10,
      multiSourceEntities: 1,
      sourceCount: 2,
      truncated: false,
    });
    expect(state.entityCounts.find((row) => row.entity === "customer")?.count).toBe(1);
    expect(state.financials.byCurrency).toEqual([
      expect.objectContaining({ currency: "TRY", orderValue: 200, invoiceValue: 0 }),
      expect.objectContaining({
        currency: "USD",
        orderValue: 100,
        invoiceValue: 50,
        paymentValue: 20,
        accountBalance: -10,
        projectBudget: 1000,
      }),
    ]);
    expect(state.financials.unclassifiedValueCount).toBe(1);
    expect(state.operations).toMatchObject({
      inventoryQuantity: 4,
      orderCount: 3,
      invoiceCount: 1,
      paymentCount: 1,
      projectCount: 1,
      eventCount: 1,
    });
    expect(state.dependencies).toContainEqual(
      expect.objectContaining({ relation: "customer", count: 1, from: "order", to: "customer" })
    );
    expect(state.dependencies).toContainEqual(
      expect.objectContaining({ relation: "product", count: 1, from: "inventory" })
    );
    expect(state.kpis).toEqual([
      expect.objectContaining({
        label: "Operating Margin",
        value: 18.5,
        observedAt: "2026-08-01T09:00:00.000Z",
      }),
    ]);
    expect(state.freshness).toMatchObject({
      lastSyncedAt: "2026-08-01T10:00:00.000Z",
      ageMinutes: 120,
      stale: false,
    });
  });

  it("tenant sınırını korur ve API oturum ister", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect(
      (await digitalTwin(new NextRequest("http://localhost/api/digital-twin"))).status
    ).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const response = await digitalTwin(new NextRequest("http://localhost/api/digital-twin"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      orgId: string;
      financials: { byCurrency: Array<{ currency: string; orderValue: number }> };
      coverage: { recordsRead: number };
    };
    expect(body.orgId).toBe(ORG);
    expect(body.coverage.recordsRead).toBe(11);
    expect(body.financials.byCurrency.find((row) => row.currency === "USD")?.orderValue).toBe(100);
  });

  it("asOf seçilen zamandan önce yakalanmış kaynak geçmişini yeniden kurar", async () => {
    const historyConfig = await createConnectorConfig({
      orgId: ORG,
      connectorId: "rest-generic",
      name: "History ERP",
      config: config("order"),
      createdBy: "state-admin",
    });
    await upsertCanonicalRecords(ORG, historyConfig, [
      {
        entity: "order",
        externalId: "history-order",
        sourceUpdatedAt: null,
        fields: { total_amount: 10, currency: "EUR" },
      },
    ]);
    await getDb().query(
      `UPDATE connector_record_history SET captured_at = '2026-06-01T00:00:00.000Z'
        WHERE org_id = $1 AND config_id = $2 AND external_id = 'history-order'`,
      [ORG, historyConfig]
    );

    await upsertCanonicalRecords(ORG, historyConfig, [
      {
        entity: "order",
        externalId: "history-order",
        sourceUpdatedAt: null,
        fields: { total_amount: 25, currency: "EUR" },
      },
    ]);
    await upsertCanonicalRecords(ORG, historyConfig, [
      {
        entity: "order",
        externalId: "history-order",
        sourceUpdatedAt: null,
        fields: { total_amount: 25, currency: "EUR" },
      },
    ]);
    await getDb().query(
      `UPDATE connector_record_history SET captured_at = '2026-07-01T00:00:00.000Z'
        WHERE org_id = $1 AND config_id = $2 AND external_id = 'history-order'
          AND captured_at > '2026-06-01T00:00:00.000Z'`,
      [ORG, historyConfig]
    );

    const before = await getEnterpriseState(ORG, {
      asOf: new Date("2026-06-15T00:00:00.000Z"),
    });
    expect(before.coverage).toMatchObject({ mode: "historical", recordsRead: 1 });
    expect(before.financials.byCurrency).toEqual([
      expect.objectContaining({ currency: "EUR", orderValue: 10 }),
    ]);
    expect(before.coverage.graphEdgeCount).toBe(0);

    const after = await getEnterpriseState(ORG, {
      asOf: new Date("2026-07-15T00:00:00.000Z"),
    });
    expect(after.coverage).toMatchObject({ mode: "historical", recordsRead: 1 });
    expect(after.financials.byCurrency).toEqual([
      expect.objectContaining({ currency: "EUR", orderValue: 25 }),
    ]);

    const historyRows = await getDb().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM connector_record_history
        WHERE org_id = $1 AND config_id = $2 AND external_id = 'history-order'`,
      [ORG, historyConfig]
    );
    expect(Number(historyRows.rows[0].count)).toBe(2);

    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const api = await digitalTwin(
      new NextRequest("http://localhost/api/digital-twin?asOf=2026-06-15T00%3A00%3A00.000Z")
    );
    expect(api.status).toBe(200);
    expect(await api.json()).toMatchObject({
      coverage: { mode: "historical", asOf: "2026-06-15T00:00:00.000Z" },
    });

    const invalid = await digitalTwin(
      new NextRequest("http://localhost/api/digital-twin?asOf=not-a-date")
    );
    expect(invalid.status).toBe(400);
  });
});
