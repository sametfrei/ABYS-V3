import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import {
  evaluateForecastSnapshot,
  summarizeForecastCalibration,
  type ForecastSnapshotEvaluation,
} from "@/lib/forecast-calibration";
import { NUMERIC_VALUE_REGEX } from "./forecast";

/**
 * Tahmin anlık görüntüleri — üretilen tahminin ilk adımı saklanır ve sonraki
 * gerçek KPI gözlemiyle karşılaştırılır. Tüm sorgular org_id kapsamlıdır.
 */

export interface ForecastSnapshotRecord {
  id: string;
  label: string;
  model: string;
  evidence: string;
  horizon: number;
  seriesPoints: number;
  p10: number;
  p50: number;
  p90: number;
  lastObservedAt: string;
  createdBy: string;
  createdAt: string;
  evaluation: ForecastSnapshotEvaluation;
}

/** Aynı etiket için verilen zamandan sonra anlık görüntü var mı? */
export async function hasSnapshotSince(
  orgId: string,
  label: string,
  sinceIso: string
): Promise<boolean> {
  await migrate();
  const r = await getDb().query(
    `SELECT 1 FROM forecast_snapshots
      WHERE org_id = $1 AND label = $2 AND created_at > $3
      LIMIT 1`,
    [orgId, label, sinceIso]
  );
  return r.rows.length > 0;
}

export async function insertForecastSnapshot(params: {
  orgId: string;
  label: string;
  model: string;
  evidence: string;
  horizon: number;
  seriesPoints: number;
  p10: number;
  p50: number;
  p90: number;
  lastObservedAt: string;
  createdBy: string;
}): Promise<string> {
  await migrate();
  const id = randomBytes(8).toString("hex");
  await getDb().query(
    `INSERT INTO forecast_snapshots
       (id, org_id, label, model, evidence, horizon, series_points, p10, p50, p90, last_observed_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      params.orgId,
      params.label,
      params.model,
      params.evidence,
      params.horizon,
      params.seriesPoints,
      params.p10,
      params.p50,
      params.p90,
      params.lastObservedAt,
      params.createdBy,
    ]
  );
  return id;
}

interface SnapshotRow {
  id: string;
  label: string;
  model: string;
  evidence: string;
  horizon: number;
  series_points: number;
  p10: number | string;
  p50: number | string;
  p90: number | string;
  last_observed_at: string | Date;
  created_by: string;
  created_at: string | Date;
  next_actual: string | null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Anlık görüntüleri, kendisinden sonraki ilk sayısal KPI gözlemiyle birlikte
 * döndürür. Değer ayrıştırma SQL'de yapılır; ayrıştırılamayan gözlem atlanır.
 */
export async function listForecastSnapshots(params: {
  orgId: string;
  label?: string;
  limit?: number;
}): Promise<ForecastSnapshotRecord[]> {
  await migrate();
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const r = await getDb().query<SnapshotRow>(
    `SELECT s.id, s.label, s.model, s.evidence, s.horizon, s.series_points,
            s.p10, s.p50, s.p90, s.last_observed_at, s.created_by, s.created_at,
            n.value AS next_actual
       FROM forecast_snapshots s
       LEFT JOIN LATERAL (
         SELECT v.value
           FROM kpi_values v
          WHERE v.org_id = s.org_id
            AND v.label = s.label
            AND v.created_at > s.last_observed_at
            AND v.value ~ $3
          ORDER BY v.created_at ASC, v.id ASC
          LIMIT 1
       ) n ON true
      WHERE s.org_id = $1
        AND ($2::text IS NULL OR s.label = $2)
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $4`,
    [params.orgId, params.label ?? null, NUMERIC_VALUE_REGEX, limit]
  );
  return r.rows.map((row) => {
    const p10 = Number(row.p10);
    const p50 = Number(row.p50);
    const p90 = Number(row.p90);
    const actual = row.next_actual === null ? null : Number(row.next_actual);
    return {
      id: row.id,
      label: row.label,
      model: row.model,
      evidence: row.evidence,
      horizon: Number(row.horizon),
      seriesPoints: Number(row.series_points),
      p10,
      p50,
      p90,
      lastObservedAt: iso(row.last_observed_at),
      createdBy: row.created_by,
      createdAt: iso(row.created_at),
      evaluation: evaluateForecastSnapshot({ p10, p50, p90 }, actual),
    };
  });
}

export function summarizeSnapshots(records: ForecastSnapshotRecord[]) {
  return summarizeForecastCalibration(records.map((record) => record.evaluation));
}

export interface ForecastSnapshotLedgerRow {
  id: string;
  label: string;
  createdAt: string;
}

/**
 * Saklama planı için hafif kayıt listesi (yalnızca kimlik, etiket, tarih).
 * Ağır lateral birleşim yapılmaz; tüm satırlar org kapsamındadır.
 */
export async function listForecastSnapshotLedger(
  orgId: string
): Promise<ForecastSnapshotLedgerRow[]> {
  await migrate();
  const r = await getDb().query<{ id: string; label: string; created_at: string | Date }>(
    `SELECT id, label, created_at FROM forecast_snapshots WHERE org_id = $1 ORDER BY created_at DESC, id DESC`,
    [orgId]
  );
  return r.rows.map((row) => ({ id: row.id, label: row.label, createdAt: iso(row.created_at) }));
}
