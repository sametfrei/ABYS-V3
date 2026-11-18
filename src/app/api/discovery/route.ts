import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { getDb, migrate } from "@/lib/db/client";
import { discoverBusiness } from "@/lib/industry/classifier";
import { INDUSTRY_PACKS } from "@/lib/industry/packs";

/**
 * GET /api/discovery — işletme keşif analizi.
 * Girdiler org'un gerçek verisinden türetilir: bağlı konnektör kayıtlarının
 * varlık dağılımı ve eşlenmiş kanonik alanları, KPI etiketleri, kayıtlı
 * sektör alanı. Sonuç hiçbir şeyi kalıcı olarak değiştirmez (öneri niteliğinde).
 */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  await migrate();
  const db = getDb();

  const [orgResult, entityResult, fieldResult, labelResult, definitionResult] = await Promise.all([
    db.query<{ sector_id: string | null }>("SELECT sector_id FROM organizations WHERE id = $1", [
      session.orgId,
    ]),
    db.query<{ entity: string; count: number }>(
      `SELECT entity, count(*)::int AS count FROM connector_records
        WHERE org_id = $1 GROUP BY entity`,
      [session.orgId]
    ),
    db.query<{ field: string }>(
      `SELECT DISTINCT jsonb_object_keys(data->'fields') AS field
         FROM connector_records WHERE org_id = $1`,
      [session.orgId]
    ),
    db.query<{ label: string }>(
      `SELECT DISTINCT label FROM kpi_values WHERE org_id = $1`,
      [session.orgId]
    ),
    db.query<{ name: string }>(
      `SELECT name FROM kpi_definitions WHERE org_id = $1`,
      [session.orgId]
    ),
  ]);

  const entityCounts: Record<string, number> = {};
  for (const row of entityResult.rows) entityCounts[row.entity] = Number(row.count);

  const fieldNames = [...new Set(fieldResult.rows.map((r) => r.field))];
  const kpiLabels = [
    ...new Set([...labelResult.rows.map((r) => r.label), ...definitionResult.rows.map((r) => r.name)]),
  ];

  const result = discoverBusiness({
    sectorId: orgResult.rows[0]?.sector_id ?? null,
    entityCounts,
    fieldNames,
    kpiLabels,
  });

  return NextResponse.json({
    ...result,
    inputs: {
      entities: entityCounts,
      fieldCount: fieldNames.length,
      kpiLabelCount: kpiLabels.length,
      sectorId: orgResult.rows[0]?.sector_id ?? null,
    },
    catalog: INDUSTRY_PACKS.map((p) => ({
      id: p.id,
      label: p.label,
      version: p.version,
      subsectors: p.subsectors.length,
      kpis: p.kpis.length,
    })),
    provenance: {
      engine: "industry/classifier.ts (çok sinyalli deterministik skorlama)",
      note: "Sınıflandırma öneridir; düşük güvende yönetici onayı gerekir. Hiçbir KPI veri yokken hesaplanmış sayılmaz.",
    },
  });
}
