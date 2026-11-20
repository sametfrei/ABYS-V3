/**
 * Tahmin anlık görüntüleri için saf saklama politikası.
 * Yaş ve etiket başına adet sınırlarını deterministik biçimde uygular.
 */

export interface RetentionPolicy {
  maxAgeDays: number;
  maxPerLabel: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  maxAgeDays: 365,
  maxPerLabel: 60,
};

const MIN_AGE_DAYS = 1;
const MAX_AGE_DAYS = 3650;
const MIN_PER_LABEL = 1;
const MAX_PER_LABEL = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function sanitizeValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Geçersiz değerleri varsayılana düşürür, geçerli aralığa kırpar. */
export function sanitizeRetentionPolicy(
  input: Partial<RetentionPolicy> | null | undefined
): RetentionPolicy {
  return {
    maxAgeDays: sanitizeValue(
      input?.maxAgeDays,
      DEFAULT_RETENTION_POLICY.maxAgeDays,
      MIN_AGE_DAYS,
      MAX_AGE_DAYS
    ),
    maxPerLabel: sanitizeValue(
      input?.maxPerLabel,
      DEFAULT_RETENTION_POLICY.maxPerLabel,
      MIN_PER_LABEL,
      MAX_PER_LABEL
    ),
  };
}

export interface RetentionCandidate {
  id: string;
  label: string;
  createdAt: string;
}

export interface RetentionPlan {
  keepIds: string[];
  archiveIds: string[];
  reasons: Record<string, "expired" | "over_limit">;
}

interface DatedCandidate {
  id: string;
  label: string;
  createdAtMs: number;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Yaş ve etiket sınırlarına göre tutulacak/arşivlenecek id'leri planlar. */
export function planForecastRetention(
  candidates: RetentionCandidate[],
  policy: RetentionPolicy,
  now: Date
): RetentionPlan {
  const safePolicy = sanitizeRetentionPolicy(policy);
  const nowMs = now.getTime();
  const unique = new Map<string, RetentionCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }

  const keep = new Set<string>();
  const archiveReasons = new Map<string, "expired" | "over_limit">();
  const groups = new Map<string, DatedCandidate[]>();

  for (const candidate of unique.values()) {
    const createdAtMs = new Date(candidate.createdAt).getTime();
    if (Number.isNaN(createdAtMs)) {
      // Tarih okunamıyorsa güvenli tarafta kal.
      keep.add(candidate.id);
      continue;
    }
    if (createdAtMs + safePolicy.maxAgeDays * MS_PER_DAY < nowMs) {
      archiveReasons.set(candidate.id, "expired");
      continue;
    }
    const group = groups.get(candidate.label) ?? [];
    group.push({ id: candidate.id, label: candidate.label, createdAtMs });
    groups.set(candidate.label, group);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) => b.createdAtMs - a.createdAtMs || compareIds(a.id, b.id)
    );
    for (const [index, candidate] of group.entries()) {
      if (index < safePolicy.maxPerLabel) {
        keep.add(candidate.id);
      } else {
        archiveReasons.set(candidate.id, "over_limit");
      }
    }
  }

  const keepIds = [...keep].sort(compareIds);
  const archiveIds = [...archiveReasons.keys()].sort(compareIds);
  const reasons: RetentionPlan["reasons"] = {};
  for (const id of archiveIds) {
    reasons[id] = archiveReasons.get(id)!;
  }

  return { keepIds, archiveIds, reasons };
}
