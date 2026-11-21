"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

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

function formatDateTime(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readError(res: Response, locale: Locale): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // JSON değilse yedek metne düş.
  }
  return formatMessage(locale, "settings.sessions.failedHttp", { status: res.status });
}

/**
 * Aktif oturumlar — salt okunur liste + iptal. Yetki ve kapsam sunucudadır.
 */
export function SessionManagement() {
  const locale = useLocale();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/sessions", { cache: "no-store" });
        if (!res.ok) throw new Error(await readError(res, locale));
        const data = (await res.json()) as { sessions?: SessionRow[] };
        if (cancelled) return;
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t(locale, "settings.sessions.network"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, locale]);

  async function revoke(payload: { id: string } | { allOthers: true }) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await readError(res, locale));
        return;
      }
      setNotice(t(locale, "settings.sessions.revoked"));
      setLoading(true);
      setReloadKey((k) => k + 1);
    } catch {
      setError(t(locale, "settings.sessions.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-10 pb-16 max-w-2xl" aria-labelledby="sessions-heading">
      <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
        <h2 id="sessions-heading" className="font-serif text-lg text-abys-navy mb-1">
          {t(locale, "settings.sessions.title")}
        </h2>
        <p className="text-xs text-abys-muted mb-4">
          {t(locale, "settings.sessions.subtitle")}
        </p>

        {loading ? (
          <p className="text-sm text-abys-muted" role="status">{t(locale, "settings.sessions.loading")}</p>
        ) : error ? (
          <p role="alert" className="text-sm text-abys-critical">{error}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-abys-muted">{t(locale, "settings.sessions.empty")}</p>
        ) : (
          <ul className="space-y-2 list-none p-0 m-0">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-abys-cream-border bg-white/50 px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="text-abys-ink">
                    {s.current ? t(locale, "settings.sessions.current") : t(locale, "settings.sessions.other")}
                    {s.current && (
                      <span className="ml-2 rounded-full bg-abys-healthy-soft px-2 py-0.5 text-[10px] font-semibold text-abys-healthy">
                        {t(locale, "settings.sessions.activeBadge")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-abys-muted">
                    {formatMessage(locale, "settings.sessions.started", {
                      date: formatDateTime(s.createdAt, locale),
                    })}{" "}
                    ·{" "}
                    {formatMessage(locale, "settings.sessions.expires", {
                      date: formatDateTime(s.expiresAt, locale),
                    })}
                  </p>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => revoke({ id: s.id })}
                    className="rounded-full border border-abys-critical/40 px-3 py-1.5 text-xs text-abys-critical hover:bg-abys-critical-soft focus:outline-none focus:ring-2 focus:ring-abys-critical disabled:opacity-50"
                  >
                    {t(locale, "settings.sessions.revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {sessions.some((s) => !s.current) && (
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => revoke({ allOthers: true })}
            className="mt-4 rounded-full border border-abys-ink/15 px-4 py-2 text-xs hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-abys-accent disabled:opacity-50"
          >
            {t(locale, "settings.sessions.revokeAll")}
          </button>
        )}

        {notice && (
          <p className="mt-3 text-sm text-abys-healthy" role="status">{notice}</p>
        )}
      </div>
    </section>
  );
}
