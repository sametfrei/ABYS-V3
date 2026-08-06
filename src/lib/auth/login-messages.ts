export const LOGIN_NETWORK_ERROR =
  "ABYS yerel hizmetine ulaşılamadı. Uygulamayı kapatıp yeniden açın.";
export const LOGIN_SERVER_ERROR =
  "Sunucu giriş isteğini işleyemedi. Lütfen tekrar deneyin.";
export const LOGIN_INVALID_ERROR = "E-posta ya da parola hatalı.";

export function getLoginErrorMessage(
  status: number,
  payload: unknown
): string {
  if (
    (status === 400 || status === 401) &&
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return payload.error;
  }
  return status >= 500 ? LOGIN_SERVER_ERROR : LOGIN_INVALID_ERROR;
}
