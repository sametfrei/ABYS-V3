import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Client } from "pg";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { getSector } from "@/lib/sectors";
import { insertDataset } from "@/lib/db/repos/data";
import { parseKpis } from "@/lib/kpi";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../auth/login/route";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const MAX_ROWS = 5000;
const STATEMENT_TIMEOUT_MS = 10_000;
const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|COPY)\b/i;

const postSchema = z.object({
  connectionString: z.string().trim().min(1).max(2000),
  query: z.string().trim().min(1).max(20000),
  sectorId: z.string().trim().max(300).optional(),
});

function normalizeReadOnlyQuery(raw: string): { ok: true; query: string } | { ok: false; error: string } {
  let q = raw.trim();
  if (q.endsWith(";")) q = q.slice(0, -1).trimEnd();
  if (q.includes(";")) {
    return { ok: false, error: "Sorgu yalnızca tek bir ifade içerebilir (noktalı virgülle çoklu ifadeye izin verilmez)." };
  }
  if (!/^(SELECT|WITH)\b/i.test(q)) {
    return { ok: false, error: "Sorgu yalnızca SELECT veya WITH ile başlayabilir." };
  }
  const forbidden = q.match(FORBIDDEN_KEYWORDS);
  if (forbidden) {
    return { ok: false, error: `Salt-okunur olmayan anahtar kelime tespit edildi: ${forbidden[0].toUpperCase()}.` };
  }
  return { ok: true, query: q };
}

function toCsv(fields: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [fields.map(escape).join(",")];
  for (const row of rows) lines.push(fields.map((f) => escape(row[f])).join(","));
  return lines.join("\n");
}

/**
 * SQL konnektörü (Faz 7): kullanıcı tanımlı bir Postgres bağlantısından
 * salt-okunur sorgu çalıştırır, sonucu veri seti olarak kaydeder.
 * connectionString hiçbir zaman denetim günlüğüne veya hata mesajına
 * yazılmaz — yalnızca host/veritabanı adı kaydedilir.
 */
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

  const sector = getSector(body.sectorId);
  if (!sector) {
    return NextResponse.json({ error: "Geçersiz sektör." }, { status: 400 });
  }

  const queryCheck = normalizeReadOnlyQuery(body.query);
  if (!queryCheck.ok) {
    return NextResponse.json({ error: queryCheck.error }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(body.connectionString.trim());
  } catch {
    return NextResponse.json({ error: "Geçersiz bağlantı dizesi." }, { status: 400 });
  }
  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") {
    return NextResponse.json({ error: "Yalnızca postgres:// veya postgresql:// şemasına izin verilir." }, { status: 400 });
  }
  const dbLabel = target.pathname.replace(/^\//, "") || "postgres";
  const hostLabel = target.host;

  const wrappedQuery = `SELECT * FROM (${queryCheck.query}) AS abys_sql_connector_subquery LIMIT ${MAX_ROWS}`;

  const client = new Client({
    connectionString: body.connectionString,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS,
    connectionTimeoutMillis: STATEMENT_TIMEOUT_MS,
  });

  let text: string;
  let rowCount: number;
  try {
    try {
      await client.connect();
    } catch {
      return NextResponse.json({ error: "Veritabanına bağlanılamadı." }, { status: 502 });
    }

    let result;
    try {
      result = await client.query(wrappedQuery);
    } catch (err) {
      const timedOut =
        (err instanceof Error && /timeout/i.test(err.message)) ||
        (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "57014");
      return NextResponse.json(
        { error: timedOut ? "Sorgu zaman aşımına uğradı (10sn)." : "Sorgu çalıştırılamadı." },
        { status: 502 }
      );
    }

    const fields = result.fields.map((f) => f.name);
    text = toCsv(fields, result.rows as Record<string, unknown>[]);
    rowCount = result.rows.length;
  } finally {
    await client.end().catch(() => {});
  }

  if (!text.trim() || rowCount === 0) {
    return NextResponse.json({ error: "Sorgu boş sonuç döndürdü." }, { status: 400 });
  }

  const kpis = parseKpis(text).map((k) => ({ label: k.label, value: k.value }));
  const datasetId = await insertDataset({
    orgId: session.orgId,
    sectorId: sector.id,
    sourceLabel: `SQL: ${hostLabel}/${dbLabel}`,
    rawContent: text,
    ingestedBy: session.displayName,
    kpis,
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "data_ingested",
    summary: `SQL konnektörü ile veri alındı: ${hostLabel}/${dbLabel} (${rowCount} satır, ${kpis.length} KPI)`,
    detail: datasetId,
  });

  return NextResponse.json({ datasetId, rowCount, kpiCount: kpis.length, status: "ok" });
}
