import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, parseLocale, t, type Locale, type ShellKey } from "@/lib/i18n";

/** İstek çerezinden arayüz dilini çözer; varsayılan Türkçedir. */
export function requestLocale(req: NextRequest): Locale {
  return parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
}

/** Kullanıcıya görünen API hatalarını `abys_lang` çerezine göre döndürür. */
export function localizedError(
  req: NextRequest,
  key: ShellKey,
  status: number,
  init?: { headers?: Record<string, string> }
): NextResponse {
  return NextResponse.json(
    { error: t(requestLocale(req), key) },
    { status, headers: init?.headers }
  );
}
