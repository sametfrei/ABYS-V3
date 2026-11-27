import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-canonical-survivorship-${process.pid}-${randomUUID()}`
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
const { GET: listCanonical } = await import("../src/app/api/canonical-entities/route");
const { GET: getCanonical } = await import("../src/app/api/canonical-entities/[id]/route");
const { GET: getPolicies, PUT: putPolicies } = await import(
  "../src/app/api/survivorship-policies/route"
);

const ORG = "org-survivorship";
const OTHER_ORG = "org-survivorship-other";
const BASE_CONFIG = {
  kind: "rest" as const,
  baseUrl: "https://survivorship.example.test",
  path: "/customers",
  authType: "none" as const,
  entity: "customer" as const,
  idField: "id",
  fieldMap: {},
  pagination: { type: "none" as const },
};

function request(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("kanonik altın kayıt ve kaynak güven sırası", () => {
  let session = "";
  let configA = "";
  let configB = "";
  let configOther = "";
  let canonicalId = "";

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Survivorship', 'other')", [ORG]);
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Other', 'other')", [OTHER_ORG]);
    const password = hashPassword("mevcut-parola-123");
    await db.query(
      `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
       VALUES ('survivorship-admin', $1, 'admin@survivorship.test', 'Veri Yöneticisi', 'data_admin', $2),
              ('survivorship-other', $3, 'admin@survivorship-other.test', 'Other Admin', 'data_admin', $2)`,
      [ORG, password, OTHER_ORG]
    );
    session = await createSession("survivorship-admin", ORG);
    configA = await createConnectorConfig({
      orgId: ORG,
      connectorId: "rest-generic",
      name: "CRM",
      config: BASE_CONFIG,
      createdBy: "survivorship-admin",
    });
    configB = await createConnectorConfig({
      orgId: ORG,
      connectorId: "rest-generic",
      name: "ERP",
      config: BASE_CONFIG,
      createdBy: "survivorship-admin",
    });
    configOther = await createConnectorConfig({
      orgId: OTHER_ORG,
      connectorId: "rest-generic",
      name: "Other ERP",
      config: BASE_CONFIG,
      createdBy: "survivorship-other",
    });

    await upsertCanonicalRecords(ORG, configA, [
      {
        entity: "customer",
        externalId: "crm-1",
        sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
        fields: { name: "CRM Adı", email: "shared@survivorship.test", phone: "111" },
      },
    ]);
    await upsertCanonicalRecords(ORG, configB, [
      {
        entity: "customer",
        externalId: "erp-1",
        sourceUpdatedAt: "2026-10-01T00:00:00.000Z",
        fields: { name: "ERP Adı", email: "shared@survivorship.test", country: "TR" },
      },
    ]);
    const link = await getDb().query<{ canonical_entity_id: string }>(
      `SELECT canonical_entity_id FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND source_external_id = 'crm-1'`,
      [ORG, configA]
    );
    canonicalId = link.rows[0].canonical_entity_id;
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("politika yokken güncel kaynağı seçer ve alan kaynağını raporlar", async () => {
    const res = await getCanonical(
      request("GET", `http://localhost/api/canonical-entities/${canonicalId}?entity=customer`),
      { params: Promise.resolve({ id: canonicalId }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      record: {
        fields: Record<string, unknown>;
        fieldProvenance: Record<string, { sourceConfigId: string; conflict: boolean }>;
        coverage: { sourceCount: number; conflictingFieldCount: number };
        policy: { applied: boolean };
      };
    };
    expect(body.record.coverage).toMatchObject({ sourceCount: 2, conflictingFieldCount: 1 });
    expect(body.record.policy.applied).toBe(false);
    expect(body.record.fields.name).toBe("ERP Adı");
    expect(body.record.fieldProvenance.name).toMatchObject({
      sourceConfigId: configB,
      conflict: true,
    });
    expect(body.record.fields.phone).toBe("111");
    expect(body.record.fields.country).toBe("TR");
  });

  it("kaynak güven sırası alan seçimini açıkça değiştirir ve denetlenebilir", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const put = await putPolicies(
      request("PUT", "http://localhost/api/survivorship-policies", {
        entity: "customer",
        priorities: [
          { sourceConfigId: configA, priority: 1 },
          { sourceConfigId: configB, priority: 2 },
        ],
      })
    );
    expect(put.status).toBe(200);
    const policies = (await put.json()) as { policies: Array<{ sourceConfigId: string; priority: number }> };
    expect(policies.policies).toEqual([
      expect.objectContaining({ sourceConfigId: configA, priority: 1 }),
      expect.objectContaining({ sourceConfigId: configB, priority: 2 }),
    ]);

    const res = await getCanonical(
      request("GET", `http://localhost/api/canonical-entities/${canonicalId}?entity=customer`),
      { params: Promise.resolve({ id: canonicalId }) }
    );
    const body = (await res.json()) as {
      record: {
        fields: Record<string, unknown>;
        fieldProvenance: Record<string, { sourceConfigId: string }>;
        policy: { applied: boolean; rule: string };
      };
    };
    expect(body.record.fields.name).toBe("CRM Adı");
    expect(body.record.fieldProvenance.name.sourceConfigId).toBe(configA);
    expect(body.record.policy).toMatchObject({ applied: true });
    expect(body.record.policy.rule).toContain("kaynak güven sırası");

    const audit = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_events WHERE org_id = $1 AND type = 'survivorship_policy_updated'",
      [ORG]
    );
    expect(Number(audit.rows[0].count)).toBe(1);
  });

  it("çok kaynaklı altın kayıtları listeler ve tek kaynaklıları dışlar", async () => {
    const res = await listCanonical(
      request("GET", "http://localhost/api/canonical-entities?entity=customer")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      records: Array<{ canonicalEntityId: string; sourceCount: number; recordCount: number; label: string }>;
    };
    expect(body.records).toEqual([
      expect.objectContaining({
        canonicalEntityId: canonicalId,
        sourceCount: 2,
        recordCount: 2,
        label: "CRM Adı",
        conflictCount: 1,
        policyApplied: true,
      }),
    ]);

    const policyRes = await getPolicies(
      request("GET", "http://localhost/api/survivorship-policies?entity=customer")
    );
    expect(policyRes.status).toBe(200);
    expect((await policyRes.json()).policies).toHaveLength(2);
  });

  it("başka tenant kaynağını politikaya kabul etmez ve altın kaydı sızdırmaz", async () => {
    const put = await putPolicies(
      request("PUT", "http://localhost/api/survivorship-policies", {
        entity: "customer",
        priorities: [{ sourceConfigId: configOther, priority: 1 }],
      })
    );
    expect(put.status).toBe(400);
    expect(await put.json()).toMatchObject({ code: "INVALID_SOURCE" });

    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    const unauthorized = await getCanonical(
      request("GET", `http://localhost/api/canonical-entities/${canonicalId}`),
      { params: Promise.resolve({ id: canonicalId }) }
    );
    expect(unauthorized.status).toBe(401);
  });

  it("aynı önceliği kabul etmez ve mevcut politikayı sessizce bozmaz", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const res = await putPolicies(
      request("PUT", "http://localhost/api/survivorship-policies", {
        entity: "customer",
        priorities: [
          { sourceConfigId: configA, priority: 1 },
          { sourceConfigId: configB, priority: 1 },
        ],
      })
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "DUPLICATE_PRIORITY" });
    const policies = await getPolicies(
      request("GET", "http://localhost/api/survivorship-policies?entity=customer")
    );
    expect((await policies.json()).policies).toHaveLength(2);
  });
});
