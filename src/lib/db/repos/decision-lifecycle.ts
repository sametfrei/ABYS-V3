import { randomBytes } from "node:crypto";
import type { Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import type { ExpectedEconomicImpact } from "@/lib/decision-economics";
import { hasPermission } from "@/lib/auth/permissions";
import { createActionInTransaction } from "./actions";
import { recordDecisionInTransaction } from "./decisions";
import { recordAuditEventInTransaction } from "./audit";

/**
 * İnsan kararı, köken aksiyon ve iki denetim kaydını tek transaction'da yazar.
 * Aksiyon oluşturma veya audit başarısız olursa karar da geri alınır; böylece
 * "karar verildi ama yürütme sahipsiz kaldı" durumu oluşmaz.
 */

export class DecisionLifecycleError extends Error {
  readonly code = "DECISION_LIFECYCLE_REJECTED";

  constructor(
    message: string,
    public readonly reason:
      | "not_found"
      | "already_decided"
      | "unauthorized_approver"
  ) {
    super(message);
    this.name = "DecisionLifecycleError";
  }
}

type AuditWriter = (
  tx: Transaction,
  params: {
    orgId: string;
    actor: string;
    type: string;
    summary: string;
    detail?: string | null;
  }
) => Promise<string>;

export async function recordHumanDecision(params: {
  orgId: string;
  caseId: string;
  choice: "accepted" | "rejected" | "modified";
  reason?: string;
  chosenAction?: string;
  expectedImpact?: ExpectedEconomicImpact | null;
  actorId: string;
  actorName: string;
  /** Onay anındaki oturum rolü; yoksa users tablosundan okunur. */
  actorRole?: string;
  auditWriter?: AuditWriter;
}): Promise<{ recordId: string; actionId: string | null }> {
  await migrate();
  const writeAudit = params.auditWriter ?? recordAuditEventInTransaction;
  return getDb().transaction(async (tx) => {
    const ownedCase = await tx.query<{ sector_id: string }>(
      "SELECT sector_id FROM decision_cases WHERE id = $1 AND org_id = $2",
      [params.caseId, params.orgId]
    );
    const caseRow = ownedCase.rows[0];
    if (!caseRow) {
      throw new DecisionLifecycleError("Vaka bulunamadı.", "not_found");
    }

    // Aynı vaka için ikinci bir İNSAN kabul/değişiklik kaydı yeni bir aksiyon
    // ve denetim kaydı üretirdi; mükerrer onay 409 ile reddedilir. Demo
    // tohumunun "sistem" aktörlü kaydı öneri tabanıdır, insan onayını engellemez
    // (bkz. src/lib/demo/tais/decisions.ts).
    const existing = await tx.query<{ id: string }>(
      "SELECT id FROM decision_records WHERE org_id = $1 AND case_id = $2 AND choice IN ('accepted', 'modified') AND LOWER(decided_by) <> 'sistem' LIMIT 1",
      [params.orgId, params.caseId]
    );
    if (existing.rows[0]) {
      throw new DecisionLifecycleError(
        "Bu vaka için karar zaten kaydedilmiş.",
        "already_decided"
      );
    }

    let role = params.actorRole?.trim() || null;
    if (!role) {
      const user = await tx.query<{ role: string }>(
        "SELECT role FROM users WHERE id = $1 AND org_id = $2",
        [params.actorId, params.orgId]
      );
      role = user.rows[0]?.role ?? null;
    }
    if (role && !hasPermission(role, "record_decision")) {
      throw new DecisionLifecycleError(
        "Bu rol karar kaydetmeye yetkili değil.",
        "unauthorized_approver"
      );
    }

    // Audit, karar satırından önce yazılır ki onay kaydı kendi audit
    // referansını taşıyabilsin. İkisi aynı transaction'dadır.
    const recordId = randomBytes(8).toString("hex");
    const approvalPermission = role ? "record_decision" : null;
    const auditId = await writeAudit(tx, {
      orgId: params.orgId,
      actor: params.actorName,
      type: "decision_made",
      summary: `Karar verildi: ${params.choice}`,
      detail: JSON.stringify({
        caseId: params.caseId,
        decisionId: recordId,
        actorId: params.actorId,
        role,
        permission: approvalPermission,
        source: "human",
      }),
    });
    await recordDecisionInTransaction(tx, {
      id: recordId,
      orgId: params.orgId,
      caseId: params.caseId,
      sectorId: caseRow.sector_id,
      choice: params.choice,
      decidedBy: params.actorName,
      payload: {
        reason: params.reason ?? "",
        chosenAction: params.chosenAction ?? "",
      },
      expectedImpact: params.expectedImpact ?? null,
      decidedById: params.actorId,
      decidedRole: role,
      approvalPermission,
      approvalSource: "human",
      approvedAt: new Date().toISOString(),
      approvalAuditId: auditId,
    });

    let actionId: string | null = null;
    if (params.choice === "accepted" || params.choice === "modified") {
      const title = params.chosenAction?.trim() || "Onaylanan kararın uygulanması";
      actionId = await createActionInTransaction(tx, {
        orgId: params.orgId,
        decisionId: recordId,
        caseId: params.caseId,
        title,
        owner: params.actorName,
        actorId: params.actorId,
        actorName: params.actorName,
      });
      await writeAudit(tx, {
        orgId: params.orgId,
        actor: params.actorName,
        type: "action_created",
        summary: `Aksiyon oluşturuldu: ${title}`,
        detail: JSON.stringify({ actionId, decisionId: recordId, actorId: params.actorId }),
      });
    }
    return { recordId, actionId };
  });
}
