import { isSsoConfigured } from "@/lib/auth/oidc";
import { LoginForm } from "./LoginForm";

/**
 * Kurumsal giriş (Faz 2 + Faz 8 SSO). Prototip profil akışı (onboarding)
 * şimdilik yaşıyor; bu ekran sunucu oturumlu gerçek kimlik doğrulamanın kapısı.
 * "Kurumsal hesapla giriş" butonu yalnızca OIDC ortam değişkenleri tam
 * yapılandırılmışsa görünür (bkz. src/lib/auth/oidc.ts).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sso_error?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm ssoEnabled={isSsoConfigured()} initialSsoError={params.sso_error ?? null} />;
}
