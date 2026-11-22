import { describe, expect, it } from "vitest";
import { filterActions, type FilterableAction } from "@/lib/action-filters";

const now = new Date("2026-03-10T12:00:00Z");

const actions: FilterableAction[] = [
  { status: "open", due_at: "2026-03-01T00:00:00Z" },
  { status: "open", due_at: "2026-03-20T00:00:00Z" },
  { status: "in_progress", due_at: "2026-03-05T00:00:00Z" },
  { status: "done", due_at: "2026-03-01T00:00:00Z" },
  { status: "cancelled", due_at: "2026-03-01T00:00:00Z" },
];

describe("aksiyon filtreleri", () => {
  it("tüm aksiyonları kopya olarak döner", () => {
    const result = filterActions(actions, "all", now);
    expect(result).toHaveLength(5);
    expect(result).not.toBe(actions);
  });

  it("durum filtresini tam eşleşmeyle uygular", () => {
    expect(filterActions(actions, "open", now)).toHaveLength(2);
    expect(filterActions(actions, "in_progress", now)).toHaveLength(1);
    expect(filterActions(actions, "done", now)).toHaveLength(1);
    expect(filterActions(actions, "cancelled", now)).toHaveLength(1);
  });

  it("gecikmede yalnızca açık/yürütülen ve vadesi geçmiş aksiyonları döner", () => {
    const overdue = filterActions(actions, "overdue", now);
    expect(overdue).toEqual([
      { status: "open", due_at: "2026-03-01T00:00:00Z" },
      { status: "in_progress", due_at: "2026-03-05T00:00:00Z" },
    ]);
  });

  it("tamamlanmış ve iptal edilmiş aksiyonları gecikmiş saymaz", () => {
    const overdue = filterActions(actions, "overdue", now);
    expect(overdue.some((action) => action.status === "done")).toBe(false);
    expect(overdue.some((action) => action.status === "cancelled")).toBe(false);
  });
});
