"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import {
  getLoginErrorMessage,
  loginNetworkError,
} from "@/lib/auth/login-messages";
import { LOCALES, persistLocale, t, type Locale } from "@/lib/i18n";
import { clearSessionCache } from "@/lib/use-session";

export function LoginForm({
  ssoEnabled,
  initialSsoError,
  locale,
}: {
  ssoEnabled: boolean;
  initialSsoError: string | null;
  locale: Locale;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialSsoError);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      let response: Response;
      try {
        response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        setError(loginNetworkError(locale));
        return;
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // Non-JSON yanıt aşağıda sunucu hatası olarak ele alınır.
      }

      if (!response.ok) {
        setError(getLoginErrorMessage(response.status, payload, locale));
        return;
      }

      clearSessionCache();
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function clearError() {
    if (error) setError(null);
  }

  const errorId = "login-error";
  const describedBy = error ? errorId : undefined;

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-abys-navy px-14 py-12 text-abys-cream lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-abys-accent/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-abys-accent-soft/10 blur-3xl"
        />

        <div className="relative">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-abys-cream px-4 py-3 shadow-lg shadow-black/10">
            <LogoMark className="h-10 w-10" />
            <span className="font-serif text-2xl tracking-tight text-abys-navy">ABYS</span>
          </div>

          <p className="mt-12 text-[11px] font-semibold tracking-[0.28em] text-abys-accent-soft">
            {t(locale, "login.brandKicker")}
          </p>
          <h1 className="mt-5 max-w-md font-serif text-5xl leading-[1.08]">
            {t(locale, "login.brandHeadline")}
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-abys-cream/70">
            {t(locale, "login.brandBody")}
          </p>
        </div>

        <ul className="relative mt-12 space-y-4 text-sm text-abys-cream/80">
          {(["login.point1", "login.point2", "login.point3"] as const).map(
            (key, index) => (
              <li key={key} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-abys-cream/25 text-[10px] font-semibold tracking-wide">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{t(locale, key)}</span>
              </li>
            )
          )}
        </ul>

        <p className="relative text-[11px] tracking-wide text-abys-cream/45">
          © 2026 ABYS
        </p>
      </section>

      <section className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-8 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="h-11 w-11" />
            <div>
              <p className="font-serif text-2xl leading-none text-abys-navy">ABYS</p>
              <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-abys-muted">
                {t(locale, "login.brandKicker")}
              </p>
            </div>
          </div>

          <p className="text-[11px] font-semibold tracking-[0.24em] text-abys-accent">
            {t(locale, "login.formKicker")}
          </p>
          <h2 className="mt-3 font-serif text-4xl leading-tight text-abys-navy">
            {t(locale, "login.title")}{" "}
            <em className="italic text-abys-accent">{t(locale, "login.accent")}</em>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-abys-muted">
            {t(locale, "login.subtitle")}
          </p>

          <form onSubmit={submit} aria-busy={busy} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-semibold tracking-wide text-abys-navy"
              >
                {t(locale, "login.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={busy}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearError();
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={describedBy}
                placeholder="name@company.com"
                className="w-full rounded-xl border border-abys-cream-border bg-white/80 px-4 py-3 text-sm text-abys-ink shadow-sm outline-none transition placeholder:text-abys-muted/60 focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-xs font-semibold tracking-wide text-abys-navy"
              >
                {t(locale, "login.password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={busy}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearError();
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-abys-cream-border bg-white/80 px-4 py-3 pr-12 text-sm text-abys-ink shadow-sm outline-none transition placeholder:text-abys-muted/60 focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={busy}
                  aria-label={t(
                    locale,
                    showPassword ? "login.hidePassword" : "login.showPassword"
                  )}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-abys-muted transition-colors hover:text-abys-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-abys-accent/40 disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p
                id={errorId}
                role="alert"
                aria-live="assertive"
                className="rounded-xl border border-abys-critical/25 bg-abys-critical/5 px-3.5 py-2.5 text-sm leading-relaxed text-abys-critical"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-abys-navy px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-abys-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-abys-accent/40 disabled:cursor-wait disabled:opacity-70"
            >
              {busy && (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              )}
              {busy ? t(locale, "login.submitting") : t(locale, "login.submit")}
            </button>
          </form>

          {ssoEnabled && (
            <a
              href="/api/auth/oidc/start"
              className="mt-3 flex w-full items-center justify-center rounded-full border border-abys-navy/25 px-5 py-3 text-sm font-medium text-abys-navy transition hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-abys-accent/40"
            >
              {t(locale, "login.sso")}
            </a>
          )}

          <div className="mt-6 rounded-xl border border-abys-cream-border bg-white/55 px-4 py-3">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-abys-muted">
              {t(locale, "login.demoTitle")}
            </p>
            <p className="mt-1 font-mono text-xs text-abys-ink">ceo@tais.demo</p>
            <p className="mt-1 text-[11px] leading-relaxed text-abys-muted">
              {t(locale, "login.demoHint")}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[16rem] text-[11px] leading-relaxed text-abys-muted">
              {t(locale, "login.forgot")}
            </p>
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label={t(locale, "shell.language")}
            >
              {LOCALES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    persistLocale(value);
                    window.location.reload();
                  }}
                  aria-pressed={locale === value}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                    locale === value
                      ? "bg-abys-navy text-white"
                      : "text-abys-muted hover:bg-abys-ink/5 hover:text-abys-ink"
                  }`}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 flex items-center gap-2 text-[11px] text-abys-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-abys-healthy" />
            {t(locale, "login.secureSession")}
          </p>
        </div>
      </section>
    </main>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M3 3l14 14M8.2 5.3A7.8 7.8 0 0 1 10 5c4.7 0 7.5 5 7.5 5a12 12 0 0 1-2.5 3.1M5.6 6.6A12.3 12.3 0 0 0 2.5 10s2.8 5 7.5 5c1 0 1.9-.2 2.7-.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8.3 8.4a2.2 2.2 0 0 0 3.1 3.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
