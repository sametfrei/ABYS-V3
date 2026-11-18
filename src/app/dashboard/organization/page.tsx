"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

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

const SEVERITY_LABEL: Record<string, string> = {
  critical: "KRİTİK",
  high: "YÜKSEK",
  medium: "ORTA",
  low: "DÜŞÜK",
};

const KIND_LABEL: Record<OrgRow["kind"], string> = {
  group: "Holding",
  company: "Şirket",
  branch: "Şube",
};

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
          if (orgRes.status === 401) throw new Error("Bu sayfa için oturum gerekir.");
          if (orgRes.status === 403) throw new Error("Organizasyon görünümü için yetkiniz yok.");
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Yükleme başarısız.");
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
        eyebrow="ORGANİZASYON"
        title="Şirket ve"
        accent="şubeler."
        desc="Oturumunuzun bağlı olduğu organizasyon ağacı ve konsolide açık iş yükü. Kapsam sunucu oturumundan belirlenir."
      />

      <div className="px-10 pb-16 max-w-4xl">
        {loading ? (
          <p className="text-sm text-abys-muted" role="status">Yükleniyor…</p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                ["Açık risk", totals.openSignals],
                ["Açık karar", totals.openDecisions],
                ["Açık aksiyon", totals.openActions],
                ["Gecikmiş aksiyon", totals.overdueActions],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3"
                >
                  <p className="text-[11px] tracking-wide text-abys-muted uppercase">{label}</p>
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
                  BUGÜNÜN ÖNCELİKLİ KARARLARI
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
                            {SEVERITY_LABEL[decision.severity] ?? decision.severity}
                          </span>
                          <span className="text-abys-muted">Güven: %{decision.confidence}</span>
                        </div>
                      </div>
                      <p className="text-xs text-abys-muted mt-1">{decision.orgName}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {orgs.length === 0 ? (
              <p className="text-sm text-abys-muted">Organizasyon kaydı bulunamadı.</p>
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
                                KÖK
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-abys-muted">
                            {KIND_LABEL[org.kind]}
                            {org.code ? ` · ${org.code}` : ""}
                            {org.country ? ` · ${org.country}` : ""}
                            {` · ${org.currency}`}
                          </p>
                        </div>
                        {m && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-abys-muted">
                            <span>Risk: <b className="text-abys-ink">{m.openSignals}</b></span>
                            <span>Karar: <b className="text-abys-ink">{m.openDecisions}</b></span>
                            <span>Aksiyon: <b className="text-abys-ink">{m.openActions}</b></span>
                            {m.overdueActions > 0 && (
                              <span className="text-abys-critical">
                                Gecikmiş: <b>{m.overdueActions}</b>
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
