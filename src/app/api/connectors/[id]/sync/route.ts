import { NextResponse } from "next/server";
import { lookup } from "dns/promises";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { getAdapter } from "@/lib/connectors/registry";
import { getConnectorConfig, finishSyncRun, getLastCheckpoint, startSyncRun, upsertCanonicalRecords } from "@/lib/db/repos/connectors";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import type { SyncContext } from "@/lib/connectors/types";
import { SsrfError } from "@/lib/net/ssrf";

/**
 * POST /api/connectors/[id]/sync — konnektörü çalıştırır.
 * Sırlar yalnızca ortam değişkenlerinden okunur. Her çalıştırma denetim
 * kaydına ve senkron geçmişine yazılır; kısmi başarıda kayıtlar idempotent
 * olarak güncellenir, checkpoint yalnızca başarılı çalıştırmada ilerler.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const { id } = await params;
  const configRow = await getConnectorConfig(session.orgId, id);
  if (!configRow) return NextResponse.json({ error: "Konnektör bulunamadı." }, { status: 404 });
  if (!configRow.enabled) return NextResponse.json({ error: "Konnektör devre dışı." }, { status: 400 });

  const adapter = getAdapter(configRow.connectorId);
  if (!adapter) return NextResponse.json({ error: "Adaptör bulunamadı." }, { status: 400 });

  const checkpoint = await getLastCheckpoint(session.orgId, configRow.id);
  const runId = await startSyncRun(session.orgId, configRow.id);

  const ctx: SyncContext = {
    orgId: session.orgId,
    configId: configRow.id,
    checkpoint,
    fetchImpl: fetch,
    resolveHost: async (hostname: string) => (await lookup(hostname, { all: true })).map((r) => r.address),
    resolveSecret: (envVarName: string) => process.env[envVarName],
    now: () => new Date(),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  };

  try {
    const outcome = await adapter.sync(configRow.config, ctx);
    const written = await upsertCanonicalRecords(session.orgId, configRow.id, outcome.records);
    await finishSyncRun({
      orgId: session.orgId,
      runId,
      status: "success",
      pages: outcome.pages,
      readCount: outcome.readCount,
      writtenCount: written,
      skippedCount: outcome.skipped,
      checkpoint: outcome.checkpoint,
      warnings: outcome.warnings,
    });
    await recordAuditEvent({
      orgId: session.orgId,
      actor: session.displayName,
      type: "connector_sync_completed",
      summary: `Konnektör senkronu: ${configRow.name} (${written} kayıt)`,
      detail: runId,
    });
    return NextResponse.json({
      runId,
      status: "success",
      pages: outcome.pages,
      readCount: outcome.readCount,
      writtenCount: written,
      skippedCount: outcome.skipped,
      checkpoint: outcome.checkpoint,
      warnings: outcome.warnings,
    });
  } catch (err) {
    const message =
      err instanceof SsrfError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Senkron başarısız oldu.";
    await finishSyncRun({
      orgId: session.orgId,
      runId,
      status: "failed",
      pages: 0,
      readCount: 0,
      writtenCount: 0,
      skippedCount: 0,
      checkpoint,
      error: message,
      warnings: [],
    });
    await recordAuditEvent({
      orgId: session.orgId,
      actor: session.displayName,
      type: "connector_sync_failed",
      summary: `Konnektör senkronu başarısız: ${configRow.name}`,
      detail: runId,
    });
    return NextResponse.json({ runId, status: "failed", error: message }, { status: 502 });
  }
}
