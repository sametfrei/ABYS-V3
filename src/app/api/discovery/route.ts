import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import {
  buildDiscovery,
  BusinessProfileError,
  confirmBusinessProfile,
  getConfirmedBusinessProfile,
  listIndustryPackCatalog,
} from "@/lib/db/repos/business-context";
import { getSemanticGraph } from "@/lib/db/repos/semantic-graph";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError, localizedErrorFromCookies } from "@/lib/api-i18n";

const confirmSchema = z.object({
  packId: z.string().trim().min(1).max(100),
  subsectorId: z.string().trim().min(1).max(100).nullable().optional(),
  acknowledgeConfidence: z.boolean().optional(),
});

/**
 * GET /api/discovery — işletme keşif analizi.
 * Girdiler org'un gerçek verisinden türetilir: bağlı konnektör kayıtlarının
 * varlık dağılımı ve eşlenmiş kanonik alanları, KPI etiketleri, kayıtlı
 * sektör alanı. Sonuç öneridir; POST ile açıkça onaylanmadıkça profil değişmez.
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return await localizedErrorFromCookies("api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const [build, confirmedProfile, graph] = await Promise.all([
    buildDiscovery(session.orgId),
    getConfirmedBusinessProfile(session.orgId),
    getSemanticGraph(session.orgId, 500),
  ]);

  return NextResponse.json({
    ...build.result,
    inputs: {
      entities: build.inputs.entityCounts,
      fieldCount: build.inputs.fieldNames.length,
      kpiLabelCount: build.inputs.kpiLabels.length,
      sectorId: build.inputs.sectorId,
    },
    fingerprint: build.fingerprint,
    observedSchema: build.schema,
    confirmedProfile: confirmedProfile
      ? {
          id: confirmedProfile.id,
          version: confirmedProfile.version,
          industryPackId: confirmedProfile.industryPackId,
          industryPackVersion: confirmedProfile.industryPackVersion,
          subsectorId: confirmedProfile.subsectorId,
          confidence: confirmedProfile.confidence,
          createdAt: confirmedProfile.createdAt,
          sourceFingerprint: confirmedProfile.sourceFingerprint,
        }
      : null,
    profileIsStale:
      confirmedProfile !== null && confirmedProfile.sourceFingerprint !== build.fingerprint,
    graphSummary: {
      coverage: graph.coverage,
      resolution: graph.resolution,
      entities: graph.entities,
      provenance: graph.provenance,
    },
    catalog: listIndustryPackCatalog(),
    provenance: {
      engine: "industry/classifier.ts (çok sinyalli deterministik skorlama)",
      note:
        "Sınıflandırma öneridir; düşük güvende yönetici onayı gerekir. Hiçbir KPI veri yokken hesaplanmış sayılmaz.",
    },
  });
}

/** POST /api/discovery — seçilen paketi sürümlü iş profili olarak onaylar. */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "confirm_business_profile")) {
    return NextResponse.json({ error: permissionError("confirm_business_profile") }, { status: 403 });
  }

  const parsed = await parseBody(req, confirmSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const confirmed = await confirmBusinessProfile({
      orgId: session.orgId,
      packId: parsed.data.packId,
      subsectorId: parsed.data.subsectorId ?? null,
      acknowledgeConfidence: parsed.data.acknowledgeConfidence,
      actor: session.displayName,
    });

    if (!confirmed.idempotent) {
      await recordAuditEvent({
        orgId: session.orgId,
        actor: session.displayName,
        type: "business_profile_confirmed",
        summary:
          `İş profili onaylandı: ${confirmed.profile.industryPackId} v${confirmed.profile.industryPackVersion}` +
          ` (profil v${confirmed.profile.version})`,
        detail: JSON.stringify({
          profileId: confirmed.profile.id,
          version: confirmed.profile.version,
          sourceFingerprint: confirmed.profile.sourceFingerprint,
          activatedKpis: confirmed.activation.createdCount,
          preservedKpis: confirmed.activation.preservedCount,
        }),
      });
    }

    return NextResponse.json(
      {
        profile: confirmed.profile,
        activation: confirmed.activation,
        idempotent: confirmed.idempotent,
      },
      { status: confirmed.idempotent ? 200 : 201 }
    );
  } catch (err) {
    if (err instanceof BusinessProfileError) {
      const status =
        err.code === "INVALID_SUBSECTOR" || err.code === "PACK_NOT_DETECTED" ? 400 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
