"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SECTORS, type SectorId } from "@/lib/sectors";
import { ROLES, type RoleId } from "@/lib/roles";
import { loadProfile, saveProfile, type AbysProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";

export default function SettingsPage() {
  const session = useSession();
  const [stored] = useStored(() => ({ profile: loadProfile() }));
  const [draft, setDraft] = useState<AbysProfile | null>(null);
  const [saved, setSaved] = useState(false);

  const profile = session ? null : draft ?? stored?.profile ?? null;
  if (session === undefined) return null;
  if (session) {
    return (
      <div>
        <PageHeader eyebrow="TAIS AYARLARI" title="Kurum" accent="bilgileri." desc="Kurumsal oturum bilgileri sunucu oturumundan okunur ve bu demo ekranında değiştirilemez." />
        <div className="px-10 pb-16 max-w-2xl space-y-3 text-sm text-abys-ink">
          <p><span className="text-abys-muted">Kurum: </span>{session.orgName}</p>
          <p><span className="text-abys-muted">Kullanıcı: </span>{session.displayName}</p>
          <p><span className="text-abys-muted">Rol: </span>{session.role}</p>
          <p><span className="text-abys-muted">Veri modu: </span>Bitrix24 uyumlu demo verisi</p>
        </div>
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
        eyebrow="SETTINGS"
        title="Profilinizi"
        accent="yönetin."
        desc="Şirket, sektör ve rol bilgilerinizi buradan güncelleyebilirsiniz."
      />

      <div className="px-10 pb-16 max-w-2xl space-y-8">
        <div>
          <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">
            ŞİRKET ADI
          </label>
          <input
            value={profile.companyName}
            onChange={(e) => update({ companyName: e.target.value })}
            className="w-full rounded-xl border border-abys-cream-border bg-abys-cream px-4 py-3.5 text-abys-ink focus:outline-none focus:ring-2 focus:ring-abys-accent"
          />
        </div>

        <div>
          <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">
            SEKTÖR
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
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs tracking-widest text-abys-muted font-semibold mb-2">
            ROL
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
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {saved && <p className="text-xs text-abys-healthy">Kaydedildi.</p>}
      </div>
    </div>
  );
}
