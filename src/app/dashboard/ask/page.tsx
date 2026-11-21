"use client";

import { useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

/**
 * Ask ABYS (Faz 5): yönetici asistanı arayüzü.
 * Cevaplar yalnızca kurumun kayıtlarından ve erişim izinli belgelerden gelir;
 * her ifade etiketli (kayıt / çıkarım / öneri) ve kaynaklıdır. Kanıt yoksa
 * sistem bunu açıkça söyler — tahmin üretmez.
 */

type Label = "fact" | "inference" | "recommendation";

interface AskResponse {
  answer: string;
  evidenceAvailable: boolean;
  statements: { label: Label; text: string; source: string }[];
  sources: { kind: string; ref: string; title: string }[];
  note?: string;
}

const LABEL_META: Record<Label, { key: ShellKey; color: string }> = {
  fact: { key: "ask.label.fact", color: "var(--abys-healthy)" },
  inference: { key: "ask.label.inference", color: "var(--abys-warning)" },
  recommendation: { key: "ask.label.recommendation", color: "var(--abys-accent)" },
};

/**
 * Örnek sorular Türkçe metniyle gönderilir; sunucu niyeti Türkçe anahtar
 * sözcüklerle çözer. Görünen etiket yerelleştirilir, gönderilen istem değişmez.
 */
const ORNEK_SORULAR: { key: ShellKey; prompt: string }[] = [
  { key: "ask.example.risk", prompt: "Bugün en kritik operasyonel risk nedir?" },
  { key: "ask.example.delayedTasks", prompt: "Hangi hizmet görevleri gecikiyor?" },
  { key: "ask.example.capacity", prompt: "Hangi ekipte kapasite problemi var?" },
  { key: "ask.example.renewals", prompt: "Yenileme tarihi yaklaşan müşteriler hangileri?" },
  { key: "ask.example.pest", prompt: "Hangi pest-control görevleri gecikti?" },
  { key: "ask.example.catering", prompt: "Catering operasyonunda bugün risk var mı?" },
  { key: "ask.example.decision", prompt: "Yönetimin bugün vermesi gereken karar nedir?" },
  { key: "ask.example.taisHealth", prompt: "TAIS'in genel operasyon sağlığı nedir?" },
];

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

export default function AskPage() {
  const locale = useLocale();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q?: string) {
    const activeLocale = readLocale();
    const soru = (q ?? question).trim();
    if (!soru) return;
    setQuestion(soru);
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: soru }),
      });
      if (r.status === 401) {
        setError(t(activeLocale, "ask.sessionRequired"));
        return;
      }
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? t(activeLocale, "ask.failed"));
        return;
      }
      setRes(j);
    } catch {
      setError(t(activeLocale, "ask.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "ask.eyebrow")}
        title={t(locale, "ask.title")}
        accent={t(locale, "ask.titleAccent")}
        desc={t(locale, "ask.subtitle")}
      />

      <div className="px-10 pb-16 max-w-3xl">
        <div className="flex gap-2 mb-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder={t(locale, "ask.placeholder")}
            className="flex-1 rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
          <button
            onClick={() => ask()}
            disabled={busy || !question.trim()}
            className="rounded-xl bg-abys-navy text-white text-sm px-5 hover:opacity-90 disabled:opacity-40"
          >
            {busy ? t(locale, "ask.busy") : t(locale, "ask.submit")}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {ORNEK_SORULAR.map((s) => (
            <button
              key={s.key}
              onClick={() => ask(s.prompt)}
              className="text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 text-abys-muted hover:bg-white/60 hover:text-abys-ink"
            >
              {t(locale, s.key)}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-abys-critical bg-abys-critical-soft rounded-lg p-3">{error}</p>}

        {res && (
          <div className="rounded-xl border border-abys-cream-border bg-abys-cream p-5">
            <p className="text-abys-navy font-medium mb-1">{res.answer}</p>
            {!res.evidenceAvailable && res.note && (
              <p className="text-xs text-abys-muted mb-2">{res.note}</p>
            )}

            {res.statements.length > 0 && (
              <ul className="space-y-2.5 mt-4">
                {res.statements.map((s, i) => {
                  const meta = LABEL_META[s.label] ?? LABEL_META.fact;
                  return (
                    <li key={i} className="text-sm">
                      <span
                        className="text-[10px] font-semibold rounded px-1.5 py-0.5 mr-2 align-middle"
                        style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                      >
                        {t(locale, meta.key)}
                      </span>
                      <span className="text-abys-ink">{s.text}</span>
                      <span className="block text-[11px] text-abys-muted mt-0.5 ml-1">
                        {formatMessage(locale, "ask.statementSource", { source: s.source })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {res.sources.length > 0 && (
              <div className="mt-4 pt-3 border-t border-abys-cream-border">
                <p className="text-[11px] text-abys-muted font-semibold mb-1">
                  {formatMessage(locale, "ask.sourcesHeading", { count: res.sources.length })}
                </p>
                <ul className="text-xs text-abys-muted space-y-0.5">
                  {res.sources.map((s, i) => (
                    <li key={i}>
                      <span className="font-mono text-[10px] mr-1">{s.kind}</span> {s.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
