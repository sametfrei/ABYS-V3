"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { SessionExpiryGuard } from "@/components/SessionExpiryGuard";
import { clearProfile } from "@/lib/profile";
import { clearSessionCache } from "@/lib/use-session";
import { getRole } from "@/lib/roles";
import { hasPermission } from "@/lib/auth/permissions";
import type { SessionInfo } from "@/lib/auth/core";
import { DASHBOARD_NAV } from "@/lib/navigation";
import {
  DEFAULT_LOCALE,
  LOCALES,
  persistLocale,
  readLocale,
  subscribeLocale,
  t,
  type Locale,
} from "@/lib/i18n";

const ICONS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  "/dashboard": DashboardIcon,
  "/dashboard/organization": AdvisorsIcon,
  "/dashboard/decision-ledger": DecisionsIcon,
  "/dashboard/forecast": ScenarioIcon,
  "/dashboard/process": AnalysisIcon,
  "/dashboard/options": ScenarioIcon,
  "/dashboard/kpi": AnalysisIcon,
  "/dashboard/data-quality": AlertsIcon,
  "/dashboard/ask": AskIcon,
  "/dashboard/decisions": DecisionsIcon,
  "/dashboard/actions": ActionsIcon,
  "/dashboard/scenarios": ScenarioIcon,
  "/dashboard/memory": MemoryIcon,
  "/dashboard/analysis": AnalysisIcon,
  "/dashboard/reports": ReportsIcon,
  "/dashboard/alerts": AlertsIcon,
  "/dashboard/integrations": IntegrationsIcon,
  "/dashboard/connectors": IntegrationsIcon,
  "/dashboard/discovery": AnalysisIcon,
  "/dashboard/advisors": AdvisorsIcon,
  "/dashboard/audit": ReportsIcon,
  "/dashboard/settings": SettingsIcon,
};

const NAV = DASHBOARD_NAV.map((item) => ({
  ...item,
  icon: ICONS[item.href] ?? DashboardIcon,
}));

export function DashboardShell({
  session,
  children,
}: {
  session: SessionInfo;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useSyncExternalStore(subscribeLocale, readLocale, () => DEFAULT_LOCALE);
  const changeLocale = (next: Locale) => {
    persistLocale(next);
  };

  const [taisSignalCount, setTaisSignalCount] = useState<number | null>(null);
  useEffect(() => {
    if (session.orgCode !== "tais-ikf-demo") return;
    let cancelled = false;
    fetch("/api/tais/risks")
      .then(async (res) => (res.ok ? ((await res.json()).risks as unknown[]) : []))
      .then((risks) => {
        if (!cancelled) setTaisSignalCount(risks.length);
      })
      .catch(() => {
        if (!cancelled) setTaisSignalCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [session.orgCode]);

  const openSignalCount = session.orgCode === "tais-ikf-demo" ? taisSignalCount ?? 0 : 0;

  const role = getRole(session.role);
  // Denetim günlüğü yalnızca view_audit izinli oturumlarda gösterilir;
  // gerçek yetki sunucuda uygulanır.
  const visibleNav = NAV.filter((item) => {
    if (item.href === "/dashboard/audit") {
      return hasPermission(session.role, "view_audit");
    }
    if (item.href === "/dashboard/data-quality" || item.href === "/dashboard/connectors") {
      return hasPermission(session.role, "ingest_data");
    }
    if (item.href === "/dashboard/kpi") {
      return hasPermission(session.role, "edit_kpi");
    }
    if (
      item.href === "/dashboard/decision-ledger" ||
      item.href === "/dashboard/forecast" ||
      item.href === "/dashboard/process" ||
      item.href === "/dashboard/discovery"
    ) {
      return hasPermission(session.role, "view_decisions");
    }
    if (item.href === "/dashboard/options") {
      return hasPermission(session.role, "run_analysis");
    }
    return true;
  });

  const activeHref =
    visibleNav.find((item) =>
      item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
    )?.href ?? "/dashboard";

  return (
    <div className="min-h-screen">
      <SessionExpiryGuard />
      <header className="no-print sticky top-0 z-40 flex items-center gap-2 border-b border-abys-ink/10 bg-abys-cream/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <LogoMark className="w-6 h-6" />
        <span className="font-serif text-lg leading-none text-abys-navy">ABYS</span>
        <select
          aria-label={t(locale, "shell.navigation")}
          value={activeHref}
          onChange={(event) => router.push(event.target.value)}
          className="ml-auto max-w-[62%] rounded-lg border border-abys-cream-border bg-white/80 px-2 py-1.5 text-xs text-abys-navy"
        >
          {visibleNav.map((item) => (
            <option key={item.href} value={item.href}>
              {t(locale, item.labelKey)}
            </option>
          ))}
        </select>
      </header>

      <div className="flex">
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-abys-ink/10 px-4 py-6 lg:flex">
        <div className="flex items-center gap-2 px-2 mb-8">
          <LogoMark className="w-7 h-7" />
          <span className="font-serif text-lg leading-none text-abys-navy">ABYS</span>
        </div>

        <nav className="flex-1 space-y-1">
          {visibleNav.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-abys-cream text-abys-navy font-medium"
                    : "text-abys-muted hover:bg-abys-ink/5 hover:text-abys-ink"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  {t(locale, item.labelKey)}
                </span>
                {item.href === "/dashboard/alerts" && openSignalCount > 0 && (
                  <span className="text-[10px] font-semibold bg-abys-critical text-white rounded-full w-4 h-4 flex items-center justify-center">
                    {openSignalCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-abys-ink/10 space-y-1">
          <div className="px-3 py-1.5 text-[11px] text-abys-healthy flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-abys-healthy" />
            {t(locale, "shell.session")}: {session.displayName}
          </div>
          <Link
            href="/dashboard/settings"
            className="flex flex-col rounded-lg px-3 py-2 hover:bg-abys-ink/5 transition-colors"
          >
            <span className="text-sm font-medium text-abys-navy">
              {role?.label ?? t(locale, "shell.user")}
            </span>
            <span className="text-xs text-abys-muted">{session.orgName}</span>
          </Link>
          <button
            onClick={async () => {
              // Önce istemci cache'ini geçersiz kıl: yavaş bir logout isteği
              // sırasında eski kullanıcı bilgisi yeni bileşenlere sızmasın.
              clearSessionCache();
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              clearProfile();
              router.replace("/login");
              router.refresh();
            }}
            className="w-full text-left text-xs text-abys-muted hover:text-abys-ink px-3 py-1.5"
          >
            {t(locale, "shell.logout")}
          </button>
          <div className="flex items-center gap-1 px-3 pt-1" role="group" aria-label={t(locale, "shell.language")}>
            <span className="text-[10px] uppercase tracking-wide text-abys-muted mr-1">
              {t(locale, "shell.language")}
            </span>
            {LOCALES.map((value) => (
              <button
                key={value}
                onClick={() => changeLocale(value)}
                aria-pressed={locale === value}
                className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                  locale === value
                    ? "bg-abys-navy text-white"
                    : "text-abys-muted hover:bg-abys-ink/5 hover:text-abys-ink"
                }`}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function DecisionsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 3v5m0 0-3.5 8.5M10 8l3.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function ScenarioIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M4 16V9m4 7V5m4 11v-5m4 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function AskIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M7.5 7.5a2.5 2.5 0 1 1 3.2 2.4c-.6.2-1 .8-1 1.4v.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9.7" cy="14.5" r="0.9" fill="currentColor" />
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function ActionsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M4 10.5 8 14l8-8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 5.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6.5V10l2.5 1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function AnalysisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 16l-3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 10h6M7 13h6M7 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function AlertsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 3a5 5 0 0 0-5 5v3l-1.5 3h13L15 11V8a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8.2 16.5a1.8 1.8 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IntegrationsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="2.5" y="8" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="12.5" y="8" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 10h5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function AdvisorsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="7.5" cy="6.5" r="2.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 16.2c.6-2.9 2.4-4.4 4.7-4.4s4.1 1.5 4.7 4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.5 5.5a2.4 2.4 0 0 1 0 4.6M15.3 16c-.4-2.1-1.3-3.5-2.7-4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 3v1.4M10 15.6V17M17 10h-1.4M4.4 10H3M14.9 5.1l-1 1M6.1 13.9l-1 1M14.9 14.9l-1-1M6.1 6.1l-1-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
