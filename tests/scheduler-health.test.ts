import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.ABYS_DB_DIR = path.join(
  os.tmpdir(),
  `abys-scheduler-health-${process.pid}-${randomUUID()}`
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
const { createConnectorConfig } = await import("../src/lib/db/repos/connectors");
const { getConnectorHealthSnapshot } = await import("../src/lib/connectors/health");
const { GET: healthRoute } = await import("../src/app/api/connectors/scheduler/health/route");

const ORG = "org-scheduler-health";
const OTHER_ORG = "org-scheduler-health-other";
const NOW = new Date("2026-06-01T12:00:00.000Z");
const BASE_CONFIG = {
  kind: "rest" as const,
  baseUrl: "https://health.example.test",
  path: "/customers",
  authType: "none" as const,
  entity: "customer" as const,
  idField: "id",
  fieldMap: {},
  pagination: { type: "none" as const },
};

async function connector(orgId: string, name: string, interval: number | null): Promise<string> {
  return createConnectorConfig({
    orgId,
    connectorId: "rest-generic",
    name,
    config: BASE_CONFIG,
    createdBy: "health-admin",
    scheduleIntervalMinutes: interval,
  });
}

async function setNextRun(orgId: string, configId: string, nextRunAt: string) {
  await getDb().query(
    "UPDATE connector_configs SET next_run_at = $3 WHERE org_id = $1 AND id = $2",
    [orgId, configId, nextRunAt]
  );
}

async function run(
  orgId: string,
  configId: string,
  status: "running" | "success" | "failed",
  startedAt: string
) {
  await getDb().query(
    `INSERT INTO connector_sync_runs
       (id, org_id, config_id, status, trigger, started_at, finished_at, written_count, error)
     VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, 0, $7)`,
    [
      randomUUID(),
      orgId,
      configId,
      status,
      startedAt,
      status === "running" ? null : startedAt,
      status === "failed" ? "source unavailable" : null,
    ]
  );
}

describe("konnektör zamanlayıcı sağlığı", () => {
  let session = "";
  let healthy = "";
  let overdue = "";
  let stale = "";
  let failing = "";

  beforeAll(async () => {
    await migrate();
    await getDb().query(
      "INSERT INTO organizations (id, name, sector_id) VALUES ($1, 'Health', 'other'), ($2, 'Other Health', 'other')",
      [ORG, OTHER_ORG]
    );
    const password = hashPassword("mevcut-parola-123");
    await getDb().query(
      `INSERT INTO users (id, org_id, email, display_name, role, password_hash)
       VALUES ('health-admin', $1, 'health@example.test', 'Health Admin', 'data_admin', $2)`,
      [ORG, password]
    );
    session = await createSession("health-admin", ORG);

    healthy = await connector(ORG, "Healthy", 30);
    overdue = await connector(ORG, "Overdue", 5);
    stale = await connector(ORG, "Stale", 15);
    failing = await connector(ORG, "Failing", 30);
    await connector(ORG, "Unscheduled", null);
    const foreign = await connector(OTHER_ORG, "Foreign", 15);

    await setNextRun(ORG, healthy, "2026-06-01T12:20:00.000Z");
    await setNextRun(ORG, overdue, "2026-06-01T11:00:00.000Z");
    await setNextRun(ORG, stale, "2026-06-01T12:10:00.000Z");
    await setNextRun(ORG, failing, "2026-06-01T12:10:00.000Z");
    await setNextRun(OTHER_ORG, foreign, "2026-05-01T00:00:00.000Z");

    await run(ORG, healthy, "success", "2026-06-01T11:30:00.000Z");
    await run(ORG, stale, "running", "2026-06-01T08:30:00.000Z");
    await run(ORG, failing, "failed", "2026-06-01T11:20:00.000Z");
    await run(ORG, failing, "failed", "2026-06-01T11:10:00.000Z");
    await run(ORG, failing, "success", "2026-06-01T11:00:00.000Z");
    await run(OTHER_ORG, foreign, "failed", "2026-05-01T00:00:00.000Z");
  });

  afterAll(async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    await getDb().close();
  });

  it("gecikme, takılı çalıştırma ve ardışık hatayı gerçek kayıtlardan ayırır", async () => {
    const snapshot = await getConnectorHealthSnapshot(ORG, NOW);
    expect(snapshot.summary).toMatchObject({
      connectorCount: 5,
      scheduledCount: 4,
      dueCount: 1,
      overdueCount: 1,
      staleRunningCount: 1,
      failingCount: 1,
      nextRunAt: "2026-06-01T12:10:00.000Z",
      lastSuccessAt: "2026-06-01T11:30:00.000Z",
    });
    const byId = new Map(snapshot.connectors.map((row) => [row.configId, row]));
    expect(byId.get(healthy)).toMatchObject({ status: "healthy", consecutiveFailures: 0 });
    expect(byId.get(overdue)).toMatchObject({ status: "overdue", overdueMinutes: 60 });
    expect(byId.get(stale)).toMatchObject({ status: "stale", staleRunning: true });
    expect(byId.get(failing)).toMatchObject({ status: "failing", consecutiveFailures: 2 });
  });

  it("tenant sınırını korur ve API oturum ister", async () => {
    nextHeaders.__setTestCookie(SESSION_COOKIE, undefined);
    const unauthorized = await healthRoute();
    expect(unauthorized.status).toBe(401);

    nextHeaders.__setTestCookie(SESSION_COOKIE, session);
    const response = await healthRoute();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      connectors: Array<{ configId: string; name: string }>;
    };
    expect(body.connectors).toHaveLength(5);
    expect(body.connectors.some((row) => row.name === "Foreign")).toBe(false);
  });
});
