import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { listKpiObservations } from "@/lib/db/repos/kpi-values";
import { scoreDataQuality } from "@/lib/data-quality-score";

/** Skorun dayandığı en fazla gözlem sayısı; örneklem bunu aşarsa `sampled` true döner. */
const OBSERVATION_SAMPLE_LIMIT = 1000;

/**
 * GET /api/data-quality/score — KPI gözlemlerinden deterministik kalite skoru.
 * Sayılar yalnızca kayıtlı satırlardan türetilir; örneklem büyüklüğü de döner.
 */
export async function GET(req: Request) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const url = new URL(req.url);
  const label = url.searchParams.get("label")?.trim() || undefined;
  if (label && label.length > 200) {
    return NextResponse.json({ error: "Geçersiz etiket." }, { status: 400 });
  }

  const rawAge = url.searchParams.get("maxAgeDays");
  let maxAgeDays = 30;
  if (rawAge !== null) {
    if (!/^\d+$/.test(rawAge.trim())) {
      return NextResponse.json({ error: "maxAgeDays tam sayı olmalı" }, { status: 400 });
    }
    maxAgeDays = Number(rawAge.trim());
    if (maxAgeDays < 1 || maxAgeDays > 3650) {
      return NextResponse.json({ error: "maxAgeDays 1 ile 3650 arasında olmalı" }, { status: 400 });
    }
  }

  const rows = await listKpiObservations(session.orgId, { label });
  const report = scoreDataQuality(rows, new Date(), { maxAgeDays });
  // Örneklem üst sınıra dayandıysa skor tüm geçmişi değil, en yeni N satırı temsil eder.
  const sampled = rows.length >= OBSERVATION_SAMPLE_LIMIT;
  return NextResponse.json({
    ...report,
    maxAgeDays,
    label: label ?? null,
    sampled,
    sampleLimit: OBSERVATION_SAMPLE_LIMIT,
  });
}
