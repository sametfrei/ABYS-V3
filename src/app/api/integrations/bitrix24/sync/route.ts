import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { resolveBitrixConfig } from "@/lib/integrations/bitrix24/config";
import { runDemoSync, runLiveSync, type SyncRunResult } from "@/lib/integrations/bitrix24/sync";
import {
  ensureBitrixConnectorConfig,
  getLastBitrixSyncRun,
  recordBitrixSyncRun,
} from "@/lib/db/repos/bitrix24";
import { quarantineIssue } from "@/lib/db/repos/data-quality";
import { upsertCanonicalRecords } from "@/lib/db/repos/connectors";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/**
 * Demo modda sentetik Bitrix24 kayıtlarını mapper/sync zincirinden geçirir;
 * live modda gerçek senkron başlatır (kimlik bilgisi eksikse ağa hiç
 * çıkmadan credentials_missing döner — bkz. runLiveSync). Sonuç ayrı bir
 * tabloya değil, mevcut denetim günlüğüne yazılır (bkz. repos/bitrix24.ts).
 */
export async function POST() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const config = resolveBitrixConfig();
  let result: SyncRunResult;
  if (config.mode === "demo") {
    result = runDemoSync(config);
  } else {
    const lastRun = await getLastBitrixSyncRun(session.orgId);
    const previousCursor = lastRun?.mode === "live" ? lastRun.cursor : {};
    result = await runLiveSync(config, previousCursor);
  }

  let persistedCount = 0;
  try {
    const configId = await ensureBitrixConnectorConfig(session.orgId, session.displayName);
    persistedCount = await upsertCanonicalRecords(session.orgId, configId, result.canonicalRecords ?? []);
  } catch (err) {
    result = {
      ...result,
      status: "error",
      errors: [
        ...result.errors,
        {
          entity: "config",
          message: `Kanonik kayıtlar kalıcılaştırılamadı: ${err instanceof Error ? err.message : "bilinmeyen hata"}`,
        },
      ],
    };
  }

  await recordBitrixSyncRun(session.orgId, session.displayName, result, persistedCount);

  // Senkron hatalarını karantinaya yaz: sessizce kaybolmasın, veri kalitesi
  // ekranında operatör görsün. Karantina yazımı senkron yanıtını düşürmemeli.
  let quarantined = 0;
  for (const err of result.errors) {
    try {
      await quarantineIssue({
        orgId: session.orgId,
        source: "bitrix24",
        entity: err.entity,
        reason: err.message,
      });
      quarantined++;
    } catch {
      // Karantina kaydı başarısız olsa da senkron sonucu döner.
    }
  }

  const publicResult = {
    runId: result.runId,
    mode: result.mode,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    status: result.status,
    importedCounts: result.importedCounts,
    errors: result.errors,
    cursor: result.cursor,
  };
  return NextResponse.json({ ...publicResult, persistedCount, quarantined });
}
