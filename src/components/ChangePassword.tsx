"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/password-policy";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

/**
 * Oturum sahibinin kendi parolasını değiştirmesi.
 *
 * Güvenlik notu: Yetki ve mevcut parola doğrulaması sunucuda yapılır
 * (`POST /api/auth/password`); buradaki kontroller yalnızca kullanıcıya
 * hızlı geri bildirim içindir. Parola hiçbir yerde loglanmaz; parola
 * değerleri yalnızca bileşen state'inde tutulur ve başarıda temizlenir.
 * Parola kırpılmaz (trim edilmez).
 */

const inputClass =
  "w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3 text-abys-ink focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-60";
const labelClass =
  "block text-xs tracking-widest text-abys-muted font-semibold mb-2";

function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
}

function formatMessage(
  locale: Locale,
  key: ShellKey,
  values: Record<string, string | number>
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    t(locale, key)
  );
}

/** Sunucunun hata metnini kullanır; yoksa dile uygun yedek metne düşer. */
async function readError(res: Response, locale: Locale): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // Gövde JSON değilse yedek metne düş.
  }
  return formatMessage(locale, "settings.password.failedHttp", { status: res.status });
}

export function ChangePassword() {
  const locale = useLocale();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const errorId = "change-password-error";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError(t(locale, "settings.password.currentRequired"));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(formatMessage(locale, "settings.password.min", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      setError(formatMessage(locale, "settings.password.max", { max: MAX_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword === currentPassword) {
      setError(t(locale, "settings.password.same"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t(locale, "settings.password.mismatch"));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        setError(await readError(res, locale));
        return;
      }
      // Parola yanıtta dönmez; yalnızca başarı durumu işlenir.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(t(locale, "settings.password.success"));
    } catch {
      setError(t(locale, "settings.password.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="px-10 pb-16 max-w-2xl"
      aria-labelledby="change-password-heading"
    >
      <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
        <h2
          id="change-password-heading"
          className="font-serif text-lg text-abys-navy mb-1"
        >
          {t(locale, "settings.password.title")}
        </h2>
        <p className="text-xs text-abys-muted mb-4">
          {formatMessage(locale, "settings.password.help", {
            min: MIN_PASSWORD_LENGTH,
            max: MAX_PASSWORD_LENGTH,
          })}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="change-password-current" className={labelClass}>
              {t(locale, "settings.password.current")}
            </label>
            <input
              id="change-password-current"
              type="password"
              required
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="current-password"
              disabled={saving}
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (error) setError("");
                if (success) setSuccess("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="change-password-new" className={labelClass}>
              {t(locale, "settings.password.new")}
            </label>
            <input
              id="change-password-new"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
              disabled={saving}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (error) setError("");
                if (success) setSuccess("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="change-password-confirm" className={labelClass}>
              {t(locale, "settings.password.confirm")}
            </label>
            <input
              id="change-password-confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
              disabled={saving}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError("");
                if (success) setSuccess("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className={inputClass}
            />
          </div>

          {error && (
            <p id={errorId} className="text-sm text-abys-critical" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-abys-healthy" role="status">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-abys-accent text-white text-sm px-5 py-2.5 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-50"
          >
            {saving ? t(locale, "settings.password.submitting") : t(locale, "settings.password.submit")}
          </button>
        </form>
      </div>
    </section>
  );
}
