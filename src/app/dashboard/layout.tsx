import { requireSession } from "@/lib/auth/guard";
import { DashboardShell } from "./dashboard-shell";

/**
 * Korumalı dashboard kabuğu. Oturum doğrulaması sunucuda yapılır; geçersiz
 * veya süresi dolmuş çerezler daha istemci kodu çalışmadan /login'e gider.
 * Böylece dashboard sayfaları anonim istemciye render edilmez.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return <DashboardShell session={session}>{children}</DashboardShell>;
}
