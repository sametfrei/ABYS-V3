"use client";

import { useEffect, useId, useState } from "react";

type AttemptStatus = "in_progress" | "succeeded" | "failed";

interface ExecutionAttempt {
  status: AttemptStatus;
  response_status: number | null;
  response_reference: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "no_attempt" }
  | { kind: "attempt"; attempt: ExecutionAttempt }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

const ATTEMPT_META: Record<AttemptStatus, { label: string; color: string; soft: string }> = {
  in_progress: { label: "Sürüyor", color: "var(--abys-warning)", soft: "var(--abys-warning-soft)" },
  succeeded: { label: "Başarılı", color: "var(--abys-healthy)", soft: "var(--abys-healthy-soft)" },
  failed: { label: "Başarısız", color: "var(--abys-critical)", soft: "var(--abys-critical-soft)" },
};

function isExecutionAttempt(value: unknown): value is ExecutionAttempt {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Record<string, unknown>;
  return (
    (attempt.status === "in_progress" || attempt.status === "succeeded" || attempt.status === "failed") &&
    typeof attempt.started_at === "string" &&
    (attempt.response_status === null || typeof attempt.response_status === "number") &&
    (attempt.response_reference === null || typeof attempt.response_reference === "string") &&
    (attempt.error_code === null || typeof attempt.error_code === "string") &&
    (attempt.error_message === null || typeof attempt.error_message === "string") &&
    (attempt.finished_at === null || typeof attempt.finished_at === "string")
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "henüz yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("tr-TR");
}

function messageForStatus(status: number): ViewState {
  if (status === 401) return { kind: "unauthenticated" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  return { kind: "error", message: `Deneme durumu yüklenemedi (HTTP ${status}).` };
}

/** Bir yürütme hazırlığının kalıcı adaptör denemesini salt-okunur gösterir. */
export function ExecutionAttemptStatus({ intentId }: { intentId: string }) {
  const headingId = useId();
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/actions/execution-intents/${encodeURIComponent(intentId)}/attempts`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }
        );
        if (cancelled) return;
        if (!response.ok) {
          setState(messageForStatus(response.status));
          return;
        }

        const payload = (await response.json()) as { attempt?: unknown };
        if (cancelled) return;
        if (payload.attempt === null) {
          setState({ kind: "no_attempt" });
        } else if (isExecutionAttempt(payload.attempt)) {
          setState({ kind: "attempt", attempt: payload.attempt });
        } else {
          setState({ kind: "error", message: "Deneme durumu okunamadı." });
        }
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setState({ kind: "error", message: "Deneme durumu yüklenemedi." });
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [intentId]);

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={state.kind === "loading"}
      className="mt-2 rounded-md border border-abys-cream-border/80 bg-abys-cream/55 px-2.5 py-2"
    >
      <p id={headingId} className="text-[10px] tracking-widest text-abys-muted font-semibold">
        ADAPTÖR DENEMESİ
      </p>

      {state.kind === "loading" && (
        <p role="status" className="mt-1 text-[11px] text-abys-muted">
          Deneme durumu yükleniyor…
        </p>
      )}

      {state.kind === "no_attempt" && (
        <p role="status" className="mt-1 text-[11px] text-abys-muted">
          Henüz adaptör denemesi yok. Bu kayıt yalnızca yürütme hazırlığıdır.
        </p>
      )}

      {state.kind === "unauthenticated" && (
        <p role="alert" className="mt-1 text-[11px] text-abys-critical">
          Deneme durumunu görmek için oturum açın.
        </p>
      )}

      {state.kind === "forbidden" && (
        <p role="alert" className="mt-1 text-[11px] text-abys-critical">
          Bu deneme durumunu görüntüleme izniniz yok.
        </p>
      )}

      {state.kind === "not_found" && (
        <p role="alert" className="mt-1 text-[11px] text-abys-critical">
          Yürütme hazırlığı bulunamadı.
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="mt-1 text-[11px] text-abys-critical">
          {state.message}
        </p>
      )}

      {state.kind === "attempt" && <AttemptDetails attempt={state.attempt} />}
    </section>
  );
}

function AttemptDetails({ attempt }: { attempt: ExecutionAttempt }) {
  const meta = ATTEMPT_META[attempt.status];

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span
          role="status"
          className="text-[10px] font-semibold rounded-full px-2 py-0.5"
          style={{ color: meta.color, backgroundColor: meta.soft }}
        >
          {meta.label}
        </span>
        <span className="text-[10px] text-abys-muted">
          Başlangıç: {formatTimestamp(attempt.started_at)}
        </span>
      </div>

      {attempt.status === "in_progress" && (
        <p className="text-[11px] text-abys-muted">Sonuç henüz kaydedilmedi.</p>
      )}

      {(attempt.response_status !== null || attempt.response_reference) && (
        <p className="text-[11px] text-abys-ink break-words">
          {attempt.response_status !== null ? `Sağlayıcı HTTP ${attempt.response_status}` : "Sağlayıcı yanıtı"}
          {attempt.response_reference ? ` · Referans: ${attempt.response_reference}` : ""}
        </p>
      )}

      {(attempt.error_code || attempt.error_message) && (
        <div className="text-[11px] text-abys-critical break-words">
          <p>
            {attempt.error_code ? `Hata kodu: ${attempt.error_code}` : "Yürütme hatası"}
          </p>
          {attempt.error_message && <p className="whitespace-pre-wrap">{attempt.error_message}</p>}
        </div>
      )}

      <p className="text-[10px] text-abys-muted">
        Bitiş: {formatTimestamp(attempt.finished_at)}
      </p>
    </div>
  );
}
