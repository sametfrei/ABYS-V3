import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import { insertLink, listLinks, updateStatus, RELATION_STATUSES } from "@/lib/db/repos/causal";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

export const CAUSAL_METHODS = [
  "randomized_controlled_trial",
  "quasi_experimental",
  "difference_in_differences",
  "instrumental_variable",
  "regression_adjustment",
  "observational",
  "expert_judgment",
] as const;

const postSchema = z.object({
  caseId: z.string().min(1).max(300),
  fromLabel: z.string().trim().min(1).max(300),
  toLabel: z.string().trim().min(1).max(300),
  relationStatus: z.enum(RELATION_STATUSES).optional(),
  confidence: z.number().finite().min(0).max(100),
  note: z.string().trim().max(20000).optional(),
  method: z.enum(CAUSAL_METHODS).optional(),
  sampleSize: z.number().int().min(0).max(100_000_000).optional(),
  dataQuality: z.enum(["high", "medium", "low"]).optional(),
  uncertainty: z.enum(["low", "medium", "high"]).optional(),
});

const patchSchema = z.object({
  linkId: z.string().min(1).max(300),
  relationStatus: z.enum(RELATION_STATUSES),
});

/** Kök neden zinciri: bir vakaya bağlı neden-sonuç bağlantılarını listeler. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const caseId = req.nextUrl.searchParams.get("caseId");
  if (!caseId) {
    return localizedError(req, "api.cases.caseIdRequired", 400);
  }

  const links = await listLinks(session.orgId, caseId);
  return NextResponse.json({ links });
}

/**
 * Yeni neden-sonuç bağlantısı ekler. Korelasyon asla kanıtlanmış
 * nedensellik olarak sunulmaz: durum belirtilmezse 'observed_correlation'.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const db = getDb();
  const owns = await db.query(
    "SELECT 1 FROM decision_cases WHERE id = $1 AND org_id = $2",
    [body.caseId, session.orgId]
  );
  if (owns.rows.length === 0) {
    return localizedError(req, "api.cases.notFound", 404);
  }

  const linkId = await insertLink({
    orgId: session.orgId,
    caseId: body.caseId,
    fromLabel: body.fromLabel,
    toLabel: body.toLabel,
    relationStatus: body.relationStatus,
    confidence: body.confidence,
    note: body.note,
    createdBy: session.displayName,
    method: body.method ?? null,
    sampleSize: body.sampleSize ?? null,
    dataQuality: body.dataQuality ?? null,
    uncertainty: body.uncertainty ?? null,
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "causal_link_created",
    summary: `Kök neden bağlantısı eklendi: ${body.fromLabel} → ${body.toLabel}`,
    detail: body.caseId,
  });

  return NextResponse.json({ linkId });
}

/** İlişki durumunu günceller (örn. gözlemlenen korelasyon -> uzman onaylı). */
export async function PATCH(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updated = await updateStatus(session.orgId, body.linkId, body.relationStatus);
  if (!updated) {
    return localizedError(req, "api.causal.linkNotFound", 404);
  }

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "causal_link_status_updated",
    summary: `Kök neden bağlantı durumu güncellendi: ${body.relationStatus}`,
    detail: body.linkId,
  });

  return NextResponse.json({ ok: true });
}
