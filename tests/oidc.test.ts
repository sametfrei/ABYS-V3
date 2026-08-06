import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getOidcConfig,
  isSsoConfigured,
  generateState,
  generatePkce,
  buildAuthorizationUrl,
  decodeAndValidateIdToken,
} from "../src/lib/auth/oidc";

const OIDC_ENV_KEYS = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"] as const;

function encodeJwtPart(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fakeIdToken(payload: Record<string, unknown>): string {
  const header = encodeJwtPart({ alg: "none", typ: "JWT" });
  const body = encodeJwtPart(payload);
  return `${header}.${body}.signature`;
}

describe("getOidcConfig / isSsoConfigured", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of OIDC_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of OIDC_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("dört değişkenden biri bile eksikse SSO kapalı sayılır (null döner)", () => {
    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.OIDC_CLIENT_ID = "abys-client";
    process.env.OIDC_CLIENT_SECRET = "gizli";
    // OIDC_REDIRECT_URI kasıtlı olarak eksik
    expect(getOidcConfig()).toBeNull();
    expect(isSsoConfigured()).toBe(false);
  });

  it("hiç ortam değişkeni yokken null döner", () => {
    expect(getOidcConfig()).toBeNull();
    expect(isSsoConfigured()).toBe(false);
  });

  it("dört değişken de doluyken yapılandırma nesnesini döner", () => {
    process.env.OIDC_ISSUER = "https://idp.example.com";
    process.env.OIDC_CLIENT_ID = "abys-client";
    process.env.OIDC_CLIENT_SECRET = "gizli";
    process.env.OIDC_REDIRECT_URI = "https://abys.example.com/api/auth/oidc/callback";
    expect(getOidcConfig()).toEqual({
      issuer: "https://idp.example.com",
      clientId: "abys-client",
      clientSecret: "gizli",
      redirectUri: "https://abys.example.com/api/auth/oidc/callback",
    });
    expect(isSsoConfigured()).toBe(true);
  });
});

describe("generateState", () => {
  it("her çağrıda farklı ve yeterince uzun bir değer üretir", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });
});

describe("generatePkce", () => {
  it("code_challenge, code_verifier'ın sha256/base64url'i olmalı (RFC 7636 S256)", () => {
    const { verifier, challenge } = generatePkce();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("her çağrıda farklı verifier üretir", () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe("buildAuthorizationUrl", () => {
  it("gerekli tüm query parametrelerini doğru biçimde içerir", () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: "https://idp.example.com/authorize",
        clientId: "abys-client",
        redirectUri: "https://abys.example.com/api/auth/oidc/callback",
        state: "state-123",
        codeChallenge: "challenge-abc",
      })
    );
    expect(url.origin + url.pathname).toBe("https://idp.example.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("abys-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://abys.example.com/api/auth/oidc/callback");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("openid");
  });
});

describe("decodeAndValidateIdToken", () => {
  const expected = { issuer: "https://idp.example.com", clientId: "abys-client" };
  const futureExp = Math.floor(Date.now() / 1000) + 3600;

  it("geçerli jetondan e-postayı küçük harfe çevirip döner", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: expected.clientId,
      exp: futureExp,
      email: "Kullanici@Ornek.Com",
    });
    expect(decodeAndValidateIdToken(token, expected)).toBe("kullanici@ornek.com");
  });

  it("aud bir dizi olsa da clientId'yi içeriyorsa kabul eder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: ["baska-client", expected.clientId],
      exp: futureExp,
      email: "user@ornek.com",
    });
    expect(decodeAndValidateIdToken(token, expected)).toBe("user@ornek.com");
  });

  it("biçimi geçersiz jetonu reddeder", () => {
    expect(() => decodeAndValidateIdToken("gecersiz-token", expected)).toThrow();
  });

  it("süresi dolmuş jetonu reddeder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: expected.clientId,
      exp: Math.floor(Date.now() / 1000) - 10,
      email: "user@ornek.com",
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/süresi dolmuş/);
  });

  it("aud uyuşmazsa reddeder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: "baska-client",
      exp: futureExp,
      email: "user@ornek.com",
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/aud/);
  });

  it("iss uyuşmazsa reddeder", () => {
    const token = fakeIdToken({
      iss: "https://baska-idp.example.com",
      aud: expected.clientId,
      exp: futureExp,
      email: "user@ornek.com",
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/iss/);
  });

  it("e-posta claim'i yoksa reddeder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: expected.clientId,
      exp: futureExp,
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/e-posta/);
  });
});
