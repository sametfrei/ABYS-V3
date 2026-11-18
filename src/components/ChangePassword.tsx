"use client";

import { useState, type FormEvent } from "react";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/password-policy";

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

const NETWORK_ERROR =
  "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.";

/** Sunucunun Türkçe hata metnini kullanır; yoksa durum kodlu yedek metin. */
async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // Gövde JSON değilse yedek metne düş.
  }
  return `Parola değiştirilemedi (HTTP ${res.status}).`;
}

export function ChangePassword() {
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
      setError("Mevcut parolanızı girin.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Yeni parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      setError(`Yeni parola en fazla ${MAX_PASSWORD_LENGTH} karakter olmalı.`);
      return;
    }
    if (newPassword === currentPassword) {
      setError("Yeni parola mevcut parolayla aynı olamaz.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Yeni parola ve tekrarı eşleşmiyor.");
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
        setError(await readError(res));
        return;
      }
      // Parola yanıtta dönmez; yalnızca başarı durumu işlenir.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Parola değiştirildi.");
    } catch {
      setError(NETWORK_ERROR);
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
          Parola değiştir
        </h2>
        <p className="text-xs text-abys-muted mb-4">
          Parola en az {MIN_PASSWORD_LENGTH}, en fazla {MAX_PASSWORD_LENGTH}{" "}
          karakter olmalıdır. Boşluklar da parolanın parçasıdır.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="change-password-current" className={labelClass}>
              MEVCUT PAROLA
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
              YENİ PAROLA
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
              YENİ PAROLA TEKRAR
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
            {saving ? "Değiştiriliyor…" : "Parolayı değiştir"}
          </button>
        </form>
      </div>
    </section>
  );
}
