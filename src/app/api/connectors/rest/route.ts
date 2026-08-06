import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { lookup } from "dns/promises";
import { isIPv4 } from "net";
import { z } from "zod";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { getSector } from "@/lib/sectors";
import { insertDataset } from "@/lib/db/repos/data";
import { parseKpis } from "@/lib/kpi";
import { parseBody } from "@/lib/validation";
import { SESSION_COOKIE } from "../../auth/login/route";
import { recordAuditEvent } from "@/lib/db/repos/audit";

const MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB
const FETCH_TIMEOUT_MS = 10_000;
const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH"];

const postSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  method: z.string().trim().max(20).optional(),
  headers: z.record(z.string().max(300), z.string().max(2000)).optional(),
  sectorId: z.string().trim().max(300).optional(),
});

function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (isIPv4(mapped)) return isBlockedIp(mapped);
  }
  return false;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (Buffer.byteLength(text, "utf-8") > maxBytes) {
      throw new Error("Yanıt gövdesi 1MB sınırını aşıyor.");
    }
    return text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Yanıt gövdesi 1MB sınırını aşıyor.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

/**
 * REST konnektörü (master plan md.16): kullanıcı tanımlı bir REST uç
 * noktasından veri çeker, KPI'ları deterministik ayıklar ve veri seti
 * olarak kaydeder. SSRF koruması: yalnızca http/https şeması kabul
 * edilir; çözümlenen IP iç ağ/localhost/bulut metadata aralığındaysa
 * istek reddedilir (fetch DNS'i yeniden çözebileceğinden burada elde
 * edilen adrese değil, aynı ana bilgisayar adına güveniyoruz — savunma
 * derinliği için hem hostname hem çözümlenmiş IP kontrol edilir).
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
  const method = (body.method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    return NextResponse.json({ error: `Desteklenmeyen metod. İzin verilenler: ${ALLOWED_METHODS.join(", ")}` }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(body.url.trim());
  } catch {
    return NextResponse.json({ error: "Geçersiz URL." }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Yalnızca http/https şemasına izin verilir." }, { status: 400 });
  }
  if (target.hostname.toLowerCase() === "localhost") {
    return NextResponse.json({ error: "İç ağ hedeflerine erişim reddedildi (SSRF koruması)." }, { status: 400 });
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(target.hostname, { all: true });
  } catch {
    return NextResponse.json({ error: "Ana bilgisayar adı çözümlenemedi." }, { status: 400 });
  }
  if (resolved.length === 0 || resolved.some((r) => isBlockedIp(r.address))) {
    return NextResponse.json({ error: "İç ağ hedeflerine erişim reddedildi (SSRF koruması)." }, { status: 400 });
  }

  let text: string;
  try {
    const res = await fetch(target, {
      method,
      headers: body.headers ?? undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Uzak sunucu hata döndü: ${res.status}` }, { status: 502 });
    }
    text = await readCapped(res, MAX_RESPONSE_BYTES);
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError" ? "İstek zaman aşımına uğradı (10sn)." : "İstek başarısız oldu.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: "Uzak sunucu boş yanıt döndürdü." }, { status: 400 });
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
