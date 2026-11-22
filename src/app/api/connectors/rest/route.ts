import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { getSector } from "@/lib/sectors";
import { insertDataset } from "@/lib/db/repos/data";
import { parseKpis } from "@/lib/kpi";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../auth/login/route";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { localizedError, localizedErrorWith } from "@/lib/api-i18n";
import { fetchPinned } from "@/lib/net/pinned-fetch";
import { SsrfError } from "@/lib/net/ssrf";

const ALLOWED_METHODS = ["GET"];

const postSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  method: z.string().trim().max(20).optional(),
  headers: z.record(z.string().max(300), z.string().max(2000)).optional(),
  sectorId: z.string().trim().max(300).optional(),
});

/**
 * REST konnektörü (master plan md.16): kullanıcı tanımlı bir REST uç
 * noktasından veri çeker, KPI'ları deterministik ayıklar ve veri seti
 * olarak kaydeder. Kaynak sistemlere yalnızca GET ile erişilir; SSRF
 * doğrulaması her redirect hopunda yinelenir ve bağlantı çözümlenen
 * public adrese sabitlenir.
 */
export async function POST(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return localizedError(req, "api.auth.sessionRequired", 401);
  if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const parsed = await parseBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sector = getSector(body.sectorId);
  if (!sector) {
    return localizedError(req, "api.scenarios.invalidSector", 400);
  }
  const method = (body.method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    return localizedErrorWith(req, "api.connectors.unsupportedMethod", 400, {
      methods: ALLOWED_METHODS.join(", "),
    });
  }

  let target: URL;
  try {
    target = new URL(body.url.trim());
  } catch {
    return localizedError(req, "api.connectors.invalidUrl", 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return localizedError(req, "api.connectors.schemeNotAllowed", 400);
  }
  if (target.hostname.toLowerCase() === "localhost") {
    return localizedError(req, "api.connectors.ssrfBlocked", 400);
  }

  let text: string;
  try {
    const res = await fetchPinned(target, {
      headers: body.headers ?? undefined,
    });
    if (!res.ok) {
      return localizedErrorWith(req, "api.connectors.remoteError", 502, {
        status: res.status,
      });
    }
    text = await res.text();
  } catch (err) {
    const message =
      err instanceof SsrfError
        ? err.message
        : err instanceof Error && /zaman aşımı/.test(err.message)
          ? "İstek zaman aşımına uğradı (15sn)."
          : "İstek başarısız oldu.";
    return NextResponse.json({ error: message }, { status: err instanceof SsrfError ? 400 : 502 });
  }

  if (!text.trim()) {
    return localizedError(req, "api.connectors.emptyResponse", 400);
  }

  const kpis = parseKpis(text).map((k) => ({ label: k.label, value: k.value }));
  const datasetId = await insertDataset({
    orgId: session.orgId,
    sectorId: sector.id,
    sourceLabel: `REST: ${target.host}`,
    rawContent: text,
    ingestedBy: session.displayName,
    kpis,
  });

  await recordAuditEvent({
    orgId: session.orgId,
    actor: session.displayName,
    type: "data_ingested",
    summary: `REST konnektörü ile veri alındı: ${target.host} (${kpis.length} KPI)`,
    detail: datasetId,
  });

  return NextResponse.json({ datasetId, kpiCount: kpis.length, status: "ok" });
}
