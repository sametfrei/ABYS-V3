"use client";

import { useEffect, useState } from "react";
import { createSessionCache } from "./session-cache";

/**
 * Sunucu oturumunu UI'a bağlar (/api/auth/me). null = oturum yok
 * (prototip localStorage akışı sürer), undefined = henüz bilinmiyor.
 * Faz 2 geçiş stratejisi: oturum varsa sayfalar sunucu verisini kullanır.
 */
export interface SessionUser {
  displayName: string;
  role: string;
  orgId: string;
  orgCode: string | null;
  orgName: string;
  sectorId: string;
}

const sessionCache = createSessionCache<SessionUser | null>(async () => {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    const body = (await res.json()) as { user?: SessionUser | null };
    return body.user ?? null;
  } catch {
    return null;
  }
});

/**
 * Login/logout sonrası çağrılmalıdır. Tam sayfa yenilemesi olmadan yapılan
 * istemci yönlendirmelerinde eski oturumun TTL boyunca görünmesini engeller.
 */
export function clearSessionCache(): void {
  sessionCache.clear();
}

export function useSession(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // Aynı anda mount olan bileşenler tek isteği paylaşır; 401 tekrarı azalır.
    sessionCache
      .get()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
