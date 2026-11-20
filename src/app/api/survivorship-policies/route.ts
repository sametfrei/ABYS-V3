import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession, type SessionInfo } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import type { CanonicalEntity } from "@/lib/connectors/types";
import {
  listSurvivorshipPolicies,
  replaceSurvivorshipPolicy,
  SurvivorshipPolicyError,
} from "@/lib/db/repos/canonical-records";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const ENTITY = z.enum([
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

const putSchema = z.object({
  entity: ENTITY,
  priorities: z
    .array(
      z.object({
        sourceConfigId: z.string().trim().min(1).max(128),
        priority: z.number().int().min(1).max(1000),
      })
    )
    .max(100),
});

async function requirePermission(permission: "view_decisions" | "ingest_data"): Promise<
  { ok: true; session: SessionInfo } | { ok: false; response: NextResponse }
> {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }) };
  }
  if (!hasPermission(session.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: permissionError(permission) }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission("view_decisions");
  if (!auth.ok) return auth.response;
  const rawEntity = req.nextUrl.searchParams.get("entity");
  const parsed = rawEntity ? ENTITY.safeParse(rawEntity) : null;
  if (parsed && !parsed.success) {
    return NextResponse.json({ error: "Geçersiz kanonik varlık türü." }, { status: 400 });
  }
  const policies = await listSurvivorshipPolicies(
    auth.session.orgId,
    parsed?.data as CanonicalEntity | undefined
  );
  return NextResponse.json({ policies });
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission("ingest_data");
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const policies = await replaceSurvivorshipPolicy({
      orgId: auth.session.orgId,
      entity: parsed.data.entity,
      priorities: parsed.data.priorities,
      updatedBy: auth.session.displayName,
    });
    await recordAuditEvent({
      orgId: auth.session.orgId,
      actor: auth.session.displayName,
      type: "survivorship_policy_updated",
      summary: `${parsed.data.entity} altın kayıt kaynak sırası güncellendi (${policies.length} kaynak)`,
      detail: parsed.data.entity,
    });
    return NextResponse.json({ policies });
  } catch (err) {
    if (err instanceof SurvivorshipPolicyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "DUPLICATE_PRIORITY" ? 409 : 400 }
      );
    }
    throw err;
  }
}
