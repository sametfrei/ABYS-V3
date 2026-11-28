import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import {
  ANOMALY_DEFAULT_WINDOW,
  ANOMALY_MIN_POINTS,
  detectAnomalies,
} from "@/lib/anomaly";
import { loadKpiSeriesScopes } from "@/lib/db/repos/kpi-signals";
import { runKpiIntelligencePipeline } from "@/lib/connectors/kpi-intelligence";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/**
 * GET /api/anomalies — kurumun sayısal KPI serilerinde sağlam aykırı değer
 * taraması. org_id oturumdan gelir. Sinyaller nedensel teşhis değildir;
 * her biri yöntem, skor ve zaman damgasıyla birlikte döner.
 *
 * Yanıt sözleşmesi (seri sayımları):
 * - `scannedLabels`: yüklenen farklı KPI etiketleri (doğrulanmış + doğrulanmamış).
 * - `scannedSeries`: yüklenen tüm kapsamlı seriler.
 * - `verifiedSeries`: ölçüm kapsamı doğrulanmış seriler.
 * - `skippedUnverifiedSeries`: kapsamı doğrulanamadığı için analiz edilmeyen seriler.
 * - `analyzedSeries`: doğrulanmış ve dedektör için yeterli gözlemi olan seriler.
 * - `insufficientSeries`: doğrulanmış ancak minimum gözlem altındaki seriler.
 * - `flaggedSeries`: analiz edilen serilerden aykırılık bulunanlar.
 * - `flaggedLabels`: işaretlenen serilerdeki farklı KPI etiketleri.
 * - `results`: yalnızca işaretlenen, kapsamı doğrulanmış seriler; her satır
 *   dataset/entity/externalId/dönem/tanım kökenini ve örneklem penceresini taşır.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const loaded = await loadKpiSeriesScopes(session.orgId);
  const results: Array<{
    label: string;
    datasetId: string;
    datasetLabel: string;
    sectorId: string;
    entity: string | null;
    externalId: string | null;
    period: string | null;
    periodKnown: boolean;
    reportingFrequency: string | null;
    definitionId: string | null;
    definitionHash: string | null;
    definitionVersion: string | null;
    definitionUnit: string | null;
    points: number;
    seriesPoints: number;
    sampleSize: number;
    anomalies: ReturnType<typeof detectAnomalies>;
  }> = [];

  for (const series of loaded.series) {
    if (!series.scopeVerified) continue;
    const anomalies = detectAnomalies(
      series.points.map((point) => point.value),
      {
        timestamps: series.points.map((point) => point.timestamp),
      }
    );
    if (anomalies.length > 0) {
      results.push({
        label: series.scope.label,
        datasetId: series.scope.datasetId,
        datasetLabel: series.scope.datasetLabel,
        sectorId: series.scope.sectorId,
        entity: series.scope.entity,
        externalId: series.scope.externalId,
        period: series.scope.period,
        periodKnown: series.scope.period !== null,
        reportingFrequency: series.scope.reportingFrequency,
        definitionId: series.scope.definitionId,
        definitionHash: series.scope.definitionHash,
        definitionVersion: series.scope.definitionVersion,
        definitionUnit: series.scope.definitionUnit,
        points: series.points.length,
        seriesPoints: series.points.length,
        sampleSize: ANOMALY_DEFAULT_WINDOW,
        anomalies,
      });
    }
  }

  results.sort((a, b) => {
    const latest = (x: (typeof results)[number]) =>
      new Date(x.anomalies[x.anomalies.length - 1]?.timestamp ?? 0).getTime();
    return latest(b) - latest(a);
  });

  return NextResponse.json({
    scannedLabels: loaded.scannedLabels,
    scannedSeries: loaded.scannedSeries,
    verifiedSeries: loaded.verifiedSeries,
    skippedUnverifiedSeries: loaded.skippedUnverifiedSeries,
    analyzedSeries: loaded.analyzedSeries,
    insufficientSeries: loaded.insufficientSeries,
    flaggedSeries: results.length,
    // Geriye dönük uyumluluk: en az bir serisi işaretlenen farklı etiket sayısı.
    flaggedLabels: new Set(results.map((result) => result.label)).size,
    minRequired: ANOMALY_MIN_POINTS,
    method: {
      engine: "anomaly.ts (median/MAD robust z-score)",
      window: ANOMALY_DEFAULT_WINDOW,
      threshold: 3.5,
      note: "İstatistiksel erken uyarı sinyali; nedensellik iddiası değildir.",
    },
    results,
  });
}

/**
 * POST /api/anomalies — en güncel aykırı KPI gözlemlerini kalıcı risk
 * sinyaline dönüştürür. Deterministik; aynı gözlem için mükerrer sinyal
 * üretmez. Sinyal, örneklem ve veri seti kökenini taşır.
 */
export async function POST() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  }
  if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }

  const { signals: result, decisionCases } = await runKpiIntelligencePipeline(
    session.orgId,
    session.displayName
  );

  // Uygun sinyal (eşikle risk/fırsat sınıflandırılmış, KPI formülü ve veri
  // kökeni olan) otomatik olarak karar taslağına dönüşür. Kanıt yetersizse
  // üretim yapılmaz; aynı sinyal için mükerrer vaka oluşmaz.
  return NextResponse.json({
    ...result,
    decisionCases,
    method: {
      engine: "anomaly.ts (median/MAD robust z-score)",
      note:
        "Yalnızca istatistiksel sinyal üretilir; nedensellik veya iş etkisi iddia edilmez. " +
        "Karar taslakları yalnızca eşikle sınıflandırılmış ve kanıtı tam sinyallerden oluşur.",
    },
  });
}
