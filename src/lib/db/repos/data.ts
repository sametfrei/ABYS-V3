import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import type { RiskAssessment } from "@/lib/ai/provider";
import { recordAuditEventInTransaction } from "./audit";
import { listKpiDefinitionSnapshots } from "./kpi-definition-provenance";

/**
 * Veri katmanı repository'si: veri seti (ham içerik korunur — veri soyu),
 * KPI değerleri ve risk sinyalleri. Tüm sorgular org-farkındalıklı.
 */

export async function insertDataset(params: {
  orgId: string;
  sectorId: string;
  sourceLabel: string;
  rawContent: string;
  ingestedBy: string;
  kpis?: { label: string; value: string; period?: string | null }[];
}): Promise<string> {
  await migrate();
  const db = getDb();
  const id = randomBytes(8).toString("hex");
  await db.query(
    `INSERT INTO datasets (id, org_id, sector_id, source_label, raw_content, ingested_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, params.orgId, params.sectorId, params.sourceLabel, params.rawContent, params.ingestedBy]
  );
  const definitions = await listKpiDefinitionSnapshots(db, params.orgId);
  for (const k of params.kpis ?? []) {
    const definition = definitions.get(k.label);
    await db.query(
      `INSERT INTO kpi_values
         (id, org_id, dataset_id, label, value,
          definition_id, definition_hash, definition_version, period)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomBytes(8).toString("hex"),
        params.orgId,
        id,
        k.label,
        k.value,
        definition?.id ?? null,
        definition?.formulaHash ?? null,
        definition?.sourceRef ?? null,
        // Gözlem dönemi yalnızca açıkça verilirse yazılır; tanımın
        // update_frequency değeri raporlama sıklığıdır, dönem değildir.
        k.period ?? null,
      ]
    );
  }
  return id;
}

/** Risk değerlendirmelerini veri soyuyla (dataset_id) sinyal olarak kaydeder. */
export async function insertRiskSignals(
  orgId: string,
  sectorId: string,
  datasetId: string | null,
  assessments: RiskAssessment[]
): Promise<number> {
  await migrate();
  const db = getDb();
  let n = 0;
  for (const a of assessments) {
    await db.query(
      `INSERT INTO signals (id, org_id, sector_id, dataset_id, category_id, severity, title, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomBytes(8).toString("hex"),
        orgId,
        sectorId,
        datasetId,
        a.categoryId,
        a.severity,
        a.categoryLabel,
        JSON.stringify(a),
      ]
    );
    n++;
  }
  return n;
}

export async function listSignals(orgId: string, sectorId?: string, limit = 200) {
  await migrate();
  // Üst sınır: sinyal tablosu zamanla büyür; sınırsız yükleme liste ekranında
  // ve dev sunucusunda belleği kontrolsüz tüketirdi.
  const boundedLimit = Math.min(1000, Math.max(1, Math.round(limit)));
  const r = await getDb().query<{
    id: string;
    sector_id: string;
    dataset_id: string | null;
    category_id: string;
    severity: string;
    title: string;
    status: string;
    payload: RiskAssessment;
    created_at: string;
  }>(
    `SELECT id, sector_id, dataset_id, category_id, severity, title, status, payload, created_at
     FROM signals WHERE org_id = $1 ${sectorId ? "AND sector_id = $2" : ""}
     ORDER BY created_at DESC
     LIMIT $${sectorId ? 3 : 2}`,
    sectorId ? [orgId, sectorId, boundedLimit] : [orgId, boundedLimit]
  );
  return r.rows;
}


export type SignalTriageStatus = "open" | "handled" | "snoozed" | "escalated";
const SIGNAL_TRIAGE_STATUSES: SignalTriageStatus[] = ["open", "handled", "snoozed", "escalated"];

export async function updateSignalStatus(params: {
  orgId: string; signalId: string; status: SignalTriageStatus; actorId: string; actorName: string;
}): Promise<boolean> {
  await migrate();
  if (!SIGNAL_TRIAGE_STATUSES.includes(params.status)) throw new Error("Invalid signal triage status.");
  return getDb().transaction(async (tx) => {
    const current = await tx.query<{ status: string }>(
      "SELECT status FROM signals WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [params.orgId, params.signalId]
    );
    if (!current.rows[0]) return false;
    const previous = current.rows[0].status;
    if (previous === params.status) return true;
    await tx.query("UPDATE signals SET status=$3 WHERE org_id=$1 AND id=$2", [params.orgId, params.signalId, params.status]);
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.actorName, type: "signal_triage_updated",
      summary: `Signal triage: ${previous} → ${params.status}`,
      detail: JSON.stringify({ signalId: params.signalId, from: previous, to: params.status, actorId: params.actorId }),
    });
    return true;
  });
}

export interface SignalNoteRow {
  id: string; signal_id: string; author_id: string; author_name: string; note: string; created_at: string | Date;
}

export async function listSignalNotes(orgId: string, signalId: string): Promise<SignalNoteRow[]> {
  await migrate();
  const result = await getDb().query<SignalNoteRow>(
    "SELECT id,signal_id,author_id,author_name,note,created_at FROM signal_notes WHERE org_id=$1 AND signal_id=$2 ORDER BY created_at ASC,id ASC LIMIT 200",
    [orgId, signalId]
  );
  return result.rows;
}

export async function addSignalNote(params: {
  orgId: string; signalId: string; authorId: string; authorName: string; note: string;
}): Promise<string | null> {
  await migrate();
  const note = params.note.trim();
  if (!note || note.length > 2000) throw new Error("Note must be between 1 and 2000 characters.");
  return getDb().transaction(async (tx) => {
    const signal = await tx.query<{ id: string }>("SELECT id FROM signals WHERE org_id=$1 AND id=$2", [params.orgId, params.signalId]);
    if (!signal.rows[0]) return null;
    const id = randomBytes(8).toString("hex");
    await tx.query(
      "INSERT INTO signal_notes (id,org_id,signal_id,author_id,author_name,note) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, params.orgId, params.signalId, params.authorId, params.authorName, note]
    );
    await recordAuditEventInTransaction(tx, {
      orgId: params.orgId, actor: params.authorName, type: "signal_war_room_note_added",
      summary: "Signal war-room note added",
      detail: JSON.stringify({ signalId: params.signalId, noteId: id, authorId: params.authorId }),
    });
    return id;
  });
}
