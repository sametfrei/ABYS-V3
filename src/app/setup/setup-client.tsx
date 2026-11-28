"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { SECTORS, type SectorId } from "@/lib/sectors";
import type { Locale } from "@/lib/i18n";

type Availability = "checking" | "available" | "closed";
type SetupClientProps = { locale: Locale };

export default function SetupClient({ locale }: SetupClientProps) {
  const isTr = locale === "tr";
  const [availability, setAvailability] = useState<Availability>("checking");
  const [token, setToken] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [sectorId, setSectorId] = useState<SectorId>("other");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/bootstrap", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("setup_unavailable");
        return response.json() as Promise<{ available?: boolean }>;
      })
      .then((body) => {
        if (!cancelled) setAvailability(body.available ? "available" : "closed");
      })
      .catch(() => {
        if (!cancelled) setAvailability("closed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || availability !== "available") return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          organizationName,
          sectorId,
          adminDisplayName,
          adminEmail,
          password,
          passwordConfirmation,
        }),
      });
      const body = await response.json().catch(() => null) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !body?.ok) {
        setError(body?.error ?? (isTr ? "Kurulum tamamlanamadı." : "Setup could not be completed."));
        return;
      }

      setToken("");
      setPassword("");
      setPasswordConfirmation("");
      setCreated(true);
      setAvailability("closed");
    } catch {
      setError(isTr ? "Sunucuya ulaşılamadı. Tekrar deneyin." : "The server could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = isTr ? "İlk kurum kurulumu" : "Initial organization setup";
  const description = isTr
    ? "Bu ekran yalnızca boş veritabanında ve sunucuya ait tek kullanımlık kurulum anahtarıyla çalışır."
    : "This screen works only on an empty database with the server's one-time setup token.";

  return (
    <main className="min-h-screen bg-abys-cream px-5 py-12 text-abys-ink sm:px-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/login" className="font-serif text-2xl text-abys-navy">ABYS</Link>
          <span className="text-xs font-semibold tracking-widest text-abys-muted">
            {isTr ? "GÜVENLİ İLK KURULUM" : "SECURE FIRST-TIME SETUP"}
          </span>
        </div>

        <section className="rounded-2xl border border-abys-cream-border bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-abys-accent">
            {isTr ? "SİSTEM YÖNETİCİSİ" : "SYSTEM ADMINISTRATOR"}
          </p>
          <h1 className="mt-3 font-serif text-3xl text-abys-navy">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-abys-muted">{description}</p>

          {availability === "checking" && (
            <p className="mt-8 text-sm text-abys-muted">
              {isTr ? "Kurulum durumu kontrol ediliyor..." : "Checking setup status..."}
            </p>
          )}

          {availability === "closed" && (
            <div className="mt-8 rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-4">
              <p className="text-sm font-semibold text-abys-navy">
                {created
                  ? (isTr ? "İlk yönetici hesabı oluşturuldu." : "The first administrator account was created.")
                  : (isTr ? "İlk kurulum kapalı." : "Initial setup is closed.")}
              </p>
              <p className="mt-2 text-sm text-abys-muted">
                {created
                  ? (isTr ? "Artık yönetici e-postanız ve parolanızla giriş yapabilirsiniz." : "You can now sign in with your administrator email and password.")
                  : (isTr ? "Veritabanında zaten kayıt bulunuyor veya sunucu kurulum anahtarı etkin değil." : "The database already has records or the server setup token is not enabled.")}
              </p>
              <Link href="/login" className="mt-4 inline-flex rounded-full bg-abys-navy px-5 py-2.5 text-sm font-medium text-white">
                {isTr ? "Giriş ekranına git" : "Go to sign in"}
              </Link>
            </div>
          )}

          {availability === "available" && (
            <form onSubmit={submit} className="mt-8 space-y-5" aria-busy={busy}>
              <div>
                <label htmlFor="bootstrap-token" className="mb-2 block text-xs font-semibold text-abys-navy">
                  {isTr ? "Tek kullanımlık kurulum anahtarı" : "One-time setup token"}
                </label>
                <input
                  id="bootstrap-token"
                  type="password"
                  autoComplete="off"
                  required
                  minLength={32}
                  maxLength={128}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  className="w-full rounded-xl border border-abys-cream-border px-4 py-3 text-sm outline-none focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20"
                />
              </div>

              <div className="border-t border-abys-cream-border pt-5">
                <h2 className="font-serif text-xl text-abys-navy">
                  {isTr ? "Kurum bilgileri" : "Organization details"}
                </h2>
              </div>
              <div>
                <label htmlFor="organization-name" className="mb-2 block text-xs font-semibold text-abys-navy">
                  {isTr ? "Kurum adı" : "Organization name"}
                </label>
                <input
                  id="organization-name"
                  required
                  minLength={2}
                  maxLength={150}
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  className="w-full rounded-xl border border-abys-cream-border px-4 py-3 text-sm outline-none focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20"
                />
              </div>
              <div>
                <label htmlFor="sector" className="mb-2 block text-xs font-semibold text-abys-navy">
                  {isTr ? "Sektör" : "Industry"}
                </label>
                <select
                  id="sector"
                  value={sectorId}
                  onChange={(event) => setSectorId(event.target.value as SectorId)}
                  className="w-full rounded-xl border border-abys-cream-border bg-white px-4 py-3 text-sm outline-none focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20"
                >
                  {SECTORS.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {isTr ? sector.label : sector.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-abys-cream-border pt-5">
                <h2 className="font-serif text-xl text-abys-navy">
                  {isTr ? "İlk sistem yöneticisi" : "First system administrator"}
                </h2>
                <p className="mt-2 text-xs text-abys-muted">
                  {isTr ? "Bu hesap kurumun tam yönetim yetkisine sahip olacaktır." : "This account will have full system administration permissions for the organization."}
                </p>
              </div>
              <div>
                <label htmlFor="admin-name" className="mb-2 block text-xs font-semibold text-abys-navy">
                  {isTr ? "Ad soyad" : "Full name"}
                </label>
                <input
                  id="admin-name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={adminDisplayName}
                  onChange={(event) => setAdminDisplayName(event.target.value)}
                  className="w-full rounded-xl border border-abys-cream-border px-4 py-3 text-sm outline-none focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20"
                />
              </div>
              <div>
                <label htmlFor="admin-email" className="mb-2 block text-xs font-semibold text-abys-navy">
                  {isTr ? "Yönetici e-postası" : "Administrator email"}
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="username"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  className="w-full rounded-xl border border-abys-cream-border px-4 py-3 text-sm outline-none focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20"
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="mb-2 block text-xs font-semibold text-abys-navy">
                  {isTr ? "Parola (en az 12 karakter)" : "Password (at least 12 characters)"}
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-abys-cream-border px-4 py-3 text-sm outline-none focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20"
                />
              </div>
              <div>
                <label htmlFor="admin-password-confirm" className="mb-2 block text-xs font-semibold text-abys-navy">
                  {isTr ? "Parolayı tekrar girin" : "Confirm password"}
                </label>
                <input
                  id="admin-password-confirm"
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  className="w-full rounded-xl border border-abys-cream-border px-4 py-3 text-sm outline-none focus:border-abys-accent focus:ring-2 focus:ring-abys-accent/20"
                />
              </div>

              {error && (
                <p role="alert" aria-live="assertive" className="rounded-xl border border-abys-critical/25 bg-abys-critical/5 px-4 py-3 text-sm text-abys-critical">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-abys-navy px-5 py-3 text-sm font-medium text-white transition hover:bg-abys-ink disabled:cursor-wait disabled:opacity-60"
              >
                {busy
                  ? (isTr ? "Kurulum yapılıyor..." : "Setting up...")
                  : (isTr ? "Kurumu ve yöneticiyi oluştur" : "Create organization and administrator")}
              </button>
              <p className="text-xs leading-relaxed text-abys-muted">
                {isTr
                  ? "İşlem bir kez yapılabilir. Kurum, yönetici ve denetim kaydı birlikte oluşturulur."
                  : "This action can be completed once. The organization, administrator and audit record are created atomically."}
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
