import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { getAdapter } from "@/lib/connectors/registry";
import { getConnectorConfig } from "@/lib/db/repos/connectors";
import { createConnectorSyncContext } from "@/lib/connectors/context";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

/**
 * POST /api/connectors/[id]/test — veri yazmadan gerçek bağlantı testi.
 *
 * Sır zinciri (ortam değişkeni, OAuth2 token), SSRF politikası, HTTP durumu,
 * JSON biçimi ve recordsPath yapısı gerçek bir istekle doğrulanır. Hiçbir
 * kanonik kayıt, run veya checkpoint oluşturulmaz; yalnızca denetim kanıtı
 * yazılır. `ok: false` tanı sonucudur, sunucu hatası değildir.
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

  const adapter = getAdapter(configRow.connectorId);
  if (!adapter) return localizedError(req, "api.connectors.adapterNotFound", 400);
  if (!adapter.probe) {
    return localizedError(req, "api.connectors.testUnsupported", 400);
  }

  const result = await adapter.probe(configRow.config, createConnectorSyncContext(configRow, null));

  try {
    await recordAuditEvent({
      orgId: session.orgId,
      actor: session.displayName,
      type: "connector_connection_tested",
      summary: `Konnektör bağlantı testi ${result.ok ? "başarılı" : "başarısız"}: ${configRow.name}`,
      detail: configRow.id,
    });
  } catch {
    // Denetim yazımı tanı sonucunu değiştirmez.
  }

  return NextResponse.json(result);
}
