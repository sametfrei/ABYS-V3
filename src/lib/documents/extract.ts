import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * İkili/ metin belge içeriğinden düz metin çıkarır. Desteklenmeyen türler ve
 * boş/çıkarılamayan içerik için hata fırlatır — sessizce boş belge kaydedilmez.
 */
export async function extractText(
  buf: Buffer,
  mime: string,
  fileName: string
): Promise<{ text: string; sourceType: string }> {
  const normalizedMime = mime.toLowerCase();
  let text: string;
  let sourceType: string;

  if (normalizedMime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
    sourceType = "pdf";
  } else if (
    normalizedMime === DOCX_MIME ||
    normalizedMime.includes("wordprocessingml") ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: buf });
    text = result.value;
    sourceType = "docx";
  } else if (
    normalizedMime === "text/plain" ||
    normalizedMime === "text/csv" ||
    fileName.toLowerCase().endsWith(".txt") ||
    fileName.toLowerCase().endsWith(".csv")
  ) {
    text = buf.toString("utf8");
    sourceType = normalizedMime === "text/csv" || fileName.toLowerCase().endsWith(".csv") ? "csv" : "txt";
  } else {
    throw new Error(`Desteklenmeyen dosya türü: ${mime}`);
  }

  if (!text.trim()) {
    throw new Error("Belgeden metin çıkarılamadı (içerik boş).");
  }

  return { text, sourceType };
}
