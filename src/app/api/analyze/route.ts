import { NextRequest, NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/ai/provider";
import { getRole } from "@/lib/roles";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { checkAnonymousRate } from "@/lib/rate-limit";
import { isPublicDemoEnabled } from "@/lib/public-demo";
import { SESSION_COOKIE } from "../auth/login/route";

export async function POST(req: NextRequest) {
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
  } else if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }
  let body: { roleId?: string; scenario?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const role = getRole(body.roleId);
  const scenario = body.scenario?.trim();

  if (!role) {
    return NextResponse.json({ error: "Geçersiz rol." }, { status: 400 });
  }
  if (!scenario) {
    return NextResponse.json({ error: "Senaryo metni boş olamaz." }, { status: 400 });
  }
  if (scenario.length > 4000) {
    return NextResponse.json({ error: "Senaryo metni çok uzun (4000 karakter sınırı)." }, { status: 400 });
  }

  try {
    const provider = await getActiveProvider();
    const briefing = await provider.generateBriefing({
      roleLabel: role.label,
      roleFocus: role.focus,
      scenario,
    });
    return NextResponse.json(briefing);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
