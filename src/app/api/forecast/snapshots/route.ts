import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../auth/login/route";
import { getKpiSeries } from "@/lib/db/repos/forecast";
import { insertForecastSnapshot, listForecastSnapshots, summarizeSnapshots } from "@/lib/db/repos/forecast-snapshots";
import { MAX_FORECAST_HORIZON, MIN_FORECAST_POINTS, forecastSeries } from "@/lib/forecasting";

const postSchema = z.object({
  label: z.string().trim().min(1).max(200),
  horizon: z.number().int().min(1).max(MAX_FORECAST_HORIZON).optional(),
});

/**
 * GET /api/forecast/snapshots — kaydedilmiş tahmin anlık görüntüleri ve
 * sonraki gerçek gözlemle karşılaştırma özeti. Sayılar yalnızca kayıtlı
 * değerlerden türetilir.
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  const label = req.nextUrl.searchParams.get("label") ?? undefined;
  if (label && label.length > 200) {
    return NextResponse.json({ error: "Geçersiz etiket." }, { status: 400 });
  }
  const snapshots = await listForecastSnapshots({ orgId: session.orgId, label });
  return NextResponse.json({ snapshots, summary: summarizeSnapshots(snapshots) });
}

/**
 * POST /api/forecast/snapshots — mevcut KPI serisinden tahmin üretip ilk adımı
 * ölçüm için kaydeder. Tahmin üretilemiyorsa (yetersiz veri) kayıt yapılmaz.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }
  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const { label } = parsed.data;
  const horizon = parsed.data.horizon ?? 3;

  const series = await getKpiSeries(session.orgId, label);
  if (series.numericPoints < MIN_FORECAST_POINTS) {
    return NextResponse.json(
      { error: `Tahmin için en az ${MIN_FORECAST_POINTS} sayısal gözlem gerekir.` },
      { status: 422 }
    );
  }
  const forecast = forecastSeries(series.values, horizon);
  if (!forecast) {
    return NextResponse.json({ error: "Tahmin üretilemedi." }, { status: 422 });
  }
  const first = forecast.points[0];
  const lastObservedAt = series.timestamps[series.timestamps.length - 1];
  if (!first || !lastObservedAt) {
    return NextResponse.json({ error: "Tahmin anlık görüntüsü için zaman damgası yok." }, { status: 422 });
  }
  const id = await insertForecastSnapshot({
    orgId: session.orgId,
    label,
    model: forecast.model,
    evidence: forecast.evidence,
    horizon: forecast.horizon,
    seriesPoints: series.numericPoints,
    p10: first.p10,
    p50: first.value,
    p90: first.p90,
    lastObservedAt,
    createdBy: session.displayName,
  });
  return NextResponse.json({ id, model: forecast.model, p10: first.p10, p50: first.value, p90: first.p90 });
}
