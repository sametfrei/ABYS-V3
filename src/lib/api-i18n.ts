import { NextResponse, type NextRequest } from "next/server";
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
export function requestLocale(req: Request): Locale {
  const value =
    (req as NextRequest).cookies?.get?.(LOCALE_COOKIE)?.value ??
    cookieFromHeader(req.headers.get("cookie"), LOCALE_COOKIE);
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
