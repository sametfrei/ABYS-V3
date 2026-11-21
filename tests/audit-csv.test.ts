import { describe, expect, it } from "vitest";
import { AUDIT_CSV_HEADER, auditRowToCells, toAuditCsv, type AuditCsvRow } from "../src/lib/audit-csv";

function row(overrides: Partial<AuditCsvRow> = {}): AuditCsvRow {
  return {
    id: "e1",
    created_at: "2026-11-21T10:00:00.000Z",
    actor: "CEO",
    type: "test_event",
    summary: "Özet",
    detail: null,
    prev_hash: "GENESIS",
    entry_hash: "a".repeat(64),
    ...overrides,
  };
}

describe("denetim CSV üretimi", () => {
  it("başlık sırası sabittir ve satır uzunluğu eşleşir", () => {
    expect(auditRowToCells(row())).toHaveLength(AUDIT_CSV_HEADER.length);
    const csv = toAuditCsv([row()]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(AUDIT_CSV_HEADER.join(","));
    expect(lines.filter(Boolean)).toHaveLength(2);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("null ayrıntı ve hash alanlarını boş bırakır", () => {
    const cells = auditRowToCells(row({ detail: null, prev_hash: null, entry_hash: null }));
    expect(cells[AUDIT_CSV_HEADER.indexOf("detail")]).toBe("");
    expect(cells[AUDIT_CSV_HEADER.indexOf("prev_hash")]).toBe("");
    expect(cells[AUDIT_CSV_HEADER.indexOf("entry_hash")]).toBe("");
  });

  it("virgül ve tırnakları RFC 4180'e göre kaçırır", () => {
    const csv = toAuditCsv([row({ summary: 'a,b "c"' })]);
    expect(csv).toContain('"a,b ""c"""');
  });

  it("boş listede yalnızca başlık döner", () => {
    expect(toAuditCsv([])).toBe(`${AUDIT_CSV_HEADER.join(",")}\r\n`);
  });
});
