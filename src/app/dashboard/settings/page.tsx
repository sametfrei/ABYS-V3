"use client";

import { useSyncExternalStore } from "react";
import { PageHeader } from "@/components/PageHeader";
import { UserManagement } from "@/components/UserManagement";
import { ChangePassword } from "@/components/ChangePassword";
import { SessionManagement } from "@/components/SessionManagement";
import { useSession } from "@/lib/use-session";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
} from "@/lib/i18n";

function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
}

export default function SettingsPage() {
  const locale = useLocale();
  const session = useSession();

  if (session === undefined || session === null) return null;

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
      <ChangePassword />
      <SessionManagement />
      {session.role === "sys_admin" && <UserManagement />}
    </div>
  );
}
