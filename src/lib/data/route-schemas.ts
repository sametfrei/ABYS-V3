import { z } from "zod";
import type { Role } from "@/lib/auth/permissions";
import { getSector } from "@/lib/sectors";

/**
 * Veri yollarının (audit, documents, ingest) ortak zod şemaları.
 * Route handler'lar yalnızca bu şemaları import eder; doğrulama tek yerde
 * tutulur. `org_id` burada ASLA kabul edilmez — oturumdan gelir.
 */

/**
 * RBAC rol listesi. `Record<Role, true>` kullanılmasının nedeni: permissions.ts
 * içindeki `Role` birliğine yeni bir rol eklenirse burada eksik anahtar
 * derleme hatası verir; liste sessizce eskimesin.
 */
const ROLE_SET: Record<Role, true> = {
  board: true,
  ceo: true,
  clevel: true,
  dept_manager: true,
  risk_manager: true,
  analyst: true,
  auditor: true,
  data_admin: true,
  sys_admin: true,
};

export const KNOWN_ROLES = Object.keys(ROLE_SET) as [Role, ...Role[]];

export const roleSchema = z.enum(KNOWN_ROLES, `Tanımsız rol. Geçerli roller: ${KNOWN_ROLES.join(", ")}`);

/**
 * Belge erişim kısıtı: yalnızca tanımlı RBAC rolleri. Boş dizi KABUL EDİLMEZ:
 * "hiçbir rol göremez" anlamına gelip belgeyi yükleyen dahil herkese görünmez
 * kılardı. Kısıt istenmiyorsa alan hiç gönderilmemelidir.
 */
export const allowedRolesSchema = z
  .array(roleSchema)
  .min(1, "allowedRoles boş olamaz; kısıt yoksa alanı göndermeyin")
  .optional();

export const MAX_DOCUMENT_TITLE_LEN = 200;
/** Metin-yapıştırma yolunun mevcut üst sınırı (geriye dönük uyumluluk için korunur). */
export const MAX_DOCUMENT_TEXT_LEN = 400_000;
export const MAX_DOCUMENT_POST_TITLE_LEN = 300;

export const documentUploadTitleSchema = z
  .string()
  .trim()
  .min(1, "başlık gerekli")
  .max(
    MAX_DOCUMENT_TITLE_LEN,
    `başlık en fazla ${MAX_DOCUMENT_TITLE_LEN} karakter olmalı`
  );

/** POST /api/documents — mevcut 300 karakter sınırı korunur. */
export const documentPostTitleSchema = z
  .string()
  .trim()
  .min(1, "başlık gerekli")
  .max(
    MAX_DOCUMENT_POST_TITLE_LEN,
    `başlık en fazla ${MAX_DOCUMENT_POST_TITLE_LEN} karakter olmalı`
  );

export const DOCUMENT_SOURCE_TYPES = [
  "txt",
  "md",
  "csv",
  "policy",
  "report",
  "procedure",
  "incident",
] as const;

export const documentPostSchema = z.object({
  title: documentPostTitleSchema,
  sourceType: z
    .preprocess(
      (v) => (typeof v === "string" ? v.toLowerCase() : v),
      z.enum(DOCUMENT_SOURCE_TYPES, "geçersiz belge türü")
    )
    .optional(),
  text: z
    .string()
    .trim()
    .min(1, "metin gerekli")
    .max(
      MAX_DOCUMENT_TEXT_LEN,
      `metin en fazla ${MAX_DOCUMENT_TEXT_LEN} karakter olmalı`
    ),
  allowedRoles: allowedRolesSchema,
});

/**
 * `allowedRoles` form alanı: JSON dizi metni. Boş/verilmemiş -> kısıt yok.
 * Dizi değilse (mevcut davranış) yok sayılır; dizideki bilinmeyen rol 400'dür.
 */
export function parseAllowedRoles(
  raw: unknown
): { ok: true; allowedRoles?: Role[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw === "string" && !raw.trim()) return { ok: true };
  if (typeof raw !== "string" && !Array.isArray(raw)) return { ok: true };

  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "allowedRoles geçerli bir JSON dizi olmalı." };
    }
  }

  if (!Array.isArray(value)) return { ok: true };

  const parsed = allowedRolesSchema.unwrap().safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return { ok: false, error: `Geçersiz allowedRoles: ${message}` };
  }
  return { ok: true, allowedRoles: parsed.data };
}

/**
 * Audit günlüğü `limit` sorgu parametresi: 1..500 tam sayı, varsayılan 100.
 * Sayı biçiminde olmayan (NaN, kesirli, negatif, metin) değerler reddedilir;
 * SQL LIMIT'e asla ham değer gitmez.
 */
export const MAX_AUDIT_LIMIT = 500;
export const DEFAULT_AUDIT_LIMIT = 100;

const auditLimitNumberSchema = z
  .number()
  .int("limit tam sayı olmalı")
  .min(1, `limit 1 ile ${MAX_AUDIT_LIMIT} arasında olmalı`)
  .max(MAX_AUDIT_LIMIT, `limit 1 ile ${MAX_AUDIT_LIMIT} arasında olmalı`);

export const auditLimitSchema = z.preprocess((v) => {
  if (v === undefined || v === null) return DEFAULT_AUDIT_LIMIT;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return DEFAULT_AUDIT_LIMIT;
    // Yalnızca onluk tamsayı metni kabul et ("1.5", "1e2", "+3" reddedilir).
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return v;
}, auditLimitNumberSchema);

export function parseAuditLimit(
  raw: string | null
): { ok: true; limit: number } | { ok: false; error: string } {
  const parsed = auditLimitSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "";
    return {
      ok: false,
      error: message.includes("limit")
        ? message
        : `limit 1 ile ${MAX_AUDIT_LIMIT} arasında tam sayı olmalı`,
    };
  }
  return { ok: true, limit: parsed.data };
}

/**
 * Liste uç noktaları için `limit`: 1..200 tam sayı, varsayılan 50 (karar
 * defteri, tahmin anlık görüntüleri). Audit'ten farklı üst sınır kullanır
 * çünkü bu satırlar alt kayıtlarla daha ağırdır. Aynı "yalnızca onluk
 * tamsayı" kuralı geçerlidir.
 */
export const MAX_LIST_LIMIT = 200;
export const DEFAULT_LIST_LIMIT = 50;

export const listLimitSchema = z.preprocess((v) => {
  if (v === undefined || v === null) return DEFAULT_LIST_LIMIT;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return DEFAULT_LIST_LIMIT;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return v;
}, z.number().int("limit tam sayı olmalı").min(1, `limit 1 ile ${MAX_LIST_LIMIT} arasında olmalı`)
  .max(MAX_LIST_LIMIT, `limit 1 ile ${MAX_LIST_LIMIT} arasında olmalı`));

export function parseListLimit(
  raw: string | null
): { ok: true; limit: number } | { ok: false; error: string } {
  const parsed = listLimitSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "";
    // zod'un İngilizce "expected number" mesajı yerine kullanıcıya Türkçe gerekçe ver.
    return {
      ok: false,
      error: message.includes("limit")
        ? message
        : `limit 1 ile ${MAX_LIST_LIMIT} arasında tam sayı olmalı`,
    };
  }
  return { ok: true, limit: parsed.data };
}

/** Ingest `sectorId`: yalnızca tanımlı sektör kimlikleri. */
export const sectorIdSchema = z
  .string()
  .trim()
  .min(1, "sectorId gerekli")
  .refine((id) => getSector(id) !== undefined, "Geçersiz sektör.");
