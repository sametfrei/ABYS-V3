import { getDb, migrate } from "@/lib/db/client";
import { seedTaisDemo, TAIS_ORG_CODE, TAIS_DEMO_EMAIL, TAIS_DEMO_PASSWORD } from "./seed";
import { seedTaisDecisions } from "./decisions";

/**
 * Sifir ortamda TAIS demo kurumunu+kullanicisini+verisini KENDI BASINA kurar.
 *
 * Neden var: `POST /api/demo/tais/reset` yalnizca zaten TAIS org'unda oturum
 * acmis bir kullanici tarafindan cagrilabilir (bkz. src/app/api/demo/tais/reset/route.ts) —
 * sifirdan temiz bir ortamda ne org ne de ceo@tais.demo hesabi mevcut oldugundan
 * kimse giris yapip reset'i tetikleyemez (tavuk-yumurta). Bu fonksiyon, reset
 * ucunu gevsetmeden, ayri ve idempotent bir "ilk kurulum" yolu saglar.
 *
 * Mevcut seed fonksiyonlarini (seedTaisDemo, seedTaisDecisions) YENIDEN YAZMAZ,
 * yalnizca cagirir; tum idempotency/determinizm garantileri oralardan gelir.
 */

export interface TaisBootstrapResult {
  orgId: string;
  adminEmail: string;
  baseDataAlreadySeeded: boolean;
  decisionsAlreadySeeded: boolean;
  decisionCount: number;
  actionCount: number;
  counts: Record<string, number>;
}

const TAIS_TABLES = [
  "tais_customers",
  "tais_locations",
  "tais_contracts",
  "tais_teams",
  "tais_employees",
  "tais_tasks",
  "tais_leads",
  "tais_deals",
  "tais_activities",
  "tais_service_requests",
  "tais_complaints",
  "tais_quality_issues",
] as const;

async function countTaisRecords(orgId: string): Promise<Record<string, number>> {
  const db = getDb();
  const counts: Record<string, number> = {};
  for (const table of TAIS_TABLES) {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE org_id = $1`, [
      orgId,
    ]);
    counts[table] = r.rows[0]?.n ?? 0;
  }
  const cases = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM decision_cases WHERE org_id = $1 AND category_id LIKE 'tais-decision:%'",
    [orgId]
  );
  counts.decision_cases = cases.rows[0]?.n ?? 0;
  const actions = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM actions WHERE org_id = $1 AND case_id IN
       (SELECT id FROM decision_cases WHERE org_id = $1 AND category_id LIKE 'tais-decision:%')`,
    [orgId]
  );
  counts.actions = actions.rows[0]?.n ?? 0;
  return counts;
}

function isBootstrapAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TAIS_DEMO_BOOTSTRAP === "true";
}

/**
 * Idempotent bootstrap: (1) migration'lari uygular, (2) TAIS org'unu bulur/olusturur,
 * (3) demo yonetici kullanicisini olusturur/gunceller (env'den TAIS_DEMO_ADMIN_EMAIL/
 * PASSWORD ile gecersiz kilinabilir), (4) sentetik operasyon verisini, (5) karar+aksiyon
 * zincirini kurar. Org+veri adimlari tek bir veritabani islemi (transaction) icinde
 * calisir: herhangi bir adim basarisiz olursa TAMAMI geri alinir, yarim veri kalmaz.
 * Baska hicbir organizasyonun verisine dokunmaz/silmez.
 */
export async function bootstrapTaisDemo(): Promise<TaisBootstrapResult> {
  if (!isBootstrapAllowed()) {
    throw new Error(
      "TAIS demo bootstrap üretim ortamında kapalıdır. Açıkça izin vermek için ALLOW_TAIS_DEMO_BOOTSTRAP=true ayarlayın."
    );
  }

  await migrate();
  const db = getDb();
  const adminEmail = process.env.TAIS_DEMO_ADMIN_EMAIL || TAIS_DEMO_EMAIL;
  const adminPassword = process.env.TAIS_DEMO_ADMIN_PASSWORD || TAIS_DEMO_PASSWORD;

  await db.exec("BEGIN");
  try {
    const { orgId, alreadySeeded: baseDataAlreadySeeded } = await seedTaisDemo({
      adminEmail,
      adminPassword,
    });
    const { alreadySeeded: decisionsAlreadySeeded, decisions } = await seedTaisDecisions(orgId);
    await db.exec("COMMIT");

    const counts = await countTaisRecords(orgId);
    return {
      orgId,
      adminEmail,
      baseDataAlreadySeeded,
      decisionsAlreadySeeded,
      decisionCount: decisions.length,
      actionCount: decisions.reduce((sum, d) => sum + d.actionIds.length, 0),
      counts,
    };
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

export { TAIS_ORG_CODE };
