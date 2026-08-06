import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { resolveBitrixConfig } from "@/lib/integrations/bitrix24/config";
import { runDemoSync, runLiveSync } from "@/lib/integrations/bitrix24/sync";
import { getLastBitrixSyncRun, recordBitrixSyncRun } from "@/lib/db/repos/bitrix24";

/**
 * Demo modda sentetik Bitrix24 kayıtlarını mapper/sync zincirinden geçirir;
 * live modda gerçek senkron başlatır (kimlik bilgisi eksikse ağa hiç
 * çıkmadan credentials_missing döner — bkz. runLiveSync). Sonuç ayrı bir
 * tabloya değil, mevcut denetim günlüğüne yazılır (bkz. repos/bitrix24.ts).
 */
export async function POST() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const config = resolveBitrixConfig();
  let result;
  if (config.mode === "demo") {
    result = runDemoSync(config);
  } else {
    const lastRun = await getLastBitrixSyncRun(session.orgId);
    const previousCursor = lastRun?.mode === "live" ? lastRun.cursor : {};
    result = await runLiveSync(config, previousCursor);
  }

  await recordBitrixSyncRun(session.orgId, session.displayName, result);

  return NextResponse.json(result);
}
