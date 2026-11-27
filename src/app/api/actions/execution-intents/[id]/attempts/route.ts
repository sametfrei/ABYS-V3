import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { getExecutionAttemptForIntent } from "@/lib/db/repos/execution-attempts";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { localizedError } from "@/lib/api-i18n";

const MAX_INTENT_ID_LENGTH = 300;

/** GET — yürütme niyetinin kalıcı adaptör denemesini salt-okunur döndürür. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(_req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > MAX_INTENT_ID_LENGTH) {
    return localizedError(_req, "api.actions.invalidIntentId", 400);
  }

  const result = await getExecutionAttemptForIntent({ orgId: session.orgId, intentId: id });
  if (!result.intentExists) {
    return localizedError(_req, "api.actions.preparationNotFound", 404);
  }
  return NextResponse.json({ attempt: result.attempt });
}
