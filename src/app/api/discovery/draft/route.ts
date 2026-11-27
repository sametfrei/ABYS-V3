import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "@/lib/auth/core";
import {
  BusinessProfileError,
  createDraftBusinessProfile,
} from "@/lib/db/repos/business-context";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedErrorFromCookies } from "@/lib/api-i18n";

const draftSchema = z.object({
  acknowledgeEvidence: z.boolean().optional(),
});

/**
 * POST /api/discovery/draft — katalogda güvenilir karşılığı olmayan işletme
 * verisi için keşif taslağı oluşturur. Taslak doğrulanmış profil değildir:
 * KPI aktive etmez, otomatik hesaplamaya girmez ve yönetici paketi onaylayana
 * kadar yalnızca kanıt/öneri kaydı olarak saklanır.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "confirm_business_profile")) {
    return NextResponse.json({ error: permissionError("confirm_business_profile") }, { status: 403 });
  }

  const parsed = await parseBody(req, draftSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const draft = await createDraftBusinessProfile({
      orgId: session.orgId,
      actor: session.displayName,
      acknowledgeEvidence: parsed.data.acknowledgeEvidence,
    });

    if (!draft.idempotent) {
      const snapshot = draft.profile.snapshot;
      await recordAuditEvent({
        orgId: session.orgId,
        actor: session.displayName,
        type: "business_profile_draft_created",
        summary: `Keşif taslağı oluşturuldu (profil v${draft.profile.version}, güven %${draft.profile.confidence})`,
        detail: JSON.stringify({
          profileId: draft.profile.id,
          version: draft.profile.version,
          sourceFingerprint: draft.profile.sourceFingerprint,
          proposal: snapshot.kind === "draft" ? snapshot.proposal : null,
        }),
      });
    }

    return NextResponse.json(
      { profile: draft.profile, idempotent: draft.idempotent },
      { status: draft.idempotent ? 200 : 201 }
    );
  } catch (err) {
    if (err instanceof BusinessProfileError) {
      const status = err.code === "PACK_ALREADY_DETECTED" ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
