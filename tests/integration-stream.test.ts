import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SSE poll'u aynı anda tek sorgu çalıştırmalı; abort veya istemci iptalinden
 * sonra yeni sorgu başlatmamalı ve timer'ları temizlemeli.
 */
const state = vi.hoisted(() => ({
  queryCalls: 0,
  pending: [] as Array<(rows: unknown[]) => void>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ name: "abys_session", value: "test-session" }),
  }),
}));

vi.mock("@/lib/auth/core", () => ({
  SESSION_COOKIE: "abys_session",
  getSession: async () => ({ orgId: "org-stream", role: "ceo" }),
}));

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: () => true,
}));

vi.mock("@/lib/db/client", () => ({
  migrate: async () => {},
  getDb: () => ({
    query: () => {
      state.queryCalls += 1;
      return new Promise((resolve) => {
        state.pending.push((rows) => resolve({ rows }));
      });
    },
  }),
}));

const { GET } = await import("../src/app/api/integration/stream/route");

function flushPending(rows: unknown[] = []): void {
  const resolvers = state.pending.splice(0);
  for (const resolve of resolvers) resolve(rows);
}

async function startStream(signal: AbortSignal) {
  // Route yalnızca req.signal kullanıyor; NextRequest'in sinyali kopyalama
  // davranışına bağlı kalmadan abort dinleyicisini doğrudan test et.
  const response = await GET({ signal } as unknown as NextRequest);
  const reader = response.body!.getReader();
  await reader.read(); // start olayı
  return reader;
}

describe("integration SSE akışı", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.queryCalls = 0;
    state.pending = [];
  });

  afterEach(() => {
    flushPending();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("yavaş sorgu sürerken yeni poll başlatmaz; abort sonrası sorgu açmaz", async () => {
    const abort = new AbortController();
    const reader = await startStream(abort.signal);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.queryCalls).toBe(1);

    // İlk sorgu hâlâ uçuşta: ikinci interval yeni sorgu açmamalı.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.queryCalls).toBe(1);

    flushPending();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.queryCalls).toBe(2);

    abort.abort();
    await vi.advanceTimersByTimeAsync(0);
    let tail = await reader.read();
    while (!tail.done) tail = await reader.read();
    expect(tail.done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    // Kapanmış stream için interval artık sorgu üretmemeli.
    flushPending();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.queryCalls).toBe(2);
  });

  it("başlamadan iptal edilen istekte timer kurmaz", async () => {
    const abort = new AbortController();
    abort.abort();
    const response = await GET({ signal: abort.signal } as unknown as NextRequest);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(true);
    expect(state.queryCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("istemci stream'i iptal ederse timer'lar temizlenir", async () => {
    const abort = new AbortController();
    const reader = await startStream(abort.signal);
    await reader.cancel();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.queryCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
