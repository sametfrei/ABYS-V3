"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

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

function severityLabel(locale: Locale, severity: string): string {
  const key = `organization.severity.${severity}` as ShellKey;
  const label = t(locale, key);
  return label === key ? severity : label;
}

function kindLabel(locale: Locale, kind: OrgRow["kind"]): string {
  return t(locale, `organization.kind.${kind}` as ShellKey);
}

interface OrgRow {
  id: string;
  name: string;
  code: string | null;
  sectorId: string;
  kind: "group" | "company" | "branch";
  parentId: string | null;
  country: string | null;
  currency: string;
  depth: number;
}

interface ConsolidationRow {
  id: string;
  name: string;
  kind: "group" | "company" | "branch";
  currency: string;
  openSignals: number;
  openDecisions: number;
  openActions: number;
  overdueActions: number;
}

interface Totals {
  openSignals: number;
  openDecisions: number;
  openActions: number;
  overdueActions: number;
}

interface PriorityDecision {
  id: string;
  orgId: string;
  orgName: string;
  title: string;
  severity: string;
  confidence: number;
  createdAt: string;
}

const EMPTY_TOTALS: Totals = {
  openSignals: 0,
  openDecisions: 0,
  openActions: 0,
  overdueActions: 0,
};

/**
 * Organizasyon hiyerarşisi + konsolide görünüm. Kapsam sunucuda belirlenir
 * (kök her zaman oturumdan gelir); başka holding/şube verisi görünmez.
 */
export default function OrganizationPage() {
  const locale = useLocale();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, ConsolidationRow>>({});
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [topDecisions, setTopDecisions] = useState<PriorityDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rootOrgId, setRootOrgId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [orgRes, conRes] = await Promise.all([
          fetch("/api/organizations", { cache: "no-store" }),
          fetch("/api/organizations/consolidation", { cache: "no-store" }),
        ]);
        if (!orgRes.ok) {
          if (orgRes.status === 401) throw new Error(t(readLocale(), "organization.sessionRequired"));
          if (orgRes.status === 403) throw new Error(t(readLocale(), "organization.forbidden"));
          throw new Error(`Organizasyon verisi yüklenemedi (HTTP ${orgRes.status}).`);
        }
        const orgData = (await orgRes.json()) as {
          rootOrgId?: string;
          organizations?: OrgRow[];
        };
        const conData = conRes.ok
          ? ((await conRes.json()) as {
              organizations?: ConsolidationRow[];
              totals?: Totals;
              topDecisions?: PriorityDecision[];
            })
          : {};

        if (cancelled) return;
        setRootOrgId(orgData.rootOrgId ?? null);
        setOrgs(Array.isArray(orgData.organizations) ? orgData.organizations : []);
        const map: Record<string, ConsolidationRow> = {};
        for (const row of conData.organizations ?? []) map[row.id] = row;
        setMetrics(map);
        setTotals(conData.totals ?? EMPTY_TOTALS);
        setTopDecisions(Array.isArray(conData.topDecisions) ? conData.topDecisions : []);
      } catch (err) {
        if (!cancelled) setError(
          err instanceof Error ? err.message : t(readLocale(), "organization.loadFailed")
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "organization.eyebrow")}
        title={t(locale, "organization.title")}
        accent={t(locale, "organization.titleAccent")}
        desc={t(locale, "organization.subtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-4xl">
        {loading ? (
          <p className="text-sm text-abys-muted" role="status">
            {t(locale, "organization.loading")}
          </p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                ["organization.totals.signals", totals.openSignals],
                ["organization.totals.decisions", totals.openDecisions],
                ["organization.totals.actions", totals.openActions],
                ["organization.totals.overdue", totals.overdueActions],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3"
                >
                  <p className="text-[11px] tracking-wide text-abys-muted uppercase">
                    {t(locale, label as ShellKey)}
                  </p>
                  <p className="font-serif text-2xl text-abys-navy">{String(value)}</p>
                </div>
              ))}
            </div>

            {topDecisions.length > 0 && (
              <section className="mb-6" aria-labelledby="top-decisions-title">
                <h2
                  id="top-decisions-title"
                  className="text-xs tracking-widest text-abys-muted font-semibold mb-3"
                >
                  {t(locale, "organization.topDecisions")}
                </h2>
                <ol className="space-y-2 list-none p-0 m-0">
                  {topDecisions.map((decision, index) => (
                    <li
                      key={decision.id}
                      className="rounded-xl border border-abys-cream-border bg-white/50 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-abys-ink">
                          <span className="text-abys-muted mr-2">{index + 1}.</span>
                          {decision.title}
                        </p>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${
                              decision.severity === "critical"
                                ? "bg-abys-critical-soft text-abys-critical"
                                : "bg-abys-cream text-abys-ink"
                            }`}
                          >
                            {severityLabel(locale, decision.severity)}
                          </span>
                          <span className="text-abys-muted">
                            {formatMessage(locale, "organization.confidence", {
                              value: decision.confidence,
                            })}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-abys-muted mt-1">{decision.orgName}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {orgs.length === 0 ? (
              <p className="text-sm text-abys-muted">{t(locale, "organization.empty")}</p>
            ) : (
              <ul className="space-y-2 list-none p-0 m-0">
                {orgs.map((org) => {
                  const m = metrics[org.id];
                  return (
                    <li
                      key={org.id}
                      className={`rounded-xl border px-4 py-3 ${
                        org.id === rootOrgId
                          ? "border-abys-accent/40 bg-abys-cream"
                          : "border-abys-cream-border bg-white/50"
                      }`}
                      style={{ marginLeft: `${Math.min(org.depth, 6) * 20}px` }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-abys-ink">
                            {org.name}
                            {org.id === rootOrgId && (
                              <span className="ml-2 rounded-full bg-abys-accent/10 px-2 py-0.5 text-[10px] font-semibold text-abys-accent">
                                {t(locale, "organization.rootBadge")}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-abys-muted">
                            {kindLabel(locale, org.kind)}
                            {org.code ? ` · ${org.code}` : ""}
                            {org.country ? ` · ${org.country}` : ""}
                            {` · ${org.currency}`}
                          </p>
                        </div>
                        {m && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-abys-muted">
                            <span>
                              {t(locale, "organization.metric.signals")}{" "}
                              <b className="text-abys-ink">{m.openSignals}</b>
                            </span>
                            <span>
                              {t(locale, "organization.metric.decisions")}{" "}
                              <b className="text-abys-ink">{m.openDecisions}</b>
                            </span>
                            <span>
                              {t(locale, "organization.metric.actions")}{" "}
                              <b className="text-abys-ink">{m.openActions}</b>
                            </span>
                            {m.overdueActions > 0 && (
                              <span className="text-abys-critical">
                                {t(locale, "organization.metric.overdue")} <b>{m.overdueActions}</b>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
