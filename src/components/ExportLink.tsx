/**
 * CSV indirme bağlantısı — tarayıcı yerel indirme akışını kullanır.
 * Sunucu ucu kimlik/izin denetimini kendisi yapar; burada yalnızca bağlantı
 * gösterilir, veri istemcide işlenmez.
 */
export function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 text-xs rounded-full border border-abys-ink/15 px-3 py-1.5 text-abys-ink hover:bg-white/60 transition-colors"
    >
      <span aria-hidden="true">↓</span>
      {label}
    </a>
  );
}
