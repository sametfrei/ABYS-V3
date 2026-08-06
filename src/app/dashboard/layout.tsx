"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { loadProfile, clearProfile } from "@/lib/profile";
import { useStored } from "@/lib/use-stored";
import { useSession } from "@/lib/use-session";
import { getSector } from "@/lib/sectors";
import { getRole } from "@/lib/roles";
import { listEntities } from "@/lib/entities";
import type { HandledSignal } from "@/lib/entities";

const NAV = [
  { href: "/dashboard", label: "Yönetim Merkezi", icon: DashboardIcon },
  { href: "/dashboard/ask", label: "Ask ABYS", icon: AskIcon },
  { href: "/dashboard/decisions", label: "Karar Merkezi", icon: DecisionsIcon },
  { href: "/dashboard/actions", label: "Aksiyonlar", icon: ActionsIcon },
  { href: "/dashboard/scenarios", label: "Senaryo Laboratuvarı", icon: ScenarioIcon },
  { href: "/dashboard/memory", label: "Kurumsal Hafıza", icon: MemoryIcon },
  { href: "/dashboard/analysis", label: "Analiz", icon: AnalysisIcon },
  { href: "/dashboard/reports", label: "Raporlar", icon: ReportsIcon },
  { href: "/dashboard/alerts", label: "Riskler ve Sinyaller", icon: AlertsIcon },
  { href: "/dashboard/integrations", label: "Veri Kaynakları", icon: IntegrationsIcon },
  { href: "/dashboard/advisors", label: "Danışman Analitiği", icon: AdvisorsIcon },
  { href: "/dashboard/settings", label: "Ayarlar", icon: SettingsIcon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [stored] = useStored(() => ({ profile: loadProfile() }));
  const profile = stored?.profile ?? null;
  const sessionUser = useSession();

  const [localSignalState, refreshLocalSignals] = useStored(() => ({
    count: listEntities<HandledSignal>("handled-signals").filter((s) => s.status === "open").length,
  }));
  const [taisSignalCount, setTaisSignalCount] = useState<number | null>(null);
  useEffect(() => {
    if (sessionUser === null) refreshLocalSignals();
  }, [pathname, sessionUser, refreshLocalSignals]);
  useEffect(() => {
    if (sessionUser?.orgCode !== "tais-ikf-demo") return;
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
  }, [sessionUser]);

  const openSignalCount = sessionUser?.orgCode === "tais-ikf-demo"
    ? taisSignalCount ?? 0
    : sessionUser
      ? 0
      : localSignalState?.count ?? 0;

  useEffect(() => {
    // Kurumsal oturumu olan kullanıcı (ör. TAIS demo girişi) yerel profil
    // kurulumu yapmamış olsa da onboarding'e yönlendirilmez — Yönetim
    // Merkezi bu durumda org'a özgü ekranını (bkz. TaisExecutiveScreen)
    // profile'dan bağımsız gösterir.
    if (stored && !sessionUser && sessionUser !== undefined && !stored.profile) router.replace("/onboarding");
  }, [stored, sessionUser, router]);

  if (sessionUser === undefined) {
    return null;
  }
  if (!sessionUser && !stored?.profile) {
    return null;
  }

  const activeProfile = sessionUser ? null : profile;
  const sector = activeProfile ? getSector(activeProfile.sectorId) : null;
  const role = activeProfile ? getRole(activeProfile.roleId) : null;

  return (
    <div className="min-h-screen flex">
      <aside className="no-print w-60 shrink-0 border-r border-abys-ink/10 flex flex-col py-6 px-4">
        <div className="flex items-center gap-2 px-2 mb-8">
          <LogoMark className="w-7 h-7" />
          <span className="font-serif text-lg leading-none text-abys-navy">ABYS</span>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
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
                  {item.label}
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
          {sessionUser && (
            <div className="px-3 py-1.5 text-[11px] text-abys-healthy flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-abys-healthy" />
              Kurumsal oturum: {sessionUser.displayName}
            </div>
          )}
          <Link
            href="/dashboard/settings"
            className="flex flex-col rounded-lg px-3 py-2 hover:bg-abys-ink/5 transition-colors"
          >
            <span className="text-sm font-medium text-abys-navy">
              {role?.label ?? "Kullanıcı"}
            </span>
            <span className="text-xs text-abys-muted">
              {sessionUser?.orgName ?? sector?.label ?? ""}
              {activeProfile ? ` · ${activeProfile.companyName}` : ""}
            </span>
          </Link>
          <button
            onClick={async () => {
              if (sessionUser) {
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              }
              clearProfile();
              router.push("/");
            }}
            className="w-full text-left text-xs text-abys-muted hover:text-abys-ink px-3 py-1.5"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
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
