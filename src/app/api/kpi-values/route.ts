import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import {
  deleteKpiPoint,
  listKpiPoints,
  recordKpiValues,
} from "@/lib/db/repos/kpi-values";
import { listKpiLabels } from "@/lib/db/repos/forecast";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

const labelSchema = z.string().trim().min(1).max(120);
const observedAtSchema = z
  .string()
  .trim()
  .refine((v) => Number.isFinite(Date.parse(v)), { message: "Geçerli bir tarih olmalı (ISO 8601)." });

const postSchema = z.object({
  label: labelSchema,
  entries: z
    .array(
      z.object({
        value: z.number().finite(),
        observedAt: observedAtSchema,
      })
    )
    .min(1)
    .max(500),
});

const deleteSchema = z.object({ id: z.string().trim().min(1).max(100) });

/**
 * GET /api/kpi-values?label=... — org'un KPI noktaları (yoksa etiket özeti).
 * POST — tek işlemde en fazla 500 nokta kaydeder (manuel giriş / toplu yapıştırma).
 * DELETE — yalnızca kendi org'una ait tek noktayı siler (düzeltme akışı).
 * org_id her zaman oturumdan gelir.
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const label = req.nextUrl.searchParams.get("label");
  if (!label) {
    const labels = await listKpiLabels(session.orgId);
    return NextResponse.json({ labels });
  }
  if (label.length > 120) {
    return localizedError(req, "api.kpi.labelTooLong", 400);
  }
  const points = await listKpiPoints(session.orgId, label);
  return NextResponse.json({ label, points });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "edit_kpi")) {
    return NextResponse.json({ error: permissionError("edit_kpi") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const { label, entries } = parsed.data;

  const written = await recordKpiValues(
    session.orgId,
    entries.map((e) => ({ label, value: e.value, observedAt: new Date(e.observedAt).toISOString() }))
  );

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "kpi_values_recorded",
    summary: `KPI noktası kaydedildi: ${label} (${written} adet)`,
    detail: JSON.stringify({ label, count: written }),
  });

  return NextResponse.json({ label, written });
}

export async function DELETE(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "edit_kpi")) {
    return NextResponse.json({ error: permissionError("edit_kpi") }, { status: 403 });
  }

  const parsed = await parseBody(req, deleteSchema);
  if (!parsed.ok) return parsed.response;

  const deleted = await deleteKpiPoint(session.orgId, parsed.data.id);
  if (!deleted) return localizedError(req, "api.kpi.notFound", 404);

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "kpi_point_deleted",
    summary: "KPI noktası silindi",
    detail: parsed.data.id,
  });

  return NextResponse.json({ deleted: true });
}
