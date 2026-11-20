"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

interface QualityIssue {
  id: string;
  source: string;
  entity: string;
  sourceRef: string | null;
  code: string | null;
  reason: string;
  status: "pending" | "resolved" | "discarded";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("tr-TR");
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // JSON değilse yedek.
  }
  return `İşlem başarısız (HTTP ${res.status}).`;
}

/**
 * Veri kalitesi karantinası — entegrasyonlardan gelen sorunlu satırlar.
 * Yalnızca ingest_data izni; kapsam sunucuda (org_id oturumdan).
 */
export default function DataQualityPage() {
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/data-quality?status=${scope}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) throw new Error("Bu sayfa için oturum gerekir.");
          if (res.status === 403) throw new Error("Veri kalitesi görünümü için yetkiniz yok.");
          throw new Error(await readError(res));
        }
        const data = (await res.json()) as { issues?: QualityIssue[] };
        if (cancelled) return;
        setIssues(Array.isArray(data.issues) ? data.issues : []);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Yükleme başarısız.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, reloadKey]);

  async function resolve(
    id: string,
    resolution: "resolved" | "discarded",
    action?: "accept_proposed" | "keep_existing"
  ) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/data-quality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolution, action }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setNotice(
        action === "accept_proposed"
          ? "Önerilen güçlü kimlik bağlantısı uygulandı."
          : action === "keep_existing"
            ? "Mevcut kimlik bağlantısı korunarak çakışma kapatıldı."
            : resolution === "resolved"
              ? "Kayıt çözüldü."
              : "Kayıt atıldı."
      );
      setLoading(true);
      setReloadKey((k) => k + 1);
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="VERİ KALİTESİ"
        title="Karantina"
        accent="kuyruğu."
        desc="Entegrasyonlarda eşleştirilemeyen veya doğrulanamayan satırlar. Sessizce atılmaz; burada incelenir."
      />

      <div className="px-10 pb-16 max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["pending", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setLoading(true);
                setScope(s);
              }}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
                scope === s
                  ? "border-abys-accent bg-abys-accent/10 text-abys-accent"
                  : "border-abys-cream-border text-abys-muted hover:bg-white/60"
              }`}
            >
              {s === "pending" ? "Bekleyen" : "Tümü"}
            </button>
          ))}
        </div>

        {notice && (
          <p role="status" className="mb-3 text-sm text-abys-healthy">{notice}</p>
        )}
        {loading ? (
          <p className="text-sm text-abys-muted" role="status">Yükleniyor…</p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-abys-critical/40 bg-abys-critical-soft px-4 py-3 text-sm text-abys-critical">
            {error}
          </p>
        ) : issues.length === 0 ? (
          <p className="text-sm text-abys-muted">
            {scope === "pending" ? "Bekleyen karantina kaydı yok." : "Karantina kaydı yok."}
          </p>
        ) : (
          <ul className="space-y-2 list-none p-0 m-0">
            {issues.map((issue) => (
              <li
                key={issue.id}
                className="rounded-xl border border-abys-cream-border bg-white/50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-abys-ink">
                      {issue.source} / {issue.entity}
                      {issue.sourceRef ? ` · ${issue.sourceRef}` : ""}
                    </p>
                    {issue.code && (
                      <p className="mt-0.5 text-[10px] font-mono text-abys-muted">{issue.code}</p>
                    )}
                    <p className="text-xs text-abys-critical mt-0.5">{issue.reason}</p>
                    <p className="text-[11px] text-abys-muted mt-1">
                      {formatDate(issue.createdAt)}
                      {issue.resolvedAt ? ` · ${issue.status}: ${formatDate(issue.resolvedAt)}` : ""}
                    </p>
                  </div>
                  {issue.status === "pending" && (
                    <div className="flex gap-2">
                      {issue.code === "IDENTITY_LINK_CONFLICT" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "resolved", "accept_proposed")}
                            className="rounded-full border border-abys-accent/40 px-3 py-1.5 text-xs text-abys-accent hover:bg-abys-accent/10 disabled:opacity-50"
                          >
                            Öneriyi uygula
                          </button>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "resolved", "keep_existing")}
                            className="rounded-full border border-abys-cream-border px-3 py-1.5 text-xs text-abys-muted hover:bg-white/60 disabled:opacity-50"
                          >
                            Mevcudu koru
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "resolved")}
                            className="rounded-full border border-abys-healthy/40 px-3 py-1.5 text-xs text-abys-healthy hover:bg-abys-healthy-soft disabled:opacity-50"
                          >
                            Çözüldü
                          </button>
                          <button
                            type="button"
                            disabled={busyId === issue.id}
                            onClick={() => resolve(issue.id, "discarded")}
                            className="rounded-full border border-abys-critical/40 px-3 py-1.5 text-xs text-abys-critical hover:bg-abys-critical-soft disabled:opacity-50"
                          >
                            At
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
