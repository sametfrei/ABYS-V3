"use client";

import { useCallback, useEffect, useState } from "react";
import { ExecutionAttemptStatus } from "@/components/ExecutionAttemptStatus";
import { PageHeader } from "@/components/PageHeader";
import { overdueDays } from "@/lib/action-deadline";
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
  decision_state: string;
  event_count: number;
  last_event_at: string | null;
  last_event_by: string | null;
  created_at: string;
}

interface ExecutionIntent {
  id: string;
  action_id: string;
  idempotency_key: string;
  mode: "manual" | "system";
  target_system: string | null;
  summary: string;
  status: "prepared" | "approved" | "cancelled";
  prepared_by_name: string;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Açık", color: "var(--abys-muted, #8a8578)" },
  in_progress: { label: "Yürütülüyor", color: "var(--abys-warning)" },
  done: { label: "Tamamlandı", color: "var(--abys-healthy)" },
  cancelled: { label: "İptal", color: "var(--abys-critical)" },
};

const DECISION_STATE_LABEL: Record<string, string> = {
  draft: "Taslak",
  under_review: "İnceleniyor",
  awaiting_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  in_execution: "Yürütmede",
  completed: "Tamamlandı",
  outcome_review: "Sonuç incelemesi",
  closed: "Kapandı",
};

interface ActionSummaryCounts {
  open: number;
  in_progress: number;
  done: number;
  cancelled: number;
}

function summarizeActions(actions: ActionRow[]): ActionSummaryCounts {
  const counts: ActionSummaryCounts = { open: 0, in_progress: 0, done: 0, cancelled: 0 };
  for (const action of actions) {
    if (action.status === "open") counts.open += 1;
    else if (action.status === "in_progress") counts.in_progress += 1;
    else if (action.status === "done") counts.done += 1;
    else if (action.status === "cancelled") counts.cancelled += 1;
  }
  return counts;
}

function newIntentKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

  const summary = actions === null ? null : summarizeActions(actions);

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
        {actions !== null && actions.length > 0 && summary && <ActionSummary counts={summary} />}
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

function ActionSummary({ counts }: { counts: ActionSummaryCounts }) {
  const activeCount = counts.open + counts.in_progress;
  const items = [
    { key: "open", label: "Açık", hint: "Henüz başlamadı", value: counts.open },
    { key: "in_progress", label: "Yürütülüyor", hint: "Devam ediyor", value: counts.in_progress },
    { key: "done", label: "Tamamlandı", hint: "Tamamlanan iş", value: counts.done },
    { key: "cancelled", label: "İptal", hint: "İptal edilen iş", value: counts.cancelled },
  ];

  return (
    <section aria-labelledby="action-summary-heading" className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 id="action-summary-heading" className="text-xs font-semibold tracking-widest text-abys-muted uppercase">
          Yönetici özeti
        </h2>
        <p className="text-xs text-abys-muted">
          Açık iş: <span className="font-semibold text-abys-navy">{activeCount}</span>
          {" "}· Tamamlanan iş: <span className="font-semibold text-abys-healthy">{counts.done}</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 m-0">
        {items.map((item) => (
          <div key={item.key} className="rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3">
            <dt className="text-[11px] tracking-wide text-abys-muted uppercase">{item.label}</dt>
            <dd className="font-serif text-2xl text-abys-navy m-0" aria-label={`${item.label}: ${item.value}`}>
              {item.value}
            </dd>
            <p className="text-[11px] text-abys-muted m-0">{item.hint}</p>
          </div>
        ))}
      </dl>
      <p className="sr-only">
        Açık iş, açık ve yürütülmekte olan aksiyonların toplamıdır; tamamlanan iş yalnızca tamamlandı durumundaki aksiyonları kapsar.
      </p>
    </section>
  );
}

function ActionCard({ action, onChanged }: { action: ActionRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(action.progress_note ?? "");
  const [showOutcome, setShowOutcome] = useState(false);
  const [showExecution, setShowExecution] = useState(false);
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
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; decisionState?: string }
          | null;
        const stateSuffix = payload?.decisionState
          ? ` Karar durumu: ${DECISION_STATE_LABEL[payload.decisionState] ?? payload.decisionState}.`
          : "";
        throw new Error((payload?.error ?? "Aksiyon güncellenemedi.") + stateSuffix);
      }
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
      {overdueDays(action.due_at, action.status) !== null && (
        <p
          className="text-[11px] font-semibold mb-2 rounded-full inline-block px-2 py-0.5"
          style={{ color: "var(--abys-critical)", backgroundColor: "var(--abys-critical-soft)" }}
        >
          Vadesi geçti · {overdueDays(action.due_at, action.status)} gün
        </p>
      )}
      <p className="text-xs text-abys-muted mb-3">
        Karar durumu: {DECISION_STATE_LABEL[action.decision_state] ?? action.decision_state} ·{" "}
        {action.event_count} yürütme olayı
        {action.last_event_at && (
          <>
            {" "}· Son olay: {action.last_event_by} / {new Date(action.last_event_at).toLocaleString("tr-TR")}
          </>
        )}
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
        {action.status === "open" && (
          <button onClick={() => patch("in_progress")} disabled={busy} className="text-xs rounded-full bg-abys-navy text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            Yürütmeye al
          </button>
        )}
        {action.status === "in_progress" && (
          <button onClick={() => patch("done")} disabled={busy} className="text-xs rounded-full bg-abys-healthy text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            Tamamlandı işaretle
          </button>
        )}
        {(action.status === "open" || action.status === "in_progress") && (
          <button onClick={() => patch("cancelled")} disabled={busy} className="text-xs rounded-full border border-abys-critical/30 text-abys-critical px-3 py-1.5 hover:bg-abys-critical-soft disabled:opacity-50">
            İptal et
          </button>
        )}
        <button onClick={() => patch(action.status)} disabled={busy || !note.trim() || action.status === "done" || action.status === "cancelled"} className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 hover:bg-white/60 disabled:opacity-50">
          Notu kaydet
        </button>
        {action.status === "done" && (
          <button onClick={() => setShowOutcome((v) => !v)} className="text-xs rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1.5 hover:bg-abys-accent-soft">
            {showOutcome ? "Sonuç formunu kapat" : "Sonuç & ders kaydet"}
          </button>
        )}
        {(action.status === "open" || action.status === "in_progress") && (
          <button onClick={() => setShowExecution((v) => !v)} className="text-xs rounded-full border border-abys-navy/25 text-abys-navy px-3 py-1.5 hover:bg-white/60">
            {showExecution ? "Hazırlığı kapat" : "Yürütme hazırlığı"}
          </button>
        )}
      </div>

      {showOutcome && <OutcomeForm decisionId={action.decision_id} onDone={() => { setShowOutcome(false); onChanged(); }} />}
      {showExecution && <ExecutionIntentPanel actionId={action.id} />}
    </div>
  );
}

function ExecutionIntentPanel({ actionId }: { actionId: string }) {
  const [intents, setIntents] = useState<ExecutionIntent[]>([]);
  const [summary, setSummary] = useState("");
  const [targetSystem, setTargetSystem] = useState("");
  const [mode, setMode] = useState<"manual" | "system">("manual");
  const [idempotencyKey, setIdempotencyKey] = useState(newIntentKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/actions/execution-intents?actionId=${encodeURIComponent(actionId)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setError("Yürütme hazırlıkları yüklenemedi.");
      return;
    }
    const payload = (await res.json()) as { intents?: ExecutionIntent[] };
    setIntents(Array.isArray(payload.intents) ? payload.intents : []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/actions/execution-intents?actionId=${encodeURIComponent(actionId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("load_failed");
        const payload = (await res.json()) as { intents?: ExecutionIntent[] };
        if (!cancelled) setIntents(Array.isArray(payload.intents) ? payload.intents : []);
      })
      .catch(() => {
        if (!cancelled) setError("Yürütme hazırlıkları yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, [actionId]);

  async function prepare() {
    if (!summary.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/actions/execution-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId,
          idempotencyKey,
          mode,
          targetSystem: targetSystem.trim() || undefined,
          summary: summary.trim(),
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Yürütme hazırlığı oluşturulamadı.");
      }
      setSummary("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yürütme hazırlığı oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function approve(intentId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/actions/execution-intents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Yürütme hazırlığı onaylanamadı.");
      }
      setIdempotencyKey(newIntentKey());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yürütme hazırlığı onaylanamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-abys-cream-border space-y-2">
      <p className="text-xs font-semibold text-abys-muted">YÜRÜTME HAZIRLIĞI</p>
      <p className="text-[11px] text-abys-muted">
        Bu adım dış sistemde işlem yapmaz. Yalnızca insan onaylı, idempotent niyet kaydı oluşturur.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["manual", "system"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`text-xs rounded-full px-3 py-1.5 border ${mode === value ? "bg-abys-navy text-white border-abys-navy" : "border-abys-ink/15 hover:bg-white/60"}`}
          >
            {value === "manual" ? "Manuel" : "Sistem"}
          </button>
        ))}
      </div>
      <input
        value={targetSystem}
        onChange={(e) => setTargetSystem(e.target.value)}
        placeholder="Hedef sistem (opsiyonel, ör. ERP)"
        className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        placeholder="Ne yapılacak? (dış çağrı yapılmayacak)"
        className="w-full text-sm rounded-lg border border-abys-cream-border bg-white/70 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-abys-accent"
      />
      {error && <p className="text-xs text-abys-critical">{error}</p>}
      <button onClick={prepare} disabled={busy || !summary.trim()} className="text-xs rounded-full bg-abys-navy text-white px-4 py-1.5 hover:opacity-90 disabled:opacity-50">
        {busy ? "Kaydediliyor…" : "Hazırlığı kaydet"}
      </button>
      {intents.length > 0 && (
        <ul className="space-y-1 list-none p-0 m-0 pt-2">
          {intents.map((intent) => (
            <li key={intent.id} className="rounded-lg border border-abys-cream-border bg-white/60 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-abys-ink">{intent.summary}</span>
                <span className="text-abys-muted">
                  {intent.status === "prepared" ? "Onay bekliyor" : intent.status === "approved" ? "Onaylandı" : "İptal"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-abys-muted">
                {intent.mode === "manual" ? "Manuel" : "Sistem"}
                {intent.target_system ? ` · ${intent.target_system}` : ""}
                {" "}· {intent.prepared_by_name}
                {intent.approved_by_name ? ` · onay: ${intent.approved_by_name}` : ""}
              </p>
              <ExecutionAttemptStatus key={`${intent.id}:${intent.status}`} intentId={intent.id} />
              {intent.status === "prepared" && (
                <button onClick={() => approve(intent.id)} disabled={busy} className="mt-1 text-[11px] rounded-full border border-abys-accent/40 text-abys-accent px-3 py-1 hover:bg-abys-accent-soft disabled:opacity-50">
                  İnsan onayı ver
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
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
