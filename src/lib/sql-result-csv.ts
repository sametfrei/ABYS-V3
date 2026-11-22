/**
 * SQL konnektörü sonuç CSV'si — harici veritabanından gelen alan adları ve
 * değerler güvenilmez girdidir. Ortak `csvCell` kaçışı kullanılır; böylece
 * RFC 4180 kaçışı ve Excel formül enjeksiyonu koruması tüm dışa aktarımlarla
 * aynı davranır.
 */

import { csvCell } from "@/lib/ledger-csv";

export function toSqlResultCsv(
  fields: readonly string[],
  rows: readonly Record<string, unknown>[]
): string {
  const lines = [fields.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(fields.map((field) => csvCell(row[field] as string | number | null | undefined)).join(","));
  }
  return lines.join("\n");
}
