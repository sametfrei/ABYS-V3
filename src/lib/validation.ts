import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ZodType } from "zod";

/**
 * Merkezi girdi doğrulama yardımcısı. JSON ayrıştırma hatası ve şema
 * ihlali için 400 + Türkçe mesajla NextResponse döner; geçerli istekte
 * ayrıştırılmış veriyi verir.
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 }) };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "gövde"}: ${issue.message}`)
      .join("; ");
    return {
      ok: false,
      response: NextResponse.json({ error: `Geçersiz girdi: ${message}` }, { status: 400 }),
    };
  }

  return { ok: true, data: result.data };
}

const MAX_ID_REF_LEN = 200;
const MAX_EVENT_DATA_BYTES = 32_000;

const idRefSchema = z
  .union([z.string(), z.number()])
  .refine((v) => v.toString().length <= MAX_ID_REF_LEN, {
    message: `en fazla ${MAX_ID_REF_LEN} karakter olmalı`,
  })
  .optional();

/**
 * Integration Gateway olay sözleşmesi (POST /api/integration/events).
 * Toplu gönderimde tek olay bu şemayı ihlal ederse yalnızca o olay
 * rejectedDetail'e düşer — batch'in geri kalanı işlenmeye devam eder,
 * bu yüzden route bu şemayı istek gövdesi genelinde değil, olay başına
 * (safeParse) uygular.
 */
export const integrationEventSchema = z
  .object({
    id: idRefSchema,
    event_type: z
      .string()
      .trim()
      .min(1, "event_type gerekli")
      .max(100, "event_type en fazla 100 karakter olmalı"),
    advisor_id: idRefSchema,
    actor_ref: idRefSchema,
    lead_id: idRefSchema,
    subject_ref: idRefSchema,
    session_ref: z.string().max(200, "session_ref en fazla 200 karakter olmalı").optional(),
    schema_version: z.string().max(20, "schema_version en fazla 20 karakter olmalı").optional(),
    occurred_at: z.string().optional(),
    data: z.unknown().optional(),
  })
  .superRefine((val, ctx) => {
    if (JSON.stringify(val.data ?? {}).length > MAX_EVENT_DATA_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: `data en fazla ${MAX_EVENT_DATA_BYTES} bayt (serileştirilmiş) olmalı`,
      });
    }
  });

/** Toplu gönderimin tamamına uygulanan ortak kaynak adı (`source`) sınırı. */
export const integrationSourceSchema = z.string().max(60, "source en fazla 60 karakter olmalı");
