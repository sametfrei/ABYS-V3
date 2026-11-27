import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "@/lib/auth/core";

/**
 * Canlı olay akışı (SSE). GET /api/integration/stream
 *
 * integration_events tablosunu 5 sn'de bir org kapsamında yoklar (poll),
 * son yoklamadan sonra alınan (received_at) yeni olayları
 * `data: {json}\n\n` biçiminde gönderir. Bağlantı istemci tarafından
 * kesilirse (request.signal abort) ya da 30 dakika dolarsa kapanır.
 *
 * Her 15 sn'de bir `: heartbeat` yorum satırı yazılır — bazı reverse proxy'ler
 * sessiz bağlantıyı keser, SSE yorum satırları istemciye görünmez.
 */
const POLL_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_DURATION_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const store = await cookies();
  const session = await getSession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return new Response("Oturum gerekli.", { status: 401 });
  }
  if (!hasPermission(session.role, "view_decisions")) {
    return new Response("Bu işlem için yetkiniz yok: view_decisions gerekli.", { status: 403 });
  }

  const orgId = session.orgId;
  const encoder = new TextEncoder();
  let closeStream: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      // Aynı anda birden fazla poll çalışmasını engeller. Yavaş bir PGlite
      // sorgusu 5 sn'yi aşarsa setInterval yeni poll'lar başlatır ve bekleyen
      // sorgu/promise/closure sayısı sınırsız büyürdü (bellek taşması).
      let pollInFlight = false;
      let lastCheck = new Date();
      const timers: {
        interval?: ReturnType<typeof setInterval>;
        heartbeat?: ReturnType<typeof setInterval>;
        autoClose?: ReturnType<typeof setTimeout>;
      } = {};

      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          close();
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          close();
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (timers.interval) clearInterval(timers.interval);
        if (timers.heartbeat) clearInterval(timers.heartbeat);
        if (timers.autoClose) clearTimeout(timers.autoClose);
        req.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // zaten kapanmış olabilir
        }
      };

      const poll = async () => {
        if (closed || pollInFlight) return;
        pollInFlight = true;
        const checkedAt = new Date();
        try {
          await migrate();
          const db = getDb();
          const result = await db.query<{
            id: string;
            event_type: string;
            actor_ref: string | null;
            subject_ref: string | null;
            occurred_at: string;
            payload: unknown;
            source: string;
          }>(
            `SELECT id, event_type, actor_ref, subject_ref, occurred_at, payload, source
             FROM integration_events
             WHERE org_id = $1 AND received_at > $2
             ORDER BY received_at ASC
             LIMIT 500`,
            [orgId, lastCheck.toISOString()]
          );
          lastCheck = checkedAt;
          for (const row of result.rows) {
            send({ type: "event", data: row });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Bilinmeyen hata.";
          send({ type: "error", error: message });
        } finally {
          pollInFlight = false;
        }
      };

      closeStream = close;
      req.signal.addEventListener("abort", close);
      // İstek başlamadan önce iptal edilmişse timer kurmadan kapat.
      if (req.signal.aborted) {
        close();
        return;
      }

      send({ type: "start" });
      // send() enqueue hatasında close() çalışır; bu durumda timer kurma.
      if (closed) return;

      timers.interval = setInterval(poll, POLL_INTERVAL_MS);
      timers.heartbeat = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      timers.autoClose = setTimeout(close, MAX_DURATION_MS);
    },
    // İstemci stream'i iptal ederse (abort sinyali gelmese bile) tüm
    // timer'lar ve dinleyiciler temizlenir.
    cancel() {
      closeStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
