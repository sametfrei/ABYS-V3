import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-entity-resolution-${process.pid}-${randomUUID()}`
);

const { migrate, getDb } = await import("../src/lib/db/client");
const { upsertCanonicalRecords } = await import("../src/lib/db/repos/connectors");
const { getSemanticGraph } = await import("../src/lib/db/repos/semantic-graph");

const ORG_A = "org-resolution-a";
const ORG_B = "org-resolution-b";
const CONFIG_A = "resolution-config-a";
const CONFIG_B = "resolution-config-b";
const CONFIG_B_OTHER_ORG = "resolution-config-c";

async function addConfig(id: string, orgId: string): Promise<void> {
  await getDb().query(
    `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
     VALUES ($1, $2, 'rest-generic', $3, $4, 'test')`,
    [
      id,
      orgId,
      id,
      JSON.stringify({
        kind: "rest",
        baseUrl: "https://example.test",
        path: "/customers",
        authType: "none",
        entity: "customer",
        idField: "id",
        fieldMap: {},
        pagination: { type: "none" },
      }),
    ]
  );
}

beforeAll(async () => {
  await migrate();
  for (const [id, name] of [
    [ORG_A, "Resolution A"],
    [ORG_B, "Resolution B"],
  ]) {
    await getDb().query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [
      id,
      name,
    ]);
  }
  await addConfig(CONFIG_A, ORG_A);
  await addConfig(CONFIG_B, ORG_A);
  await addConfig(CONFIG_B_OTHER_ORG, ORG_B);
});

afterAll(async () => {
  await getDb().close();
});

describe("kaynaklar arası kanonik kimlik çözümlemesi", () => {
  it("aynı normalize e-postayı org içinde tek kimlikte birleştirir, org sınırını aşmaz", async () => {
    await upsertCanonicalRecords(ORG_A, CONFIG_A, [
      {
        entity: "customer",
        externalId: "crm-1",
        sourceUpdatedAt: null,
        fields: { name: "Acme", email: " Sales@Acme.Example " },
      },
    ]);
    await upsertCanonicalRecords(ORG_A, CONFIG_B, [
      {
        entity: "customer",
        externalId: "erp-42",
        sourceUpdatedAt: null,
        fields: { name: "Acme A.Ş.", email: "sales@acme.example" },
      },
    ]);
    await upsertCanonicalRecords(ORG_B, CONFIG_B_OTHER_ORG, [
      {
        entity: "customer",
        externalId: "other-1",
        sourceUpdatedAt: null,
        fields: { name: "Başka Org", email: "sales@acme.example" },
      },
    ]);

    const links = await getDb().query<{
      org_id: string;
      canonical_entity_id: string;
      match_strategy: string;
      match_confidence: number;
    }>(
      `SELECT org_id, canonical_entity_id, match_strategy, match_confidence
         FROM canonical_entity_links
        WHERE org_id IN ($1, $2) AND entity = 'customer'
        ORDER BY org_id, source_config_id`,
      [ORG_A, ORG_B]
    );
    const orgALinks = links.rows.filter((row) => row.org_id === ORG_A);
    const orgBLink = links.rows.find((row) => row.org_id === ORG_B);
    expect(orgALinks).toHaveLength(2);
    expect(new Set(orgALinks.map((row) => row.canonical_entity_id)).size).toBe(1);
    expect(orgALinks[0]).toMatchObject({ match_strategy: "email", match_confidence: 100 });
    expect(orgBLink?.canonical_entity_id).not.toBe(orgALinks[0].canonical_entity_id);
    expect(JSON.stringify(links.rows)).not.toContain("sales@acme.example");

    const graph = await getSemanticGraph(ORG_A);
    const customerNodes = graph.nodes.filter((node) => node.entity === "customer");
    expect(customerNodes).toHaveLength(1);
    expect(customerNodes[0].sourceConfigIds.sort()).toEqual([CONFIG_A, CONFIG_B].sort());
    expect(graph.coverage).toMatchObject({
      linkedRecordCount: 2,
      multiSourceNodeCount: 1,
    });
    expect(graph.resolution).toMatchObject({ strongLinkRecords: 2, sourceScopedRecords: 0 });
  });

  it("güçlü kimliği olmayan aynı dış kimlikleri farklı kaynaklarda yanlışlıkla birleştirmez", async () => {
    await upsertCanonicalRecords(ORG_A, CONFIG_A, [
      {
        entity: "product",
        externalId: "shared-id",
        sourceUpdatedAt: null,
        fields: { name: "Kaynak A ürünü" },
      },
    ]);
    await upsertCanonicalRecords(ORG_A, CONFIG_B, [
      {
        entity: "product",
        externalId: "shared-id",
        sourceUpdatedAt: null,
        fields: { name: "Kaynak B ürünü" },
      },
    ]);
    const links = await getDb().query<{ canonical_entity_id: string; match_strategy: string }>(
      `SELECT canonical_entity_id, match_strategy
         FROM canonical_entity_links
        WHERE org_id = $1 AND entity = 'product' AND source_external_id = 'shared-id'
        ORDER BY source_config_id`,
      [ORG_A]
    );
    expect(links.rows).toHaveLength(2);
    expect(new Set(links.rows.map((row) => row.canonical_entity_id)).size).toBe(2);
    expect(links.rows.every((row) => row.match_strategy === "source-identity")).toBe(true);
  });

  it("başka organizasyonun konnektörüne kanonik kayıt yazmayı reddeder", async () => {
    await expect(
      upsertCanonicalRecords(ORG_A, CONFIG_B_OTHER_ORG, [
        {
          entity: "customer",
          externalId: "cross-tenant",
          sourceUpdatedAt: null,
          fields: { name: "Yetkisiz" },
        },
      ])
    ).rejects.toThrow("bu organizasyona ait değil");
    const leaked = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM connector_records WHERE org_id = $1 AND external_id = 'cross-tenant'",
      [ORG_A]
    );
    expect(Number(leaked.rows[0].count)).toBe(0);
  });

  it("güçlü kimlik kaybolunca gerilemez; değişince inceleme açar ve eski bağlantıyı korur", async () => {
    const externalId = "stable-customer-identity";
    const originalEmail = "owner@stable.example";
    const replacementEmail = "replacement@stable.example";

    await upsertCanonicalRecords(ORG_A, CONFIG_A, [
      {
        entity: "customer",
        externalId,
        sourceUpdatedAt: null,
        fields: { name: "Stable Ltd", email: originalEmail },
      },
    ]);
    const first = await getDb().query<{
      canonical_entity_id: string;
      match_strategy: string;
      match_confidence: number;
    }>(
      `SELECT canonical_entity_id, match_strategy, match_confidence
         FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'customer'
          AND source_external_id = $3`,
      [ORG_A, CONFIG_A, externalId]
    );
    expect(first.rows[0]).toMatchObject({ match_strategy: "email", match_confidence: 100 });

    await upsertCanonicalRecords(ORG_A, CONFIG_A, [
      {
        entity: "customer",
        externalId,
        sourceUpdatedAt: null,
        fields: { name: "Stable Ltd" },
      },
    ]);
    const withoutEmail = await getDb().query<{
      canonical_entity_id: string;
      match_strategy: string;
      match_confidence: number;
    }>(
      `SELECT canonical_entity_id, match_strategy, match_confidence
         FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'customer'
          AND source_external_id = $3`,
      [ORG_A, CONFIG_A, externalId]
    );
    expect(withoutEmail.rows[0]).toEqual(first.rows[0]);

    for (let attempt = 0; attempt < 2; attempt++) {
      await upsertCanonicalRecords(ORG_A, CONFIG_A, [
        {
          entity: "customer",
          externalId,
          sourceUpdatedAt: null,
          fields: { name: "Stable Ltd", email: replacementEmail },
        },
      ]);
    }

    const afterChange = await getDb().query<{
      canonical_entity_id: string;
      match_strategy: string;
      match_confidence: number;
    }>(
      `SELECT canonical_entity_id, match_strategy, match_confidence
         FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'customer'
          AND source_external_id = $3`,
      [ORG_A, CONFIG_A, externalId]
    );
    expect(afterChange.rows[0]).toEqual(first.rows[0]);

    const issues = await getDb().query<{
      code: string;
      payload: unknown;
      connector_run_id: string | null;
    }>(
      `SELECT code, payload, connector_run_id
         FROM data_quality_issues
        WHERE org_id = $1 AND source = $2 AND source_ref = $3
          AND code = 'IDENTITY_LINK_CONFLICT' AND status = 'pending'`,
      [ORG_A, `connector:${CONFIG_A}`, externalId]
    );
    expect(issues.rows).toHaveLength(1);
    expect(issues.rows[0].connector_run_id).toBeNull();
    const payload = JSON.stringify(issues.rows[0].payload);
    expect(payload).not.toContain(originalEmail);
    expect(payload).not.toContain(replacementEmail);
  });

  it("güçlü SKU kimliğini sonraki kayıtta SKU yoksa korur", async () => {
    const externalId = "stable-product-sku";
    await upsertCanonicalRecords(ORG_A, CONFIG_A, [
      {
        entity: "product",
        externalId,
        sourceUpdatedAt: null,
        fields: { name: "Stable Product", sku: "SKU-STABLE-1" },
      },
    ]);
    const first = await getDb().query<{ canonical_entity_id: string; match_strategy: string }>(
      `SELECT canonical_entity_id, match_strategy
         FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'product'
          AND source_external_id = $3`,
      [ORG_A, CONFIG_A, externalId]
    );
    expect(first.rows[0]?.match_strategy).toBe("sku");

    await upsertCanonicalRecords(ORG_A, CONFIG_A, [
      {
        entity: "product",
        externalId,
        sourceUpdatedAt: null,
        fields: { name: "Stable Product" },
      },
    ]);
    const second = await getDb().query<{ canonical_entity_id: string; match_strategy: string }>(
      `SELECT canonical_entity_id, match_strategy
         FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'product'
          AND source_external_id = $3`,
      [ORG_A, CONFIG_A, externalId]
    );
    expect(second.rows[0]).toEqual(first.rows[0]);
  });
});
