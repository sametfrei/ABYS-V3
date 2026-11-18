"use client";

import { useEffect, useState } from "react";

interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // JSON değilse yedek metne düş.
  }
  return `İşlem başarısız oldu (HTTP ${res.status}).`;
}

const NETWORK_ERROR =
  "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.";

/**
 * Aktif oturumlar — salt okunur liste + iptal. Yetki ve kapsam sunucudadır.
 */
export function SessionManagement() {
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
        if (!res.ok) throw new Error(await readError(res));
        const data = (await res.json()) as { sessions?: SessionRow[] };
        if (cancelled) return;
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : NETWORK_ERROR);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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
        setError(await readError(res));
        return;
      }
      setNotice("Oturum kapatıldı.");
      setLoading(true);
      setReloadKey((k) => k + 1);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-10 pb-16 max-w-2xl" aria-labelledby="sessions-heading">
      <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
        <h2 id="sessions-heading" className="font-serif text-lg text-abys-navy mb-1">
          Aktif oturumlar
        </h2>
        <p className="text-xs text-abys-muted mb-4">
          Hesaplandığınız cihaz/oturumlar. Tanımadığınız bir oturum varsa kapatın.
        </p>

        {loading ? (
          <p className="text-sm text-abys-muted" role="status">Yükleniyor…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-abys-critical">{error}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-abys-muted">Aktif oturum bulunamadı.</p>
        ) : (
          <ul className="space-y-2 list-none p-0 m-0">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-abys-cream-border bg-white/50 px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="text-abys-ink">
                    {s.current ? "Bu oturum" : "Diğer oturum"}
                    {s.current && (
                      <span className="ml-2 rounded-full bg-abys-healthy-soft px-2 py-0.5 text-[10px] font-semibold text-abys-healthy">
                        AKTİF
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-abys-muted">
                    Başlangıç: {formatDateTime(s.createdAt)} · Bitiş: {formatDateTime(s.expiresAt)}
                  </p>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => revoke({ id: s.id })}
                    className="rounded-full border border-abys-critical/40 px-3 py-1.5 text-xs text-abys-critical hover:bg-abys-critical-soft focus:outline-none focus:ring-2 focus:ring-abys-critical disabled:opacity-50"
                  >
                    Oturumu kapat
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
            Diğer tüm oturumları kapat
          </button>
        )}

        {notice && (
          <p className="mt-3 text-sm text-abys-healthy" role="status">{notice}</p>
        )}
      </div>
    </section>
  );
}
