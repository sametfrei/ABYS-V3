import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { listGoldenRecordSummaries } from "@/lib/db/repos/canonical-records";
import type { CanonicalEntity } from "@/lib/connectors/types";
import { localizedError } from "@/lib/api-i18n";

const ENTITIES = new Set<CanonicalEntity>([
  "customer",
  "supplier",
  "employee",
  "product",
  "order",
  "invoice",
  "payment",
  "account",
  "project",
  "inventory",
  "event",
]);

/** GET — çok kaynaklı kanonik varlıklardan altın kayıt inceleme listesi. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const rawEntity = req.nextUrl.searchParams.get("entity");
  if (rawEntity && !ENTITIES.has(rawEntity as CanonicalEntity)) {
    return localizedError(req, "api.canonical.invalidType", 400);
  }
  const parsedLimit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.trunc(parsedLimit))) : 20;
  const records = await listGoldenRecordSummaries(session.orgId, {
    entity: (rawEntity as CanonicalEntity | null) ?? undefined,
    limit,
  });
  return NextResponse.json({
    records,
    provenance: {
      source: "canonical_entity_links + connector_records + canonical_survivorship_policies",
      note: "Yalnızca birden fazla kaynağa bağlı kanonik varlıklar listelenir; kaynak kayıtları değiştirilmez.",
    },
  });
}
