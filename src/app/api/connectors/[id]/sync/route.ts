import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { getAdapter } from "@/lib/connectors/registry";
import {
  ConnectorSyncBusyError,
  getConnectorConfig,
  startSyncRun,
} from "@/lib/db/repos/connectors";
import { executeConnectorSync } from "@/lib/connectors/sync-execution";
import { localizedError } from "@/lib/api-i18n";

/**
 * POST /api/connectors/[id]/sync — konnektörü çalıştırır.
 * Sırlar yalnızca ortam değişkenlerinden okunur. Her çalıştırma denetim
 * kaydına ve senkron geçmişine yazılır; kısmi başarıda kayıtlar idempotent
 * olarak güncellenir, checkpoint yalnızca başarılı çalıştırmada ilerler.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const { id } = await params;
  const configRow = await getConnectorConfig(session.orgId, id);
  if (!configRow) return localizedError(req, "api.connectors.notFound", 404);
  if (!configRow.enabled) return localizedError(req, "api.connectors.disabled", 400);

  const adapter = getAdapter(configRow.connectorId);
  if (!adapter) return localizedError(req, "api.connectors.adapterNotFound", 400);

  let runId: string;
  try {
    runId = await startSyncRun(session.orgId, configRow.id, { trigger: "manual" });
  } catch (err) {
    if (err instanceof ConnectorSyncBusyError) {
      return NextResponse.json(
        { error: err.message, code: err.code, runId: err.runId },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Senkron başlatılamadı." },
      { status: 500 }
    );
  }

  try {
    const result = await executeConnectorSync({
      configRow,
      runId,
      actor: session.displayName,
      trigger: "manual",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Senkron başarısız oldu.";
    return NextResponse.json({ runId, status: "failed", error: message }, { status: 502 });
  }
}
