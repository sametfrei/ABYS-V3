import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { authenticateApiKey, hasScope } from "@/lib/integrations/api-key";
import { metricsForOrg, timelineFor } from "@/lib/integrations/advisor-analytics";
import { checkApiKeyRate } from "@/lib/rate-limit";

/**
 * Danışman analitiği okuma ucu (Faz 2).
 * GET /api/integration/advisors?from=&to=&advisor=&timeline=1
 *
 * İKİ kimlik yolu desteklenir:
 *  - Tarayıcı oturumu (yönetici dashboard'ı için)
 *  - API anahtarı (portal kendi ekranında göstermek isterse; read:advisors)
 * Her ikisinde de org_id kimlikten türetilir — istekten asla.
 */
export async function GET(req: NextRequest) {
  let orgId: string | null = null;

  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (session && hasPermission(session.role, "view_decisions")) {
    orgId = session.orgId;
  } else {
    const ctx = await authenticateApiKey(req);
    if (ctx && hasScope(ctx, "read:advisors")) {
      const rate = checkApiKeyRate(ctx.keyId, "advisors", 60);
      if (!rate.allowed) {
        return NextResponse.json(
          { error: rate.message },
          { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } }
        );
      }
      orgId = ctx.orgId;
    }
  }

  if (!orgId) {
    return NextResponse.json(
      { error: "Yetki gerekli: kurumsal oturum ya da read:advisors kapsamlı API anahtarı." },
      { status: 401 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const fromIso = sp.get("from") ?? undefined;
  const toIso = sp.get("to") ?? undefined;
  const advisorRef = sp.get("advisor") ?? undefined;

  if (sp.get("timeline") === "1") {
    if (!advisorRef) {
      return NextResponse.json({ error: "timeline için advisor parametresi gerekli." }, { status: 400 });
    }
    const timeline = await timelineFor({ orgId, advisorRef, fromIso, toIso });
    return NextResponse.json({ advisorRef, timeline });
  }

  const advisors = await metricsForOrg({ orgId, fromIso, toIso, advisorRef });
  return NextResponse.json({
    advisors,
    window: { from: fromIso ?? "son 24 saat", to: toIso ?? "şimdi" },
    note: "Tüm süreler iş olaylarının zaman damgalarından deterministik hesaplanır; dil modeli kullanılmaz.",
  });
}
