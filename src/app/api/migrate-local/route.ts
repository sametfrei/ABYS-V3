import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../auth/login/route";
import { insertCases } from "@/lib/db/repos/decisions";
import type { AiDecisionCase } from "@/lib/ai/provider";
import { recordAuditEvent } from "@/lib/db/repos/audit";

/**
 * Prototip (localStorage) verisinin tek seferlik sunucu göçü.
 * Oturum zorunlu; her şey oturumdaki kuruma yazılır. Idempotent: aynı
 * localId ikinci kez gönderilirse atlanır (audit detail üzerinden izlenir).
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  let body: {
    sectorId?: string;
    cases?: { localId: string; case: AiDecisionCase; status?: string }[];
    auditEvents?: { localId: string; type: string; actor: string; summary: string; detail?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }
  const sectorId = body.sectorId?.trim();
  if (!sectorId) return NextResponse.json({ error: "sectorId gerekli." }, { status: 400 });

  const db = getDb();
  // Daha önce göçmüş localId'ler (migration audit kayıtlarının detail alanında)
  const prior = await db.query<{ detail: string }>(
    "SELECT detail FROM audit_events WHERE org_id = $1 AND type = 'local_migration' AND detail IS NOT NULL",
    [session.orgId]
  );
  const migrated = new Set(prior.rows.map((r) => r.detail));

  let cases = 0;
  for (const item of body.cases ?? []) {
    if (!item.localId || migrated.has(item.localId)) continue;
    await insertCases(session.orgId, sectorId, [item.case]);
    await recordAuditEvent({
      orgId: session.orgId,
      actor: session.displayName,
      type: "local_migration",
      summary: "Prototip vakası taşındı",
      detail: item.localId,
    });
    cases++;
  }

  let audits = 0;
  for (const ev of body.auditEvents ?? []) {
    if (!ev.localId || migrated.has(ev.localId)) continue;
    await recordAuditEvent({
      orgId: session.orgId,
      actor: ev.actor,
      type: "local_migration",
      summary: `[prototip] ${ev.summary}`,
      detail: ev.localId,
    });
    audits++;
  }

  return NextResponse.json({ migrated: { cases, audits }, skipped: migrated.size });
}
