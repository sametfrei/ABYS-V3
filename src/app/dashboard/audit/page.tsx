"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ExportLink } from "@/components/ExportLink";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

interface AuditEvent {
  id: string;
  actor: string;
  type: string;
  summary: string;
  detail: string | null;
  created_at: string;
  entry_hash?: string | null;
  prev_hash?: string | null;
}

interface VerifyResult {
  valid: boolean;
  checked: number;
  skipped: number;
  brokenAtId?: string;
}

const LIMIT_OPTIONS = [25, 100, 500] as const;
type AuditLimit = (typeof LIMIT_OPTIONS)[number];

type AuditError =
  | {
      kind:
        | "unauthorized"
        | "forbidden"
        | "invalidRequest"
        | "loadFailed"
        | "verifyMissing"
        | "verifyFailed";
    }
  | { kind: "http"; status: number; serverError?: string };

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

function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale);
}

function errorForStatus(status: number, serverError?: string): AuditError {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 400) return { kind: "invalidRequest" };
  return { kind: "http", status, serverError };
}

function auditErrorMessage(locale: Locale, error: AuditError): string {
  if (error.kind === "http") {
    return error.serverError ?? formatMessage(locale, "audit.loadFailedHttp", { status: error.status });
  }
  return t(locale, `audit.${error.kind}` as ShellKey);
}

function isAuditError(value: unknown): value is AuditError {
  return typeof value === "object" && value !== null && "kind" in value;
}

function auditTypeLabel(locale: Locale, type: string): string | null {
  const key = `audit.type.${type}` as ShellKey;
  const label = t(locale, key);
  return label === key ? null : label;
}

/**
 * Kurumun denetim günlüğü — salt okunur. Yetki ve org kapsamı sunucuda
 * uygulanır (/api/audit); bu ekran yalnızca sonucu gösterir.
 */
export default function AuditPage() {
  const locale = useLocale();
  const [limit, setLimit] = useState<AuditLimit>(100);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuditError | null>(null);

  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<AuditError | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/audit?limit=${limit}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw errorForStatus(res.status, body?.error);
        return Array.isArray(body?.events) ? (body.events as AuditEvent[]) : [];
      })
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setEvents([]);
        setError(isAuditError(err) ? err : { kind: "loadFailed" });
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
      if (!res.ok) throw errorForStatus(res.status, body?.error);
      if (!body?.verify) throw { kind: "verifyMissing" } satisfies AuditError;
      setVerifyResult(body.verify as VerifyResult);
    } catch (err) {
      setVerifyError(isAuditError(err) ? err : { kind: "verifyFailed" });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "audit.eyebrow")}
        title={t(locale, "audit.title")}
        accent={t(locale, "audit.titleAccent")}
        desc={t(locale, "audit.subtitle")}
      />

      <div className="px-10 pb-16 max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label
              htmlFor="audit-limit"
              className="block text-xs tracking-widest text-abys-muted font-semibold mb-2"
            >
              {t(locale, "audit.limitLabel")}
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
                  {formatMessage(locale, "audit.limitOption", {
                    count: formatNumber(option, locale),
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ExportLink
              href={`/api/audit/export?limit=${limit}`}
              label={t(locale, "audit.exportCsv")}
            />
            <button
              type="button"
              onClick={verifyChain}
              disabled={verifying}
              aria-busy={verifying}
              className="text-sm rounded-full border border-abys-ink/15 px-4 py-2 hover:bg-white/60 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifying ? t(locale, "audit.verifying") : t(locale, "audit.verify")}
            </button>
          </div>
        </div>

        <div aria-live="polite" className="space-y-3">
          {verifyError && (
            <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
              {auditErrorMessage(locale, verifyError)}
            </p>
          )}
          {verifyResult && <VerifySummary result={verifyResult} locale={locale} />}
        </div>

        <section aria-labelledby="audit-events-title">
          <h2 id="audit-events-title" className="text-xs tracking-widest text-abys-muted font-semibold mb-3">
            {t(locale, "audit.eventsHeading")}
          </h2>

          {loading ? (
            <p className="text-sm text-abys-muted">{t(locale, "audit.loading")}</p>
          ) : error ? (
            <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
              {auditErrorMessage(locale, error)}
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-abys-muted">{t(locale, "audit.empty")}</p>
          ) : (
            <div className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] tracking-wide text-abys-muted uppercase border-b border-abys-ink/10">
                      <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{t(locale, "audit.tableTime")}</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{t(locale, "audit.tableActor")}</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{t(locale, "audit.tableType")}</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">{t(locale, "audit.tableSummary")}</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">{t(locale, "audit.tableDetail")}</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">{t(locale, "audit.tableHash")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id} className="border-b border-abys-ink/5 last:border-0 align-top">
                        <td className="px-4 py-2.5 whitespace-nowrap text-abys-muted">
                          <time dateTime={event.created_at}>{formatTimestamp(event.created_at, locale)}</time>
                        </td>
                        <td className="px-4 py-2.5 text-abys-ink">{event.actor || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs text-abys-navy">{event.type || "—"}</span>
                          {auditTypeLabel(locale, event.type) && (
                            <p className="mt-0.5 text-xs text-abys-muted">
                              {auditTypeLabel(locale, event.type)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-abys-ink">
                          <span>{event.summary || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-abys-muted whitespace-pre-wrap break-words">
                          {event.detail || "—"}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-mono text-[11px] text-abys-muted">
                            {event.entry_hash ? `${event.entry_hash.slice(0, 12)}…` : "—"}
                          </span>
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

function VerifySummary({ result, locale }: { result: VerifyResult; locale: Locale }) {
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
        {result.valid ? t(locale, "audit.chainValid") : t(locale, "audit.chainInvalid")}
      </p>
      <p className="text-xs text-abys-muted mt-1">
        {formatMessage(locale, "audit.checkedSkipped", {
          checked: formatNumber(result.checked, locale),
          skipped: formatNumber(result.skipped, locale),
        })}
      </p>
      {!result.valid && result.brokenAtId && (
        <p className="text-xs text-abys-critical mt-1">
          {t(locale, "audit.firstBroken")} <span className="font-mono">{result.brokenAtId}</span>
        </p>
      )}
    </div>
  );
}

function formatTimestamp(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
