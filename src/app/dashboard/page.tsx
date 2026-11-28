"use client";

import { useState } from "react";
import Link from "next/link";
import { CommandCenter } from "@/components/CommandCenter";
import { TaisExecutiveScreen } from "@/components/TaisExecutiveScreen";
import { useSession } from "@/lib/use-session";

export default function DashboardHome() {
  const session = useSession();
  const [taisApplicable, setTaisApplicable] = useState<boolean | null>(null);

  // Dashboard data is tenant-scoped and server-owned. The old localStorage
  // prototype dashboard is intentionally not reachable from authenticated workspaces.
  if (session === undefined || session === null) return null;

  if (session.orgCode === "tais-ikf-demo") {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-10">
        <p className="text-xs tracking-widest text-abys-muted font-semibold mb-2">
          {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <TaisExecutiveScreen onStatus={setTaisApplicable} />
        {taisApplicable === false && (
          <p className="text-sm text-abys-muted">
            Bu kurum için ABYS başlangıç ayarları tamamlanmamış.{" "}
            <Link href="/onboarding" className="text-abys-accent font-medium">
              Kuruluma başla
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return <CommandCenter />;
}
