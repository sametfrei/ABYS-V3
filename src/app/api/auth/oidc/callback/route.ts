import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";
import { authCookieIsSecure, createSession } from "@/lib/auth/core";
import { recordAuditEvent } from "@/lib/db/repos/audit";
import { SESSION_COOKIE } from "@/app/api/auth/login/route";
import {
  getOidcConfig,
  getDiscoveryDocument,
  exchangeCodeForToken,
  decodeAndValidateIdToken,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
} from "@/lib/auth/oidc";

function redirectWithError(req: NextRequest, message: string): NextResponse {
  const url = new URL("/login", req.url);
  url.searchParams.set("sso_error", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete(OIDC_STATE_COOKIE);
  res.cookies.delete(OIDC_VERIFIER_COOKIE);
  return res;
}

/**
 * GET /api/auth/oidc/callback — state'i doğrular, kodu id_token ile değiştirir,
 * e-postayı MEVCUT bir kullanıcıyla eşleştirir. Eşleşme yoksa oturum AÇILMAZ
 * (SSO ile kendiliğinden hesap/rol oluşturma yok — yetki yükselmesi riski).
 */
export async function GET(req: NextRequest) {
  const config = getOidcConfig();
  if (!config) {
    return NextResponse.json({ error: "Kurumsal giriş (SSO) yapılandırılmamış." }, { status: 404 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const store = await cookies();
  const expectedState = store.get(OIDC_STATE_COOKIE)?.value;
  const verifier = store.get(OIDC_VERIFIER_COOKIE)?.value;

  if (providerError) {
    return redirectWithError(req, `Kimlik sağlayıcı hata döndürdü: ${providerError}`);
  }
  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    return redirectWithError(req, "Oturum durumu eşleşmedi; giriş iptal edildi. Lütfen tekrar deneyin.");
  }

  let discovery;
  try {
    discovery = await getDiscoveryDocument(config.issuer);
  } catch (err) {
    return redirectWithError(req, err instanceof Error ? err.message : "OIDC yapılandırması alınamadı.");
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
    return redirectWithError(req, err instanceof Error ? err.message : "Token değişimi başarısız.");
  }

  let email: string;
  try {
    email = decodeAndValidateIdToken(idToken, { issuer: config.issuer, clientId: config.clientId });
  } catch (err) {
    return redirectWithError(req, err instanceof Error ? err.message : "Kimlik jetonu doğrulanamadı.");
  }

  await ensureSeeded();
  const db = getDb();
  const r = await db.query<{ id: string; org_id: string; display_name: string }>(
    "SELECT id, org_id, display_name FROM users WHERE email = $1 AND status = 'active'",
    [email]
  );
  const user = r.rows[0];
  if (!user) {
    return redirectWithError(req, "Bu e-posta ABYS'de tanımlı değil; yöneticinize başvurun.");
  }

  const sessionId = await createSession(user.id, user.org_id);
  await recordAuditEvent({
    orgId: user.org_id,
    actor: user.display_name,
    type: "login",
    summary: `${email} SSO (OIDC) ile giriş yaptı`,
  });

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  res.cookies.delete(OIDC_STATE_COOKIE);
  res.cookies.delete(OIDC_VERIFIER_COOKIE);
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: authCookieIsSecure(),
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
