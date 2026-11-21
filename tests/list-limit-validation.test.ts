import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, parseListLimit } from "../src/lib/data/route-schemas";

describe("liste limiti doğrulaması", () => {
  it("boş veya eksik değerde varsayılana döner", () => {
    expect(parseListLimit(null)).toEqual({ ok: true, limit: DEFAULT_LIST_LIMIT });
    expect(parseListLimit("")).toEqual({ ok: true, limit: DEFAULT_LIST_LIMIT });
    expect(parseListLimit("   ")).toEqual({ ok: true, limit: DEFAULT_LIST_LIMIT });
  });

  it("sınırlar içindeki tamsayıları kabul eder", () => {
    expect(parseListLimit("1")).toEqual({ ok: true, limit: 1 });
    expect(parseListLimit(String(MAX_LIST_LIMIT))).toEqual({ ok: true, limit: MAX_LIST_LIMIT });
    expect(parseListLimit("37")).toEqual({ ok: true, limit: 37 });
  });

  it.each(["abc", "0", "-1", "1.5", "1e2", "+3", "201", "999999999999999999999"])(
    "geçersiz değer %s reddedilir",
    (raw) => {
      const parsed = parseListLimit(raw);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toContain("limit");
    }
  );
});
