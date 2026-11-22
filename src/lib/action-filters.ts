/**
 * Aksiyon Merkezi filtreleri — saf ve deterministik.
 * Gecikme yalnızca açık/yürütülen aksiyonlar için anlamlıdır; tamamlanmış
 * veya iptal edilmiş bir aksiyon vadesi geçmiş olsa da "geciken" sayılmaz.
 */

import { isOverdue } from "@/lib/action-deadline";

export type ActionFilter =
  | "all"
  | "open"
  | "in_progress"
  | "done"
  | "cancelled"
  | "overdue";

export interface FilterableAction {
  status: string;
  due_at: string | null;
}

export function filterActions<T extends FilterableAction>(
  actions: readonly T[],
  filter: ActionFilter,
  now: Date = new Date()
): T[] {
  if (filter === "all") return [...actions];
  if (filter === "overdue") {
    return actions.filter((action) => isOverdue(action.due_at, action.status, now));
  }
  return actions.filter((action) => action.status === filter);
}
