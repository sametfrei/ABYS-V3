import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession, type SessionInfo } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { parseBody } from "@/lib/validation";
import {
  getIssue,
  IdentityConflictResolutionError,
  listIssues,
  quarantineIssue,
  resolveIdentityConflict,
  resolveIssue,
  type QualityStatus,
} from "@/lib/db/repos/data-quality";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

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
  action: z.enum(["accept_proposed", "keep_existing"]).optional(),
});

async function requireIngest(req?: NextRequest): Promise<
  { ok: true; session: SessionInfo } | { ok: false; response: NextResponse }
> {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return {
      ok: false,
      response: localizedError(req ?? new Request("http://localhost/api/data-quality"), "api.auth.sessionRequired", 401),
    };
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
  const auth = await requireIngest(req);
  if (!auth.ok) return auth.response;

  const rawStatus = req.nextUrl.searchParams.get("status") ?? "pending";
  const status: QualityStatus | "all" =
    rawStatus === "all" || rawStatus === "resolved" || rawStatus === "discarded"
      ? rawStatus
      : "pending";

  // Sessiz kırpma yok: istemci kaç satır istediğini ve kesilip kesilmediğini görür.
  const rawLimit = req.nextUrl.searchParams.get("limit");
  let limit = 100;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit.trim())) {
      return localizedError(req, "api.quality.limitInteger", 400);
    }
    limit = Number(rawLimit.trim());
    if (limit < 1 || limit > 500) {
      return localizedError(req, "api.quality.limitRange", 400);
    }
  }

  const issues = await listIssues(auth.session.orgId, status, limit);
  return NextResponse.json({ issues, limit, truncated: issues.length >= limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireIngest(req);
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
  const auth = await requireIngest(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, resolveSchema);
  if (!parsed.ok) return parsed.response;

  if (parsed.data.action) {
    try {
      const issue = await resolveIdentityConflict({
        orgId: auth.session.orgId,
        id: parsed.data.id,
        action: parsed.data.action,
        resolvedBy: auth.session.displayName,
      });
      await recordAuditEvent({
        orgId: auth.session.orgId,
        actor: auth.session.displayName,
        type:
          parsed.data.action === "accept_proposed"
            ? "identity_link_accepted"
            : "identity_link_kept",
        summary:
          parsed.data.action === "accept_proposed"
            ? "Önerilen güçlü kimlik bağlantısı yönetici onayıyla uygulandı"
            : "Mevcut güçlü kimlik bağlantısı korunarak çakışma kapatıldı",
        detail: issue.id,
      });
      return NextResponse.json({ issue, action: parsed.data.action });
    } catch (err) {
      if (err instanceof IdentityConflictResolutionError) {
        const status =
          err.code === "NOT_FOUND"
            ? 404
            : err.code === "NOT_IDENTITY_CONFLICT" || err.code === "INVALID_PAYLOAD"
              ? 400
              : 409;
        return NextResponse.json({ error: err.message, code: err.code }, { status });
      }
      throw err;
    }
  }

  const existing = await getIssue(auth.session.orgId, parsed.data.id);
  if (existing?.code === "IDENTITY_LINK_CONFLICT") {
    return NextResponse.json(
      {
        error:
          "Kimlik çakışması için accept_proposed veya keep_existing action'ı gerekli.",
        code: "IDENTITY_ACTION_REQUIRED",
      },
      { status: 400 }
    );
  }

  const issue = await resolveIssue({
    orgId: auth.session.orgId,
    id: parsed.data.id,
    resolution: parsed.data.resolution,
    resolvedBy: auth.session.displayName,
  });
  if (!issue) {
    return localizedError(req, "api.quality.quarantineNotFound", 404);
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
