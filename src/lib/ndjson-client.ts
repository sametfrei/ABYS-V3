/**
 * lib/ai/stream-route.ts ile üretilen NDJSON stream yanıtlarının istemci
 * karşılığı: ping satırlarını atlar, {"type":"result"} gelince data'yı döner,
 * {"type":"error"} gelince fırlatır. Doğrulama hataları (4xx) stream'den önce
 * düz JSON döndüğü için onları da yakalar.
 */
export async function postJsonStreamed<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readNdjsonResult<T>(res);
}

/** postJsonStreamed'in FormData (dosya yükleme) sürümü — aynı NDJSON sözleşmesi. */
export async function postFormStreamed<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  return readNdjsonResult<T>(res);
}

async function readNdjsonResult<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? "İstek başarısız oldu.");
  }
  if (!res.body) throw new Error("Sunucu yanıtı boş.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line: string): { data: T } | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const msg = JSON.parse(trimmed) as { type?: string; error?: string; data?: T };
    if (msg.type === "error") throw new Error(msg.error ?? "İşlem başarısız oldu.");
    if (msg.type === "result") return { data: msg.data as T };
    return null;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const result = handleLine(line);
      if (result) return result.data;
    }
  }
  const result = handleLine(buffer);
  if (result) return result.data;
  throw new Error("Sonuç alınamadı — bağlantı erken kapandı.");
}
