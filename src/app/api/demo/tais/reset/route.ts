import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../../auth/login/route";
import { getDb } from "@/lib/db/client";
import { resetTaisDemo, TAIS_ORG_CODE } from "@/lib/demo/tais/seed";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

/**
 * TAIS demo verisini kontrollü sıfırlar. YALNIZCA: (1) üretimde değilken,
 * (2) oturum sahibi TAIS demo kurumuna üyeyken, (3) karar yetkisi olan bir
 * rolde (record_decision — demo girişindeki tek rol "ceo" budur) çalışır.
 * Başka bir kurumun kullanıcısı, mevcut olsa bile, org kontrolünde 403 alır.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return await localizedErrorFromCookies("api.demo.productionDisabled", 403);
  }

  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const org = await getDb().query<{ code: string | null }>("SELECT code FROM organizations WHERE id = $1", [
    session.orgId,
  ]);
  if (org.rows[0]?.code !== TAIS_ORG_CODE) {
    return await localizedErrorFromCookies("api.demo.taisOnly", 403);
  }

  const { orgId } = await resetTaisDemo();
  return NextResponse.json({ ok: true, orgId });
}
