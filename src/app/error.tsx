"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Uygulama içi hata sınırı. Kullanıcıya teknik ayrıntı göstermez; hata
 * ayrıntısı yalnızca tarayıcı konsoluna yazılır (sunucu sırları istemciye
 * taşınmaz). Kullanıcı sayfayı yeniden deneyebilir veya panele dönebilir.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ABYS uygulama hatası:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-abys-cream">
      <div className="w-full max-w-lg rounded-2xl border border-abys-cream-border bg-white/70 p-8 text-center">
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
          BEKLENMEYEN HATA
        </p>
        <h1 className="font-serif text-2xl text-abys-navy mb-3">
          Bir şeyler ters gitti.
        </h1>
        <p className="text-sm text-abys-muted mb-6">
          İşleminiz tamamlanamadı. Verileriniz korunuyor. Sayfayı yeniden
          deneyebilir ya da yönetim merkezine dönebilirsiniz.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-abys-accent px-5 py-2.5 text-sm text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            Yeniden dene
          </button>
          <Link
            href="/dashboard"
            className="rounded-full border border-abys-ink/15 px-5 py-2.5 text-sm text-abys-ink hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            Yönetim merkezine dön
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 text-[11px] text-abys-muted">
            Referans: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
