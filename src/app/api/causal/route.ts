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

const postSchema = z.object({
  caseId: z.string().min(1).max(300),
  fromLabel: z.string().trim().min(1).max(300),
  toLabel: z.string().trim().min(1).max(300),
  relationStatus: z.enum(RELATION_STATUSES).optional(),
  confidence: z.number(),
  note: z.string().trim().max(20000).optional(),
});

const patchSchema = z.object({
  linkId: z.string().min(1).max(300),
  relationStatus: z.enum(RELATION_STATUSES),
});

/** Kök neden zinciri: bir vakaya bağlı neden-sonuç bağlantılarını listeler. */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const caseId = req.nextUrl.searchParams.get("caseId");
  if (!caseId) {
    return NextResponse.json({ error: "caseId gerekli." }, { status: 400 });
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
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
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
    return NextResponse.json({ error: "Vaka bulunamadı." }, { status: 404 });
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
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updated = await updateStatus(session.orgId, body.linkId, body.relationStatus);
  if (!updated) {
    return NextResponse.json({ error: "Bağlantı bulunamadı." }, { status: 404 });
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
