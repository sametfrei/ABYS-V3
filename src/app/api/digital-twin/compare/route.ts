import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../auth/login/route";
import { getEnterpriseState } from "@/lib/db/repos/enterprise-state";
import {
  MAX_DIGITAL_TWIN_ADJUSTMENT,
  compareDigitalTwinScenario,
} from "@/lib/digital-twin-comparison";
import { localizedError } from "@/lib/api-i18n";

const adjustmentNumber = z
  .number()
  .finite()
  .min(-MAX_DIGITAL_TWIN_ADJUSTMENT)
  .max(MAX_DIGITAL_TWIN_ADJUSTMENT);

const currencyAdjustment = z.object({
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  orderValue: adjustmentNumber.optional(),
  invoiceValue: adjustmentNumber.optional(),
  paymentValue: adjustmentNumber.optional(),
  accountBalance: adjustmentNumber.optional(),
  projectBudget: adjustmentNumber.optional(),
});

const postSchema = z.object({
  label: z.string().trim().min(1).max(160).optional(),
  asOf: z.string().datetime().optional(),
  adjustments: z.object({
    currencyAdjustments: z.array(currencyAdjustment).max(20).optional(),
    operationAdjustments: z
      .object({
        inventoryQuantity: adjustmentNumber.optional(),
        projectCount: adjustmentNumber.optional(),
        orderCount: adjustmentNumber.optional(),
        invoiceCount: adjustmentNumber.optional(),
        paymentCount: adjustmentNumber.optional(),
        eventCount: adjustmentNumber.optional(),
      })
      .optional(),
    kpiAdjustments: z
      .array(z.object({ label: z.string().trim().min(1).max(160), value: adjustmentNumber }))
      .max(50)
      .optional(),
    risks: z
      .array(
        z.object({
          code: z.string().trim().min(1).max(80),
          severity: z.enum(["critical", "warning", "info"]),
          title: z.string().trim().min(1).max(160),
          evidence: z.string().trim().min(1).max(500),
        })
      )
      .max(20)
      .optional(),
  }),
});

/** POST — mevcut/as-of dijital ikizi açık senaryo deltalarıyla karşılaştırır. */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema, { maxBytes: 256_000 });
  if (!parsed.ok) return parsed.response;

  const baseline = await getEnterpriseState(
    session.orgId,
    parsed.data.asOf ? { asOf: new Date(parsed.data.asOf) } : {}
  );
  try {
    return NextResponse.json(
      compareDigitalTwinScenario(
        baseline,
        parsed.data.adjustments,
        parsed.data.label ?? "Senaryo karşılaştırması"
      )
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Senaryo karşılaştırması geçersiz." },
      { status: 400 }
    );
  }
}
