import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { getKpiSeries, listKpiLabels } from "@/lib/db/repos/forecast";
import {
  hasSnapshotSince,
  insertForecastSnapshot,
} from "@/lib/db/repos/forecast-snapshots";
import { MIN_FORECAST_POINTS, forecastSeries } from "@/lib/forecasting";

/** Aynı etiket için bu süre içinde ikinci anlık görüntü alınmaz (tekrar çalıştırma güvenli). */
const CAPTURE_IDEMPOTENCY_HOURS = 20;

interface CapturedItem {
  label: string;
  status: "captured" | "skipped_recent" | "insufficient_data" | "not_forecastable";
  snapshotId?: string;
}

/**
 * POST /api/forecast/snapshots/capture — tahmin edilebilir tüm KPI etiketleri
 * için anlık görüntü alır. Cron/zamanlayıcıdan güvenle tekrar çağrılabilir:
 * aynı etiket için 20 saat içinde ikinci kayıt oluşmaz. Dış sistem çağrısı yok.
 */
export async function POST() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }

  const labels = await listKpiLabels(session.orgId);
  const since = new Date(Date.now() - CAPTURE_IDEMPOTENCY_HOURS * 60 * 60 * 1000).toISOString();
  const results: CapturedItem[] = [];

  for (const label of labels) {
    if (label.numericPoints < MIN_FORECAST_POINTS) {
      results.push({ label: label.label, status: "insufficient_data" });
      continue;
    }
    if (await hasSnapshotSince(session.orgId, label.label, since)) {
      results.push({ label: label.label, status: "skipped_recent" });
      continue;
    }
    const series = await getKpiSeries(session.orgId, label.label);
    const forecast = forecastSeries(series.values, 3);
    const first = forecast?.points[0];
    const lastObservedAt = series.timestamps[series.timestamps.length - 1];
    if (!forecast || !first || !lastObservedAt) {
      results.push({ label: label.label, status: "not_forecastable" });
      continue;
    }
    const snapshotId = await insertForecastSnapshot({
      orgId: session.orgId,
      label: label.label,
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
    results.push({ label: label.label, status: "captured", snapshotId });
  }

  return NextResponse.json({
    captured: results.filter((item) => item.status === "captured").length,
    skipped: results.filter((item) => item.status === "skipped_recent").length,
    results,
    idempotencyHours: CAPTURE_IDEMPOTENCY_HOURS,
  });
}
