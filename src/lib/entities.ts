export interface Entity {
  id: string;
  createdAt: string;
}

export interface SavedReport extends Entity {
  title: string;
  roleId: string;
  content: string;
}

export interface WarRoomNote extends Entity {
  signalId: string;
  author: string;
  text: string;
}

export type SignalStatus = "open" | "handled" | "snoozed" | "escalated";

export interface HandledSignal extends Entity {
  signalId: string;
  status: SignalStatus;
}

export interface UrgentTask extends Entity {
  title: string;
  done: boolean;
}

export interface Reminder extends Entity {
  title: string;
  dueDate: string;
}

export interface CounselorStat {
  name: string;
  assigned: number;
  sales: number;
  revenue: number;
  conversionPct: number;
}

export interface ImportedDataset extends Entity {
  sectorId: string;
  fileName: string;
  kpis: { label: string; value: string }[];
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  counselors?: CounselorStat[];
}

export interface AssessedRisk extends Entity {
  sectorId: string;
  categoryId: string;
  categoryLabel: string;
  severity: "critical" | "warning" | "info" | "healthy";
  explanation: string;
  recommendedAction: string;
}

function key(name: string) {
  return `abys.entities.${name}`;
}

function readAll<T extends Entity>(name: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key(name));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeAll<T extends Entity>(name: string, items: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(name), JSON.stringify(items));
}

export function listEntities<T extends Entity>(name: string): T[] {
  return readAll<T>(name);
}

export function upsertEntity<T extends Entity>(name: string, item: T): T[] {
  const items = readAll<T>(name);
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  writeAll(name, items);
  return items;
}

export function deleteEntity<T extends Entity>(name: string, id: string): T[] {
  const items = readAll<T>(name).filter((i) => i.id !== id) as T[];
  writeAll(name, items);
  return items;
}

export function replaceEntities<T extends Entity>(name: string, items: T[]) {
  writeAll(name, items);
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
