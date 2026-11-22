import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, t, type Locale, type ShellKey } from "@/lib/i18n";

function cookieFromHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** İstek çerezinden arayüz dilini çözer; varsayılan Türkçedir. */
export function requestLocale(req?: Request): Locale {
  if (!req) return parseLocale(undefined);
  const value =
    (req as NextRequest).cookies?.get?.(LOCALE_COOKIE)?.value ??
    cookieFromHeader(req.headers?.get?.("cookie") ?? null, LOCALE_COOKIE);
  return parseLocale(value);
}

/** Kullanıcıya görünen API hatalarını `abys_lang` çerezine göre döndürür. */
export function localizedError(
  req: Request,
  key: ShellKey,
  status: number,
  init?: { headers?: Record<string, string> }
): NextResponse {
  return NextResponse.json(
    { error: t(requestLocale(req), key) },
    { status, headers: init?.headers }
  );
}

/** Parametreli (ör. sayı/ad içeren) hata mesajları için aynı yardımcı. */
export function localizedErrorWith(
  req: Request,
  key: ShellKey,
  status: number,
  params: Record<string, string | number>
): NextResponse {
  return NextResponse.json(
    { error: t(requestLocale(req), key, params) },
    { status }
  );
}

/**
 * İstek parametresi almayan route handler'lar için: dili `abys_lang`
 * çerezinden okuyup yerelleştirilmiş hata döndürür.
 */
export async function localizedErrorFromCookies(
  key: ShellKey,
  status: number,
  init?: { headers?: Record<string, string> }
): Promise<NextResponse> {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  return NextResponse.json({ error: t(locale, key) }, { status, headers: init?.headers });
}
