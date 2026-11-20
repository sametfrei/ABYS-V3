import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-business-context-${process.pid}-${randomUUID()}`
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
const { GET, POST } = await import("../src/app/api/discovery/route");
const {
  buildDiscovery,
  confirmBusinessProfile,
  getConfirmedBusinessProfile,
} = await import("../src/lib/db/repos/business-context");
const { getSemanticGraph } = await import("../src/lib/db/repos/semantic-graph");
const { upsertDefinition, listDefinitions } = await import("../src/lib/db/repos/kpi-registry");

const ORG_A = "org-business-a";
const ORG_B = "org-business-b";
const CONFIG_A = "connector-business-a";

let ceoSession = "";
let auditorSession = "";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

beforeAll(async () => {
  await migrate();
  const db = getDb();
  for (const [id, name] of [
    [ORG_A, "Business A"],
    [ORG_B, "Business B"],
  ]) {
    await db.query("INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, 'other')", [id, name]);
  }
  const password = hashPassword("mevcut-parola-123");
  for (const [id, org, email, role] of [
    ["business-ceo", ORG_A, "ceo@business.test", "ceo"],
    ["business-auditor", ORG_A, "auditor@business.test", "auditor"],
  ] as const) {
    await db.query(
      "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, org, email, id, role, password]
    );
  }
  ceoSession = await createSession("business-ceo", ORG_A);
  auditorSession = await createSession("business-auditor", ORG_A);

  await db.query(
    `INSERT INTO connector_configs (id, org_id, connector_id, name, config, created_by)
     VALUES ($1, $2, 'rest-generic', 'Üretim kaynağı', $3, 'test')`,
    [
      CONFIG_A,
      ORG_A,
      JSON.stringify({
        kind: "rest",
        baseUrl: "https://erp.example.test",
        path: "/production",
        authType: "none",
        entity: "product",
        idField: "id",
        fieldMap: {},
        pagination: { type: "none" },
      }),
    ]
  );
  await db.query(
    `INSERT INTO connector_records (id, org_id, config_id, entity, external_id, data, source_updated_at)
     VALUES ($1, $2, $3, 'product', 'P-1', $4, '2026-01-01T00:00:00Z')`,
    [
      "record-business-1",
      ORG_A,
      CONFIG_A,
      JSON.stringify({
        fields: {
          name: "Motor 1",
          machine_id: "M-1",
          work_order: "WO-1",
          planned_production_time: 600,
          downtime_minutes: 60,
          ideal_cycle_time_minutes: 1,
          total_units: 480,
          good_units: 456,
          customerId: "C-1",
        },
      }),
    ]
  );

  await upsertDefinition({
    orgId: ORG_A,
    name: "İlk geçiş verimi",
    formulaText: "operatör tarafından doğrulanmış özel formül",
    owner: "Kalite Müdürü",
  });
});

afterAll(async () => {
  nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
  await getDb().close();
});

describe("kalıcı iş bağlamı", () => {
  it("keşif girdisi ve gözlenen şemayı gerçek kanonik kayıtlardan üretir", async () => {
    const build = await buildDiscovery(ORG_A);
    expect(build.result.primary?.packId).toBe("manufacturing");
    expect(build.inputs.entityCounts.product).toBe(1);
    expect(build.inputs.fieldNames).toContain("good_units");
    expect(build.schema[0].fields.find((field) => field.field === "total_units")).toMatchObject({
      types: { number: 1 },
      observations: 1,
    });
    expect(build.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("POST yalnızca yetkili rolün onayıyla sürümlü profil ve KPI tanımları oluşturur", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    expect((await POST(postRequest({ packId: "manufacturing" }))).status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, auditorSession);
    expect((await POST(postRequest({ packId: "manufacturing" }))).status).toBe(403);

    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await POST(
      postRequest({ packId: "manufacturing", acknowledgeConfidence: true })
    );
    const body = (await res.json()) as {
      profile: { id: string; version: number; industryPackId: string };
      activation: { createdCount: number; preservedCount: number };
      idempotent: boolean;
    };
    expect(res.status).toBe(201);
    expect(body.profile).toMatchObject({ version: 1, industryPackId: "manufacturing" });
    expect(body.idempotent).toBe(false);
    // Elle tanımlanan "İlk geçiş verimi" korunur; paket kalan 7 KPI'yı ekler.
    expect(body.activation).toMatchObject({ createdCount: 7, preservedCount: 1 });

    const definitions = await listDefinitions(ORG_A);
    expect(definitions).toHaveLength(8);
    expect(definitions.find((definition) => definition.name === "İlk geçiş verimi")).toMatchObject({
      source: "manual",
      sourceRef: null,
      formulaText: "operatör tarafından doğrulanmış özel formül",
      owner: "Kalite Müdürü",
    });
    expect(definitions.filter((definition) => definition.source === "industry-pack")).toHaveLength(7);

    const audit = await getDb().query(
      "SELECT 1 FROM audit_events WHERE org_id = $1 AND type = 'business_profile_confirmed'",
      [ORG_A]
    );
    expect(audit.rows).toHaveLength(1);
  });

  it("GET onaylı profili, şema ve grafik özetini döndürür", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await GET();
    const body = (await res.json()) as {
      confirmedProfile: { version: number } | null;
      observedSchema: Array<{ entity: string }>;
      graphSummary: {
        coverage: { nodeCount: number; edgeCount: number; linkedRecordCount: number };
        resolution: { strongLinkRecords: number; sourceScopedRecords: number };
      };
      profileIsStale: boolean;
    };
    expect(res.status).toBe(200);
    expect(body.confirmedProfile?.version).toBe(1);
    expect(body.observedSchema[0].entity).toBe("product");
    expect(body.graphSummary.coverage).toMatchObject({ nodeCount: 2, edgeCount: 1 });
    expect(body.graphSummary.resolution).toMatchObject({
      strongLinkRecords: 0,
      sourceScopedRecords: 0,
    });
    expect(body.profileIsStale).toBe(false);
  });

  it("aynı kaynak parmak izinde yeni profil sürümü üretmez", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, ceoSession);
    const res = await POST(
      postRequest({ packId: "manufacturing", acknowledgeConfidence: true })
    );
    const body = (await res.json()) as { profile: { version: number }; idempotent: boolean };
    expect(res.status).toBe(200);
    expect(body.idempotent).toBe(true);
    expect(body.profile.version).toBe(1);
  });

  it("kaynak değişince onaylı profili sessizce değiştirmez; yeni sürüm ister", async () => {
    await getDb().query(
      `UPDATE connector_records SET data = jsonb_set(data, '{fields,scrap_units}', '24'::jsonb)
        WHERE id = 'record-business-1' AND org_id = $1`,
      [ORG_A]
    );
    const before = await getConfirmedBusinessProfile(ORG_A);
    expect(before?.version).toBe(1);

    const confirmed = await confirmBusinessProfile({
      orgId: ORG_A,
      packId: "manufacturing",
      acknowledgeConfidence: true,
      actor: "ceo",
    });
    expect(confirmed.idempotent).toBe(false);
    expect(confirmed.profile.version).toBe(2);
    expect(confirmed.profile.snapshot.inputs.fieldNames).toContain("scrap_units");
  });

  it("eşzamanlı profil onaylarını org kilidiyle sıraya alır ve sürüm çoğaltmaz", async () => {
    await getDb().query(
      `UPDATE connector_records SET data = jsonb_set(data, '{fields,scrap_reason}', '"kalite"'::jsonb)
        WHERE id = 'record-business-1' AND org_id = $1`,
      [ORG_A]
    );
    const results = await Promise.all([
      confirmBusinessProfile({
        orgId: ORG_A,
        packId: "manufacturing",
        acknowledgeConfidence: true,
        actor: "ceo",
      }),
      confirmBusinessProfile({
        orgId: ORG_A,
        packId: "manufacturing",
        acknowledgeConfidence: true,
        actor: "ceo",
      }),
    ]);
    expect(results.map((result) => result.profile.version)).toEqual([3, 3]);
    expect(new Set(results.map((result) => result.profile.id)).size).toBe(1);
    expect(results.filter((result) => result.idempotent)).toHaveLength(1);
    const versions = await getDb().query<{ version: number }>(
      "SELECT version FROM business_profiles WHERE org_id = $1 ORDER BY version",
      [ORG_A]
    );
    expect(versions.rows.map((row) => row.version)).toEqual([1, 2, 3]);
  });

  it("semantik grafik yalnızca org içi kayıtları ve açık referansları kapsar", async () => {
    const graph = await getSemanticGraph(ORG_A);
    expect(graph.nodes.find((node) => node.entity === "product")?.resolved).toBe(true);
    expect(graph.nodes.find((node) => node.entity === "customer")).toMatchObject({
      ref: "C-1",
      resolved: false,
    });
    expect(graph.edges[0].relation).toBe("customer");
    expect(graph.coverage.unresolvedNodeCount).toBe(1);

    const other = await getSemanticGraph(ORG_B);
    expect(other.nodes).toHaveLength(0);
    expect(other.edges).toHaveLength(0);
  });
});
