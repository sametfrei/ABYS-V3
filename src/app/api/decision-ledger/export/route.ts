import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { getLedgerEntries } from "@/lib/db/repos/decision-ledger";
import { toLedgerCsv } from "@/lib/ledger-csv";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/**
 * GET /api/decision-ledger/export — karar defterini CSV olarak indirir.
 * Salt okunur; kurum kapsamı oturumdan gelir. En fazla 500 kayıt dışa aktarılır
 * ki tek istekte bellek/yanıt boyutu sınırlı kalsın.
 */
const MAX_EXPORT_ROWS = 500;

export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const entries = await getLedgerEntries(session.orgId, MAX_EXPORT_ROWS);
  const csv = toLedgerCsv(entries);
  const stamp = new Date().toISOString().slice(0, 10);

  // Karar verisi dışa aktarımı denetim zincirine yazılır: kim, ne zaman, kaç kayıt.
  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "decision_ledger_exported",
    summary: `${entries.length} karar CSV olarak dışa aktarıldı`,
    detail: `limit=${MAX_EXPORT_ROWS} tarih=${stamp}`,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="decision-ledger-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
