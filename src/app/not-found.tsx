import Link from "next/link";

/** 404 — bilinmeyen yol. Kullanıcıyı panele veya girişe yönlendirir. */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-abys-cream">
      <div className="w-full max-w-lg rounded-2xl border border-abys-cream-border bg-white/70 p-8 text-center">
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
          404
        </p>
        <h1 className="font-serif text-2xl text-abys-navy mb-3">
          Bu sayfa bulunamadı.
        </h1>
        <p className="text-sm text-abys-muted mb-6">
          Aradığınız ekran taşınmış veya hiç var olmamış olabilir.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-abys-accent px-5 py-2.5 text-sm text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            Yönetim merkezi
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-abys-ink/15 px-5 py-2.5 text-sm text-abys-ink hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-abys-accent"
          >
            Giriş
          </Link>
        </div>
      </div>
    </div>
  );
}
