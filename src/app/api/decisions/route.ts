import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "@/lib/auth/core";
import { updateDecisionState, DECISION_STATES } from "@/lib/db/repos/decisions";
import {
  DecisionLifecycleError,
  recordHumanDecision,
} from "@/lib/db/repos/decision-lifecycle";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import type { ExpectedEconomicImpact } from "@/lib/decision-economics";
import { localizedError } from "@/lib/api-i18n";

const expectedImpactSchema = z
  .object({
    value: z.number().finite().min(-1_000_000_000_000_000).max(1_000_000_000_000_000),
    low: z.number().finite().min(-1_000_000_000_000_000).max(1_000_000_000_000_000).optional(),
    high: z.number().finite().min(-1_000_000_000_000_000).max(1_000_000_000_000_000).optional(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/, "Para birimi üç büyük harfli ISO kodu olmalı."),
    basis: z.string().trim().max(500).optional(),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  })
  .superRefine((impact, ctx) => {
    if (impact.low !== undefined && impact.low > impact.value) {
      ctx.addIssue({ code: "custom", path: ["low"], message: "Alt sınır beklenen değerden büyük olamaz." });
    }
    if (impact.high !== undefined && impact.high < impact.value) {
      ctx.addIssue({ code: "custom", path: ["high"], message: "Üst sınır beklenen değerden küçük olamaz." });
    }
  });

const postSchema = z.object({
  caseId: z.string().min(1).max(300),
  sectorId: z.string().min(1).max(300),
  choice: z.enum(["accepted", "rejected", "modified"]),
  reason: z.string().max(20000).optional(),
  chosenAction: z.string().max(300).optional(),
  expectedImpact: expectedImpactSchema.optional(),
});

const patchSchema = z.object({
  decisionId: z.string().min(1).max(300),
  state: z.enum(DECISION_STATES),
});

/**
 * İnsan kararının kaydı (kabul/ret/değiştir) — record_decision izni gerekir.
 * Maddi kararlar daima insan onaylıdır; AI bu ucu çağıramaz.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const expectedImpact: ExpectedEconomicImpact | null = body.expectedImpact
    ? {
        value: body.expectedImpact.value,
        low: body.expectedImpact.low ?? null,
        high: body.expectedImpact.high ?? null,
        currency: body.expectedImpact.currency,
        basis: body.expectedImpact.basis ?? null,
        assumptions: body.expectedImpact.assumptions ?? [],
      }
    : null;

  try {
    const result = await recordHumanDecision({
      orgId: session.orgId,
      caseId: body.caseId,
      choice: body.choice,
      reason: body.reason,
      chosenAction: body.chosenAction,
      expectedImpact,
      actorId: session.userId,
      actorName: session.displayName,
      actorRole: session.role,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DecisionLifecycleError) {
      if (err.reason === "already_decided") {
        return localizedError(req, "api.decisions.alreadyDecided", 409);
      }
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}

/** Karar kaydının yaşam döngüsü durumunu günceller (draft → ... → closed). */
export async function PATCH(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "record_decision")) {
    return NextResponse.json({ error: permissionError("record_decision") }, { status: 403 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updated = await updateDecisionState(session.orgId, body.decisionId, body.state);
  if (!updated) {
    return localizedError(req, "api.outcomes.decisionNotFound", 404);
  }

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "decision_state_updated",
    summary: `Karar durumu güncellendi: ${body.state}`,
    detail: body.decisionId,
  });

  return NextResponse.json({ ok: true });
}
