import { describe, expect, it } from "vitest";
import { csvCell, ledgerEntryToRow, toLedgerCsv, LEDGER_CSV_HEADER } from "../src/lib/ledger-csv";
import type { LedgerEntry } from "../src/lib/db/repos/decision-ledger";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    decisionId: "d-1",
    caseId: "c-1",
    title: "Fiyat artışı",
    severity: "high",
    confidence: 0.72,
    businessImpact: "Gelir",
    choice: "uygula",
    decidedBy: "CEO",
    decidedAt: "2026-11-01T10:00:00.000Z",
    decisionState: "approved",
    execution: {
      actionId: "a-1",
      title: "Yeni fiyat listesi",
      owner: "Satış",
      status: "open",
      dueAt: "2026-12-01T00:00:00.000Z",
      progressNote: null,
      updatedAt: "2026-11-02T00:00:00.000Z",
      eventCount: 1,
    },
    expectedImpact: {
      value: 120000,
      low: 90000,
      high: 150000,
      currency: "TRY",
      basis: "test",
      assumptions: [],
    },
    actualImpact: {
      value: 100000,
      currency: "TRY",
      measurementStart: null,
      measurementEnd: null,
      evidence: null,
    },
    economicVariance: { amount: -20000, percent: -16.67, currency: "TRY" },
    outcome: {
      result: "improved",
      note: "Satış korundu",
      lesson: null,
      recordedBy: "CFO",
      recordedAt: "2026-11-10T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("karar defteri CSV üretimi", () => {
  it("virgül, tırnak ve satır sonunu RFC 4180'e göre kaçırır", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('de"di')).toBe('"de""di"');
    expect(csvCell("ik\r\nsatır")).toBe('"ik\r\nsatır"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(0)).toBe("0");
  });

  it("başlık sırası sabittir ve satır uzunluğu başlıkla eşleşir", () => {
    const row = ledgerEntryToRow(entry());
    expect(row).toHaveLength(LEDGER_CSV_HEADER.length);
    const csv = toLedgerCsv([entry()]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(LEDGER_CSV_HEADER.join(","));
    expect(lines).toHaveLength(3);
  });

  it("eksik yürütme/sonuç alanlarını boş bırakır, sayıları ham yazar", () => {
    const row = ledgerEntryToRow(
      entry({
        execution: null,
        actualImpact: null,
        economicVariance: null,
        outcome: null,
        expectedImpact: null,
        businessImpact: null,
      })
    );
    expect(row[10]).toBe("");
    expect(row[15]).toBe("");
    expect(row[17]).toBe("");
    expect(row[21]).toBe("");
    expect(row[4]).toBe("0.72");
  });

  it("boş defterde yalnızca başlık satırı döner", () => {
    expect(toLedgerCsv([])).toBe(`${LEDGER_CSV_HEADER.join(",")}\r\n`);
  });

  it("başlıktaki metinleri kaçış kuralına sokar", () => {
    const csv = toLedgerCsv([]);
    expect(csv.includes('""')).toBe(false);
  });
});
