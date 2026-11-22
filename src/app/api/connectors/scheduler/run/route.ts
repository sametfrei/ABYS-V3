import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { runDueConnectorSyncs } from "@/lib/connectors/scheduler";
import { localizedError } from "@/lib/api-i18n";

function safeTokenEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST — zamanı gelen konnektörleri çalıştırır.
 *
 * Cron/worker, `ABYS_SCHEDULER_TOKEN` ile tüm organizasyonları çalıştırabilir.
 * Oturumlu kullanıcı yalnızca kendi organizasyonunun zamanlanmış işlerini
 * tetikleyebilir; çapraz-tenant çalıştırma yetkisi tanımlı değildir.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const limit = Math.max(
    1,
    Math.min(20, Number(req.nextUrl.searchParams.get("limit") ?? "5") || 5)
  );

  if (authHeader !== null) {
    const expected = process.env.ABYS_SCHEDULER_TOKEN;
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!expected || !token || !safeTokenEqual(token, expected)) {
      return localizedError(req, "api.connectors.invalidSchedulerId", 401);
    }
    const summary = await runDueConnectorSyncs({ limit, actor: "system:scheduler" });
    return NextResponse.json(summary);
  }

  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }
  const summary = await runDueConnectorSyncs({
    orgId: session.orgId,
    limit,
    actor: session.displayName,
  });
  return NextResponse.json(summary);
}
