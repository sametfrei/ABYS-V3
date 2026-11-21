/**
 * Konnektör senkron çalıştırmalarının sağlığı — saf, deterministik özet.
 * Amaç: son çalıştırma hatasını ve art arda gelen başarısızlıkları görünür
 * kılıp operatöre "yeniden dene" kararını gerekçesiyle sunmak. Dış çağrı,
 * DB veya saat bağımlılığı yoktur.
 */

export const FAILED_RUN_STATUSES = ["failed"] as const;

export interface ConnectorRunLike {
  id: string;
  status: string;
  startedAt: string;
  error?: string | null;
}

export interface ConnectorRunHealth {
  /** En yeni çalıştırmanın durumu; hiç çalıştırma yoksa null. */
  lastStatus: string | null;
  /** En yeniden geriye doğru kesintisiz başarısızlık sayısı. */
  consecutiveFailures: number;
  lastErrorMessage: string | null;
  lastFailureAt: string | null;
  /** Operatörün manuel yeniden denemesinin önerilip önerilmediği. */
  retryRecommended: boolean;
}

function isFailed(status: string): boolean {
  return (FAILED_RUN_STATUSES as readonly string[]).includes(status);
}

/**
 * Çalıştırmaları en yeniden en eskiye sıralar. `startedAt` geçersizse
 * sıralamada en sona düşer; eşitlikte id ile deterministik kırılır.
 */
function sortNewestFirst(runs: ConnectorRunLike[]): ConnectorRunLike[] {
  return [...runs].sort((a, b) => {
    const ta = new Date(a.startedAt).getTime();
    const tb = new Date(b.startedAt).getTime();
    const va = Number.isNaN(ta) ? -Infinity : ta;
    const vb = Number.isNaN(tb) ? -Infinity : tb;
    if (va !== vb) return vb - va;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function summarizeConnectorRuns(runs: ConnectorRunLike[]): ConnectorRunHealth {
  if (runs.length === 0) {
    return {
      lastStatus: null,
      consecutiveFailures: 0,
      lastErrorMessage: null,
      lastFailureAt: null,
      retryRecommended: false,
    };
  }

  const ordered = sortNewestFirst(runs);
  let consecutiveFailures = 0;
  for (const run of ordered) {
    if (!isFailed(run.status)) break;
    consecutiveFailures += 1;
  }

  const latestFailure = ordered.find((run) => isFailed(run.status)) ?? null;
  const message = latestFailure?.error?.trim() ? latestFailure.error.trim() : null;

  return {
    lastStatus: ordered[0].status,
    consecutiveFailures,
    lastErrorMessage: message,
    lastFailureAt: latestFailure?.startedAt ?? null,
    retryRecommended: consecutiveFailures > 0,
  };
}

/** Operatöre gösterilecek kısa, Türkçe durum cümlesi; yoksa null. */
export function connectorHealthNote(health: ConnectorRunHealth): string | null {
  if (health.consecutiveFailures === 0) return null;
  const count = health.consecutiveFailures;
  const base = `${count} ardışık senkron hatası`;
  return health.lastErrorMessage ? `${base}: ${health.lastErrorMessage}` : base;
}

/**
 * Hata mesajını operatörün atacağı adıma göre sınıflandırır. Yeniden deneme
 * yalnızca geçici olabilecek hatalarda önerilir; kimlik/izin hatalarında
 * tekrar denemek durumu düzeltmez, yapılandırma düzeltmesi gerekir.
 */
export type ConnectorFailureKind =
  | "rate_limit"
  | "auth"
  | "timeout"
  | "server"
  | "network"
  | "unknown";

export function classifyConnectorError(message: string | null | undefined): ConnectorFailureKind {
  const text = String(message ?? "").toLowerCase();
  if (!text.trim()) return "unknown";
  if (/429|too many requests|rate limit/.test(text)) return "rate_limit";
  if (/401|403|unauthori[sz]ed|forbidden|kimlik|yetki/.test(text)) return "auth";
  if (/timeout|zaman aşımı|timed out|etimedout/.test(text)) return "timeout";
  if (/\b5\d\d\b|internal server|bad gateway|service unavailable|gateway timeout/.test(text)) {
    return "server";
  }
  if (/fetch failed|econnreset|enotfound|eai_again|network|ağ/.test(text)) return "network";
  return "unknown";
}

/** Sınıflandırmaya göre güvenli yeniden deneme kipi. */
export function retryAdvice(
  kind: ConnectorFailureKind
): "backoff" | "fix_config" | "manual" {
  if (kind === "auth") return "fix_config";
  if (kind === "rate_limit" || kind === "timeout" || kind === "server" || kind === "network") {
    return "backoff";
  }
  return "manual";
}
