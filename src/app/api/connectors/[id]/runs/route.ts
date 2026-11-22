import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import {
  countRecordsByEntity,
  getConnectorConfig,
  listSyncRuns,
} from "@/lib/db/repos/connectors";
import { getConnectorPromotionCounts } from "@/lib/db/repos/connector-promotion";
import { classifyConnectorError, summarizeConnectorRuns } from "@/lib/connector-run-health";
import { localizedError } from "@/lib/api-i18n";

/** GET — konnektörün son senkron çalıştırmaları ve kanonik kayıt sayıları. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(_req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const { id } = await params;
  const configRow = await getConnectorConfig(session.orgId, id);
  if (!configRow) return localizedError(_req, "api.connectors.notFound", 404);

  const [runs, records, promotion] = await Promise.all([
    listSyncRuns(session.orgId, configRow.id),
    countRecordsByEntity(session.orgId, configRow.id),
    getConnectorPromotionCounts(session.orgId, configRow.id),
  ]);

  const health = summarizeConnectorRuns(runs);
  return NextResponse.json({
    runs,
    records,
    promotion,
    health: { ...health, failureKind: classifyConnectorError(health.lastErrorMessage) },
  });
}
