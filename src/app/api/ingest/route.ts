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
import { sectorIdSchema } from "@/lib/data/route-schemas";
import { SESSION_COOKIE } from "../auth/login/route";

export const maxDuration = 600;

import { localizedError } from "@/lib/api-i18n";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — sonuç metni 8000 karakter sınırına düşecek, ayrıştırma maliyetini sınırlar

type FormReadResult =
  | { rawText: string; sectorId?: string }
  | { errorKey: "api.ingest.fileTooLarge" | "api.ingest.invalidForm" | "api.ingest.fileRequired" | "api.ingest.emptyFile"; status: number }
  | { error: string; status: number };

async function readRawTextFromForm(req: NextRequest): Promise<FormReadResult> {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return { errorKey: "api.ingest.fileTooLarge", status: 413 };
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { errorKey: "api.ingest.invalidForm", status: 400 };
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { errorKey: "api.ingest.fileRequired", status: 400 };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { errorKey: "api.ingest.fileTooLarge", status: 413 };
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
    return { errorKey: "api.ingest.emptyFile", status: 400 };
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
      return localizedError(req, "api.auth.sessionRequired", 401);
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
    if ("errorKey" in result) {
      return localizedError(req, result.errorKey, result.status);
    }
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
      return localizedError(req, "api.scenarios.invalidBody", 400);
    }
    rawTextInput = body.rawText?.trim();
    sectorIdInput = body.sectorId;
  }

  const rawText = rawTextInput?.trim();
  // sectorId yalnızca tanımlı sektörlerden biri olabilir; geçersiz/boş -> 400
  // (mevcut davranış korunur).
  const sectorParsed = sectorIdSchema.safeParse(sectorIdInput);
  const sector = sectorParsed.success ? getSector(sectorParsed.data) : undefined;

  if (!rawText) {
    return localizedError(req, "api.ingest.emptyText", 400);
  }
  if (rawText.length > 8000) {
    return localizedError(req, "api.ingest.textTooLong", 400);
  }
  if (!sector) {
    return localizedError(req, "api.scenarios.invalidSector", 400);
  }

  return streamedJsonResponse(async () => {
    const provider = await getActiveProvider();
    return provider.extractData({ rawText, sectorLabel: sector.label });
  });
}
