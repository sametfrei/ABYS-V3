import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getActiveProvider } from "@/lib/ai/provider";
import { getSector } from "@/lib/sectors";
import { streamedJsonResponse } from "@/lib/ai/stream-route";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { checkAnonymousRate } from "@/lib/rate-limit";
import { isPublicDemoEnabled } from "@/lib/public-demo";
import { insertDataset, insertRiskSignals } from "@/lib/db/repos/data";
import { SESSION_COOKIE } from "../auth/login/route";

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let body: { sectorId?: string; data?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const sector = getSector(body.sectorId);
  const data = body.data?.trim();

  if (!sector) {
    return NextResponse.json({ error: "Geçersiz sektör." }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Veri boş olamaz." }, { status: 400 });
  }
  if (data.length > 12000) {
    return NextResponse.json({ error: "Veri çok uzun (12000 karakter sınırı)." }, { status: 400 });
  }

  // Oturum stream başlamadan okunur.
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    // Oturumsuz erişim varsayılan olarak kapalıdır — yalnızca ABYS_PUBLIC_DEMO=1
    // ile açık deneme akışı için geri açılır (bkz. src/lib/public-demo.ts).
    if (!isPublicDemoEnabled()) {
      return NextResponse.json({ error: "Bu uç oturum gerektirir." }, { status: 401 });
    }
    // Oturumsuz istekler IP başına sınırlıdır (AI kaynak tüketimine karşı).
    const rate = checkAnonymousRate(req, false);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: rate.message },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } }
      );
    }
  } else if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  return streamedJsonResponse(async () => {
    const provider = await getActiveProvider();
    const assessments = await provider.assessRisk({
      sectorLabel: sector.label,
      riskCategories: sector.riskCategories,
      data,
    });
    // Oturum varsa: ham veri (soy) + sinyaller kurum adına kalıcılaşır.
    if (session && assessments.length > 0) {
      const datasetId = await insertDataset({
        orgId: session.orgId,
        sectorId: sector.id,
        sourceLabel: "risk-analizi-girdisi",
        rawContent: data,
        ingestedBy: session.displayName,
      });
      await insertRiskSignals(session.orgId, sector.id, datasetId, assessments);
    }
    return { assessments, persisted: !!session };
  });
}
