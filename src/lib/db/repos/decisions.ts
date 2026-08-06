import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import type { AiDecisionCase } from "@/lib/ai/provider";

/**
 * Karar repository'si — tüm sorgular org-farkındalıklı (orgId parametresi
 * oturumdan gelir, asla istemciden). localStorage'daki prototip karar
 * deposunun sunucu karşılığı; UI kademeli olarak buna geçecek.
 */

export const DECISION_STATES = [
  "draft",
  "under_review",
  "awaiting_approval",
  "approved",
  "rejected",
  "in_execution",
  "completed",
  "outcome_review",
  "closed",
] as const;

export type DecisionState = (typeof DECISION_STATES)[number];

export interface StoredCase {
  id: string;
  orgId: string;
  sectorId: string;
  status: "open" | "decided";
  createdAt: string;
  case: AiDecisionCase;
}

export async function insertCases(
  orgId: string,
  sectorId: string,
  cases: AiDecisionCase[]
): Promise<StoredCase[]> {
  await migrate();
  const db = getDb();
  const out: StoredCase[] = [];
  for (const c of cases) {
    const id = randomBytes(8).toString("hex");
    await db.query(
      `INSERT INTO decision_cases (id, org_id, sector_id, category_id, severity, title, confidence, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, orgId, sectorId, c.categoryId, c.severity, c.title, Math.round(c.confidence), JSON.stringify(c)]
    );
    out.push({ id, orgId, sectorId, status: "open", createdAt: new Date().toISOString(), case: c });
  }
  return out;
}

export async function listCasesForOrg(orgId: string, sectorId?: string): Promise<StoredCase[]> {
  await migrate();
  const r = await getDb().query<{
    id: string;
    sector_id: string;
    status: string;
    payload: AiDecisionCase;
    created_at: string;
  }>(
    `SELECT id, sector_id, status, payload, created_at FROM decision_cases
     WHERE org_id = $1 ${sectorId ? "AND sector_id = $2" : ""}
     ORDER BY created_at DESC`,
    sectorId ? [orgId, sectorId] : [orgId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    orgId,
    sectorId: row.sector_id,
    status: row.status as "open" | "decided",
    createdAt: row.created_at,
    case: row.payload,
  }));
}

/**
 * Sunucu tarafı kurumsal hafıza özeti: kurumun geçmiş kararları ve
 * KAYDEDİLMİŞ SONUÇLARI, AI prompt'una beslenecek metne dönüştürülür.
 * Bu, master plandaki "öğrenme" halkasıdır — model geçmişte neyin işe
 * yaradığını/yaramadığını gerçek kayıtlardan görür. Sonucu olan kararlar
 * (kanıtlanmış ders) öne alınır.
 */
export async function buildServerMemory(orgId: string, sectorId: string, limit = 6): Promise<string> {
  await migrate();
  const r = await getDb().query<{
    choice: string;
    payload: { reason?: string; chosenAction?: string };
    outcome: { result?: string; note?: string; lesson?: string } | null;
    created_at: string;
  }>(
    `SELECT choice, payload, outcome, created_at FROM decision_records
     WHERE org_id = $1 AND sector_id = $2
     ORDER BY (outcome IS NOT NULL) DESC, created_at DESC
     LIMIT $3`,
    [orgId, sectorId, limit]
  );
  if (r.rows.length === 0) return "";

  const label = (c: string) => (c === "accepted" ? "KABUL" : c === "rejected" ? "RED" : "DEĞİŞTİRİLDİ");
  const outcomeLabel = (o: string) =>
    o === "improved" ? "iyileşme sağlandı" : o === "worsened" ? "durum kötüleşti" : "değişim olmadı";

  const lines = r.rows.map((row) => {
    const reason = row.payload?.reason ? ` (gerekçe: ${row.payload.reason})` : "";
    const action = row.payload?.chosenAction ? ` Uygulanan: "${row.payload.chosenAction}".` : "";
    let outcome = " Sonuç: henüz kaydedilmedi.";
    if (row.outcome?.result) {
      const lesson = row.outcome.lesson ? ` Ders: ${row.outcome.lesson}` : "";
      outcome = ` Sonuç: ${outcomeLabel(row.outcome.result)}${row.outcome.note ? ` (${row.outcome.note})` : ""}.${lesson}`;
    }
    return `- Öneri ${label(row.choice)}${reason}.${action}${outcome}`;
  });

  const withOutcome = r.rows.filter((x) => x.outcome?.result).length;
  const stat = withOutcome > 0 ? `\nİstatistik: ${r.rows.length} karar, ${withOutcome} tanesinin sonucu kayıtlı.` : "";
  return lines.join("\n") + stat;
}

export async function recordDecision(params: {
  orgId: string;
  caseId: string;
  sectorId: string;
  choice: "accepted" | "rejected" | "modified";
  decidedBy: string;
  payload: unknown;
}): Promise<string> {
  await migrate();
  const db = getDb();
  const id = randomBytes(8).toString("hex");
  await db.query(
    `INSERT INTO decision_records (id, org_id, case_id, sector_id, choice, decided_by, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, params.orgId, params.caseId, params.sectorId, params.choice, params.decidedBy, JSON.stringify(params.payload)]
  );
  await db.query(
    "UPDATE decision_cases SET status = 'decided' WHERE id = $1 AND org_id = $2",
    [params.caseId, params.orgId]
  );
  return id;
}

/**
 * Karar kaydının yaşam döngüsü durumunu günceller (bkz. DECISION_STATES).
 * Geçersiz durum reddedilir; org kontrolü zorunlu.
 */
export async function updateDecisionState(
  orgId: string,
  decisionId: string,
  state: DecisionState
): Promise<boolean> {
  if (!DECISION_STATES.includes(state)) return false;
  await migrate();
  const r = await getDb().query(
    "UPDATE decision_records SET state = $1 WHERE id = $2 AND org_id = $3",
    [state, decisionId, orgId]
  );
  return (r.affectedRows ?? 0) > 0;
}
