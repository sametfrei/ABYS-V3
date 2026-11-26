"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearSessionCache } from "@/lib/use-session";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Uzun süre açık kalan dashboard sekmelerinde oturumun sessizce dolmasını
 * engeller. Sunucu kapısı her tam sayfa yüklemesinde doğrular; bu bileşen
 * görünürlük/odak ve 5 dakikalık hafif bir kontrolle 401'i yakalayıp login'e
 * döner. Ağ hatasında oturum düşürülmez.
 */
export function SessionExpiryGuard() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function check() {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!cancelled && res.status === 401) {
          clearSessionCache();
          router.replace("/login");
        }
      } catch {
        // Geçici ağ hatası oturumu sonlandırmaz.
      } finally {
        inFlight = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void check();
    }

    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  return null;
}
