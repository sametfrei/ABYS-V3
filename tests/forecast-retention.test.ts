import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_POLICY,
  planForecastRetention,
  sanitizeRetentionPolicy,
  type RetentionCandidate,
} from "@/lib/forecast-retention";

const now = new Date("2026-11-21T00:00:00Z");

describe("tahmin saklama politikası", () => {
  it("geçersiz değerleri varsayılana düşürür ve aralığa kırpar", () => {
    expect(sanitizeRetentionPolicy(null)).toEqual(DEFAULT_RETENTION_POLICY);
    expect(sanitizeRetentionPolicy(undefined)).toEqual(DEFAULT_RETENTION_POLICY);
    expect(
      sanitizeRetentionPolicy({
        maxAgeDays: -1,
        maxPerLabel: Number.NaN,
      })
    ).toEqual(DEFAULT_RETENTION_POLICY);
    expect(
      sanitizeRetentionPolicy({
        maxAgeDays: 0,
        maxPerLabel: 0,
      })
    ).toEqual({ maxAgeDays: 1, maxPerLabel: 1 });
    expect(
      sanitizeRetentionPolicy({
        maxAgeDays: 99_999,
        maxPerLabel: 99_999,
      })
    ).toEqual({ maxAgeDays: 3650, maxPerLabel: 1000 });
    expect(
      sanitizeRetentionPolicy({
        maxAgeDays: Number.POSITIVE_INFINITY,
        maxPerLabel: 12.9,
      })
    ).toEqual({
      maxAgeDays: DEFAULT_RETENTION_POLICY.maxAgeDays,
      maxPerLabel: 12,
    });
  });

  it("tam yaş sınırını korur, sınırı aşanı arşivler", () => {
    const candidates: RetentionCandidate[] = [
      { id: "boundary", label: "Ciro", createdAt: "2026-11-11T00:00:00Z" },
      { id: "older", label: "Ciro", createdAt: "2026-11-10T23:59:59.999Z" },
    ];
    const plan = planForecastRetention(
      candidates,
      { maxAgeDays: 10, maxPerLabel: 60 },
      now
    );
    expect(plan).toEqual({
      keepIds: ["boundary"],
      archiveIds: ["older"],
      reasons: { older: "expired" },
    });
  });

  it("her etikette en yeni kayıtları tutar ve girdi sırasından bağımsızdır", () => {
    const candidates: RetentionCandidate[] = [
      { id: "a-old", label: "Ciro", createdAt: "2026-11-01T00:00:00Z" },
      { id: "b-only", label: "Maliyet", createdAt: "2026-10-01T00:00:00Z" },
      { id: "a-new", label: "Ciro", createdAt: "2026-11-20T00:00:00Z" },
      { id: "a-mid", label: "Ciro", createdAt: "2026-11-10T00:00:00Z" },
    ];
    const plan = planForecastRetention(
      candidates,
      { maxAgeDays: 365, maxPerLabel: 2 },
      now
    );
    expect(plan.keepIds).toEqual(["a-mid", "a-new", "b-only"]);
    expect(plan.archiveIds).toEqual(["a-old"]);
    expect(plan.reasons).toEqual({ "a-old": "over_limit" });

    const reversed = planForecastRetention(
      [...candidates].reverse(),
      { maxAgeDays: 365, maxPerLabel: 2 },
      now
    );
    expect(reversed).toEqual(plan);
  });

  it("geçersiz tarihi nedensiz olarak korur ve limitte saymaz", () => {
    const candidates: RetentionCandidate[] = [
      { id: "invalid", label: "Ciro", createdAt: "geçersiz-tarih" },
      { id: "new", label: "Ciro", createdAt: "2026-11-20T00:00:00Z" },
      { id: "mid", label: "Ciro", createdAt: "2026-11-10T00:00:00Z" },
    ];
    const plan = planForecastRetention(
      candidates,
      { maxAgeDays: 365, maxPerLabel: 1 },
      now
    );
    expect(plan.keepIds).toEqual(["invalid", "new"]);
    expect(plan.archiveIds).toEqual(["mid"]);
    expect(plan.reasons).toEqual({ mid: "over_limit" });
    expect(plan.reasons.invalid).toBeUndefined();
  });

  it("aynı id için ilk kaydı esas alır", () => {
    const candidates: RetentionCandidate[] = [
      { id: "dup", label: "Ciro", createdAt: "2020-01-01T00:00:00Z" },
      { id: "dup", label: "Ciro", createdAt: "2026-11-20T00:00:00Z" },
    ];
    const plan = planForecastRetention(
      candidates,
      { maxAgeDays: 1, maxPerLabel: 1 },
      now
    );
    expect(plan).toEqual({
      keepIds: [],
      archiveIds: ["dup"],
      reasons: { dup: "expired" },
    });
  });

  it("yaş ve etiket nedenlerini birlikte raporlar", () => {
    const candidates: RetentionCandidate[] = [
      { id: "expired", label: "Ciro", createdAt: "2025-01-01T00:00:00Z" },
      { id: "newest", label: "Ciro", createdAt: "2026-11-20T00:00:00Z" },
      { id: "older", label: "Ciro", createdAt: "2026-11-10T00:00:00Z" },
    ];
    const plan = planForecastRetention(
      candidates,
      { maxAgeDays: 365, maxPerLabel: 1 },
      now
    );
    expect(plan.keepIds).toEqual(["newest"]);
    expect(plan.archiveIds).toEqual(["expired", "older"]);
    expect(plan.reasons).toEqual({
      expired: "expired",
      older: "over_limit",
    });
  });

  it("boş girdide boş plan döndürür", () => {
    expect(
      planForecastRetention([], DEFAULT_RETENTION_POLICY, now)
    ).toEqual({ keepIds: [], archiveIds: [], reasons: {} });
  });
});
