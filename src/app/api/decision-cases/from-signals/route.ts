import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { generateDecisionCasesFromKpiSignals } from "@/lib/db/repos/kpi-signal-cases";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/**
 * POST /api/decision-cases/from-signals — kayıtlı KPI risk/fırsat
 * sinyallerinden deterministik karar vakası taslakları üretir.
 *
 * Yalnızca eşik yönüyle sınıflandırılmış, KPI tanımı/formülü ve veri seti
 * kökeni olan sinyaller işlenir. Aynı sinyal için mükerrer vaka oluşmaz.
 * Vakalar mevcut karar yaşam döngüsüne (onay/ret/aksiyon) hazırdır.
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

  const result = await generateDecisionCasesFromKpiSignals(session.orgId);
  return NextResponse.json(result, { status: result.generated > 0 ? 201 : 200 });
}
