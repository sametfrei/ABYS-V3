import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession, type SessionInfo } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { parseBody } from "@/lib/validation";
import {
  listIssues,
  quarantineIssue,
  resolveIssue,
  type QualityStatus,
} from "@/lib/db/repos/data-quality";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/**
 * Veri kalitesi karantinası — yalnızca ingest_data izni (veri yöneticisi).
 * org_id oturumdan gelir. Payload sır içermemeli; API bunu doğrulayamaz,
 * çağıran connector sorumludur (repo yorumunda da belirtilir).
 */

const MAX_PAYLOAD_BYTES = 8000;

const createSchema = z.object({
  source: z.string().trim().min(1, "source gerekli").max(60, "source en fazla 60 karakter"),
  entity: z.string().trim().min(1, "entity gerekli").max(60, "entity en fazla 60 karakter"),
  sourceRef: z.string().max(200, "sourceRef en fazla 200 karakter").optional(),
  reason: z.string().trim().min(1, "reason gerekli").max(500, "reason en fazla 500 karakter"),
  payload: z.unknown().optional(),
});

const resolveSchema = z.object({
  id: z.string().min(1).max(128),
  resolution: z.enum(["resolved", "discarded"]),
});

async function requireIngest(): Promise<
  { ok: true; session: SessionInfo } | { ok: false; response: NextResponse }
> {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }) };
  }
  if (!hasPermission(session.role, "ingest_data")) {
    return {
      ok: false,
      response: NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

export async function GET(req: NextRequest) {
  const auth = await requireIngest();
  if (!auth.ok) return auth.response;

  const rawStatus = req.nextUrl.searchParams.get("status") ?? "pending";
  const status: QualityStatus | "all" =
    rawStatus === "all" || rawStatus === "resolved" || rawStatus === "discarded"
      ? rawStatus
      : "pending";

  const issues = await listIssues(auth.session.orgId, status);
  return NextResponse.json({ issues });
}

export async function POST(req: NextRequest) {
  const auth = await requireIngest();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const serialized = JSON.stringify(body.payload ?? null);
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: `payload en fazla ${MAX_PAYLOAD_BYTES} bayt (serileştirilmiş) olmalı.` },
      { status: 400 }
    );
  }

  const issue = await quarantineIssue({
    orgId: auth.session.orgId,
    source: body.source,
    entity: body.entity,
    sourceRef: body.sourceRef ?? null,
    reason: body.reason,
    payload: body.payload,
  });

  await recordAuditEvent({
    orgId: auth.session.orgId,
    actor: auth.session.displayName,
    type: "data_quality_quarantined",
    summary: `Karantinaya alındı: ${body.source}/${body.entity}`,
    detail: issue.id,
  });

  return NextResponse.json({ issue }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireIngest();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, resolveSchema);
  if (!parsed.ok) return parsed.response;

  const issue = await resolveIssue({
    orgId: auth.session.orgId,
    id: parsed.data.id,
    resolution: parsed.data.resolution,
    resolvedBy: auth.session.displayName,
  });
  if (!issue) {
    return NextResponse.json({ error: "Karantina kaydı bulunamadı." }, { status: 404 });
  }

  await recordAuditEvent({
    orgId: auth.session.orgId,
    actor: auth.session.displayName,
    type: "data_quality_resolved",
    summary: `Karantina kaydı ${parsed.data.resolution === "resolved" ? "çözüldü" : "atıldı"}`,
    detail: issue.id,
  });

  return NextResponse.json({ issue });
}
