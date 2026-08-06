import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieIsSecure } from "@/lib/auth/core";
import {
  getOidcConfig,
  getDiscoveryDocument,
  generateState,
  generatePkce,
  buildAuthorizationUrl,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  OIDC_COOKIE_TTL_SECONDS,
} from "@/lib/auth/oidc";

/** GET /api/auth/oidc/start — yetkilendirme URL'ine yönlendirir. SSO yapılandırılmamışsa 404. */
export async function GET() {
  const config = getOidcConfig();
  if (!config) {
    return NextResponse.json({ error: "Kurumsal giriş (SSO) yapılandırılmamış." }, { status: 404 });
  }

  let discovery;
  try {
    discovery = await getDiscoveryDocument(config.issuer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OIDC yapılandırması alınamadı." },
      { status: 502 }
    );
  }

  const state = generateState();
  const { verifier, challenge } = generatePkce();
  const authUrl = buildAuthorizationUrl({
    authorizationEndpoint: discovery.authorization_endpoint,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    codeChallenge: challenge,
  });

  const store = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: authCookieIsSecure(),
    path: "/api/auth/oidc",
    maxAge: OIDC_COOKIE_TTL_SECONDS,
  };
  store.set(OIDC_STATE_COOKIE, state, cookieOpts);
  store.set(OIDC_VERIFIER_COOKIE, verifier, cookieOpts);

  return NextResponse.redirect(authUrl);
}
