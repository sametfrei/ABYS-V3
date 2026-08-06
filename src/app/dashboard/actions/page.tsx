"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useSession } from "@/lib/use-session";

/**
 * Aksiyon Merkezi (Faz 3): kararlardan doğan hesap verebilir aksiyonlar.
 * ABYS genel görev yöneticisi DEĞİLDİR — her aksiyon bir karara/vakaya bağlı
 * kalır. Yönetici ilerlemeyi günceller, tamamlanınca gerçekleşen sonucu ve
 * kurumsal dersi kaydeder (döngü: Karar → Aksiyon → Sonuç → Ders).
 */

interface ActionRow {
  id: string;
  decision_id: string;
  case_id: string;
  title: string;
  owner: string;
  due_at: string | null;
  status: string;
  progress_note: string | null;
  related_risk_id: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Açık", color: "var(--abys-muted, #8a8578)" },
  in_progress: { label: "Yürütülüyor", color: "var(--abys-warning)" },
  done: { label: "Tamamlandı", color: "var(--abys-healthy)" },
  cancelled: { label: "İptal", color: "var(--abys-critical)" },
};

export default function ActionsPage() {
  const session = useSession();
  const [actions, setActions] = useState<ActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (session === undefined) return;
    let cancelled = false;
    fetch("/api/actions")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setError("Bu sayfa kurumsal oturum gerektirir. Lütfen giriş yapın.");
          setActions([]);
          return;
        }
        if (!res.ok) {
          setError("Aksiyonlar yüklenemedi.");
          setActions([]);
          return;
        }
        setError(null);
        setActions((await res.json()).actions);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Aksiyonlar yüklenemedi.");
          setActions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, reloadKey]);

  return (
    <div>
      <PageHeader
        eyebrow="AKSİYONLAR"
        title="Kararların"
        accent="yürütülmesi."
        desc="Her aksiyon bir karara bağlıdır. İlerlemeyi güncelleyin, tamamlanınca gerçekleşen sonucu ve dersi kaydedin."
      />
      <div className="px-10 pb-16 max-w-3xl">
        {error && (
          <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3 mb-4">{error}</p>
        )}
        {actions === null && <p className="text-sm text-abys-muted">Yükleniyor…</p>}
        {actions !== null && actions.length === 0 && !error && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-8 text-center">
            <p className="text-sm text-abys-muted">
              Henüz aksiyon yok. Karar Merkezi&rsquo;nde bir öneriyi kabul edin —
              onaylanan karar burada hesap verebilir bir aksiyona dönüşür.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {actions?.map((a) => (
            <ActionCard key={a.id} action={a} onChanged={load} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ action, onChanged }: { action: ActionRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(action.progress_note ?? "");
  const [showOutcome, setShowOutcome] = useState(false);
  const meta = STATUS_META[action.status] ?? STATUS_META.open;

  async function patch(status?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, status, progressNote: note || undefined }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Aksiyon güncellenemedi.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksiyon güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-abys-navy">{action.title}</p>
        <span
          className="text-[11px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
          style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
        >
          {meta.label}
        </span>
      </div>
      <p className="text-xs text-abys-muted mb-3">
        Sorumlu: {action.owner} · Son tarih: {action.due_at ? new Date(action.due_at).toLocaleDateString("tr-TR") : "belirlenmedi"} · Köken karar: <span className="font-mono">{action.decision_id.slice(0, 8)}</span>
      </p>
      <p className="text-[11px] text-abys-muted mb-3">
        İlgili risk: <span className="font-mono">{action.related_risk_id ? action.related_risk_id : "risk referansı yok"}</span>
      </p>
      {error && <p className="text-xs text-abys-critical mb-3">{error}</p>}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="İlerleme notu…"
        className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-abys-accent"
      />

      <div className="flex flex-wrap gap-2">
        {action.status !== "in_progress" && action.status !== "done" && (
          <button onClick={() => patch("in_progress")} disabled={busy} className="text-xs rounded-full bg-abys-navy text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            Yürütmeye al
          </button>
        )}
        {action.status !== "done" && (
          <button onClick={() => patch("done")} disabled={busy} className="text-xs rounded-full bg-abys-healthy text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            Tamamlandı işaretle
          </button>
        )}
        <button onClick={() => patch()} disabled={busy} className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 hover:bg-white/60 disabled:opacity-50">
          Notu kaydet
        </button>
        {action.status === "done" && (
          <button onClick={() => setShowOutcome((v) => !v)} className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1.5 hover:bg-abys-accent-soft">
            {showOutcome ? "Sonuç formunu kapat" : "Sonuç & ders kaydet"}
          </button>
        )}
      </div>

      {showOutcome && <OutcomeForm decisionId={action.decision_id} onDone={() => { setShowOutcome(false); onChanged(); }} />}
    </div>
  );
}

function OutcomeForm({ decisionId, onDone }: { decisionId: string; onDone: () => void }) {
  const [result, setResult] = useState<"improved" | "unchanged" | "worsened">("improved");
  const [outNote, setOutNote] = useState("");
  const [lesson, setLesson] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!outNote.trim()) {
      setErr("Sonuç açıklaması gerekli.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/outcomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId, result, note: outNote, lesson: lesson || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => null))?.error ?? "Sonuç kaydedilemedi.");
      return;
    }
    onDone();
  }

  return (
    <div className="mt-4 pt-4 border-t border-abys-cream-border space-y-2">
      <p className="text-xs font-semibold text-abys-muted">GERÇEKLEŞEN SONUÇ</p>
      <div className="flex gap-2">
        {(["improved", "unchanged", "worsened"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setResult(r)}
            className={`text-xs rounded-full px-3 py-1.5 border ${result === r ? "bg-abys-navy text-white border-abys-navy" : "border-abys-ink/15 hover:bg-white/60"}`}
          >
            {r === "improved" ? "İyileşti" : r === "unchanged" ? "Değişmedi" : "Kötüleşti"}
          </button>
        ))}
      </div>
      <textarea value={outNote} onChange={(e) => setOutNote(e.target.value)} rows={2} placeholder="Ne oldu? (ör. rötar 34 dk yerine 12 dk)" className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent" />
      <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} rows={2} placeholder="Kurumsal ders (opsiyonel — sonraki analizlere beslenir)" className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent" />
      {err && <p className="text-xs text-abys-critical">{err}</p>}
      <button onClick={save} disabled={busy} className="text-xs rounded-full bg-abys-accent text-white px-4 py-1.5 hover:opacity-90 disabled:opacity-50">
        {busy ? "Kaydediliyor…" : "Sonucu ve dersi kaydet"}
      </button>
    </div>
  );
}
