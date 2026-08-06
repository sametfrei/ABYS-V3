import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { resolveBitrixConfig, getConnectorPublicStatus } from "@/lib/integrations/bitrix24/config";
import { getLastBitrixSyncRun } from "@/lib/db/repos/bitrix24";
import { buildDemoDataset } from "@/lib/integrations/bitrix24/demo-source";

/**
 * Bitrix24 konnektör durumu — Veri Kaynakları ekranındaki kartı besler.
 * HASSAS BİLGİ DÖNMEZ: token/secret/connection string/base URL yok,
 * yalnızca mod, yapılandırma durumu ve en son senkron özeti.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const config = resolveBitrixConfig();
  const publicStatus = getConnectorPublicStatus(config);
  const lastRun = await getLastBitrixSyncRun(session.orgId);
  const demoDataset = publicStatus.mode === "demo" ? buildDemoDataset(config.fieldMapping) : null;
  const demoRecordCounts = demoDataset
    ? {
        companies: demoDataset.companies.length,
        contacts: demoDataset.contacts.length,
        leads: demoDataset.leads.length,
        deals: demoDataset.deals.length,
        activities: demoDataset.activities.length,
        tasks: demoDataset.tasks.length,
        users: demoDataset.users.length,
        departments: demoDataset.departments.length,
        serviceRequest: demoDataset.smartProcessItems.serviceRequest.length,
        complaint: demoDataset.smartProcessItems.complaint.length,
        qualityIssue: demoDataset.smartProcessItems.qualityIssue.length,
      }
    : null;

  return NextResponse.json({
    mode: publicStatus.mode,
    configured: publicStatus.configured,
    connected: publicStatus.mode === "live" && lastRun?.status === "ok",
    lastSyncAt: lastRun?.finishedAt ?? null,
    lastError: lastRun?.errors[0]?.message ?? null,
    importedRecordCounts: lastRun?.importedCounts ?? null,
    demoRecordCounts,
  });
}
