import type { CanonicalEntity, CanonicalRecord } from "@/lib/connectors/types";

export interface GoldenRecordSource {
  sourceConfigId: string;
  sourceExternalId: string;
  sourceUpdatedAt: string | null;
  syncedAt: string;
  priority: number | null;
  fields: CanonicalRecord["fields"];
}

export interface GoldenFieldProvenance {
  value: string | number | boolean | null;
  sourceConfigId: string;
  sourceExternalId: string;
  sourceUpdatedAt: string | null;
  syncedAt: string;
  priority: number | null;
  candidateCount: number;
  conflict: boolean;
}

export interface GoldenRecordSelection {
  entity: CanonicalEntity;
  fields: CanonicalRecord["fields"];
  fieldProvenance: Record<string, GoldenFieldProvenance>;
  conflictCount: number;
  coverage: {
    sourceCount: number;
    fieldCount: number;
    conflictingFieldCount: number;
    policySourceCount: number;
  };
  policy: {
    applied: boolean;
    rule: string;
  };
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function usable(value: CanonicalRecord["fields"][string]): boolean {
  return value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "");
}

function compareSources(a: GoldenRecordSource, b: GoldenRecordSource): number {
  const priorityA = a.priority ?? Number.MAX_SAFE_INTEGER;
  const priorityB = b.priority ?? Number.MAX_SAFE_INTEGER;
  if (priorityA !== priorityB) return priorityA - priorityB;
  const updatedA = timestamp(a.sourceUpdatedAt);
  const updatedB = timestamp(b.sourceUpdatedAt);
  if (updatedA !== updatedB) return updatedB - updatedA;
  const syncedA = timestamp(a.syncedAt);
  const syncedB = timestamp(b.syncedAt);
  if (syncedA !== syncedB) return syncedB - syncedA;
  const config = a.sourceConfigId.localeCompare(b.sourceConfigId);
  if (config !== 0) return config;
  return a.sourceExternalId.localeCompare(b.sourceExternalId);
}

/**
 * Alan bazında deterministik altın kayıt seçimi. Kaynak kayıtları değişmez;
 * yalnızca hangi doğrulanmış değerin sunulacağı ve nereden geldiği belirlenir.
 * Kaynak önceliği yoksa daha güncel `sourceUpdatedAt`, ardından `syncedAt`
 * kullanılır. Eşitlikte konfigürasyon kimliği ve dış kimlik sıralamayı sabitler.
 */
export function selectGoldenRecord(
  entity: CanonicalEntity,
  rawSources: GoldenRecordSource[]
): GoldenRecordSelection | null {
  const sources = [...rawSources].sort(compareSources);
  if (sources.length === 0) return null;

  const fieldNames = new Set<string>();
  for (const source of sources) {
    for (const [field, value] of Object.entries(source.fields)) {
      if (usable(value)) fieldNames.add(field);
    }
  }

  const fields: CanonicalRecord["fields"] = {};
  const fieldProvenance: Record<string, GoldenFieldProvenance> = {};
  let conflictingFieldCount = 0;
  for (const field of [...fieldNames].sort()) {
    const candidates = sources.filter((source) => usable(source.fields[field]));
    if (candidates.length === 0) continue;
    const chosen = candidates[0];
    const distinct = new Set(
      candidates.map((source) => JSON.stringify(source.fields[field] ?? null))
    );
    const conflict = distinct.size > 1;
    if (conflict) conflictingFieldCount += 1;
    fields[field] = chosen.fields[field];
    fieldProvenance[field] = {
      value: chosen.fields[field],
      sourceConfigId: chosen.sourceConfigId,
      sourceExternalId: chosen.sourceExternalId,
      sourceUpdatedAt: chosen.sourceUpdatedAt,
      syncedAt: chosen.syncedAt,
      priority: chosen.priority,
      candidateCount: candidates.length,
      conflict,
    };
  }

  const policySourceCount = sources.filter((source) => source.priority !== null).length;
  return {
    entity,
    fields,
    fieldProvenance,
    conflictCount: conflictingFieldCount,
    coverage: {
      sourceCount: sources.length,
      fieldCount: Object.keys(fields).length,
      conflictingFieldCount,
      policySourceCount,
    },
    policy: {
      applied: policySourceCount > 0,
      rule:
        policySourceCount > 0
          ? "önce kaynak güven sırası, sonra kaynak güncelliği"
          : "kaynak güncelliği; eşitlikte kimlik sırası",
    },
  };
}
