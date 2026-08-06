"use client";

import { useEffect, useState } from "react";

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

export function useSession(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? (await r.json()).user : null))
      .then((u) => {
        if (!cancelled) setUser(u ?? null);
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
