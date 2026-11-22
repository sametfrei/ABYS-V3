import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { getSector, type SectorId } from "@/lib/sectors";
import { getTemplates, getTemplate, runComparison } from "@/lib/scenario-engine";
import { runMonteCarlo } from "@/lib/scenario-simulation";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError } from "@/lib/api-i18n";

/**
 * Senaryo Laboratuvarı (master plan md.13).
 * GET: sektörün şablonları + kayıtlı senaryolar.
 * POST: deterministik karşılaştırma çalıştırır (taban/iyimser/kötümser),
 *       duyarlılık üretir ve isteğe bağlı kaydeder.
 * Sayılar KODDA hesaplanır; hiçbir dil modeli sayı üretmez.
 */

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const sectorId = (req.nextUrl.searchParams.get("sectorId") ?? "other") as SectorId;
  const sector = getSector(sectorId);
  if (!sector) return localizedError(req, "api.scenarios.invalidSector", 400);

  await migrate();
  const saved = await getDb().query(
    `SELECT id, name, template_id, inputs, results, formula_text, created_by, created_at
     FROM scenarios WHERE org_id = $1 AND sector_id = $2 ORDER BY created_at DESC LIMIT 20`,
    [session.orgId, sectorId]
  );

  return NextResponse.json({
    templates: getTemplates(sector.id).map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      variables: t.variables,
      formulaText: t.formulaText,
      limitations: t.limitations,
    })),
    saved: saved.rows,
  });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "run_analysis")) {
    return NextResponse.json({ error: permissionError("run_analysis") }, { status: 403 });
  }

  let body: {
    sectorId?: string;
    templateId?: string;
    inputs?: Record<string, number>;
    save?: boolean;
    name?: string;
    caseId?: string;
    simulate?: boolean;
    samples?: number;
    seed?: number;
  };
  try {
    body = await req.json();
  } catch {
    return localizedError(req, "api.scenarios.invalidBody", 400);
  }

  const sector = getSector(body.sectorId);
  if (!sector) return localizedError(req, "api.scenarios.invalidSector", 400);
  const template = getTemplate(sector.id, body.templateId ?? "");
  if (!template) return localizedError(req, "api.scenarios.templateNotFound", 400);

  // Girdiler sayısal ve şablon sınırları içinde olmalı (deterministik güvenlik).
  const inputs: Record<string, number> = {};
  for (const v of template.variables) {
    const raw = Number(body.inputs?.[v.id] ?? v.value);
    if (!Number.isFinite(raw)) {
      return NextResponse.json({ error: `${v.label} sayısal olmalı.` }, { status: 400 });
    }
    inputs[v.id] = Math.max(v.min, Math.min(v.max, raw));
  }

  const { runs, sensitivity } = runComparison(template, inputs);
  const simulation =
    body.simulate === true
      ? runMonteCarlo(template, inputs, {
          samples: typeof body.samples === "number" ? body.samples : undefined,
          seed: typeof body.seed === "number" ? body.seed : undefined,
        })
      : null;
  const calculatedAt = new Date().toISOString();

  let scenarioId: string | null = null;
  if (body.save) {
    await migrate();
    scenarioId = randomBytes(8).toString("hex");
    await getDb().query(
      `INSERT INTO scenarios (id, org_id, sector_id, template_id, name, inputs, results, formula_text, created_by, case_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        scenarioId,
        session.orgId,
        sector.id,
        template.id,
        (typeof body.name === "string" ? body.name.trim() : "") || template.label,
        JSON.stringify(inputs),
        JSON.stringify(runs),
        template.formulaText,
        session.displayName,
        typeof body.caseId === "string" ? body.caseId : null,
      ]
    );
    await recordAuditEvent({
      orgId: session.orgId,
      actor: session.displayName,
      type: "scenario_saved",
      summary: `Senaryo kaydedildi: ${body.name ?? template.label}`,
      detail: scenarioId,
    });
  }

  return NextResponse.json({
    scenarioId,
    runs,
    sensitivity,
    simulation,
    // İzlenebilirlik paketi — her sonuçla birlikte döner (md.13 şartı)
    provenance: {
      templateId: template.id,
      formulaText: template.formulaText,
      limitations: template.limitations,
      engine: "deterministic (scenario-engine.ts)",
      calculatedAt,
      note: "Sayısal sonuçlar kodda hesaplanır; dil modeli sayı üretmez.",
    },
  });
}
