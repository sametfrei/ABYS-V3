"use client";

import { useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import { UserManagement } from "@/components/UserManagement";
import { ChangePassword } from "@/components/ChangePassword";
import { SessionManagement } from "@/components/SessionManagement";
import { SECTORS, type SectorId } from "@/lib/sectors";
import { ROLES, type RoleId } from "@/lib/roles";
import { loadProfile, saveProfile, type AbysProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
  type ShellKey,
} from "@/lib/i18n";

function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
}

function optionLabel(locale: Locale, prefix: string, id: string, fallback: string): string {
  const key = `${prefix}.${id}` as ShellKey;
  const label = t(locale, key);
  return label === key ? fallback : label;
}

export default function SettingsPage() {
  const locale = useLocale();
  const session = useSession();
  const [stored] = useStored(() => ({ profile: loadProfile() }));
  const [draft, setDraft] = useState<AbysProfile | null>(null);
  const [saved, setSaved] = useState(false);

  const profile = session ? null : draft ?? stored?.profile ?? null;
  if (session === undefined) return null;
  if (session) {
    return (
      <div>
        <PageHeader
          eyebrow={t(locale, "settings.eyebrow")}
          title={t(locale, "settings.sessionTitle")}
          accent={t(locale, "settings.sessionAccent")}
          desc={t(locale, "settings.sessionSubtitle")}
        />
        <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-2xl space-y-3 text-sm text-abys-ink">
          <p><span className="text-abys-muted">{t(locale, "settings.organization")} </span>{session.orgName}</p>
          <p><span className="text-abys-muted">{t(locale, "settings.user")} </span>{session.displayName}</p>
          <p><span className="text-abys-muted">{t(locale, "settings.role")} </span>{session.role}</p>
          <p><span className="text-abys-muted">{t(locale, "settings.dataMode")} </span>{t(locale, "settings.demoData")}</p>
        </div>
        {/* Oturumlu her rol kendi parolasını değiştirebilir; yetki sunucudadır. */}
        <ChangePassword />
        {/* Oturum sahibi kendi aktif oturumlarını görür/kapatır; kapsam sunucudadır. */}
        <SessionManagement />
        {/* Yetki kararı sunucudadır; bu bölüm yalnızca sys_admin oturumunda gösterilir. */}
        {session.role === "sys_admin" && <UserManagement />}
      </div>
    );
  }
  if (!profile) return null;

  function update(patch: Partial<AbysProfile>) {
    if (!profile) return;
    const next = { ...profile, ...patch };
    saveProfile(next);
    setDraft(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div>
      <PageHeader
        eyebrow={t(locale, "settings.eyebrow")}
        title={t(locale, "settings.profileTitle")}
        accent={t(locale, "settings.profileAccent")}
        desc={t(locale, "settings.profileSubtitle")}
      />

      <div className="px-4 sm:px-6 lg:px-10 pb-16 max-w-2xl space-y-8">
        <div>
          <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">
            {t(locale, "settings.companyName")}
          </label>
          <input
            value={profile.companyName}
            onChange={(e) => update({ companyName: e.target.value })}
            className="w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5 text-abys-ink focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
        </div>

        <div>
          <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">
            {t(locale, "settings.sector")}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SECTORS.map((s) => (
              <button
                key={s.id}
                onClick={() => update({ sectorId: s.id as SectorId })}
                className={`text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  profile.sectorId === s.id
                    ? "border-abys-accent bg-abys-cream ring-1 ring-abys-accent"
                    : "border-abys-cream-border bg-abys-cream hover:border-abys-accent/50"
                }`}
              >
                <span className="mr-1.5">{s.icon}</span>
                {optionLabel(locale, "settings.sector", s.id, s.label)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">
            {t(locale, "settings.roleLabel")}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => update({ roleId: r.id as RoleId })}
                className={`text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  profile.roleId === r.id
                    ? "border-abys-accent bg-abys-cream ring-1 ring-abys-accent"
                    : "border-abys-cream-border bg-abys-cream hover:border-abys-accent/50"
                }`}
              >
                {optionLabel(locale, "settings.role", r.id, r.label)}
              </button>
            ))}
          </div>
        </div>

        {saved && <p className="text-xs text-abys-healthy">{t(locale, "settings.saved")}</p>}
      </div>
    </div>
  );
}
