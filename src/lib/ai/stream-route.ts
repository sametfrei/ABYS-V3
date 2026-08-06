/**
 * Uzun süren AI işlerini NDJSON stream olarak dönen route yardımcısı.
 *
 * Sebep: yerel model CPU'da 5 dakikayı aşabiliyor; tarayıcı ve Node (undici),
 * yanıt başlığı ~300 sn içinde gelmezse bağlantıyı "fetch failed" ile kesiyor.
 * Bu yardımcı bağlantıyı ilk saniyede açar, iş sürerken 10 sn'de bir
 * {"type":"ping"} atar, bitince {"type":"result","data":...} ya da
 * {"type":"error","error":...} gönderir. İstemci karşılığı: lib/ndjson-client.ts
 */
export function streamedJsonResponse<T>(work: () => Promise<T>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const heartbeat = setInterval(() => {
        try {
          send({ type: "ping" });
        } catch {
          clearInterval(heartbeat);
        }
      }, 10_000);

      send({ type: "start" });
      try {
        const data = await work();
        send({ type: "result", data });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bilinmeyen hata.";
        send({ type: "error", error: message });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
