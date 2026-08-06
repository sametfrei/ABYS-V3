import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../auth/login/route";
import { upsertDefinition, listDefinitions } from "@/lib/db/repos/kpi-registry";

const postSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20000).optional(),
  unit: z.string().trim().max(100).optional(),
  formulaText: z.string().trim().max(20000).optional(),
  owner: z.string().trim().max(300).optional(),
  department: z.string().trim().max(300).optional(),
  target: z.number().optional(),
  warnThreshold: z.number().optional(),
  criticalThreshold: z.number().optional(),
  updateFrequency: z.string().trim().max(100).optional(),
});

/** KPI kayıt defteri: org'a ait KPI tanımlarını listeler. */
export async function GET() {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "view_decisions")) {
    return NextResponse.json({ error: permissionError("view_decisions") }, { status: 403 });
  }

  const definitions = await listDefinitions(session.orgId);
  return NextResponse.json({ definitions });
}

/** Yeni KPI tanımı ekler veya aynı isimdeki tanımı günceller (upsert). */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const id = await upsertDefinition({
    orgId: session.orgId,
    name: body.name,
    description: body.description,
    unit: body.unit,
    formulaText: body.formulaText,
    owner: body.owner,
    department: body.department,
    target: body.target,
    warnThreshold: body.warnThreshold,
    criticalThreshold: body.criticalThreshold,
    updateFrequency: body.updateFrequency,
  });

  return NextResponse.json({ id });
}
