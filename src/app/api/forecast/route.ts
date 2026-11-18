import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { getKpiSeries, listKpiLabels } from "@/lib/db/repos/forecast";
import {
  MIN_FORECAST_POINTS,
  forecastSeries,
  MAX_FORECAST_HORIZON,
} from "@/lib/forecasting";

/**
 * GET /api/forecast — KPI serisinden geriye dönük test edilmiş tahmin.
 * `label` yoksa tahmin edilebilir etiketleri döner. org_id oturumdan gelir.
 * Sayılar deterministik Python-benzeri değil, `src/lib/forecasting.ts`
 * içindeki saf TypeScript modellerle hesaplanır.
 */
export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const label = req.nextUrl.searchParams.get("label");
  const rawHorizon = Number(req.nextUrl.searchParams.get("horizon") ?? "3");
  const horizon = Number.isFinite(rawHorizon)
    ? Math.min(MAX_FORECAST_HORIZON, Math.max(1, Math.round(rawHorizon)))
    : 3;

  if (!label) {
    const labels = await listKpiLabels(session.orgId);
    return NextResponse.json({
      labels: labels.map((l) => ({
        ...l,
        forecastable: l.numericPoints >= MIN_FORECAST_POINTS,
      })),
      minRequired: MIN_FORECAST_POINTS,
    });
  }

  if (label.length > 120) {
    return NextResponse.json({ error: "Etiket çok uzun." }, { status: 400 });
  }

  const series = await getKpiSeries(session.orgId, label);
  const forecast = forecastSeries(series.values, horizon);

  return NextResponse.json({
    label,
    history: { values: series.values, timestamps: series.timestamps },
    forecast,
    insufficientData: forecast === null,
    minRequired: MIN_FORECAST_POINTS,
    provenance: {
      numericPoints: series.numericPoints,
      excludedPoints: series.excludedPoints,
      lastAt: series.timestamps[series.timestamps.length - 1] ?? null,
      engine: "forecasting.ts (naive / SES / linear-trend backtest)",
      assumptions: [
        `En az ${MIN_FORECAST_POINTS} sayısal gözlem gerekir; eksikse tahmin üretilmez.`,
        "Geçmiş sırası kayıt zamanına göredir (created_at ASC).",
        "Aralıklar artık hataların P10–P90 yüzdeliklerinden türetilir; istatistiksel garanti değildir.",
      ],
    },
  });
}
