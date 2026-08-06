import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { getSession } from "@/lib/auth/core";
import { hasPermission } from "@/lib/auth/permissions";
import { SESSION_COOKIE } from "../../auth/login/route";

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

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastCheck = new Date();

      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        clearTimeout(autoClose);
        try {
          controller.close();
        } catch {
          // zaten kapanmış olabilir
        }
      };

      const poll = async () => {
        if (closed) return;
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
             ORDER BY received_at ASC`,
            [orgId, lastCheck.toISOString()]
          );
          lastCheck = checkedAt;
          for (const row of result.rows) {
            send({ type: "event", data: row });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Bilinmeyen hata.";
          send({ type: "error", error: message });
        }
      };

      send({ type: "start" });
      const interval = setInterval(poll, POLL_INTERVAL_MS);
      const heartbeat = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      const autoClose = setTimeout(close, MAX_DURATION_MS);

      req.signal.addEventListener("abort", close);
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
