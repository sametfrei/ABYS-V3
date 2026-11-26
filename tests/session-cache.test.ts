import { describe, expect, it } from "vitest";
import { createSessionCache } from "../src/lib/session-cache";

describe("oturum okuma cache'i", () => {
  it("eşzamanlı çağrıları tek istekte birleştirir ve TTL içinde önbellekten döner", async () => {
    let calls = 0;
    let release: ((value: string | null) => void) | null = null;
    let clock = 1_000;
    const cache = createSessionCache<string | null>(
      () => {
        calls++;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      { ttlMs: 5_000, now: () => clock }
    );

    const first = cache.get();
    const second = cache.get();
    expect(calls).toBe(1);

    release!("user-1");
    await expect(first).resolves.toBe("user-1");
    await expect(second).resolves.toBe("user-1");

    clock += 1_000;
    await expect(cache.get()).resolves.toBe("user-1");
    expect(calls).toBe(1);

    clock += 5_000;
    const next = cache.get();
    expect(calls).toBe(2);
    release!("user-2");
    await expect(next).resolves.toBe("user-2");
  });

  it("clear sırasında uçuşta olan eski yanıt yeni oturum cache'ini ezmez", async () => {
    let calls = 0;
    const resolvers: Array<(value: string | null) => void> = [];
    const cache = createSessionCache<string | null>(
      () => {
        calls++;
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      },
      { ttlMs: 60_000, now: () => 0 }
    );

    const oldSession = cache.get();
    cache.clear();
    const newSession = cache.get();
    expect(calls).toBe(2);

    // Eski istek geç döner: yeni cache'e yazılmamalı, yeni inFlight'ı temizlememeli.
    resolvers[0]!("old-user");
    await expect(oldSession).resolves.toBe("old-user");
    const concurrent = cache.get();
    expect(calls).toBe(2); // hâlâ yeni isteğin uçuşu paylaşılıyor

    resolvers[1]!("new-user");
    await expect(newSession).resolves.toBe("new-user");
    await expect(concurrent).resolves.toBe("new-user");
    await expect(cache.get()).resolves.toBe("new-user");
    expect(calls).toBe(2);
  });

  it("hata sonrası yeniden dener; clear önbelleği sıfırlar", async () => {
    let calls = 0;
    let shouldFail = true;
    const cache = createSessionCache<string | null>(
      async () => {
        calls++;
        if (shouldFail) throw new Error("ağ hatası");
        return "user";
      },
      { ttlMs: 60_000, now: () => 0 }
    );

    await expect(cache.get()).rejects.toThrow("ağ hatası");
    shouldFail = false;
    await expect(cache.get()).resolves.toBe("user");
    expect(calls).toBe(2);

    await expect(cache.get()).resolves.toBe("user");
    expect(calls).toBe(2);
    cache.clear();
    await expect(cache.get()).resolves.toBe("user");
    expect(calls).toBe(3);
  });
});
