import { randomBytes } from "crypto";
import { getDb, migrate } from "../client";
import { embed, isEmbeddingAvailable, cosineSimilarity } from "@/lib/ai/embeddings";

/**
 * Kurumsal hafıza belge katmanı (Faz 5).
 * Belgeler parçalara bölünür; her parça atıf verilebilir en küçük birimdir.
 * Erişim yetki-farkındalıklıdır (allowed_roles) ve org-izolasyonludur.
 *
 * Erişim şu an deterministik anahtar-kelime skorlamasıyla çalışır: hızlı,
 * açıklanabilir ve model gerektirmez. Semantik (embedding) sıralama
 * eklendiğinde bu arayüz değişmez — yalnızca skorlama güçlenir.
 */

const CHUNK_SIZE = 700; // karakter — paragraf bütünlüğü korunarak bölünür

export function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && (current + "\n\n" + p).length > CHUNK_SIZE) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  // Tek paragraf çok uzunsa sert böl
  return chunks.flatMap((c) =>
    c.length <= CHUNK_SIZE * 1.5
      ? [c]
      : (c.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, "g")) ?? [c])
  );
}

export async function insertDocument(params: {
  orgId: string;
  title: string;
  sourceType: string;
  mime?: string;
  text: string;
  uploadedBy: string;
  allowedRoles?: string[];
}): Promise<{ documentId: string; chunkCount: number; embedded: boolean }> {
  await migrate();
  const db = getDb();
  const id = randomBytes(8).toString("hex");
  await db.query(
    `INSERT INTO documents (id, org_id, title, source_type, mime, byte_size, uploaded_by, allowed_roles)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      params.orgId,
      params.title,
      params.sourceType,
      params.mime ?? null,
      Buffer.byteLength(params.text, "utf8"),
      params.uploadedBy,
      params.allowedRoles ?? null,
    ]
  );
  const chunks = chunkText(params.text);
  // Embedding varsa üretilir; yoksa null kalır ve erişim anahtar-kelimeyle çalışır.
  const vectors = (await isEmbeddingAvailable()) ? await embed(chunks) : null;
  for (let i = 0; i < chunks.length; i++) {
    await db.query(
      "INSERT INTO document_chunks (id, org_id, document_id, chunk_index, text, embedding) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        randomBytes(8).toString("hex"),
        params.orgId,
        id,
        i,
        chunks[i],
        vectors ? JSON.stringify(vectors[i]) : null,
      ]
    );
  }
  return { documentId: id, chunkCount: chunks.length, embedded: !!vectors };
}

export async function listDocuments(orgId: string, role: string) {
  await migrate();
  const r = await getDb().query(
    `SELECT id, title, source_type, byte_size, uploaded_by, version, created_at,
            (SELECT count(*)::int FROM document_chunks ch WHERE ch.document_id = d.id) AS chunk_count
     FROM documents d
     WHERE org_id = $1 AND (allowed_roles IS NULL OR $2 = ANY(allowed_roles))
     ORDER BY created_at DESC`,
    [orgId, role]
  );
  return r.rows;
}

export interface RetrievedChunk {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  text: string;
  score: number;
}

/** Türkçe metni kaba kelime kümesine indirger (ortak ekler için gövde kırpma yok). */
function terms(q: string): string[] {
  return q
    .toLocaleLowerCase("tr-TR")
    .split(/[^a-zçğıöşü0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Yetki-farkındalıklı erişim: sorgu terimlerinin parça içinde geçme sayısına
 * göre deterministik skorlama. Sonuçlar atıf için belge başlığı + parça
 * sırasıyla döner. Eşleşme yoksa BOŞ döner — uydurma atıf üretilmez.
 */
export async function retrieveChunks(params: {
  orgId: string;
  role: string;
  query: string;
  limit?: number;
}): Promise<RetrievedChunk[]> {
  await migrate();
  const t = terms(params.query);
  if (t.length === 0) return [];

  const r = await getDb().query<{
    document_id: string;
    title: string;
    chunk_index: number;
    text: string;
    embedding: string | null;
  }>(
    `SELECT ch.document_id, d.title, ch.chunk_index, ch.text, ch.embedding
     FROM document_chunks ch JOIN documents d ON d.id = ch.document_id
     WHERE ch.org_id = $1 AND (d.allowed_roles IS NULL OR $2 = ANY(d.allowed_roles))`,
    [params.orgId, params.role]
  );
  if (r.rows.length === 0) return [];

  // Anahtar-kelime skoru (deterministik, her zaman hesaplanır)
  const keyword = r.rows.map((row) => {
    const lower = row.text.toLocaleLowerCase("tr-TR");
    let score = 0;
    for (const term of t) score += lower.split(term).length - 1;
    return score;
  });
  const maxKeyword = Math.max(...keyword, 0);

  // Semantik skor (embedding varsa) — hibrit sıralama için
  let semantic: number[] | null = null;
  const haveVectors = r.rows.some((row) => row.embedding);
  if (haveVectors && (await isEmbeddingAvailable())) {
    const qv = await embed([params.query]);
    if (qv) {
      semantic = r.rows.map((row) => {
        if (!row.embedding) return 0;
        try {
          return cosineSimilarity(qv[0], JSON.parse(row.embedding) as number[]);
        } catch {
          return 0;
        }
      });
    }
  }

  const scored = r.rows.map((row, i) => {
    const kw = maxKeyword > 0 ? keyword[i] / maxKeyword : 0;
    const sem = semantic ? semantic[i] : 0;
    // Hibrit: anlam yakalar, anahtar-kelime kesinliği korur.
    const score = semantic ? 0.6 * sem + 0.4 * kw : kw;
    return {
      documentId: row.document_id,
      documentTitle: row.title,
      chunkIndex: row.chunk_index,
      text: row.text,
      score,
      keywordHits: keyword[i],
      semanticScore: sem,
    };
  });

  // Eşik: anahtar-kelime eşleşmesi VEYA belirgin anlamsal yakınlık.
  // Hiçbiri yoksa BOŞ döner — alakasız parça atıf olarak gösterilmez.
  return scored
    .filter((x) => x.keywordHits > 0 || x.semanticScore >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? 5)
    .map(({ keywordHits, semanticScore, ...rest }) => {
      void keywordHits;
      void semanticScore;
      return rest;
    });
}
