import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";
import { parseBody } from "@/lib/validation";
import { evaluateOptions, validateInputs } from "@/lib/decision-options";

const criterionSchema = z.object({
  id: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100),
  direction: z.enum(["maximize", "minimize"]),
  weight: z.number().positive().max(1_000_000),
});

const optionSchema = z.object({
  id: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(100),
  scores: z.record(z.string(), z.number().finite()),
});

const bodySchema = z.object({
  criteria: z.array(criterionSchema).min(1).max(8),
  options: z.array(optionSchema).min(2).max(50),
});

/**
 * POST /api/decision-options/evaluate — çok kriterli seçenek değerlendirmesi.
 * Girdi şeması doğrulanır; eksik/tekrarlı kriter-skora izin verilmez.
 * Sayısal sonuç tamamen deterministiktir; oturum org'una yazma yapmaz.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const issues = validateInputs(parsed.data.criteria, parsed.data.options);
  if (issues.length > 0) {
    return NextResponse.json(
      { error: `Geçersiz girdi: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}` },
      { status: 400 }
    );
  }

  const result = evaluateOptions(parsed.data.criteria, parsed.data.options);
  return NextResponse.json({
    ...result,
    provenance: {
      engine: "decision-options.ts (min-max normalizasyon + Pareto baskınlığı)",
      criteria: parsed.data.criteria.length,
      options: parsed.data.options.length,
      calculatedAt: new Date().toISOString(),
    },
  });
}
