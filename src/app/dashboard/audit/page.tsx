"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

interface AuditEvent {
  id: string;
  actor: string;
  type: string;
  summary: string;
  detail: string | null;
  created_at: string;
}

interface VerifyResult {
  valid: boolean;
  checked: number;
  skipped: number;
  brokenAtId?: string;
}

const LIMIT_OPTIONS = [25, 100, 500] as const;
type AuditLimit = (typeof LIMIT_OPTIONS)[number];

/**
 * Kurumun denetim günlüğü — salt okunur. Yetki ve org kapsamı sunucuda
 * uygulanır (/api/audit); bu ekran yalnızca sonucu gösterir.
 */
export default function AuditPage() {
  const [limit, setLimit] = useState<AuditLimit>(100);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/audit?limit=${limit}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(messageForStatus(res.status, body?.error));
        return Array.isArray(body?.events) ? (body.events as AuditEvent[]) : [];
      })
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setEvents([]);
        setError(err instanceof Error ? err.message : "Denetim olayları yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [limit]);

  async function verifyChain() {
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/audit?verify=1");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(messageForStatus(res.status, body?.error));
      if (!body?.verify) throw new Error("Doğrulama sonucu alınamadı.");
      setVerifyResult(body.verify as VerifyResult);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Zincir doğrulanamadı.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="DENETİM"
        title="Denetim"
        accent="günlüğü."
        desc="Kurumunuzdaki kritik işlemler hash zinciriyle kayıt altına alınır. Bu ekran salt okunurdur."
      />

      <div className="px-10 pb-16 max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label
              htmlFor="audit-limit"
              className="block text-xs tracking-widest text-abys-muted font-semibold mb-2"
            >
              GÖSTERİLECEK OLAY
            </label>
            <select
              id="audit-limit"
              value={limit}
              onChange={(e) => {
                setLoading(true);
                setError(null);
                setLimit(Number(e.target.value) as AuditLimit);
              }}
              className="rounded-lg border border-abys-cream-border bg-abys-cream px-3 py-2 text-sm text-abys-ink focus:outline-none focus:ring-2 focus:ring-abys-accent"
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Son {option} olay
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={verifyChain}
            disabled={verifying}
            aria-busy={verifying}
            className="text-sm rounded-full border border-abys-ink/15 px-4 py-2 hover:bg-white/60 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifying ? "Doğrulanıyor…" : "Zinciri doğrula"}
          </button>
        </div>

        <div aria-live="polite" className="space-y-3">
          {verifyError && (
            <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
              {verifyError}
            </p>
          )}
          {verifyResult && <VerifySummary result={verifyResult} />}
        </div>

        <section aria-labelledby="audit-events-title">
          <h2 id="audit-events-title" className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
            DENETİM OLAYLARI
          </h2>

          {loading ? (
            <p className="text-sm text-abys-muted">Yükleniyor…</p>
          ) : error ? (
            <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
              {error}
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-abys-muted">Kayıtlı denetim olayı bulunmuyor.</p>
          ) : (
            <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] tracking-wide text-abys-muted uppercase border-b border-abys-ink/10">
                      <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">Tarih / saat</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">Aktör</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">Tür</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Özet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id} className="border-b border-abys-ink/5 last:border-0 align-top">
                        <td className="px-4 py-2.5 whitespace-nowrap text-abys-muted">
                          <time dateTime={event.created_at}>{formatTimestamp(event.created_at)}</time>
                        </td>
                        <td className="px-4 py-2.5 text-abys-ink">{event.actor || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs text-abys-navy">{event.type || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-abys-ink">
                          <span>{event.summary || "—"}</span>
                          {event.detail && (
                            <p className="mt-1 text-xs text-abys-muted whitespace-pre-wrap break-words">
                              {event.detail}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function VerifySummary({ result }: { result: VerifyResult }) {
  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 text-sm ${
        result.valid
          ? "border-abys-healthy/40 bg-abys-healthy-soft"
          : "border-abys-critical/40 bg-abys-critical-soft"
      }`}
    >
      <p className={`font-medium ${result.valid ? "text-abys-healthy" : "text-abys-critical"}`}>
        {result.valid ? "Zincir geçerli." : "Zincir geçersiz."}
      </p>
      <p className="text-xs text-abys-muted mt-1">
        Kontrol edilen: {result.checked} olay · Atlanan: {result.skipped}
      </p>
      {!result.valid && result.brokenAtId && (
        <p className="text-xs text-abys-critical mt-1">
          İlk bozulma: <span className="font-mono">{result.brokenAtId}</span>
        </p>
      )}
    </div>
  );
}

function messageForStatus(status: number, serverError?: string): string {
  if (status === 401) return "Bu ekranı görmek için oturum açmanız gerekiyor.";
  if (status === 403) return serverError || "Bu ekranı görüntülemek için yetkiniz yok.";
  if (status === 400) return serverError || "Geçersiz istek.";
  return serverError || `Denetim verisi yüklenemedi (HTTP ${status}).`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
