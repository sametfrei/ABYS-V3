/**
 * Aksiyon vadesi — deterministik, saat diliminden bağımsız hesap.
 * Yalnızca açık veya yürütülen aksiyonlar gecikebilir; tamamlanan/iptal edilen
 * aksiyonlar vade geçmiş olsa bile "geciken" sayılmaz.
 */

export const OPEN_ACTION_STATUSES = ["open", "in_progress"] as const;

export function isOpenStatus(status: string): boolean {
  return (OPEN_ACTION_STATUSES as readonly string[]).includes(status);
}

/** Vadesi geçmiş açık aksiyon için geçen tam gün sayısı; değilse null. */
export function overdueDays(
  dueAt: string | null | undefined,
  status: string,
  now: Date = new Date()
): number | null {
  if (!dueAt || !isOpenStatus(status)) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const diff = now.getTime() - due.getTime();
  if (diff <= 0) return null;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export function isOverdue(
  dueAt: string | null | undefined,
  status: string,
  now: Date = new Date()
): boolean {
  return overdueDays(dueAt, status, now) !== null;
}
