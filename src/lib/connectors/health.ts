import { getDb, migrate } from "@/lib/db/client";

const STALE_RUNNING_MS = 2 * 60 * 60 * 1000;
const OVERDUE_MINIMUM_MS = 15 * 60 * 1000;

export type ConnectorScheduleHealth =
  | "unscheduled"
  | "healthy"
  | "due"
  | "overdue"
  | "running"
  | "stale"
  | "failing";

export interface ConnectorHealthRow {
  configId: string;
  name: string;
  enabled: boolean;
  scheduleIntervalMinutes: number | null;
  nextRunAt: string | null;
  lastScheduledAt: string | null;
  status: ConnectorScheduleHealth;
  overdueMinutes: number;
  staleRunning: boolean;
  consecutiveFailures: number;
  latestRun: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    writtenCount: number;
    error: string | null;
  } | null;
}

export interface ConnectorHealthSnapshot {
  checkedAt: string;
  staleAfterMinutes: number;
  summary: {
    connectorCount: number;
    scheduledCount: number;
    dueCount: number;
    overdueCount: number;
    staleRunningCount: number;
    failingCount: number;
    nextRunAt: string | null;
    lastSuccessAt: string | null;
  };
  connectors: ConnectorHealthRow[];
}

interface ConfigHealthRow {
  id: string;
  name: string;
  enabled: boolean;
  schedule_interval_minutes: number | null;
  next_run_at: string | Date | null;
  last_scheduled_at: string | Date | null;
}

interface RunHealthRow {
  id: string;
  config_id: string;
  status: string;
  trigger: string;
  started_at: string | Date;
  finished_at: string | Date | null;
  written_count: number;
  error: string | null;
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function ageMs(value: string | Date | null, now: Date): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, now.getTime() - timestamp) : 0;
}

/** Konnektör zamanlama durumunu gerçek çalıştırma kayıtlarından türetir. */
export async function getConnectorHealthSnapshot(
  orgId: string,
  now = new Date()
): Promise<ConnectorHealthSnapshot> {
  await migrate();
  const configs = await getDb().query<ConfigHealthRow>(
    `SELECT id, name, enabled, schedule_interval_minutes, next_run_at, last_scheduled_at
       FROM connector_configs
      WHERE org_id = $1
      ORDER BY next_run_at NULLS LAST, created_at DESC`,
    [orgId]
  );
  const runs = await getDb().query<RunHealthRow>(
    `SELECT id, config_id, status, trigger, started_at, finished_at, written_count, error
       FROM (
         SELECT r.*, row_number() OVER (PARTITION BY config_id ORDER BY started_at DESC) AS rn
           FROM connector_sync_runs r
          WHERE r.org_id = $1
       ) ranked
      WHERE rn <= 5
      ORDER BY started_at DESC`,
    [orgId]
  );

  const runsByConfig = new Map<string, RunHealthRow[]>();
  for (const run of runs.rows) {
    const list = runsByConfig.get(run.config_id) ?? [];
    list.push(run);
    runsByConfig.set(run.config_id, list);
  }

  const connectors: ConnectorHealthRow[] = configs.rows.map((config) => {
    const recent = runsByConfig.get(config.id) ?? [];
    const latest = recent[0] ?? null;
    let consecutiveFailures = 0;
    for (const run of recent) {
      if (run.status === "failed") consecutiveFailures += 1;
      else break;
    }
    const nextRunAt = iso(config.next_run_at);
    const overdueMs = nextRunAt ? ageMs(nextRunAt, now) : 0;
    const intervalMs = Number(config.schedule_interval_minutes ?? 0) * 60_000;
    const runningAge = latest?.status === "running" ? ageMs(latest.started_at, now) : 0;
    const staleRunning = latest?.status === "running" && runningAge > STALE_RUNNING_MS;

    let status: ConnectorScheduleHealth;
    if (config.schedule_interval_minutes === null) status = "unscheduled";
    else if (staleRunning) status = "stale";
    else if (latest?.status === "running") status = "running";
    else if (consecutiveFailures >= 2) status = "failing";
    else if (
      overdueMs > Math.max(OVERDUE_MINIMUM_MS, intervalMs)
    ) {
      status = "overdue";
    } else if (overdueMs > 0) status = "due";
    else status = "healthy";

    return {
      configId: config.id,
      name: config.name,
      enabled: config.enabled,
      scheduleIntervalMinutes:
        config.schedule_interval_minutes === null ? null : Number(config.schedule_interval_minutes),
      nextRunAt,
      lastScheduledAt: iso(config.last_scheduled_at),
      status,
      overdueMinutes: Math.floor(overdueMs / 60_000),
      staleRunning,
      consecutiveFailures,
      latestRun: latest
        ? {
            id: latest.id,
            status: latest.status,
            trigger: latest.trigger,
            startedAt: iso(latest.started_at) ?? "",
            finishedAt: iso(latest.finished_at),
            writtenCount: Number(latest.written_count),
            error: latest.error,
          }
        : null,
    };
  });

  const scheduled = connectors.filter((connector) => connector.scheduleIntervalMinutes !== null);
  const successfulRuns = runs.rows.filter((run) => run.status === "success");
  const lastSuccessAt =
    successfulRuns.length > 0 ? iso(successfulRuns[0].finished_at ?? successfulRuns[0].started_at) : null;
  const nextRunAt =
    scheduled
      .map((connector) => connector.nextRunAt)
      .filter(
        (value): value is string =>
          Boolean(value) && new Date(value as string).getTime() >= now.getTime()
      )
      .sort()[0] ?? null;

  return {
    checkedAt: now.toISOString(),
    staleAfterMinutes: STALE_RUNNING_MS / 60_000,
    summary: {
      connectorCount: connectors.length,
      scheduledCount: scheduled.length,
      dueCount: connectors.filter((connector) => connector.status === "due" || connector.status === "overdue").length,
      overdueCount: connectors.filter((connector) => connector.status === "overdue").length,
      staleRunningCount: connectors.filter((connector) => connector.status === "stale").length,
      failingCount: connectors.filter((connector) => connector.status === "failing").length,
      nextRunAt,
      lastSuccessAt,
    },
    connectors,
  };
}
