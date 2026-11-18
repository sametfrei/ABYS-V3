import { getDb, migrate } from "../client";

/**
 * Organizasyon hiyerarşisi — holding (group) → şirket (company) → şube (branch).
 * Her sorgu bir KÖK org ile başlar; kökün alt ağacı dışına asla çıkılmaz.
 * Bu, çok şirketli yapılarda oturum sahibinin yalnızca kendi alt ağacını
 * görmesini sağlar (kiracı izolasyonu).
 */

export type OrgKind = "group" | "company" | "branch";

export interface OrgRow {
  id: string;
  name: string;
  code: string | null;
  sectorId: string;
  kind: OrgKind;
  parentId: string | null;
  country: string | null;
  currency: string;
  depth: number;
}

interface OrgDbRow {
  id: string;
  name: string;
  code: string | null;
  sector_id: string;
  kind: string;
  parent_id: string | null;
  country: string | null;
  currency: string;
  depth: number;
}

const ORG_COLUMNS =
  "id, name, code, sector_id, kind, parent_id, country, currency";

function mapOrg(row: OrgDbRow): OrgRow {
  const kind: OrgKind =
    row.kind === "group" || row.kind === "branch" ? row.kind : "company";
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    sectorId: row.sector_id,
    kind,
    parentId: row.parent_id,
    country: row.country,
    currency: row.currency,
    depth: Number(row.depth ?? 0),
  };
}

export async function getOrganization(orgId: string): Promise<OrgRow | null> {
  await migrate();
  const r = await getDb().query<OrgDbRow>(
    `SELECT ${ORG_COLUMNS}, 0 AS depth FROM organizations WHERE id = $1`,
    [orgId]
  );
  return r.rows[0] ? mapOrg(r.rows[0]) : null;
}

/**
 * Kökün kendisi + tüm alt kurumlar (önce kök, sonra seviye ve ada göre).
 * Döngüsel parent_id verisine karşı derinlik 50 ile sınırlanır.
 */
export async function listOrganizationSubtree(rootId: string): Promise<OrgRow[]> {
  await migrate();
  const r = await getDb().query<OrgDbRow>(
    `WITH RECURSIVE tree AS (
       SELECT ${ORG_COLUMNS}, 0 AS depth
         FROM organizations WHERE id = $1
       UNION ALL
       SELECT o.id, o.name, o.code, o.sector_id, o.kind, o.parent_id,
              o.country, o.currency, tree.depth + 1
         FROM organizations o
         JOIN tree ON o.parent_id = tree.id
        WHERE tree.depth < 50
     )
     SELECT * FROM tree ORDER BY depth ASC, name ASC`,
    [rootId]
  );
  return r.rows.map(mapOrg);
}

export interface OrgConsolidationRow {
  id: string;
  name: string;
  kind: OrgKind;
  currency: string;
  openSignals: number;
  openDecisions: number;
  openActions: number;
  overdueActions: number;
}

interface ConsolidationDbRow {
  id: string;
  name: string;
  kind: string;
  currency: string;
  open_signals: number;
  open_decisions: number;
  open_actions: number;
  overdue_actions: number;
}

/**
 * Alt ağaçtaki her kurum için açık risk, karar ve aksiyon sayıları.
 * Tek sorguda toplanır; kök her zaman oturumdan gelir.
 */
export async function getOrganizationConsolidation(
  rootId: string
): Promise<OrgConsolidationRow[]> {
  await migrate();
  const r = await getDb().query<ConsolidationDbRow>(
    `WITH RECURSIVE tree AS (
       SELECT id, name, kind, currency, 0 AS depth
         FROM organizations WHERE id = $1
       UNION ALL
       SELECT o.id, o.name, o.kind, o.currency, tree.depth + 1
         FROM organizations o
         JOIN tree ON o.parent_id = tree.id
        WHERE tree.depth < 50
     )
     SELECT t.id, t.name, t.kind, t.currency,
       (SELECT count(*)::int FROM signals s
         WHERE s.org_id = t.id AND s.status = 'open') AS open_signals,
       (SELECT count(*)::int FROM decision_cases c
         WHERE c.org_id = t.id AND c.status = 'open') AS open_decisions,
       (SELECT count(*)::int FROM actions a
         WHERE a.org_id = t.id AND a.status IN ('open', 'in_progress')) AS open_actions,
       (SELECT count(*)::int FROM actions a
         WHERE a.org_id = t.id AND a.status IN ('open', 'in_progress')
           AND a.due_at IS NOT NULL AND a.due_at < now()) AS overdue_actions
     FROM tree t ORDER BY t.depth ASC, t.name ASC`,
    [rootId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind === "group" || row.kind === "branch" ? row.kind : "company",
    currency: row.currency,
    openSignals: Number(row.open_signals),
    openDecisions: Number(row.open_decisions),
    openActions: Number(row.open_actions),
    overdueActions: Number(row.overdue_actions),
  }));
}

export interface PriorityDecision {
  id: string;
  orgId: string;
  orgName: string;
  title: string;
  severity: string;
  confidence: number;
  createdAt: string;
}

interface PriorityDbRow {
  id: string;
  org_id: string;
  org_name: string;
  title: string;
  severity: string;
  confidence: number;
  created_at: string | Date;
}

/**
 * Alt ağaçtaki AÇIK karar vakalarından öncelikli ilk N tanesi.
 * Sıra: kritik → yüksek → orta → düşük, sonra güven (yüksek önce), sonra eski.
 * "Bugün hangi üç karara öncelik verilmeli?" sorusunun deterministik tabanı.
 */
export async function getTopOpenDecisions(
  rootId: string,
  limit = 3
): Promise<PriorityDecision[]> {
  await migrate();
  const r = await getDb().query<PriorityDbRow>(
    `WITH RECURSIVE tree AS (
       SELECT id, 0 AS depth FROM organizations WHERE id = $1
       UNION ALL
       SELECT o.id, tree.depth + 1
         FROM organizations o JOIN tree ON o.parent_id = tree.id
        WHERE tree.depth < 50
     )
     SELECT c.id, c.org_id, o.name AS org_name, c.title, c.severity, c.confidence, c.created_at
       FROM decision_cases c
       JOIN tree t ON t.id = c.org_id
       JOIN organizations o ON o.id = c.org_id
      WHERE c.status = 'open'
      ORDER BY CASE c.severity
                 WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                 WHEN 'medium' THEN 2 ELSE 3 END ASC,
               c.confidence DESC,
               c.created_at ASC
      LIMIT $2`,
    [rootId, limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    orgName: row.org_name,
    title: row.title,
    severity: row.severity,
    confidence: Number(row.confidence),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}
