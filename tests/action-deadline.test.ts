import { describe, expect, it } from "vitest";
import { isOpenStatus, isOverdue, overdueDays } from "@/lib/action-deadline";

const now = new Date("2026-03-10T12:00:00Z");

describe("aksiyon vadesi", () => {
  it("yalnızca açık ve yürütülen aksiyonlar gecikebilir", () => {
    expect(isOpenStatus("open")).toBe(true);
    expect(isOpenStatus("in_progress")).toBe(true);
    expect(isOpenStatus("done")).toBe(false);
    expect(isOverdue("2026-03-01T00:00:00Z", "done", now)).toBe(false);
    expect(isOverdue("2026-03-01T00:00:00Z", "cancelled", now)).toBe(false);
    expect(isOverdue("2026-03-01T00:00:00Z", "open", now)).toBe(true);
  });

  it("vadesi gelmemiş veya tarihi olmayan aksiyon gecikmiş sayılmaz", () => {
    expect(overdueDays("2026-03-11T00:00:00Z", "open", now)).toBeNull();
    expect(overdueDays(null, "open", now)).toBeNull();
    expect(overdueDays("geçersiz", "open", now)).toBeNull();
    expect(isOverdue(undefined, "open", now)).toBe(false);
  });

  it("geçen tam gün sayısını döndürür", () => {
    expect(overdueDays("2026-03-09T12:00:00Z", "open", now)).toBe(1);
    expect(overdueDays("2026-03-01T00:00:00Z", "in_progress", now)).toBe(9);
    expect(overdueDays("2026-03-10T11:59:59Z", "open", now)).toBe(0);
  });
});
