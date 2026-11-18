import { getDb, migrate } from "../client";

/**
 * Süreç madenciliği için ham olay okuma. Olaylar yalnızca okunur; org_id
 * oturumdan gelir. Öznesi (subject_ref/actor_ref) olmayan olaylar süreç
 * akışına dahil edilemez ve çağırana eksik sayısı raporlanır.
 */

export interface ProcessEventRow {
  subject: string | null;
  type: string;
  at: string;
}

export interface ProcessEventScan {
  rows: ProcessEventRow[];
  totalRows: number;
  withoutSubject: number;
  since: string;
}

export async function getProcessEvents(
  orgId: string,
  days = 90,
  limit = 5000
): Promise<ProcessEventScan> {
  await migrate();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const r = await getDb().query<{
    subject_ref: string | null;
    actor_ref: string | null;
    event_type: string;
    occurred_at: string | Date;
  }>(
    `SELECT subject_ref, actor_ref, event_type, occurred_at
       FROM integration_events
      WHERE org_id = $1 AND occurred_at >= $2
      ORDER BY occurred_at ASC
      LIMIT $3`,
    [orgId, since, limit]
  );

  const rows: ProcessEventRow[] = [];
  let withoutSubject = 0;
  for (const row of r.rows) {
    const subject = row.subject_ref ?? row.actor_ref ?? null;
    if (!subject) {
      withoutSubject++;
      continue;
    }
    rows.push({
      subject,
      type: row.event_type,
      at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
    });
  }

  return { rows, totalRows: r.rows.length, withoutSubject, since };
}
