import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-bitrix-idempotency-test-${process.pid}-${randomUUID()}`
);
delete process.env.BITRIX24_MODE;

// Canlı senkron yalnızca ağ katmanını taklit eder; mapper ve kanonik yazım
// gerçek kod hattından geçer. Demo senkron gerçek kalır (aşağıda actual).
const livePayload = vi.hoisted(() => ({
  records: [] as {
    entity: string;
    externalId: string;
    sourceUpdatedAt: string | null;
    fields: Record<string, unknown>;
  }[],
}));

vi.mock("../src/lib/integrations/bitrix24/sync", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/integrations/bitrix24/sync")>();
  return {
    ...actual,
    runLiveSync: vi.fn(async () => ({
      runId: `live-${Math.random().toString(16).slice(2)}`,
      mode: "live" as const,
      startedAt: "2026-11-01T00:00:00.000Z",
      finishedAt: "2026-11-01T00:00:01.000Z",
      status: "ok" as const,
      importedCounts: { companies: livePayload.records.length },
      errors: [],
      cursor: {},
      canonicalRecords: livePayload.records,
    })),
  };
});

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
const { POST: syncRoute } = await import(
  "../src/app/api/integrations/bitrix24/sync/route"
);

const ORG_A = "org-bitrix-idem-a";
const ORG_B = "org-bitrix-idem-b";

async function seedOrg(orgId: string, userId: string, email: string) {
  await getDb().query(
    "INSERT INTO organizations (id, name, sector_id) VALUES ($1, $2, $3)",
    [orgId, `Org ${orgId}`, "other"]
  );
  await getDb().query(
    "INSERT INTO users (id, org_id, email, display_name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)",
    [userId, orgId, email, email, "data_admin", hashPassword("parola-123456")]
  );
  return createSession(userId, orgId);
}

async function runSyncAs(session: string) {
  nextHeaders.__setTestCookie(SESSION_COOKIE, session);
  const res = await syncRoute();
  expect(res.status).toBe(200);
  return (await res.json()) as {
    status: string;
    persistedCount: number;
    errors: unknown[];
  };
}

async function countRecords(orgId: string) {
  const rows = await getDb().query<{ count: number }>(
    "SELECT count(*)::int AS count FROM connector_records WHERE org_id = $1",
    [orgId]
  );
  return Number(rows.rows[0].count);
}

describe("Bitrix24 senkron idempotency, provenance ve organizasyon izolasyonu", () => {
  let sessionA: string;
  let sessionB: string;

  beforeAll(async () => {
    await migrate();
    sessionA = await seedOrg(ORG_A, "bitrix-idem-a", "idem-a@bitrix.test");
    sessionB = await seedOrg(ORG_B, "bitrix-idem-b", "idem-b@bitrix.test");
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    delete process.env.BITRIX24_MODE;
    await getDb().close();
  });

  it("aynı demo senkron girdisi iki kez çalışınca kanonik kayıt sayısı artmaz", async () => {
    delete process.env.BITRIX24_MODE;
    const first = await runSyncAs(sessionA);
    expect(first.status).toBe("ok");
    expect(first.persistedCount).toBeGreaterThan(0);
    expect(await countRecords(ORG_A)).toBe(first.persistedCount);

    const firstIds = await getDb().query<{ id: string }>(
      "SELECT id FROM connector_records WHERE org_id = $1 ORDER BY id",
      [ORG_A]
    );

    const second = await runSyncAs(sessionA);
    expect(second.status).toBe("ok");
    expect(second.persistedCount).toBe(first.persistedCount);

    expect(await countRecords(ORG_A)).toBe(first.persistedCount);
    const secondIds = await getDb().query<{ id: string }>(
      "SELECT id FROM connector_records WHERE org_id = $1 ORDER BY id",
      [ORG_A]
    );
    // Upsert aynı satırları günceller; yeni satır üretmez.
    expect(secondIds.rows).toEqual(firstIds.rows);
    const duplicates = await getDb().query<{ count: number }>(
      `SELECT count(*)::int AS count FROM (
         SELECT config_id, entity, external_id
           FROM connector_records WHERE org_id = $1
          GROUP BY config_id, entity, external_id
         HAVING count(*) > 1
       ) dup`,
      [ORG_A]
    );
    expect(Number(duplicates.rows[0].count)).toBe(0);
  });

  it("canlı senkronda kaynak kimliği ve kaynak zaman damgası korunur", async () => {
    process.env.BITRIX24_MODE = "live";
    livePayload.records = [
      {
        entity: "customer",
        externalId: "companies:9001",
        sourceUpdatedAt: "2026-10-15T08:30:00.000Z",
        fields: {
          source_entity: "companies",
          source_external_id: "9001",
          name: "Provenance Müşteri",
        },
      },
    ];

    const run = await runSyncAs(sessionA);
    expect(run.persistedCount).toBe(1);

    const stored = await getDb().query<{
      org_id: string;
      config_id: string;
      entity: string;
      external_id: string;
      source_updated_at: string | Date | null;
      data: { fields: Record<string, unknown> };
    }>(
      `SELECT org_id, config_id, entity, external_id, source_updated_at, data
         FROM connector_records
        WHERE org_id = $1 AND external_id = $2`,
      [ORG_A, "companies:9001"]
    );
    expect(stored.rows).toHaveLength(1);
    const row = stored.rows[0];
    expect(row.org_id).toBe(ORG_A);
    expect(row.config_id).toBe(`bitrix24:${ORG_A}`);
    expect(row.entity).toBe("customer");
    expect(row.external_id).toBe("companies:9001");
    expect(new Date(row.source_updated_at as string).toISOString()).toBe(
      "2026-10-15T08:30:00.000Z"
    );
    expect(row.data.fields).toMatchObject({
      source_entity: "companies",
      source_external_id: "9001",
      name: "Provenance Müşteri",
    });

    const link = await getDb().query<{ source_external_id: string }>(
      `SELECT source_external_id FROM canonical_entity_links
        WHERE org_id = $1 AND source_config_id = $2 AND entity = $3`,
      [ORG_A, `bitrix24:${ORG_A}`, "customer"]
    );
    expect(link.rows.map((r) => r.source_external_id)).toContain("companies:9001");
  });

  it("org A için senkronlanan kayıt org B'ye sızmaz ve org B aynı dış kimliği ayrı satır olarak tutar", async () => {
    process.env.BITRIX24_MODE = "live";
    livePayload.records = [
      {
        entity: "customer",
        externalId: "companies:9001",
        sourceUpdatedAt: "2026-10-15T08:30:00.000Z",
        fields: { source_external_id: "9001", name: "A'nın kaydı" },
      },
    ];

    const beforeA = await countRecords(ORG_A);
    const runB = await runSyncAs(sessionB);
    expect(runB.persistedCount).toBe(1);

    // Org B kendi kaydını alır; org A'nın satır sayısı değişmez.
    expect(await countRecords(ORG_B)).toBe(1);
    expect(await countRecords(ORG_A)).toBe(beforeA);

    const rowsB = await getDb().query<{ org_id: string }>(
      "SELECT org_id FROM connector_records WHERE external_id = $1 AND org_id = $2",
      ["companies:9001", ORG_B]
    );
    expect(rowsB.rows).toHaveLength(1);
    expect(rowsB.rows[0].org_id).toBe(ORG_B);

    // Aynı dış kimlik iki org'da iki ayrı satırdır; biri diğerini ezmez.
    const both = await getDb().query<{ org_id: string; id: string }>(
      "SELECT org_id, id FROM connector_records WHERE external_id = $1 ORDER BY org_id",
      ["companies:9001"]
    );
    expect(both.rows.map((r) => r.org_id)).toEqual([ORG_A, ORG_B]);
    expect(both.rows[0].id).not.toBe(both.rows[1].id);

    // Org B oturumuyla yapılan sorgu yalnızca kendi organizasyonunu görür.
    const scopedB = await getDb().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM connector_records WHERE org_id = $1",
      [ORG_B]
    );
    expect(Number(scopedB.rows[0].count)).toBe(1);
  });
});
