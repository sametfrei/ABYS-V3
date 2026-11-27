import { randomBytes } from "crypto";
import type { Transaction } from "@electric-sql/pglite";
import { getDb, migrate } from "../client";
import type { AiDecisionCase } from "@/lib/ai/provider";
import type { ExpectedEconomicImpact } from "@/lib/decision-economics";

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

export async function listCasesForOrg(
  orgId: string,
  sectorId?: string,
  limit = 200
): Promise<StoredCase[]> {
  await migrate();
  // Vaka geçmişi sınırsız büyüyebilir; okuma üst sınırı bellek tüketimini
  // kontrol altında tutar (dev sunucusunda OOM koruması).
  const boundedLimit = Math.min(1000, Math.max(1, Math.round(limit)));
  const r = await getDb().query<{
    id: string;
    sector_id: string;
    status: string;
    payload: AiDecisionCase;
    created_at: string;
  }>(
    `SELECT id, sector_id, status, payload, created_at FROM decision_cases
     WHERE org_id = $1 ${sectorId ? "AND sector_id = $2" : ""}
     ORDER BY created_at DESC
     LIMIT $${sectorId ? 3 : 2}`,
    sectorId ? [orgId, sectorId, boundedLimit] : [orgId, boundedLimit]
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
 * Sunucu tarafı kurumsal hafıza özeti.
 *
 * Üç güven sınıfı ASLA birbirine karıştırılmaz ve her satır sınıfıyla
 * etiketlenir:
 * - [VERIFIED]: eylem öncesi/sonrası gerçek KPI gözlemleriyle ölçülmüş
 *   sonuç. Bu bile nedensel etki kanıtı değildir; gözlenen değişimdir.
 * - [REPORTED]: yetkili kullanıcının bildirdiği, bağımsız veriyle
 *   doğrulanmamış sonuç.
 * - [INFERRED]: sistemin verilerden çıkardığı, insan doğrulaması olmayan
 *   istatistiksel sinyal.
 * Hiçbir sınıf diğerinin yerine "kesin ders" olarak sunulmaz. Tüm sorgular
 * org_id ve sektör kapsamlıdır; listeler SQL'de sınırlıdır.
 */
export async function buildServerMemory(orgId: string, sectorId: string, limit = 6): Promise<string> {
  await migrate();
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const reportedLimit = Math.min(3, safeLimit);
  const inferredLimit = 3;

  const verified = await getDb().query<{
    choice: string;
    payload: { reason?: string; chosenAction?: string };
    result: string;
    note: string;
    lesson: string | null;
    kpi_label: string;
    before_value: string | number;
    after_value: string | number;
    delta: string | number;
    pct_change: string | number | null;
    decided_by: string;
    decided_role: string | null;
    measurement_at: string | Date;
    before_source: string | null;
    after_source: string | null;
    definition_hash: string | null;
  }>(
    `SELECT r.choice, r.payload, r.decided_by, r.decided_role,
            o.result, o.note, o.lesson,
            m.kpi_label, m.before_value, m.after_value, m.delta, m.pct_change,
            m.measurement_at, m.before_source, m.after_source, m.definition_hash
       FROM decision_records r
       JOIN decision_kpi_measurements m
         ON m.org_id = r.org_id AND m.decision_id = r.id
       JOIN outcomes o
         ON o.id = m.outcome_id AND o.org_id = r.org_id
      WHERE r.org_id = $1 AND r.sector_id = $2
      ORDER BY r.created_at DESC
      LIMIT $3`,
    [orgId, sectorId, safeLimit]
  );

  const reported = await getDb().query<{
    choice: string;
    payload: { reason?: string; chosenAction?: string };
    result: string;
    note: string;
    lesson: string | null;
    recorded_by: string;
    recorded_at: string | Date;
  }>(
    `SELECT r.choice, r.payload, o.result, o.note, o.lesson, o.recorded_by,
            o.created_at AS recorded_at
       FROM outcomes o
       JOIN decision_records r ON r.id = o.decision_id AND r.org_id = o.org_id
      WHERE o.org_id = $1 AND r.sector_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM decision_kpi_measurements m
           WHERE m.org_id = o.org_id AND m.decision_id = o.decision_id
        )
      ORDER BY o.created_at DESC
      LIMIT $3`,
    [orgId, sectorId, reportedLimit]
  );

  const inferred = await getDb().query<{
    category_id: string;
    severity: string;
    title: string;
    payload: {
      label?: unknown;
      classification?: unknown;
      metricValue?: unknown;
      baseline?: unknown;
      direction?: unknown;
      score?: unknown;
    };
    created_at: string | Date;
  }>(
    `SELECT category_id, severity, title, payload, created_at
       FROM signals
      WHERE org_id = $1 AND sector_id = $2 AND status = 'open'
        AND category_id IN ('kpi_anomaly', 'kpi_opportunity')
      ORDER BY created_at DESC
      LIMIT $3`,
    [orgId, sectorId, inferredLimit]
  );

  if (verified.rows.length === 0 && reported.rows.length === 0 && inferred.rows.length === 0) {
    return "";
  }

  const label = (c: string) => (c === "accepted" ? "KABUL" : c === "rejected" ? "RED" : "DEĞİŞTİRİLDİ");
  const outcomeLabel = (o: string) =>
    o === "improved" ? "iyileşme sağlandı" : o === "worsened" ? "durum kötüleşti" : "değişim olmadı";
  const number = (value: string | number) => Number(value);
  const day = (value: string | Date) =>
    (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);

  const sections: string[] = [
    "Kurumsal hafıza güven sınıfları ayrıdır; hiçbir sınıf diğerinin yerine kullanılmaz.",
  ];

  if (verified.rows.length > 0) {
    sections.push(
      "",
      "[VERIFIED] Gerçek KPI gözlemleriyle ölçülen sonuçlar (gözlenen değişim; nedensel etki iddiası değil):"
    );
    for (const row of verified.rows) {
      const reason = row.payload?.reason ? ` (gerekçe: ${row.payload.reason})` : "";
      const action = row.payload?.chosenAction ? ` Uygulanan: "${row.payload.chosenAction}".` : "";
      const pct = row.pct_change === null ? "" : `, %${number(row.pct_change).toFixed(2)}`;
      const lesson = row.lesson ? ` Ders: ${row.lesson}` : "";
      sections.push(
        `- [VERIFIED] Öneri ${label(row.choice)}${reason}.${action} ` +
          `KPI "${row.kpi_label}": ${number(row.before_value)} → ${number(row.after_value)} ` +
          `(fark ${number(row.delta)}${pct}); ${outcomeLabel(row.result)}. ` +
          `Onaylayan: ${row.decided_by}${row.decided_role ? ` (${row.decided_role})` : ""}; ` +
          `ölçüm: ${day(row.measurement_at)}; kaynak: ${row.before_source ?? "—"}; ` +
          `tanım hash: ${row.definition_hash ?? "—"}.${lesson}`
      );
    }
  }

  if (reported.rows.length > 0) {
    sections.push(
      "",
      "[REPORTED] Yetkili kullanıcı bildirimleri (bağımsız veriyle doğrulanmadı):"
    );
    for (const row of reported.rows) {
      const reason = row.payload?.reason ? ` (gerekçe: ${row.payload.reason})` : "";
      const action = row.payload?.chosenAction ? ` Uygulanan: "${row.payload.chosenAction}".` : "";
      const lesson = row.lesson ? ` Ders: ${row.lesson}` : "";
      sections.push(
        `- [REPORTED] Öneri ${label(row.choice)}${reason}.${action} ` +
          `Sonuç: ${outcomeLabel(row.result)} (${row.note}). Bildiren: ${row.recorded_by}; ` +
          `bildirim: ${day(row.recorded_at)}.${lesson} Bağımsız KPI doğrulaması yok.`
      );
    }
  }

  if (inferred.rows.length > 0) {
    sections.push(
      "",
      "[INFERRED] Sistem çıkarımları (insan doğrulaması yok; istatistiksel sinyal, nedensellik değil):"
    );
    for (const row of inferred.rows) {
      const payload = row.payload ?? {};
      const kpi =
        typeof payload.label === "string" && payload.label.trim()
          ? payload.label
          : row.title;
      const value =
        typeof payload.metricValue === "number" && Number.isFinite(payload.metricValue)
          ? payload.metricValue
          : null;
      const baseline =
        typeof payload.baseline === "number" && Number.isFinite(payload.baseline)
          ? payload.baseline
          : null;
      const direction = payload.direction === "above" || payload.direction === "below"
        ? payload.direction
        : null;
      const score =
        typeof payload.score === "number" && Number.isFinite(payload.score)
          ? payload.score
          : null;
      sections.push(
        `- [INFERRED] KPI "${kpi}"` +
          (value === null ? "" : ` değeri ${value}`) +
          (baseline === null ? "" : `, baz çizgi ${baseline}`) +
          (score === null ? "" : `, aykırılık skoru ${score}`) +
          (direction === null ? "" : `, yön ${direction}`) +
          ` (${row.severity}; ${row.category_id}; sinyal: ${day(row.created_at)}). ` +
          "İnsan doğrulaması yok."
      );
    }
  }

  sections.push(
    "",
    `İstatistik: ${verified.rows.length} doğrulanmış, ${reported.rows.length} bildirilmiş, ${inferred.rows.length} çıkarımsal kayıt.`
  );
  return sections.join("\n");
}

export interface RecordDecisionParams {
  orgId: string;
  caseId: string;
  sectorId: string;
  choice: "accepted" | "rejected" | "modified";
  decidedBy: string;
  payload: unknown;
  expectedImpact?: ExpectedEconomicImpact | null;
  /** Audit'in karara önceden atıf yapabilmesi için dışarıdan üretilebilir. */
  id?: string;
  decidedById?: string | null;
  decidedRole?: string | null;
  approvalPermission?: string | null;
  approvalSource?: "human" | "system" | null;
  approvedAt?: string | null;
  approvalAuditId?: string | null;
}

export async function recordDecisionInTransaction(
  db: Transaction,
  params: RecordDecisionParams
): Promise<string> {
  const id = params.id ?? randomBytes(8).toString("hex");
  const expected = params.expectedImpact ?? null;
  const approvalSource =
    params.approvalSource ??
    (params.decidedBy.trim().toLocaleLowerCase("tr") === "sistem" ? "system" : null);
  await db.query(
    `INSERT INTO decision_records
       (id, org_id, case_id, sector_id, choice, decided_by, payload,
        expected_value, expected_value_low, expected_value_high,
        value_currency, value_basis, value_assumptions,
        decided_by_id, decided_role, approval_permission, approval_source,
        approved_at, approval_audit_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18, $19)`,
    [
      id,
      params.orgId,
      params.caseId,
      params.sectorId,
      params.choice,
      params.decidedBy,
      JSON.stringify(params.payload),
      expected?.value ?? null,
      expected?.low ?? null,
      expected?.high ?? null,
      expected?.currency ?? null,
      expected?.basis ?? null,
      expected ? JSON.stringify(expected.assumptions) : null,
      params.decidedById ?? null,
      params.decidedRole ?? null,
      params.approvalPermission ?? null,
      approvalSource,
      params.approvedAt ?? null,
      params.approvalAuditId ?? null,
    ]
  );
  await db.query(
    "UPDATE decision_cases SET status = 'decided' WHERE id = $1 AND org_id = $2",
    [params.caseId, params.orgId]
  );
  return id;
}

export async function recordDecision(params: RecordDecisionParams): Promise<string> {
  await migrate();
  return getDb().transaction((tx) => recordDecisionInTransaction(tx, params));
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
