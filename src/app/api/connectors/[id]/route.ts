import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../auth/login/route";
import { setConnectorSchedule } from "@/lib/db/repos/connectors";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

const patchSchema = z.object({
  scheduleIntervalMinutes: z.number().int().min(5).max(525_600).nullable(),
});

/** PATCH — konnektörün zamanlanmış senkron aralığını ayarlar veya kapatır. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { id } = await params;
  const updated = await setConnectorSchedule({
    orgId: session.orgId,
    configId: id,
    intervalMinutes: parsed.data.scheduleIntervalMinutes,
  });
  if (!updated) return localizedError(req, "api.connectors.notFound", 404);

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "connector_schedule_updated",
    summary:
      updated.scheduleIntervalMinutes === null
        ? `Konnektör zamanlaması kapatıldı: ${updated.name}`
        : `Konnektör zamanlaması ${updated.scheduleIntervalMinutes} dakikaya ayarlandı: ${updated.name}`,
    detail: updated.id,
  });

  return NextResponse.json({
    id: updated.id,
    scheduleIntervalMinutes: updated.scheduleIntervalMinutes,
    nextRunAt: updated.nextRunAt,
    lastScheduledAt: updated.lastScheduledAt,
  });
}
