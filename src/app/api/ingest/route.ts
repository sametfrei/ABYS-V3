import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { getActiveProvider } from "@/lib/ai/provider";
import { getSector } from "@/lib/sectors";
import { streamedJsonResponse } from "@/lib/ai/stream-route";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/core";
import { hasPermission, permissionError } from "@/lib/auth/permissions";
import { checkAnonymousRate } from "@/lib/rate-limit";
import { isPublicDemoEnabled } from "@/lib/public-demo";
import { parseTable } from "@/lib/data/parse-table";
import { SESSION_COOKIE } from "../auth/login/route";

export const maxDuration = 600;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — sonuç metni 8000 karakter sınırına düşecek, ayrıştırma maliyetini sınırlar

async function readRawTextFromForm(req: NextRequest): Promise<{ rawText: string; sectorId?: string } | { error: string; status: number }> {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return { error: "Dosya çok büyük (5MB sınırı).", status: 413 };
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { error: "Geçersiz form verisi.", status: 400 };
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { error: "Dosya gerekli.", status: 400 };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "Dosya çok büyük (5MB sınırı).", status: 413 };
  }

  const sectorId = form.get("sectorId");
  const buf = Buffer.from(await file.arrayBuffer());

  let table: { headers: string[]; rows: string[][] };
  try {
    table = parseTable(buf, file.type || "", file.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dosya ayrıştırılamadı.";
    return { error: message, status: 400 };
  }

  if (table.headers.length === 0 && table.rows.length === 0) {
    return { error: "Dosya boş.", status: 400 };
  }

  const rawText = Papa.unparse({ fields: table.headers, data: table.rows });
  return { rawText, sectorId: typeof sectorId === "string" ? sectorId : undefined };
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    // Oturumsuz erişim varsayılan olarak kapalıdır — yalnızca ABYS_PUBLIC_DEMO=1
    // ile açık deneme akışı için geri açılır (bkz. src/lib/public-demo.ts).
    if (!isPublicDemoEnabled()) {
      return NextResponse.json({ error: "Bu uç oturum gerektirir." }, { status: 401 });
    }
    // Oturumsuz istekler IP başına sınırlıdır (AI kaynak tüketimine karşı).
    const rate = checkAnonymousRate(req, false);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: rate.message },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec ?? 60) } }
      );
    }
  } else if (!hasPermission(session.role, "ingest_data")) {
    return NextResponse.json({ error: permissionError("ingest_data") }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let rawTextInput: string | undefined;
  let sectorIdInput: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    // Dosyadan içe alma (CSV/TSV/XLSX/XLS) — düz metin/yapıştırma yolu aşağıda değişmeden kalır.
    const result = await readRawTextFromForm(req);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    rawTextInput = result.rawText;
    sectorIdInput = result.sectorId;
  } else {
    let body: { rawText?: string; sectorId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }
    rawTextInput = body.rawText?.trim();
    sectorIdInput = body.sectorId;
  }

  const rawText = rawTextInput?.trim();
  const sector = getSector(sectorIdInput);

  if (!rawText) {
    return NextResponse.json({ error: "Metin boş olamaz." }, { status: 400 });
  }
  if (rawText.length > 8000) {
    return NextResponse.json({ error: "Metin çok uzun (8000 karakter sınırı)." }, { status: 400 });
  }
  if (!sector) {
    return NextResponse.json({ error: "Geçersiz sektör." }, { status: 400 });
  }

  return streamedJsonResponse(async () => {
    const provider = await getActiveProvider();
    return provider.extractData({ rawText, sectorLabel: sector.label });
  });
}
