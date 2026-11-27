import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, migrate } from "@/lib/db/client";
import { authCookieIsSecure, createSession } from "@/lib/auth/core";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { SESSION_COOKIE } from "@/lib/auth/core";
import {
  getOidcConfig,
  getDiscoveryDocument,
  exchangeCodeForToken,
  verifyIdToken,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  OIDC_NONCE_COOKIE,
} from "@/lib/auth/oidc";
import { LOCALE_COOKIE, parseLocale, t } from "@/lib/i18n";

/**
 * State/verifier çerezlerini SİLİNDİĞİ path ile temizler. `cookies.delete`
 * varsayılan "/" path'i kullanır; çerez "/api/auth/oidc" altında set edildiği
 * için silme etkisiz kalırdı.
 */
function clearOidcCookies(res: NextResponse): void {
  const options = {
    path: "/api/auth/oidc",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: authCookieIsSecure(),
  };
  res.cookies.set(OIDC_STATE_COOKIE, "", options);
  res.cookies.set(OIDC_VERIFIER_COOKIE, "", options);
  res.cookies.set(OIDC_NONCE_COOKIE, "", options);
}

function redirectWithError(req: NextRequest, message: string): NextResponse {
  const url = new URL("/login", req.url);
  url.searchParams.set("sso_error", message);
  const res = NextResponse.redirect(url);
  clearOidcCookies(res);
  return res;
}

/**
 * GET /api/auth/oidc/callback — state'i doğrular, kodu id_token ile değiştirir,
 * e-postayı MEVCUT bir kullanıcıyla eşleştirir. Eşleşme yoksa oturum AÇILMAZ
 * (SSO ile kendiliğinden hesap/rol oluşturma yok — yetki yükselmesi riski).
 */
export async function GET(req: NextRequest) {
  const locale = parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
  const config = getOidcConfig();
  if (!config) {
    return NextResponse.json(
      { error: t(locale, "login.error.ssoNotConfigured") },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const store = await cookies();
  const expectedState = store.get(OIDC_STATE_COOKIE)?.value;
  const verifier = store.get(OIDC_VERIFIER_COOKIE)?.value;
  const expectedNonce = store.get(OIDC_NONCE_COOKIE)?.value;

  // Önce state/verifier doğrulanır; sağlayıcıdan gelen serbest metin
  // (`error=...`) state doğrulanmadan kullanıcıya yansıtılmaz.
  if (!state || !expectedState || !verifier || !expectedNonce || state !== expectedState) {
    return redirectWithError(req, t(locale, "login.error.ssoState"));
  }
  if (providerError) {
    console.error("OIDC sağlayıcı hatası:", providerError.slice(0, 200));
    return redirectWithError(req, t(locale, "login.error.ssoProvider"));
  }
  if (!code) {
    return redirectWithError(req, t(locale, "login.error.ssoCode"));
  }

  let discovery;
  try {
    discovery = await getDiscoveryDocument(config.issuer);
  } catch (err) {
    console.error("OIDC discovery hatası:", err instanceof Error ? err.message : err);
    return redirectWithError(req, t(locale, "login.error.ssoDiscovery"));
  }

  let idToken: string;
  try {
    const tokenResult = await exchangeCodeForToken({
      tokenEndpoint: discovery.token_endpoint,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      code,
      codeVerifier: verifier,
    });
    idToken = tokenResult.idToken;
  } catch (err) {
    console.error("OIDC token değişimi hatası:", err instanceof Error ? err.message : err);
    return redirectWithError(req, t(locale, "login.error.ssoExchange"));
  }

  let email: string;
  try {
    email = await verifyIdToken(idToken, {
      issuer: config.issuer,
      clientId: config.clientId,
      jwksUri: discovery.jwks_uri ?? "",
      nonce: expectedNonce,
    });
  } catch (err) {
    console.error("OIDC id_token doğrulama hatası:", err instanceof Error ? err.message : err);
    return redirectWithError(req, t(locale, "login.error.ssoVerify"));
  }

  await migrate();
  const db = getDb();
  const r = await db.query<{ id: string; org_id: string; display_name: string }>(
    "SELECT id, org_id, display_name FROM users WHERE email = $1 AND status = 'active'",
    [email]
  );
  const user = r.rows[0];
  if (!user) {
    return redirectWithError(req, t(locale, "login.error.ssoUnknownUser"));
  }

  const sessionId = await createSession(user.id, user.org_id, req.headers.get("user-agent"));
  await recordAuditEvent({
    orgId: user.org_id,
    actor: user.display_name,
    type: "login",
    summary: `${email} SSO (OIDC) ile giriş yaptı`,
  });

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  clearOidcCookies(res);
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: authCookieIsSecure(),
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
