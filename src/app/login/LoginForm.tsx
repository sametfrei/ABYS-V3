"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoBox } from "@/components/Logo";
import {
  getLoginErrorMessage,
  LOGIN_NETWORK_ERROR,
} from "@/lib/auth/login-messages";

export function LoginForm({
  ssoEnabled,
  initialSsoError,
}: {
  ssoEnabled: boolean;
  initialSsoError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("ceo@tais.demo");
  const [password, setPassword] = useState("");
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
        setError(LOGIN_NETWORK_ERROR);
        return;
      }

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        // A non-JSON response is treated as a server failure below.
      }

      if (!response.ok) {
        setError(getLoginErrorMessage(response.status, payload));
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex justify-center">
          <LogoBox large />
        </div>
        <h1 className="font-serif text-2xl text-abys-navy text-center mb-1">
          Kurumsal <em className="italic text-abys-accent">giriş.</em>
        </h1>
        <p className="text-sm text-abys-muted text-center mb-8">
          Yetkileriniz rolünüze göre sunucuda uygulanır.
        </p>

        <form onSubmit={submit} className="space-y-3" aria-busy={busy}>
          <label htmlFor="email" className="sr-only">
            E-posta
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            spellCheck={false}
            required
            disabled={busy}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="E-posta"
            className="w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-70"
          />
          <label htmlFor="password" className="sr-only">
            Parola
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Parola"
            className="w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-70"
          />
          {error && (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-lg border border-abys-critical/30 bg-abys-critical/5 px-3 py-2 text-sm text-abys-critical"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-abys-navy text-white font-medium py-3 hover:bg-abys-ink transition-colors disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Giriş yapılıyor…" : "Giriş yap →"}
          </button>
        </form>

        {ssoEnabled && (
          <a
            href="/api/auth/oidc/start"
            className="mt-3 block w-full rounded-full border border-abys-navy text-abys-navy text-center font-medium py-3 hover:bg-abys-cream transition-colors"
          >
            Kurumsal hesapla giriş →
          </a>
        )}

        <p className="text-xs text-abys-muted text-center mt-6 leading-relaxed">
          TAIS demo hesabı: <span className="font-mono">ceo@tais.demo</span>
          <br />
          Parola kurulum ve giriş belgesindedir.
        </p>
      </div>
    </div>
  );
}
