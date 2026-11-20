#!/usr/bin/env node

const endpoint =
  process.env.ABYS_SCHEDULER_URL ?? "http://127.0.0.1:3100/api/connectors/scheduler/run";
const token = process.env.ABYS_SCHEDULER_TOKEN;
const pollMs = Math.max(
  10_000,
  Number(process.env.ABYS_SCHEDULER_POLL_MS ?? "60000") || 60_000
);

if (!token) {
  console.error("ABYS_SCHEDULER_TOKEN tanımlı değil; zamanlayıcı başlatılmadı.");
  process.exit(1);
}

let stopped = false;
let timer = null;

async function tick() {
  if (stopped) return;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`Zamanlayıcı isteği başarısız: HTTP ${response.status}`, body);
    } else {
      console.log(
        `[${new Date().toISOString()}] due=${body.dueCount ?? 0} ok=${body.succeeded ?? 0} ` +
          `failed=${body.failed ?? 0} skipped=${body.skipped ?? 0}`
      );
    }
  } catch (err) {
    console.error(
      `Zamanlayıcı isteği çalıştırılamadı: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    if (!stopped) timer = setTimeout(tick, pollMs);
  }
}

function stop() {
  stopped = true;
  if (timer) clearTimeout(timer);
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(`Konnektör zamanlayıcısı çalışıyor: ${endpoint} (${pollMs}ms)`);
void tick();
