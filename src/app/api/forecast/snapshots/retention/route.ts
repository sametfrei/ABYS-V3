import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { listForecastSnapshotLedger } from "@/lib/db/repos/forecast-snapshots";
import {
  DEFAULT_RETENTION_POLICY,
  planForecastRetention,
  sanitizeRetentionPolicy,
} from "@/lib/forecast-retention";
import { localizedError } from "@/lib/api-i18n";

/**
 * GET — saklama politikasının bu kurum için ne yapacağını SALT OKUNUR raporlar.
 * Hiçbir kayıt silinmez; arşivleme kararı ayrı ve onaylı bir adımda uygulanır.
 */
export async function GET(req: Request) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const url = new URL(req.url);
  const policy = sanitizeRetentionPolicy({
    maxAgeDays: url.searchParams.has("maxAgeDays")
      ? Number(url.searchParams.get("maxAgeDays"))
      : DEFAULT_RETENTION_POLICY.maxAgeDays,
    maxPerLabel: url.searchParams.has("maxPerLabel")
      ? Number(url.searchParams.get("maxPerLabel"))
      : DEFAULT_RETENTION_POLICY.maxPerLabel,
  });

  const ledger = await listForecastSnapshotLedger(session.orgId);
  const plan = planForecastRetention(ledger, policy, new Date());

  return NextResponse.json({
    policy,
    total: ledger.length,
    keepCount: plan.keepIds.length,
    archiveCount: plan.archiveIds.length,
    archiveIds: plan.archiveIds.slice(0, 200),
    reasons: plan.reasons,
    dryRun: true,
  });
}
