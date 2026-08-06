import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseTable } from "@/lib/data/parse-table";

describe("parseTable — CSV/TSV", () => {
  it("tırnak içindeki virgülü tek hücre olarak okur", () => {
    const csv = 'Ad,Not\n"Acme, Inc.",İyi müşteri\n';
    const table = parseTable(Buffer.from(csv, "utf-8"), "text/csv", "veri.csv");
    expect(table.headers).toEqual(["Ad", "Not"]);
    expect(table.rows).toEqual([["Acme, Inc.", "İyi müşteri"]]);
  });

  it("tırnaklı alan içindeki gömülü satır sonunu bozmadan okur", () => {
    const csv = 'Ad,Açıklama\n"Satır 1\nSatır 2",tamam\n';
    const table = parseTable(Buffer.from(csv, "utf-8"), "text/csv", "veri.csv");
    expect(table.headers).toEqual(["Ad", "Açıklama"]);
    expect(table.rows).toEqual([["Satır 1\nSatır 2", "tamam"]]);
  });

  it("BOM'lu dosyayı temizleyip okur", () => {
    const csv = "﻿Ad,Değer\nX,10\n";
    const table = parseTable(Buffer.from(csv, "utf-8"), "text/csv", "veri.csv");
    expect(table.headers).toEqual(["Ad", "Değer"]);
    expect(table.rows).toEqual([["X", "10"]]);
  });

  it("noktalı virgül ayırıcıyı otomatik algılar", () => {
    const csv = "Ad;Değer\nX;10\nY;20\n";
    const table = parseTable(Buffer.from(csv, "utf-8"), "text/csv", "veri.csv");
    expect(table.headers).toEqual(["Ad", "Değer"]);
    expect(table.rows).toEqual([
      ["X", "10"],
      ["Y", "20"],
    ]);
  });

  it("boş dosya için çökmeden boş sonuç döner", () => {
    const table = parseTable(Buffer.from("", "utf-8"), "text/csv", "bos.csv");
    expect(table.headers).toEqual([]);
    expect(table.rows).toEqual([]);
  });

  it("yalnızca başlık satırı olan dosya için boş rows döner", () => {
    const table = parseTable(Buffer.from("Ad,Değer\n", "utf-8"), "text/csv", "sadece-baslik.csv");
    expect(table.headers).toEqual(["Ad", "Değer"]);
    expect(table.rows).toEqual([]);
  });

  it("dosya adından .tsv uzantısını tanır", () => {
    const tsv = "Ad\tDeğer\nX\t10\n";
    const table = parseTable(Buffer.from(tsv, "utf-8"), "", "veri.tsv");
    expect(table.headers).toEqual(["Ad", "Değer"]);
    expect(table.rows).toEqual([["X", "10"]]);
  });
});

describe("parseTable — XLSX", () => {
  it("ilk sayfayı başlık + satır olarak okur", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Ad", "Değer"],
      ["X", 10],
      ["Y", 20],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sayfa1");
    const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const table = parseTable(
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "veri.xlsx"
    );
    expect(table.headers).toEqual(["Ad", "Değer"]);
    expect(table.rows).toEqual([
      ["X", "10"],
      ["Y", "20"],
    ]);
  });

  it("birden fazla sayfa varsa yalnızca ilkini okur", () => {
    const sheet1 = XLSX.utils.aoa_to_sheet([["Ad"], ["X"]]);
    const sheet2 = XLSX.utils.aoa_to_sheet([["Diğer"], ["Y"]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet1, "Birinci");
    XLSX.utils.book_append_sheet(workbook, sheet2, "İkinci");
    const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const table = parseTable(buf, "", "veri.xlsx");
    expect(table.headers).toEqual(["Ad"]);
    expect(table.rows).toEqual([["X"]]);
  });
});

describe("parseTable — desteklenmeyen tür", () => {
  it("bilinmeyen mime türü için Türkçe hata fırlatır", () => {
    expect(() => parseTable(Buffer.from("%PDF-1.4"), "application/pdf", "belge.pdf")).toThrow(
      /Desteklenmeyen dosya türü/
    );
  });
});
