import { describe, expect, it } from "vitest";
import { toSqlResultCsv } from "../src/lib/sql-result-csv";

describe("SQL konnektörü sonuç CSV'si", () => {
  it("alan sırasını korur ve satırları LF ile ayırır", () => {
    const csv = toSqlResultCsv(
      ["customer", "amount"],
      [
        { customer: "Ada", amount: 42 },
        { customer: "Bora", amount: 7 },
      ]
    );
    expect(csv).toBe("customer,amount\nAda,42\nBora,7");
  });

  it("harici değerlerde virgül, tırnak ve satır sonunu RFC 4180'e göre kaçırır", () => {
    const csv = toSqlResultCsv(
      ["note"],
      [{ note: 'a,b "c"\nsatır' }]
    );
    expect(csv).toBe('note\n"a,b ""c""\nsatır"');
  });

  it("harici formül tetikleyicilerini düz metne sabitler", () => {
    const csv = toSqlResultCsv(
      ["=cmd", "value"],
      [
        { "=cmd": "=1+1", value: "+1+1" },
        { "=cmd": "-1+1", value: "@SUM(A1)" },
        { "=cmd": "\t=cmd", value: -20000 },
      ]
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("'=cmd,value");
    expect(lines[1]).toBe("'=1+1,'+1+1");
    expect(lines[2]).toBe("'-1+1,'@SUM(A1)");
    expect(lines[3]).toBe("\"'\t=cmd\",-20000");
  });

  it("null/undefined hücreleri boş bırakır", () => {
    const csv = toSqlResultCsv(["a", "b"], [{ a: null, b: undefined }]);
    expect(csv).toBe("a,b\n,");
  });
});
