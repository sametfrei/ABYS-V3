import type { ObservedSourceField } from "./types";

/**
 * Kaynak JSON'un yalnızca yapısını gözler: alan yolu ve JSON tipi.
 * Değerler, örnek kayıtlar ve sırlar hiçbir zaman döndürülmez veya saklanmaz.
 */

const MAX_FIELDS = 250;
const MAX_DEPTH = 5;

type FieldAccumulator = {
  path: string;
  types: Record<string, number>;
  observations: number;
};

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function observeSourceSchema(items: unknown[]): ObservedSourceField[] {
  const fields = new Map<string, FieldAccumulator>();

  function observe(value: unknown, path: string, depth: number): void {
    if (fields.size >= MAX_FIELDS) return;
    if (depth > MAX_DEPTH) return;

    if (path) {
      const existing = fields.get(path) ?? { path, types: {}, observations: 0 };
      const type = valueType(value);
      existing.types[type] = (existing.types[type] ?? 0) + 1;
      existing.observations++;
      fields.set(path, existing);
    }

    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) observe(item, `${path}[]`, depth + 1);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (fields.size >= MAX_FIELDS) break;
        observe(child, path ? `${path}.${key}` : key, depth + 1);
      }
    }
  }

  for (const item of items) observe(item, "", 0);
  return [...fields.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function summarizeSourceSchema(fields: ObservedSourceField[]): {
  fieldCount: number;
  observedFieldCount: number;
  paths: string[];
} {
  return {
    fieldCount: fields.length,
    observedFieldCount: fields.reduce((sum, field) => sum + field.observations, 0),
    paths: fields.map((field) => field.path),
  };
}
