import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveProvider } from "@/lib/ai/provider";
import { getRole } from "@/lib/roles";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { localizedError, localizedErrorWith } from "@/lib/api-i18n";
import { checkAnonymousRate } from "@/lib/rate-limit";
import { isPublicDemoEnabled } from "@/lib/public-demo";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";

const MAX_SCENARIO_LEN = 4000;

/**
 * POST /api/analyze gövdesi. `org_id` ve bilinmeyen alanlar zod tarafından
 * sessizce atılır (kurum kimliği yalnızca oturumdan gelir). Metin alanları
 * şemada trim edilir; boşluktan ibaret senaryo 400 döner.
 */
const analyzeBodySchema = z.object({
  roleId: z.unknown(),
  scenario: z.unknown(),
});

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    // Oturumsuz erişim varsayılan olarak kapalıdır — yalnızca ABYS_PUBLIC_DEMO=1
    // ile açık deneme akışı için geri açılır (bkz. src/lib/public-demo.ts).
    if (!isPublicDemoEnabled()) {
      return localizedError(req, "api.auth.sessionRequired", 401);
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
  const parsed = await parseBody(req, analyzeBodySchema);
  if (!parsed.ok) return parsed.response;

  if (typeof parsed.data.roleId !== "string") {
    return localizedError(req, "api.analyze.invalidRole", 400);
  }
  if (typeof parsed.data.scenario !== "string") {
    return localizedError(req, "api.analyze.scenarioRequired", 400);
  }
  const role = getRole(parsed.data.roleId);
  if (!role) {
    return localizedError(req, "api.analyze.invalidRole", 400);
  }
  const scenario = parsed.data.scenario.trim();
  if (scenario.length === 0) {
    return localizedError(req, "api.analyze.scenarioRequired", 400);
  }
  if (scenario.length > MAX_SCENARIO_LEN) {
    return localizedErrorWith(req, "api.analyze.scenarioTooLong", 400, { max: MAX_SCENARIO_LEN });
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
