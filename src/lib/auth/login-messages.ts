import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

export const LOGIN_NETWORK_ERROR = t(DEFAULT_LOCALE, "login.error.network");
export const LOGIN_SERVER_ERROR = t(DEFAULT_LOCALE, "login.error.server");
export const LOGIN_INVALID_ERROR = t(DEFAULT_LOCALE, "login.error.invalid");

/**
 * 400/401/429 yanıtlarındaki sunucu mesajı zaten çerez diline göre gelir.
 * Ağ hatası ve 5xx için istemci tarafında yerelleştirilmiş yedek metin döner.
 */
export function getLoginErrorMessage(
  status: number,
  payload: unknown,
  locale: Locale = DEFAULT_LOCALE
): string {
  if (
    (status === 400 || status === 401 || status === 429) &&
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return payload.error;
  }
  return status >= 500
    ? t(locale, "login.error.server")
    : t(locale, "login.error.invalid");
}

export function loginNetworkError(locale: Locale = DEFAULT_LOCALE): string {
  return t(locale, "login.error.network");
}
