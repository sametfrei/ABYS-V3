import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { resolveBitrixConfig } from "@/lib/integrations/bitrix24/config";
import { testConnection } from "@/lib/integrations/bitrix24/client";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/**
 * Yalnızca LIVE mod + kimlik bilgisi varsa gerçek bağlantı testi yapar.
 * testConnection() zaten demo modda "credentials_missing" ile sahte
 * başarı DÖNMEZ (bkz. client.ts) — bu uç doğrudan onu çağırır, ikinci bir
 * "bağlanmış gibi davran" yolu eklemez.
 */
export async function POST() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const config = resolveBitrixConfig();
  const result = await testConnection(config);

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "bitrix24_connection_test",
    summary: `Bitrix24 bağlantı testi: ${result.ok ? "başarılı" : result.reason ?? "başarısız"}`,
    detail: result.message,
  });

  return NextResponse.json(result);
}
