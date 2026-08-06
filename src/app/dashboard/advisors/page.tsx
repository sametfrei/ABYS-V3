"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useSession } from "@/lib/use-session";

interface AdvisorMetrics {
  advisorRef: string;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  spanMinutes: number;
  activeMinutes: number;
  gapMinutes: number;
  unknownMinutes: number | null;
  /** @deprecated gapMinutes kullanın */
  idleMinutes: number;
  avgFirstResponseMinutes: number | null;
  avgNoteAfterCallMinutes: number | null;
  avgSaleCycleMinutes: number | null;
  abandonedCount: number;
  counts: Record<string, number>;
  idleThresholdMinutes: number;
}

interface TimelineEntry {
  at: string;
  eventType: string;
  subjectRef: string | null;
  gapMinutesBefore: number | null;
  isIdleGap: boolean;
}

function formatMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return `${h} sa ${rem} dk`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdvisorsPage() {
  const session = useSession();
  const [advisors, setAdvisors] = useState<AdvisorMetrics[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/integration/advisors")
      .then(async (r) => {
        if (cancelled) return;
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Danışman verileri alınamadı.");
          return;
        }
        setError(null);
        setAdvisors(j.advisors ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Danışman verileri alınamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  function openTimeline(advisorRef: string) {
    setSelected(advisorRef);
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(true);
    fetch(`/api/integration/advisors?timeline=1&advisor=${encodeURIComponent(advisorRef)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) {
          setTimelineError(j.error ?? "Zaman çizelgesi alınamadı.");
          return;
        }
        setTimeline(j.timeline ?? []);
      })
      .catch(() => setTimelineError("Zaman çizelgesi alınamadı."))
      .finally(() => setTimelineLoading(false));
  }

  return (
    <div>
      <PageHeader
        eyebrow="ADVISOR ANALYTICS"
        title="Danışman"
        accent="performans metrikleri."
        desc="Portal iş olaylarından deterministik hesaplanan aktif/boşta süreleri, müdahale hızı ve satış döngüsü."
      />

      <div className="px-10 pb-16">
        {session === null && (
          <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3 mb-6 max-w-xl">
            Bu sayfa kurumsal oturum gerektirir.
          </p>
        )}

        {session && error && (
          <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3 mb-6 max-w-xl">
            {error}
          </p>
        )}

        {session && !error && advisors === null && <p className="text-sm text-abys-muted">Yükleniyor…</p>}

        {session && !error && advisors !== null && advisors.length === 0 && (
          <p className="text-sm text-abys-muted max-w-xl">
            Portal entegrasyonu bağlandığında burada danışman metrikleri görünecek.
          </p>
        )}

        {session && !error && advisors !== null && advisors.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {advisors.map((a) => (
              <AdvisorCard key={a.advisorRef} metrics={a} onOpenTimeline={() => openTimeline(a.advisorRef)} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <TimelineModal
          advisorRef={selected}
          entries={timeline}
          loading={timelineLoading}
          error={timelineError}
          onClose={() => {
            setSelected(null);
            setTimeline(null);
            setTimelineError(null);
          }}
        />
      )}
    </div>
  );
}

function AdvisorCard({ metrics, onOpenTimeline }: { metrics: AdvisorMetrics; onOpenTimeline: () => void }) {
  const known = metrics.activeMinutes + metrics.gapMinutes;
  const activePct = known > 0 ? Math.round((metrics.activeMinutes / known) * 100) : 0;

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-abys-navy">{metrics.advisorRef}</p>
        <button
          onClick={onOpenTimeline}
          className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 hover:bg-white/60 transition-colors"
        >
          Zaman çizelgesi →
        </button>
      </div>

      <div className="mb-1">
        <div className="flex justify-between text-[11px] text-abys-muted mb-1">
          <span>Aktif {activePct}%</span>
          <span>Olay boşluğu {100 - activePct}%</span>
        </div>
        <div className="h-2 rounded-full bg-abys-ink/10 overflow-hidden flex">
          <div className="h-full bg-abys-healthy" style={{ width: `${activePct}%` }} />
          <div className="h-full bg-abys-ink/20" style={{ width: `${100 - activePct}%` }} />
        </div>
      </div>
      <p className="text-[11px] text-abys-muted/70 mb-3">
        {metrics.unknownMinutes === null
          ? "Bilinmeyen süre: bu danışman için oturum verisi yok, ayrım yapılamıyor."
          : `Bilinmeyen süre (oturum dışı): ${formatMinutes(metrics.unknownMinutes)}`}
      </p>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="İlk müdahale" value={formatMinutes(metrics.avgFirstResponseMinutes)} />
        <Metric label="Not girme süresi" value={formatMinutes(metrics.avgNoteAfterCallMinutes)} />
        <Metric label="Satış döngüsü" value={formatMinutes(metrics.avgSaleCycleMinutes)} />
        <Metric
          label="Yarım bırakılan"
          value={String(metrics.abandonedCount)}
          warn={metrics.abandonedCount > 0}
        />
      </div>

      <p className="text-[11px] text-abys-muted mt-3">
        {metrics.eventCount} olay · olay boşluğu eşiği {metrics.idleThresholdMinutes} dk
      </p>
      <p className="text-[11px] text-abys-muted/70 mt-1">
        Bu metrikler iş olayı zaman damgalarından türetilir; portal dışı çalışmayı ölçmez.
      </p>
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-abys-muted mb-0.5">{label}</p>
      <p className={`font-medium ${warn ? "text-abys-warning" : "text-abys-navy"}`}>{value}</p>
    </div>
  );
}

function TimelineModal({
  advisorRef,
  entries,
  loading,
  error,
  onClose,
}: {
  advisorRef: string;
  entries: TimelineEntry[] | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-abys-ink/40 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-abys-navy">{advisorRef} — zaman çizelgesi</p>
          <button onClick={onClose} className="text-xs text-abys-muted hover:text-abys-ink">
            kapat ✕
          </button>
        </div>

        {loading && <p className="text-sm text-abys-muted">Yükleniyor…</p>}
        {error && <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{error}</p>}
        {!loading && !error && entries !== null && entries.length === 0 && (
          <p className="text-sm text-abys-muted">Bu aralıkta olay bulunamadı.</p>
        )}
        {!loading && !error && entries !== null && entries.length > 0 && (
          <div className="space-y-1.5">
            {entries.map((e, i) => (
              <div key={i}>
                {e.isIdleGap && e.gapMinutesBefore !== null && (
                  <div className="text-[11px] text-abys-muted bg-abys-ink/5 rounded-lg px-3 py-1.5 my-1.5">
                    ⋯ {e.gapMinutesBefore} dk olay boşluğu
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-abys-muted text-xs font-mono w-24 shrink-0">{formatTime(e.at)}</span>
                  <span className="text-abys-navy font-medium">{e.eventType}</span>
                  {e.subjectRef && <span className="text-abys-muted text-xs">· {e.subjectRef}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
