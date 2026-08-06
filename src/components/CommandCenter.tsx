"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Yönetim Komuta Merkezi paneli (Faz 4). Oturumdayken dashboard'ın en üstünde
 * durur ve yöneticinin ~30 saniyede kurumu kavramasını sağlar: dikkat bekleyen
 * kararlar, risk/sinyal yoğunluğu, açık aksiyonlar, son ölçülen sonuçlar.
 * Veri /api/command-center'dan gelir (org-izolasyonlu). Her blok ilgili
 * sayfaya bağlıdır — kanıta/kayda tıkla-git.
 */

interface Brief {
  caseId: string;
  currentCondition: string;
  businessImpact: string;
  nextDevelopment: string;
  recommendedAction: string;
  confidence: number;
  confidenceRationale: string;
  topEvidence: { fact: string; reliability: string }[];
}

interface CommandData {
  brief: Brief | null;
  decisions: { id: string; title: string; severity: string; confidence: number }[];
  signals: { bySeverity: Record<string, number>; top: { id: string; title: string; severity: string }[] };
  actions: { byStatus: Record<string, number>; open: { id: string; title: string; owner: string; status: string }[] };
  outcomes: { result: string; note: string; lesson: string | null }[];
  lastActivityAt: string | null;
}

const SEV_COLOR: Record<string, string> = {
  critical: "var(--abys-critical)",
  warning: "var(--abys-warning)",
  info: "var(--abys-accent)",
  healthy: "var(--abys-healthy)",
};

export function CommandCenter() {
  const [data, setData] = useState<CommandData | null | "none">(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/command-center")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d ?? "none");
      })
      .catch(() => {
        if (!cancelled) setData("none");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Oturum yoksa (401) panel gösterilmez — prototip dashboard'ı bozulmaz.
  if (data === "none" || data === null) return null;

  const critCount = data.signals.bySeverity.critical ?? 0;
  const warnCount = data.signals.bySeverity.warning ?? 0;
  const openActions = (data.actions.byStatus.open ?? 0) + (data.actions.byStatus.in_progress ?? 0);
  const improved = data.outcomes.filter((o) => o.result === "improved").length;

  return (
    <section className="mb-10 rounded-2xl border border-abys-cream-border bg-abys-cream/60 p-6">
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs tracking-widest text-abys-muted font-semibold">YÖNETİM KOMUTA MERKEZİ</p>
        <span className="text-[11px] text-abys-muted">
          {data.lastActivityAt
            ? `Son faaliyet: ${new Date(data.lastActivityAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : "Faaliyet yok"}
        </span>
      </div>

      {/* Yapılandırılmış yönetici brifingi — en kritik açık vaka (izlenebilir) */}
      {data.brief && <ExecutiveBrief brief={data.brief} />}

      {/* Özet şerit — 30 saniyelik kavrama */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Dikkat bekleyen karar" value={data.decisions.length} href="/dashboard/decisions" tone={data.decisions.length > 0 ? "warning" : "healthy"} />
        <Stat label="Kritik / uyarı sinyal" value={`${critCount} / ${warnCount}`} href="/dashboard/alerts" tone={critCount > 0 ? "critical" : warnCount > 0 ? "warning" : "healthy"} />
        <Stat label="Açık aksiyon" value={openActions} href="/dashboard/actions" tone={openActions > 0 ? "warning" : "healthy"} />
        <Stat label="İyileşme sağlanan sonuç" value={improved} href="/dashboard/memory" tone="healthy" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Dikkat bekleyen kararlar */}
        <Block title="Onayınızı bekleyen kararlar" href="/dashboard/decisions" empty={data.decisions.length === 0} emptyText="Bekleyen karar yok.">
          {data.decisions.map((d) => (
            <li key={d.id} className="flex items-start gap-2 text-sm">
              <Dot color={SEV_COLOR[d.severity] ?? SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{d.title}</span>
              <span className="text-xs text-abys-muted shrink-0">%{d.confidence}</span>
            </li>
          ))}
        </Block>

        {/* En önemli sinyaller */}
        <Block title="Öne çıkan riskler ve sinyaller" href="/dashboard/alerts" empty={data.signals.top.length === 0} emptyText="Açık sinyal yok.">
          {data.signals.top.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <Dot color={SEV_COLOR[s.severity] ?? SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{s.title}</span>
            </li>
          ))}
        </Block>

        {/* Açık aksiyonlar */}
        <Block title="Yürütmedeki aksiyonlar" href="/dashboard/actions" empty={data.actions.open.length === 0} emptyText="Açık aksiyon yok.">
          {data.actions.open.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <Dot color={a.status === "in_progress" ? SEV_COLOR.warning : SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{a.title}</span>
              <span className="text-xs text-abys-muted shrink-0">{a.owner}</span>
            </li>
          ))}
        </Block>

        {/* Son ölçülen sonuçlar */}
        <Block title="Son ölçülen sonuçlar" href="/dashboard/memory" empty={data.outcomes.length === 0} emptyText="Henüz sonuç kaydı yok.">
          {data.outcomes.map((o, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Dot color={o.result === "improved" ? SEV_COLOR.healthy : o.result === "worsened" ? SEV_COLOR.critical : SEV_COLOR.info} />
              <span className="flex-1 text-abys-ink">{o.lesson || o.note}</span>
            </li>
          ))}
        </Block>
      </div>
    </section>
  );
}

const RELIABILITY_LABEL: Record<string, string> = {
  verified: "doğrulanmış",
  estimated: "tahmini",
  unknown: "bilinmiyor",
};

function ExecutiveBrief({ brief }: { brief: Brief }) {
  return (
    <div className="mb-6 rounded-xl border border-abys-accent/25 bg-white/70 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] tracking-widest text-abys-accent font-semibold">YÖNETİCİ BRİFİNGİ · EN KRİTİK VAKA</p>
        <span className="text-xs text-abys-muted">Güven %{brief.confidence}</span>
      </div>
      <div className="space-y-2.5 text-sm">
        <BriefLine label="Mevcut durum" value={brief.currentCondition} />
        {brief.businessImpact && <BriefLine label="İş etkisi" value={brief.businessImpact} />}
        {brief.nextDevelopment && <BriefLine label="Aksiyon alınmazsa" value={brief.nextDevelopment} />}
        {brief.recommendedAction && <BriefLine label="Önerilen aksiyon" value={brief.recommendedAction} accent />}
        {brief.confidenceRationale && <BriefLine label="Güven gerekçesi" value={brief.confidenceRationale} muted />}
      </div>
      {brief.topEvidence.length > 0 && (
        <div className="mt-3 pt-3 border-t border-abys-cream-border">
          <p className="text-[11px] text-abys-muted font-semibold mb-1.5">KANIT</p>
          <ul className="space-y-1">
            {brief.topEvidence.map((e, i) => (
              <li key={i} className="text-xs text-abys-ink flex items-start gap-2">
                <span className="text-abys-muted shrink-0">[{RELIABILITY_LABEL[e.reliability] ?? e.reliability}]</span>
                <span>{e.fact}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/dashboard/decisions" className="inline-block mt-3 text-xs text-abys-accent hover:underline">
        Kararı incele ve karar ver →
      </Link>
    </div>
  );
}

function BriefLine({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-abys-muted w-28 shrink-0 pt-0.5">{label}</span>
      <span className={`flex-1 ${accent ? "text-abys-navy font-medium" : muted ? "text-abys-muted text-xs pt-0.5" : "text-abys-ink"}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: string | number; href: string; tone: string }) {
  const color = SEV_COLOR[tone] ?? SEV_COLOR.info;
  return (
    <Link href={href} className="rounded-xl border border-abys-cream-border bg-white/60 px-4 py-3 hover:bg-white transition-colors">
      <p className="font-mono text-2xl" style={{ color }}>{value}</p>
      <p className="text-[11px] text-abys-muted leading-tight mt-1">{label}</p>
    </Link>
  );
}

function Block({ title, href, empty, emptyText, children }: { title: string; href: string; empty: boolean; emptyText: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-abys-navy">{title}</p>
        <Link href={href} className="text-[11px] text-abys-accent hover:underline">tümü →</Link>
      </div>
      {empty ? (
        <p className="text-sm text-abys-muted">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />;
}
