import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, SESSION_COOKIE, type SessionInfo } from "./core";

/**
 * Sunucu taraflı oturum kapıları.
 *
 * `getSession` yalnızca çerezdeki opak kimliği değil, sunucudaki oturum
 * kaydını, kullanıcı durumunu ve sona erme zamanını da doğrular. Bu yüzden
 * süresi dolmuş veya geçersiz çerezler de login'e yönlendirilir.
 */
export async function getSessionFromCookies(): Promise<SessionInfo | null> {
  const store = await cookies();
  return getSession(store.get(SESSION_COOKIE)?.value);
}

/** Korumalı sayfalar için: geçerli oturum yoksa /login'e yönlendirir. */
export async function requireSession(): Promise<SessionInfo> {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  return session;
}

/** Login/kök sayfalar için: geçerli oturum varsa /dashboard'a yönlendirir. */
export async function redirectIfAuthenticated(): Promise<void> {
  const session = await getSessionFromCookies();
  if (session) redirect("/dashboard");
}
