"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useSession } from "@/lib/use-session";
import { SEVERITY_META, type Signal } from "@/lib/signals";
import type { SignalStatus } from "@/lib/entities";
import type { TaisRisk } from "@/lib/demo/tais/risks";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

const STATUS_LABEL: Record<SignalStatus, ShellKey> = {
  open: "alerts.status.open",
  handled: "alerts.status.handled",
  snoozed: "alerts.status.snoozed",
  escalated: "alerts.status.escalated",
};

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

function codeLabel(locale: Locale, prefix: string, code: string): string {
  const key = `${prefix}.${code}` as ShellKey;
  const label = t(locale, key);
  return label === key ? code : label;
}

function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale);
}

interface DbSignalRow {
  id: string;
  category_id: string;
  severity: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const DB_SEVERITIES: Signal["severity"][] = ["critical", "warning", "info", "healthy"];

/** Kayıtlı risk sinyalini mevcut kart görünümüne çevirir; sayı uydurmaz. */
function dbSignalToSignal(row: DbSignalRow): Signal {
  const payload = row.payload as {
    kind?: string;
    label?: string;
    metricValue?: number;
    baseline?: number;
    score?: number;
    direction?: string;
    sampleSize?: number;
    seriesPoints?: number;
    classificationReason?: string;
    series?: {
      datasetLabel?: string | null;
      entity?: string | null;
      externalId?: string | null;
      period?: string | null;
      periodKnown?: boolean;
      reportingFrequency?: string | null;
      definitionHash?: string | null;
      definitionUnit?: string | null;
    };
    timestamp?: string;
    note?: string;
  };
  const isKpiSignal = payload.kind === "kpi_anomaly" || payload.kind === "kpi_opportunity";
  const scope = [
    payload.series?.entity,
    payload.series?.externalId,
    payload.series?.period,
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" · ");
  const sources = isKpiSignal
    ? [
        `${payload.label}: ${payload.metricValue}`,
        `Taban: ${payload.baseline} · Skor: ${payload.score} (${payload.direction})`,
        `Analiz penceresi: ${payload.sampleSize} · seri: ${payload.seriesPoints ?? payload.sampleSize}`,
        scope ? `Kapsam: ${scope}` : `Kapsam: ${payload.series?.datasetLabel ?? "veri seti"}`,
        payload.series?.period == null ? "Gözlem dönemi: bilinmiyor" : "",
        payload.series?.reportingFrequency
          ? `Raporlama sıklığı: ${payload.series.reportingFrequency}`
          : "",
        payload.series?.definitionUnit ? `Birim: ${payload.series.definitionUnit}` : "",
        payload.classificationReason ? `Sınıf: ${payload.classificationReason}` : "",
        "Yöntem: medyan/MAD (deterministik)",
      ].filter((line) => line.length > 0 && !line.includes("undefined"))
    : [payload.note ?? row.category_id];
  return {
    id: row.id,
    status: (["open", "handled", "snoozed", "escalated"] as string[]).includes(row.status) ? row.status as SignalStatus : "open",
    categoryId: row.category_id,
    categoryLabel: isKpiSignal ? "KPI" : row.category_id,
    severity: DB_SEVERITIES.includes(row.severity as Signal["severity"])
      ? (row.severity as Signal["severity"])
      : "warning",
    title: row.title,
    sources,
    isReal: false,
    dataAsOf: payload.timestamp ?? row.created_at,
  };
}

/** TaisRisk kaydını mevcut Signal görünümüne çevirir (kanıt kayıtları KAYNAKLAR olarak listelenir). */
function taisRiskToSignal(r: TaisRisk, locale: Locale): Signal {
  const context = [r.customerName, r.locationName].filter(Boolean).join(" · ");
  return {
    id: r.id,
    categoryId: r.ruleId,
    categoryLabel: context || codeLabel(locale, "alerts.rule", r.ruleId),
    severity: r.severity,
    title: r.title,
    sources: r.evidence.map((e) =>
      formatMessage(locale, "alerts.evidenceRef", {
        type: codeLabel(locale, "alerts.evidenceType", e.type),
        id: e.id,
      })
    ),
    recommendedAction: r.recommendedAction,
    isReal: true,
    serviceType: r.category,
    customerName: r.customerName,
    locationName: r.locationName,
    rootCause: r.rootCause,
    expectedImpact: r.expectedImpact,
    confidence: r.confidence,
    dataAsOf: r.dataAsOf,
    evidence: r.evidence,
  };
}

export default function AlertsPage() {
  const locale = useLocale();
  // Signal inventory and triage state are always read from the authenticated tenant.
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  const [taisRisks, setTaisRisks] = useState<TaisRisk[] | null>(null);
  const [dbSignals, setDbSignals] = useState<Signal[] | null>(null);
  useEffect(() => {
    if (!session || isTais) return;
    let cancelled = false;
    fetch("/api/signals", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()).signals as DbSignalRow[]) : []))
      .then((rows) => {
        if (!cancelled) setDbSignals(rows.map(dbSignalToSignal));
      })
      .catch(() => {
        if (!cancelled) setDbSignals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session, isTais]);

  useEffect(() => {
    if (!isTais) return;
    let cancelled = false;
    fetch("/api/tais/risks")
      .then(async (r) => (r.ok ? (await r.json()).risks : null))
      .then((rows: TaisRisk[] | null) => {
        if (!cancelled) setTaisRisks(rows);
      })
      .catch(() => {
        if (!cancelled) setTaisRisks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isTais]);

  const signals = isTais
    ? (taisRisks ?? []).map((risk) => taisRiskToSignal(risk, locale))
    : (dbSignals ?? []);
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseMessage, setCaseMessage] = useState("");
  const [caseError, setCaseError] = useState("");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, SignalStatus>>({});
  const taisStatuses = Object.fromEntries((taisRisks ?? []).map((risk) => [risk.id, risk.status]));
  const dbStatuses = Object.fromEntries((dbSignals ?? []).map((signal) => [signal.id, signal.status ?? "open"]));
  const statuses = isTais ? taisStatuses : { ...dbStatuses, ...statusOverrides };
  const [expanded, setExpanded] = useState<string | null>(null);

  if (session === undefined || session === null) return null;

  async function setStatus(signalId: string, status: SignalStatus) {
    if (isTais) return;
    const response = await fetch(`/api/signals/${encodeURIComponent(signalId)}/triage`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) return;
    setStatusOverrides((current) => ({ ...current, [signalId]: status }));
    setDbSignals((current) => current?.map((signal) => signal.id === signalId ? { ...signal, status } : signal) ?? []);
  }

  async function generateCaseDrafts() {
    setCaseBusy(true);
    setCaseMessage("");
    setCaseError("");
    try {
      const res = await fetch("/api/decision-cases/from-signals", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body.error ??
            formatMessage(locale, "alerts.caseDraftFailedHttp", { status: res.status })
        );
      }
      setCaseMessage(
        formatMessage(locale, "alerts.caseDraftResult", {
          generated: body.generated ?? 0,
          existing: body.existing ?? 0,
          skipped: body.skipped ?? 0,
        })
      );
    } catch (err) {
      setCaseError(
        err instanceof Error ? err.message : t(locale, "alerts.caseDraftFailed")
      );
    } finally {
      setCaseBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "alerts.eyebrow")}
        title={t(locale, "alerts.title")}
        accent={t(locale, "alerts.titleAccent")}
        desc={t(locale, "alerts.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-2xl space-y-3">
        {session && !isTais && (
          <div className="rounded-xl border border-abys-accent/25 bg-white/70 p-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void generateCaseDrafts()}
              disabled={caseBusy}
              className="text-sm rounded-full bg-abys-navy text-white px-4 py-1.5 hover:opacity-90 disabled:opacity-40"
            >
              {caseBusy
                ? t(locale, "alerts.generatingCaseDrafts")
                : t(locale, "alerts.generateCaseDrafts")}
            </button>
            <Link
              href="/dashboard/decisions"
              className="text-xs text-abys-accent hover:underline"
            >
              {t(locale, "alerts.openDecisions")}
            </Link>
            {caseMessage && (
              <span className="text-[11px] text-abys-muted">{caseMessage}</span>
            )}
            {caseError && (
              <span className="text-[11px] text-abys-critical">{caseError}</span>
            )}
          </div>
        )}
        {isTais && taisRisks === null && (
          <p className="text-sm text-abys-muted">{t(locale, "alerts.loadingTais")}</p>
        )}
        {signals.length === 0 &&
          !(isTais && taisRisks === null) &&
          !(session && dbSignals === null) && (
            <p className="text-sm text-abys-muted">{t(locale, "alerts.empty")}</p>
          )}
        {signals.map((s) => {
          const status = statuses[s.id] ?? "open";
          const meta = SEVERITY_META[s.severity];
          const isOpen = expanded === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-abys-cream-border bg-abys-cream overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : s.id)}
                className="w-full flex items-start gap-3 px-5 py-4 text-left"
              >
                <span
                  className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-1 mt-0.5 shrink-0"
                  style={{ color: meta.color, background: meta.soft }}
                >
                  {codeLabel(locale, "alerts.severity", s.severity)}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-abys-ink font-medium">{s.title}</p>
                  <p className="text-xs text-abys-muted mt-0.5">
                    {s.categoryLabel} · {t(locale, STATUS_LABEL[status])}
                    {s.isReal && <span className="text-abys-accent"> · {t(locale, "alerts.taisDemoBadge")}</span>}
                  </p>
                </div>
                <span className="text-abys-muted text-sm">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-abys-ink/10 pt-4">
                   {s.recommendedAction && (
                    <>
                      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
                        {t(locale, "alerts.recommendedAction")}
                      </p>
                      <p className="text-sm text-abys-ink mb-4">{s.recommendedAction}</p>
                    </>
                   )}
                  {(s.serviceType || s.customerName || s.locationName || s.rootCause || s.expectedImpact || s.confidence !== undefined || s.dataAsOf) && (
                    <div className="space-y-1 mb-4 text-sm text-abys-ink">
                      {s.serviceType && (
                        <p>
                          <span className="text-abys-muted">{t(locale, "alerts.serviceType")} </span>
                          {codeLabel(locale, "alerts.serviceType", s.serviceType)}
                        </p>
                      )}
                      {s.customerName && <p><span className="text-abys-muted">{t(locale, "alerts.customer")} </span>{s.customerName}</p>}
                      {s.locationName && <p><span className="text-abys-muted">{t(locale, "alerts.location")} </span>{s.locationName}</p>}
                      {s.rootCause && <p><span className="text-abys-muted">{t(locale, "alerts.rootCause")} </span>{s.rootCause}</p>}
                      {s.expectedImpact && <p><span className="text-abys-muted">{t(locale, "alerts.expectedImpact")} </span>{s.expectedImpact}</p>}
                      {s.confidence !== undefined && (
                        <p>
                          <span className="text-abys-muted">{t(locale, "alerts.confidence")} </span>
                          {formatMessage(locale, "alerts.confidenceValue", {
                            value: formatNumber(s.confidence, locale),
                          })}
                        </p>
                      )}
                      {s.dataAsOf && (
                        <p>
                          <span className="text-abys-muted">{t(locale, "alerts.dataAsOf")} </span>
                          {new Date(s.dataAsOf).toLocaleString(locale)}
                        </p>
                      )}
                    </div>
                  )}
                   <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">{t(locale, "alerts.sources")}</p>
                  <ul className="text-sm text-abys-ink mb-4 list-disc list-inside">
                    {s.sources.map((src) => (
                      <li key={src}>{src}</li>
                    ))}
                  </ul>

                  {isTais ? (
                    <p className="text-xs text-abys-muted mb-5">
                      {t(locale, "alerts.taisStatusNote")}
                    </p>
                  ) : (
                    <div className="flex gap-2 mb-5">
                      <StatusButton current={status} target="handled" onClick={() => void setStatus(s.id, "handled")} />
                      <StatusButton current={status} target="snoozed" onClick={() => void setStatus(s.id, "snoozed")} />
                      <StatusButton current={status} target="escalated" onClick={() => void setStatus(s.id, "escalated")} />
                      {status !== "open" && (
                        <StatusButton current={status} target="open" onClick={() => void setStatus(s.id, "open")} />
                      )}
                    </div>
                  )}

                   {!isTais && <WarRoom signalId={s.id} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusButton({
  current,
  target,
  onClick,
}: {
  current: SignalStatus;
  target: SignalStatus;
  onClick: () => void;
}) {
  const locale = useLocale();
  const active = current === target;
  return (
    <button
      onClick={onClick}
      className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
        active
          ? "bg-abys-navy text-white border-abys-navy"
          : "border-abys-ink/15 text-abys-ink hover:bg-white/60"
      }`}
    >
      {t(locale, STATUS_LABEL[target])}
    </button>
  );
}

function WarRoom({ signalId }: { signalId: string }) {
  const locale = useLocale();
  const [notes, setNotes] = useState<{ id: string; author: string; text: string; createdAt: string }[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadNotes() {
    const response = await fetch(`/api/signals/${encodeURIComponent(signalId)}/notes`, { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { notes: { id: string; author_name: string; note: string; created_at: string }[] };
    setNotes(body.notes.map((note) => ({ id: note.id, author: note.author_name, text: note.note, createdAt: note.created_at })));
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/signals/${encodeURIComponent(signalId)}/notes`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { notes: { id: string; author_name: string; note: string; created_at: string }[] } : { notes: [] })
      .then((body) => {
        if (!cancelled) setNotes(body.notes.map((note) => ({ id: note.id, author: note.author_name, text: note.note, createdAt: note.created_at })));
      })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [signalId]);

  async function add() {
    if (!text.trim()) return;
    setError(null);
    const response = await fetch(`/api/signals/${encodeURIComponent(signalId)}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: text.trim() }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? t(locale, "alerts.noteSaveFailed"));
      return;
    }
    setText("");
    await loadNotes();
  }

  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">{t(locale, "alerts.warRoom")}</p>
      {notes.length === 0 && <p className="text-xs text-abys-muted mb-3">{t(locale, "alerts.noNotes")}</p>}
      <div className="space-y-2 mb-3">
        {notes.map((note) => (
          <div key={note.id} className="text-sm bg-white/60 rounded-lg px-3 py-2">
            <span className="font-medium text-abys-navy">{note.author}: </span>
            <span className="text-abys-ink">{note.text}</span>
            <p className="text-[10px] text-abys-muted mt-1">{new Date(note.createdAt).toLocaleString(locale)}</p>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-abys-critical mb-2">{error}</p>}
      <div className="flex gap-2">
        <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void add()} placeholder={t(locale, "alerts.notePlaceholder")} className="flex-1 text-sm rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent" />
        <button onClick={() => void add()} className="text-sm rounded-lg bg-abys-navy text-white px-3 py-2">{t(locale, "alerts.send")}</button>
      </div>
    </div>
  );
}
