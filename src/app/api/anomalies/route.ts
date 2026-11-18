import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { getAllKpiSeries } from "@/lib/db/repos/forecast";
import { ANOMALY_MIN_POINTS, detectAnomalies } from "@/lib/anomaly";

/**
 * GET /api/anomalies — kurumun sayısal KPI serilerinde sağlam aykırı değer
 * taraması. org_id oturumdan gelir. Sinyaller nedensel teşhis değildir;
 * her biri yöntem, skor ve zaman damgasıyla birlikte döner.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const seriesMap = await getAllKpiSeries(session.orgId);
  const results: Array<{
    label: string;
    points: number;
    anomalies: ReturnType<typeof detectAnomalies>;
  }> = [];

  for (const [label, { values, timestamps }] of seriesMap) {
    const anomalies = detectAnomalies(values, { timestamps });
    if (anomalies.length > 0) {
      results.push({ label, points: values.length, anomalies });
    }
  }

  results.sort((a, b) => {
    const latest = (x: (typeof results)[number]) =>
      new Date(x.anomalies[x.anomalies.length - 1]?.timestamp ?? 0).getTime();
    return latest(b) - latest(a);
  });

  return NextResponse.json({
    scannedLabels: seriesMap.size,
    flaggedLabels: results.length,
    minRequired: ANOMALY_MIN_POINTS,
    method: {
      engine: "anomaly.ts (median/MAD robust z-score)",
      window: 8,
      threshold: 3.5,
      note: "İstatistiksel erken uyarı sinyali; nedensellik iddiası değildir.",
    },
    results,
  });
}
