/**
 * Oturum okumasını tek uçuşta birleştiren küçük cache.
 *
 * Neden: dashboard'daki 18 bileşen aynı anda `/api/auth/me` çağırıyordu.
 * Bu, oturum yokken tekrarlanan 401 isteklerine ve gereksiz sunucu yüküne
 * yol açıyordu. Aynı anda yapılan çağrılar tek Promise'i paylaşır; kısa TTL
 * içindeki ardışık çağrılar da önbellekten döner. Login/logout tam sayfa
 * yenilemesi yaptığı için modül cache'i sıfırlanır.
 */

export interface SessionCache<T> {
  get(): Promise<T>;
  clear(): void;
}

export function createSessionCache<T>(
  load: () => Promise<T>,
  options: { ttlMs?: number; now?: () => number } = {}
): SessionCache<T> {
  const ttlMs = Math.max(0, options.ttlMs ?? 5_000);
  const now = options.now ?? (() => Date.now());
  let cached: { value: T; at: number } | null = null;
  let inFlight: Promise<T> | null = null;
  // clear() sırasında uçuşta olan eski istek, yeni oturumun cache'ini ezmemeli.
  let generation = 0;

  return {
    get() {
      if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value);
      if (inFlight) return inFlight;
      const requestGeneration = generation;
      inFlight = load()
        .then((value) => {
          if (requestGeneration === generation) cached = { value, at: now() };
          return value;
        })
        .finally(() => {
          if (requestGeneration === generation) inFlight = null;
        });
      return inFlight;
    },
    clear() {
      generation += 1;
      cached = null;
      inFlight = null;
    },
  };
}
