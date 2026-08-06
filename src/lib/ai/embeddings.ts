/**
 * Embedding sağlayıcı (Faz 5, master plan md.4 EmbeddingProvider arayüzü).
 *
 * İLKE: Embedding OPSİYONELDİR. Model yoksa/başarısızsa sistem sessizce
 * deterministik anahtar-kelime erişimine döner — erişim hiçbir zaman
 * tamamen modele bağımlı olmaz (açıklanabilirlik ve dayanıklılık).
 *
 * Gizlilik: embedding üretimi de AI politikasına tabidir. LOCAL_ONLY altında
 * yalnızca yerel Ollama kullanılır; belge metni buluta gönderilmez.
 */

const EMBED_MODEL = () => process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const BASE_URL = () => process.env.OLLAMA_URL || "http://localhost:11434";

/** Bulut politikalarında yerel embedding zorunlu değildir; yine de asla buluta gönderilmez. */
export async function isEmbeddingAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const j = (await res.json()) as { models?: { name: string }[] };
    return (j.models ?? []).some((m) => m.name.startsWith(EMBED_MODEL()));
  } catch {
    return false;
  }
}

/** Metin listesini vektörlere çevirir. Başarısızlıkta null döner (çağıran geri düşer). */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  try {
    const res = await fetch(`${BASE_URL()}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL(), input: texts }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { embeddings?: number[][] };
    if (!j.embeddings || j.embeddings.length !== texts.length) return null;
    return j.embeddings;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
