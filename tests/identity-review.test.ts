import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-identity-review-${process.pid}-${randomUUID()}`
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
const { PATCH: resolveQualityIssue } = await import("../src/app/api/data-quality/route");

const ORG_A = "org-identity-review-a";
const ORG_B = "org-identity-review-b";
const BASE_CONFIG = {
  kind: "rest" as const,
  baseUrl: "https://identity.example.test",
  path: "/customers",
  authType: "none" as const,
  entity: "customer" as const,
  idField: "id",
  fieldMap: {},
  pagination: { type: "none" as const },
};

describe("kimlik çakışması inceleme kuyruğu", () => {
  let sessionA = "";
  let sessionB = "";
  let configA = "";
  let configB = "";

  beforeAll(async () => {
    await migrate();
    const db = getDb();
    for (const [id, name] of [
      [ORG_A, "Identity A"],
      [ORG_B, "Identity B"],
    ]) {
      await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [
        id,
        name,
      ]);
    }
    const password = hashPassword("mevcut-parola-123");
    for (const [id, org, email] of [
      ["identity-admin-a", ORG_A, "admin@identity-a.test"],
      ["identity-admin-b", ORG_B, "admin@identity-b.test"],
    ]) {
      await db.query(
        `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
         VALUES ($1, $2, $3, $1, 'data_admin', $4)`,
        [id, org, email, password]
      );
    }
    sessionA = await createSession("identity-admin-a", ORG_A);
    sessionB = await createSession("identity-admin-b", ORG_B);
    configA = await createConnectorConfig({
      orgId: ORG_A,
      connectorId: "rest-generic",
      name: "Identity A",
      config: BASE_CONFIG,
      createdBy: "identity-admin-a",
    });
    configB = await createConnectorConfig({
      orgId: ORG_A,
      connectorId: "rest-generic",
      name: "Identity B",
      config: BASE_CONFIG,
      createdBy: "identity-admin-a",
    });
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  async function createConflict(configId: string, externalId: string) {
    await upsertCanonicalRecords(ORG_A, configId, [
      {
        entity: "customer",
        externalId,
        sourceUpdatedAt: null,
        fields: { name: "Identity Customer", email: `${externalId}-old@example.test` },
      },
    ]);
    const before = await getDb().query<{ canonical_entity_id: string }>(
      `SELECT canonical_entity_id FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'customer' AND source_external_id = $3`,
      [ORG_A, configId, externalId]
    );
    await upsertCanonicalRecords(ORG_A, configId, [
      {
        entity: "customer",
        externalId,
        sourceUpdatedAt: null,
        fields: { name: "Identity Customer", email: `${externalId}-new@example.test` },
      },
    ]);
    const issue = await getDb().query<{ id: string; payload: unknown }>(
      `SELECT id, payload FROM data_quality_issues
        WHERE org_id = $1 AND source = $2 AND code = 'IDENTITY_LINK_CONFLICT'
          AND source_ref = $3 AND status = 'pending'`,
      [ORG_A, `connector:${configId}`, externalId]
    );
    return { issue: issue.rows[0], previousCanonicalId: before.rows[0].canonical_entity_id };
  }

  function patch(body: unknown) {
    return new NextRequest("http://localhost/api/data-quality", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("önerilen kimliği yönetici onayıyla atomik uygular ve tekrar kapanmasını engeller", async () => {
    const { issue, previousCanonicalId } = await createConflict(configA, "review-accept");
    expect(issue).toBeTruthy();
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const res = await resolveQualityIssue(
      patch({ id: issue.id, resolution: "resolved", action: "accept_proposed" })
    );
    expect(res.status).toBe(200);
    const updated = await getDb().query<{
      canonical_entity_id: string;
      match_strategy: string;
      match_confidence: number;
    }>(
      `SELECT canonical_entity_id, match_strategy, match_confidence
         FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'customer' AND source_external_id = $3`,
      [ORG_A, configA, "review-accept"]
    );
    expect(updated.rows[0].canonical_entity_id).not.toBe(previousCanonicalId);
    expect(updated.rows[0]).toMatchObject({ match_strategy: "email", match_confidence: 100 });

    const repeated = await resolveQualityIssue(
      patch({ id: issue.id, resolution: "resolved", action: "accept_proposed" })
    );
    expect(repeated.status).toBe(409);
    expect(await repeated.json()).toMatchObject({ code: "NOT_PENDING" });
  });

  it("mevcut kimliği koruyarak çakışmayı kapatır", async () => {
    const { issue, previousCanonicalId } = await createConflict(configB, "review-keep");
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const res = await resolveQualityIssue(
      patch({ id: issue.id, resolution: "resolved", action: "keep_existing" })
    );
    expect(res.status).toBe(200);
    const link = await getDb().query<{ canonical_entity_id: string }>(
      `SELECT canonical_entity_id FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = 'customer' AND source_external_id = $3`,
      [ORG_A, configB, "review-keep"]
    );
    expect(link.rows[0].canonical_entity_id).toBe(previousCanonicalId);
    const issueRow = await getDb().query<{ status: string; resolved_by: string }>(
      "SELECT status, resolved_by FROM data_quality_issues WHERE org_id = $1 AND id = $2",
      [ORG_A, issue.id]
    );
    expect(issueRow.rows[0]).toMatchObject({ status: "resolved", resolved_by: "identity-admin-a" });
  });

  it("kimlik kaydını action olmadan veya başka tenant'tan kapatmaz", async () => {
    const { issue } = await createConflict(configA, "review-protected");
    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionA);
    const missingAction = await resolveQualityIssue(
      patch({ id: issue.id, resolution: "resolved" })
    );
    expect(missingAction.status).toBe(400);
    expect(await missingAction.json()).toMatchObject({ code: "IDENTITY_ACTION_REQUIRED" });

    nextHeaders.__setTestCookie(SESSION_COOKIE, sessionB);
    const crossTenant = await resolveQualityIssue(
      patch({ id: issue.id, resolution: "resolved", action: "keep_existing" })
    );
    expect(crossTenant.status).toBe(404);
  });
});
