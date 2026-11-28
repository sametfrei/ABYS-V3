"use client";

import { useEffect, useState } from "react";
import { hasPermission } from "@/lib/auth/permissions";
import { useSession } from "@/lib/use-session";

interface Evidence {
  source: string;
  summary: string;
  reliability: "high" | "medium" | "low";
}

interface Brief {
  headline: string;
  whyItMatters: string;
  whatNext: string;
  recommendation: { label: string; rationale: string; expected: string | null } | null;
  confidence: number;
  confidenceRationale: string[];
  evidence: Evidence[];
  context: Evidence[];
  caveats: string[];
}

interface Payload {
  brief: Brief;
  sources: {
    metricLabel: string | null;
    forecastUsed: boolean;
    anomalyCount: number;
    causalCount: number;
    outcomeCount: number;
    externalContextCount: number;
    caseSignalCount: number;
    openSignalCount: number;
    openSignalScope?: "organization";
    caseSignalScope?: "case";
    outcomeScope?: "case";
  };
}

interface SignalOption {
  id: string;
  title: string;
  severity: string;
}

interface ExternalContextOption {
  id: string;
  provider: string;
  sourceName: string;
  topic: string;
  geography: string;
  summary: string;
  publishedAt: string;
  observedAt: string;
  retrievedAt: string;
  relevanceScore: number;
  confidence: number;
  licenseId: string;
  attributionText: string;
  sourceObservationUri: string;
  reviewStatus: "candidate" | "accepted" | "rejected";
}

const RELIABILITY_LABEL: Record<string, string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const SOURCE_LABEL: Record<string, string> = {
  vaka: "Vaka kanıtı",
  sinyal: "Vaka sinyali",
  bağlam: "Kurum bağlamı",
  tahmin: "Tahmin",
  anomali: "Anomali",
  nedensel: "Nedensel bağ",
  sonuç: "Geçmiş sonuç",
  external_context: "Dış bağlam",
};

/**
 * Karar Zekâsı paneli — `/api/decision-cases/[id]/intelligence` çıktısını
 * gösterir. Veri yoksa panel boş durum metni gösterir; sahte içerik üretmez.
 */
export function DecisionIntelligencePanel({ caseId }: { caseId: string }) {
  const session = useSession();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalOption[]>([]);
  const [acceptedExternal, setAcceptedExternal] = useState<ExternalContextOption[]>([]);
  const [candidateExternal, setCandidateExternal] = useState<ExternalContextOption[]>([]);
  const [linkedExternalIds, setLinkedExternalIds] = useState<string[]>([]);
  const [externalActionError, setExternalActionError] = useState<string | null>(null);
  const [selectedSignal, setSelectedSignal] = useState("");
  const [reason, setReason] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, signalRes, acceptedRes, candidateRes, linkedRes] = await Promise.all([
          fetch(`/api/decision-cases/${caseId}/intelligence`, { cache: "no-store" }),
          fetch("/api/signals", { cache: "no-store" }),
          fetch("/api/external-context?status=accepted&limit=20", { cache: "no-store" }),
          fetch("/api/external-context?status=candidate&limit=20", { cache: "no-store" }),
          fetch(`/api/decision-cases/${caseId}/external-context`, { cache: "no-store" }),
        ]);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Karar zekâsı yüklenemedi (HTTP ${res.status}).`);
        if (!cancelled) {
          setData(body as Payload);
          setError(null);
          if (signalRes.ok) {
            const signalBody = (await signalRes.json()) as { signals?: SignalOption[] };
            setSignals(Array.isArray(signalBody.signals) ? signalBody.signals : []);
          }
          if (acceptedRes.ok) {
            const externalBody = (await acceptedRes.json()) as { observations?: ExternalContextOption[] };
            setAcceptedExternal(Array.isArray(externalBody.observations) ? externalBody.observations : []);
          }
          if (candidateRes.ok) {
            const candidateBody = (await candidateRes.json()) as { observations?: ExternalContextOption[] };
            setCandidateExternal(Array.isArray(candidateBody.observations) ? candidateBody.observations : []);
          }
          if (linkedRes.ok) {
            const linkedBody = (await linkedRes.json()) as { observations?: ExternalContextOption[] };
            setLinkedExternalIds((linkedBody.observations ?? []).map((item) => item.id));
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Karar zekâsı yüklenemedi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, reloadKey]);

  async function linkSignal() {
    if (!selectedSignal || reason.trim().length < 3) {
      setLinkError("Bir sinyal seçin ve en az 3 karakterlik gerekçe yazın.");
      return;
    }
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/decision-cases/${caseId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: selectedSignal, reason: reason.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sinyal bağlanamadı.");
      setSelectedSignal("");
      setReason("");
      setReloadKey((key) => key + 1);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Sinyal bağlanamadı.");
    } finally {
      setLinking(false);
    }
  }

  async function reviewExternalContext(observationId: string, decision: "accepted" | "rejected") {
    setExternalActionError(null);
    try {
      const response = await fetch(`/api/external-context/${observationId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Dış bağlam incelemesi başarısız.");
      setReloadKey((key) => key + 1);
    } catch (err) {
      setExternalActionError(err instanceof Error ? err.message : "Dış bağlam incelemesi başarısız.");
    }
  }

  async function linkExternalContext(observationId: string) {
    setExternalActionError(null);
    try {
      const response = await fetch(`/api/decision-cases/${caseId}/external-context`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observationId, reason: "İnsan tarafından kabul edilmiş dış bağlam gözlemi; karar vakasına açıkça bağlandı." }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Dış bağlam vakaya bağlanamadı.");
      setReloadKey((key) => key + 1);
    } catch (err) {
      setExternalActionError(err instanceof Error ? err.message : "Dış bağlam vakaya bağlanamadı.");
    }
  }

  if (error) {
    return (
      <p role="alert" className="text-xs" style={{ color: "var(--abys-critical)" }}>
        {error}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-abys-muted">Karar zekâsı hesaplanıyor…</p>;
  }

  const { brief, sources } = data;
  const canLinkSignal = session ? hasPermission(session.role, "record_decision") : false;
  const canReviewExternal = session ? hasPermission(session.role, "approve_external_context") : false;
  const unlinkedAcceptedExternal = acceptedExternal.filter((item) => !linkedExternalIds.includes(item.id));
  const confidenceColor =
    brief.confidence >= 75
      ? "var(--abys-healthy)"
      : brief.confidence >= 50
        ? "var(--abys-warning)"
        : "var(--abys-critical)";

  return (
    <div className="rounded-xl border border-abys-accent/25 bg-white/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs tracking-widest text-abys-accent font-semibold">KARAR ZEKÂSI — KANIT ÖZETİ</p>
        <span
          className="text-[11px] font-semibold rounded-full px-2 py-0.5"
          style={{ color: confidenceColor, background: "rgba(255,255,255,0.7)" }}
        >
          Güven %{brief.confidence}
        </span>
      </div>

      <p className="text-sm font-medium text-abys-ink">{brief.headline}</p>
      <p className="text-sm text-abys-ink mt-1">{brief.whyItMatters}</p>
      <p className="text-sm text-abys-muted mt-1">{brief.whatNext}</p>

      {brief.recommendation && (
        <div className="mt-3 rounded-lg bg-abys-cream px-3 py-2">
          <p className="text-[11px] tracking-widest text-abys-muted font-semibold">ÖNERİLEN AKSİYON</p>
          <p className="text-sm text-abys-navy font-medium">{brief.recommendation.label}</p>
          <p className="text-xs text-abys-muted mt-0.5">{brief.recommendation.rationale}</p>
          {brief.recommendation.expected && (
            <p className="text-xs text-abys-ink mt-1">Beklenen: {brief.recommendation.expected}</p>
          )}
        </div>
      )}

      <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">KANITLAR</p>
      <ul className="space-y-1 list-none p-0 m-0">
        {brief.evidence.length === 0 ? (
          <li className="text-xs text-abys-muted">Kayıtlı kanıt yok.</li>
        ) : (
          brief.evidence.map((e, i) => (
            <li key={i} className="text-xs text-abys-ink flex flex-wrap gap-1.5">
              <span className="text-abys-muted">[{SOURCE_LABEL[e.source] ?? e.source}]</span>
              <span className="flex-1">{e.summary}</span>
              <span className="text-[10px] rounded-full bg-abys-cream px-1.5 py-0.5 text-abys-muted">
                {RELIABILITY_LABEL[e.reliability] ?? e.reliability}
              </span>
            </li>
          ))
        )}
      </ul>

      {brief.context.length > 0 && (
        <>
          <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">KURUM BAĞLAMI</p>
          <ul className="space-y-1 list-none p-0 m-0">
            {brief.context.map((e, i) => (
              <li key={i} className="text-xs text-abys-muted flex flex-wrap gap-1.5">
                <span>[{SOURCE_LABEL[e.source] ?? e.source}]</span>
                <span className="flex-1">{e.summary}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(canReviewExternal && candidateExternal.length > 0 || canLinkSignal && unlinkedAcceptedExternal.length > 0) && (
        <div className="mt-4 rounded-lg border border-abys-cream-border bg-abys-cream/70 px-3 py-2 space-y-3">
          <div>
            <p className="text-[11px] tracking-widest text-abys-muted font-semibold">DIŞ BAĞLAM — KAYNAK VE LİSANS İZİ</p>
            <p className="text-[11px] text-abys-muted">Dış gözlemler iç KPI/muhasebe verisinden ayrı tutulur. Önce insan incelemesi, sonra vakaya açık bağlantı gerekir.</p>
          </div>
          {externalActionError && <p role="alert" className="text-[11px]" style={{ color: "var(--abys-critical)" }}>{externalActionError}</p>}
          {canReviewExternal && candidateExternal.map((item) => (
            <div key={item.id} className="border-t border-abys-ink/10 pt-2">
              <p className="text-xs font-medium text-abys-ink">{item.sourceName} · {item.topic} / {item.geography}</p>
              <p className="text-xs text-abys-muted">{item.summary}</p>
              <p className="text-[10px] text-abys-muted">Yayın: {new Date(item.publishedAt).toLocaleString("tr-TR")} · Gözlem: {new Date(item.observedAt).toLocaleString("tr-TR")} · Lisans: {item.licenseId} · İlgi: {Math.round(item.relevanceScore * 100)}%</p>
              <p className="text-[10px] text-abys-muted">{item.attributionText} · <a href={item.sourceObservationUri} target="_blank" rel="noreferrer" className="underline">Kaynak</a></p>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => void reviewExternalContext(item.id, "accepted")} className="text-[10px] rounded-full border px-2 py-0.5">Kabul et</button>
                <button type="button" onClick={() => void reviewExternalContext(item.id, "rejected")} className="text-[10px] rounded-full border px-2 py-0.5">Reddet</button>
              </div>
            </div>
          ))}
          {canLinkSignal && unlinkedAcceptedExternal.map((item) => (
            <div key={item.id} className="border-t border-abys-ink/10 pt-2">
              <p className="text-xs font-medium text-abys-ink">{item.sourceName} · {item.topic} / {item.geography}</p>
              <p className="text-xs text-abys-muted">{item.summary}</p>
              <p className="text-[10px] text-abys-muted">Yayın: {new Date(item.publishedAt).toLocaleString("tr-TR")} · Gözlem: {new Date(item.observedAt).toLocaleString("tr-TR")} · Alınma: {new Date(item.retrievedAt).toLocaleString("tr-TR")}</p>
              <p className="text-[10px] text-abys-muted">Lisans: {item.licenseId} · {item.attributionText} · <a href={item.sourceObservationUri} target="_blank" rel="noreferrer" className="underline">Kaynak</a></p>
              <button type="button" onClick={() => void linkExternalContext(item.id)} className="mt-1 text-[10px] rounded-full border border-abys-accent/40 text-abys-accent px-2.5 py-0.5">Bu vakaya bağla</button>
            </div>
          ))}
        </div>
      )}

      {canLinkSignal && signals.length > 0 && (
        <div className="mt-4 rounded-lg border border-abys-cream-border bg-abys-cream/70 px-3 py-2">
          <p className="text-[11px] tracking-widest text-abys-muted font-semibold">KANIT SİNYALİ BAĞLA</p>
          <div className="mt-2 grid gap-2">
            <select
              value={selectedSignal}
              onChange={(event) => setSelectedSignal(event.target.value)}
              className="text-xs rounded-md border border-abys-cream-border bg-white px-2 py-1.5 text-abys-ink"
            >
              <option value="">Sinyal seçin…</option>
              {signals.map((signal) => (
                <option key={signal.id} value={signal.id}>
                  {signal.title} · {signal.severity}
                </option>
              ))}
            </select>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="Bu sinyal neden bu vakaya ait?"
              className="text-xs rounded-md border border-abys-cream-border bg-white px-2 py-1.5 text-abys-ink"
            />
            {linkError && (
              <p role="alert" className="text-[11px]" style={{ color: "var(--abys-critical)" }}>
                {linkError}
              </p>
            )}
            <button
              type="button"
              onClick={linkSignal}
              disabled={linking}
              className="justify-self-start text-[11px] rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft disabled:opacity-50"
            >
              {linking ? "Bağlanıyor…" : "Kanıt olarak bağla"}
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">GÜVEN GEREKÇESİ</p>
      <ul className="space-y-0.5 list-none p-0 m-0">
        {brief.confidenceRationale.map((r, i) => (
          <li key={i} className="text-xs text-abys-muted">
            • {r}
          </li>
        ))}
      </ul>

      <p className="text-[11px] tracking-widest text-abys-muted font-semibold mt-4 mb-1">SINIRLAR</p>
      <ul className="space-y-0.5 list-none p-0 m-0">
        {brief.caveats.map((c, i) => (
          <li key={i} className="text-xs text-abys-muted">
            • {c}
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-abys-muted mt-3">
        Kaynaklar: {sources.caseSignalCount} vakaya bağlı sinyal · {sources.openSignalCount} kurum bağlamı sinyali ·{" "}
        {sources.forecastUsed ? "tahmin var" : "tahmin yok"} · {sources.anomalyCount} anomali ·{" "}
        {sources.causalCount} nedensel bağ · {sources.outcomeCount} vakaya bağlı sonuç · {sources.externalContextCount} lisanslı dış bağlam gözlemi
      </p>
    </div>
  );
}
