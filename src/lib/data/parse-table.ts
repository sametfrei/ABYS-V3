import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function isCsvLike(mime: string, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (
    mime === "text/csv" ||
    mime === "text/tab-separated-values" ||
    mime === "application/csv" ||
    mime === "text/plain"
  ) {
    return true;
  }
  return lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt");
}

function isExcelLike(mime: string, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    return true;
  }
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

function parseCsv(buf: Buffer): ParsedTable {
  const text = stripBom(buf.toString("utf-8"));
  if (!text.trim()) return { headers: [], rows: [] };

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  const data = result.data;
  if (data.length === 0) return { headers: [], rows: [] };

  const [headerRow, ...rest] = data;
  return {
    headers: headerRow.map((h) => (h ?? "").trim()),
    rows: rest.map((row) => row.map((cell) => cell ?? "")),
  };
}

function parseExcel(buf: Buffer): ParsedTable {
  const workbook = XLSX.read(buf, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown as string[][];
  if (data.length === 0) return { headers: [], rows: [] };

  const [headerRow, ...rest] = data;
  return {
    headers: headerRow.map((h) => String(h ?? "").trim()),
    rows: rest.map((row) => row.map((cell) => String(cell ?? ""))),
  };
}

/**
 * CSV/TSV/XLSX/XLS içeriğinden başlık + satır dizisi çıkarır. Boş dosya ve
 * yalnızca başlık satırı olan dosya için çökmeden boş rows döner.
 */
export function parseTable(buf: Buffer, mime: string, fileName: string): ParsedTable {
  const normalizedMime = (mime || "").toLowerCase();

  if (isExcelLike(normalizedMime, fileName)) {
    return parseExcel(buf);
  }
  if (isCsvLike(normalizedMime, fileName)) {
    return parseCsv(buf);
  }
  throw new Error(`Desteklenmeyen dosya türü: ${mime || fileName}`);
}
