"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { loadProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import { getSector } from "@/lib/sectors";
import { getActiveSignals, SEVERITY_META, type Signal } from "@/lib/signals";
import { listEntities, upsertEntity, newId } from "@/lib/entities";
import type { HandledSignal, SignalStatus, WarRoomNote } from "@/lib/entities";
import type { TaisRisk } from "@/lib/demo/tais/risks";

const STATUS_LABEL: Record<SignalStatus, string> = {
  open: "Açık",
  handled: "Çözüldü",
  snoozed: "Ertelendi",
  escalated: "Yükseltildi",
};

const EVIDENCE_TYPE_LABEL: Record<TaisRisk["evidence"][number]["type"], string> = {
  task: "Görev",
  complaint: "Şikâyet",
  deal: "Satış Fırsatı",
  quality_issue: "Kalite Uygunsuzluğu",
  service_request: "Hizmet Talebi",
  contract: "Sözleşme",
};

/** TaisRisk kaydını mevcut Signal görünümüne çevirir (kanıt kayıtları KAYNAKLAR olarak listelenir). */
function taisRiskToSignal(r: TaisRisk): Signal {
  const context = [r.customerName, r.locationName].filter(Boolean).join(" · ");
  return {
    id: r.id,
    categoryId: r.ruleId,
    categoryLabel: context || r.ruleId,
    severity: r.severity,
    title: r.title,
    sources: r.evidence.map((e) => `${EVIDENCE_TYPE_LABEL[e.type]} kaydı: ${e.id}`),
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
  const [stored] = useStored(() => {
    const p = loadProfile();
    const sector = p ? getSector(p.sectorId) : null;
    const catalog = sector ? getActiveSignals(sector) : [];
    const handled = listEntities<HandledSignal>("handled-signals");
    const map: Record<string, SignalStatus> = {};
    for (const s of catalog) {
      const h = handled.find((x) => x.signalId === s.id);
      map[s.id] = h?.status ?? "open";
    }
    return { profile: p, signals: catalog, statuses: map };
  });
  const localProfile = stored?.profile ?? null;
  const sectorSignals = stored?.signals ?? [];

  // Kurumsal oturum var ama yerel onboarding profili yok (ör. TAIS demo girişi):
  // sektör kataloğu yerine TAIS risk motorunun ürettiği riskler gösterilir
  // (bkz. src/lib/demo/tais/risks.ts — 12 deterministik kural, kanıt kayıtlı).
  const session = useSession();
  const isTais = session?.orgCode === "tais-ikf-demo";
  const profile = session ? null : localProfile;
  const [taisRisks, setTaisRisks] = useState<TaisRisk[] | null>(null);
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

  const signals = isTais ? (taisRisks ?? []).map(taisRiskToSignal) : profile ? sectorSignals : [];
  const [statusOverrides, setStatusOverrides] = useState<Record<string, SignalStatus>>({});
  const taisStatuses = Object.fromEntries((taisRisks ?? []).map((risk) => [risk.id, risk.status]));
  const statuses = isTais ? taisStatuses : { ...(stored?.statuses ?? {}), ...statusOverrides };
  const [expanded, setExpanded] = useState<string | null>(null);

  if (session === undefined) return null;

  function setStatus(signalId: string, status: SignalStatus) {
    if (isTais) return;
    upsertEntity<HandledSignal>("handled-signals", {
      id: signalId,
      createdAt: new Date().toISOString(),
      signalId,
      status,
    });
    setStatusOverrides((s) => ({ ...s, [signalId]: status }));
  }

  return (
    <div>
      <PageHeader
        eyebrow="ALERTS"
        title="Aktif"
        accent="sinyaller."
        desc="Sektörünüze özel risk sinyalleri. Bir sinyali açarak kaynaklarını görebilir, durumunu değiştirebilir ve War Room'da not bırakabilirsiniz."
      />

      <div className="px-10 pb-16 max-w-2xl space-y-3">
        {isTais && taisRisks === null && <p className="text-sm text-abys-muted">TAIS risk kayıtları yükleniyor…</p>}
        {signals.length === 0 && !(isTais && taisRisks === null) && <p className="text-sm text-abys-muted">Sinyal bulunamadı.</p>}
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
                  {meta.label}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-abys-ink font-medium">{s.title}</p>
                  <p className="text-xs text-abys-muted mt-0.5">
                    {s.categoryLabel} · {STATUS_LABEL[status]}
                    {s.isReal && <span className="text-abys-accent"> · TAIS demo kaydı</span>}
                  </p>
                </div>
                <span className="text-abys-muted text-sm">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-abys-ink/10 pt-4">
                   {s.recommendedAction && (
                    <>
                      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">ÖNERİLEN AKSİYON</p>
                      <p className="text-sm text-abys-ink mb-4">{s.recommendedAction}</p>
                    </>
                   )}
                  {(s.serviceType || s.customerName || s.locationName || s.rootCause || s.expectedImpact || s.confidence !== undefined || s.dataAsOf) && (
                    <div className="space-y-1 mb-4 text-sm text-abys-ink">
                      {s.serviceType && <p><span className="text-abys-muted">Hizmet türü: </span>{s.serviceType}</p>}
                      {s.customerName && <p><span className="text-abys-muted">Müşteri: </span>{s.customerName}</p>}
                      {s.locationName && <p><span className="text-abys-muted">Lokasyon: </span>{s.locationName}</p>}
                      {s.rootCause && <p><span className="text-abys-muted">Kök neden: </span>{s.rootCause}</p>}
                      {s.expectedImpact && <p><span className="text-abys-muted">Beklenen etki: </span>{s.expectedImpact}</p>}
                      {s.confidence !== undefined && <p><span className="text-abys-muted">Güven seviyesi: </span>%{s.confidence}</p>}
                      {s.dataAsOf && <p><span className="text-abys-muted">Veri güncelliği: </span>{new Date(s.dataAsOf).toLocaleString("tr-TR")}</p>}
                    </div>
                  )}
                   <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">KAYNAKLAR</p>
                  <ul className="text-sm text-abys-ink mb-4 list-disc list-inside">
                    {s.sources.map((src) => (
                      <li key={src}>{src}</li>
                    ))}
                  </ul>

                  {isTais ? (
                    <p className="text-xs text-abys-muted mb-5">
                      Durum merkezi TAIS risk motorundan gelir; bu hesaplanan bulgu halen açıktır.
                    </p>
                  ) : (
                    <div className="flex gap-2 mb-5">
                      <StatusButton current={status} target="handled" onClick={() => setStatus(s.id, "handled")} />
                      <StatusButton current={status} target="snoozed" onClick={() => setStatus(s.id, "snoozed")} />
                      <StatusButton current={status} target="escalated" onClick={() => setStatus(s.id, "escalated")} />
                      {status !== "open" && (
                        <StatusButton current={status} target="open" onClick={() => setStatus(s.id, "open")} />
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
      {STATUS_LABEL[target]}
    </button>
  );
}

function WarRoom({ signalId }: { signalId: string }) {
  const [stored, refreshNotes] = useStored(() => ({
    notes: listEntities<WarRoomNote>("war-room-notes").filter((n) => n.signalId === signalId),
  }));
  const notes = stored?.notes ?? [];
  const [text, setText] = useState("");

  // Farklı sinyale geçilirse notları yeniden oku
  useEffect(() => {
    refreshNotes();
  }, [signalId, refreshNotes]);

  function add() {
    if (!text.trim()) return;
    const note: WarRoomNote = {
      id: newId(),
      createdAt: new Date().toISOString(),
      signalId,
      author: "Siz",
      text: text.trim(),
    };
    upsertEntity("war-room-notes", note);
    refreshNotes();
    setText("");
  }

  return (
    <div>
      <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">WAR ROOM</p>
      {notes.length === 0 && <p className="text-xs text-abys-muted mb-3">Henüz not yok.</p>}
      <div className="space-y-2 mb-3">
        {notes.map((n) => (
          <div key={n.id} className="text-sm bg-white/60 rounded-lg px-3 py-2">
            <span className="font-medium text-abys-navy">{n.author}: </span>
            <span className="text-abys-ink">{n.text}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Not ekle..."
          className="flex-1 text-sm rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
        />
        <button onClick={add} className="text-sm rounded-lg bg-abys-navy text-white px-3 py-2">
          Gönder
        </button>
      </div>
    </div>
  );
}
