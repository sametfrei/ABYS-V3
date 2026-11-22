import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { getGoldenRecord } from "@/lib/db/repos/canonical-records";
import type { CanonicalEntity } from "@/lib/connectors/types";
import { localizedError } from "@/lib/api-i18n";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 128) {
    return localizedError(req, "api.canonical.invalidId", 400);
  }
  const entity = (req.nextUrl.searchParams.get("entity") as CanonicalEntity | null) ?? undefined;
  const record = await getGoldenRecord(session.orgId, id, entity);
  if (!record) return localizedError(req, "api.canonical.notFound", 404);
  return NextResponse.json({
    record,
    provenance: {
      source: "canonical_entity_links + connector_records + canonical_survivorship_policies",
      note: "Alan değerleri kaynak kayıtlardan deterministik olarak seçilir; her alanın kaynağı ayrıca raporlanır.",
    },
  });
}
