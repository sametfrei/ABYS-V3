import { createHash, generateKeyPairSync, sign } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOidcConfig,
  isSsoConfigured,
  generateState,
  generatePkce,
  buildAuthorizationUrl,
  decodeAndValidateIdToken,
  verifyIdToken,
  resetJwksCache,
  getDiscoveryDocument,
  resetDiscoveryCache,
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

  it("nonce verilirse yetkilendirme URL'ine ekler", () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: "https://idp.example.com/authorize",
        clientId: "abys-client",
        redirectUri: "https://abys.example.com/api/auth/oidc/callback",
        state: "state-123",
        codeChallenge: "challenge-abc",
        nonce: "nonce-xyz",
      })
    );
    expect(url.searchParams.get("nonce")).toBe("nonce-xyz");
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
      email_verified: true,
    });
    expect(decodeAndValidateIdToken(token, expected)).toBe("kullanici@ornek.com");
  });

  it("aud bir dizi olsa da clientId'yi içeriyorsa kabul eder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: ["baska-client", expected.clientId],
      azp: expected.clientId,
      exp: futureExp,
      email: "user@ornek.com",
      email_verified: true,
    });
    expect(decodeAndValidateIdToken(token, expected)).toBe("user@ornek.com");
  });

  it("çoklu aud'da azp bu istemci değilse reddeder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: ["baska-client", expected.clientId],
      azp: "baska-client",
      exp: futureExp,
      email: "user@ornek.com",
      email_verified: true,
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/azp/);
  });

  it("beklenen nonce ile eşleşen jetonu kabul eder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: expected.clientId,
      exp: futureExp,
      nonce: "nonce-123",
      email: "user@ornek.com",
      email_verified: true,
    });
    expect(decodeAndValidateIdToken(token, { ...expected, nonce: "nonce-123" })).toBe(
      "user@ornek.com"
    );
  });

  it("nonce eşleşmezse reddeder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: expected.clientId,
      exp: futureExp,
      nonce: "saldirgan-nonce",
      email: "user@ornek.com",
      email_verified: true,
    });
    expect(() =>
      decodeAndValidateIdToken(token, { ...expected, nonce: "beklenen-nonce" })
    ).toThrow(/nonce/);
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
      email_verified: true,
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/süresi dolmuş/);
  });

  it("aud uyuşmazsa reddeder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: "baska-client",
      exp: futureExp,
      email: "user@ornek.com",
      email_verified: true,
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/aud/);
  });

  it("iss uyuşmazsa reddeder", () => {
    const token = fakeIdToken({
      iss: "https://baska-idp.example.com",
      aud: expected.clientId,
      exp: futureExp,
      email: "user@ornek.com",
      email_verified: true,
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

  it("email_verified true değilse reddeder (hesap devralma koruması)", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: expected.clientId,
      exp: futureExp,
      email: "user@ornek.com",
      email_verified: false,
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/doğrulanmamış/);
  });

  it("email_verified hiç yoksa reddeder", () => {
    const token = fakeIdToken({
      iss: expected.issuer,
      aud: expected.clientId,
      exp: futureExp,
      email: "user@ornek.com",
    });
    expect(() => decodeAndValidateIdToken(token, expected)).toThrow(/doğrulanmamış/);
  });

  it("OIDC_ALLOW_UNVERIFIED_EMAIL=1 bilinçli opt-out ile kabul eder", () => {
    process.env.OIDC_ALLOW_UNVERIFIED_EMAIL = "1";
    try {
      const token = fakeIdToken({
        iss: expected.issuer,
        aud: expected.clientId,
        exp: futureExp,
        email: "user@ornek.com",
      });
      expect(decodeAndValidateIdToken(token, expected)).toBe("user@ornek.com");
    } finally {
      delete process.env.OIDC_ALLOW_UNVERIFIED_EMAIL;
    }
  });
});

describe("verifyIdToken (JWKS imza doğrulaması)", () => {
  const expected = {
    issuer: "https://idp.example.com",
    clientId: "abys-client",
    jwksUri: "https://idp.example.com/jwks",
  };
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const kid = "test-key-1";
  const originalFetch = globalThis.fetch;

  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid, alg: "RS256", use: "sig" };

  function signedIdToken(
    payload: Record<string, unknown>,
    header: Record<string, unknown> = { alg: "RS256", kid, typ: "JWT" },
    signingKey = privateKey
  ): string {
    const h = encodeJwtPart(header);
    const b = encodeJwtPart(payload);
    const signature = sign("RSA-SHA256", Buffer.from(`${h}.${b}`), signingKey).toString("base64url");
    return `${h}.${b}.${signature}`;
  }

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      iss: expected.issuer,
      aud: expected.clientId,
      exp: futureExp,
      email: "Kullanici@Ornek.Com",
      email_verified: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    resetJwksCache();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetJwksCache();
  });

  it("geçerli RS256 imzası ve iddialarla e-postayı döner", async () => {
    await expect(verifyIdToken(signedIdToken(validPayload()), expected)).resolves.toBe(
      "kullanici@ornek.com"
    );
  });

  it("değiştirilmiş gövdeyi (geçersiz imza) reddeder", async () => {
    const [h, , s] = signedIdToken(validPayload()).split(".");
    const tampered = `${h}.${encodeJwtPart(validPayload({ email: "saldirgan@ornek.com" }))}.${s}`;
    await expect(verifyIdToken(tampered, expected)).rejects.toThrow(/imza/);
  });

  it("başka anahtarla imzalanmış jetonu reddeder", async () => {
    const token = signedIdToken(validPayload(), undefined, other.privateKey);
    await expect(verifyIdToken(token, expected)).rejects.toThrow(/imza/);
  });

  it("alg: none jetonunu reddeder (algoritma karışıklığı)", async () => {
    const token = signedIdToken(validPayload(), { alg: "none", kid, typ: "JWT" });
    await expect(verifyIdToken(token, expected)).rejects.toThrow(/algoritma/);
  });

  it("HS256 jetonunu reddeder", async () => {
    const token = signedIdToken(validPayload(), { alg: "HS256", kid, typ: "JWT" });
    await expect(verifyIdToken(token, expected)).rejects.toThrow(/algoritma/);
  });

  it("JWKS içinde bulunmayan kid'yi reddeder", async () => {
    const token = signedIdToken(validPayload(), { alg: "RS256", kid: "bilinmeyen", typ: "JWT" });
    await expect(verifyIdToken(token, expected)).rejects.toThrow(/anahtar/);
  });

  it("imza geçerli olsa da süresi dolmuş jetonu reddeder", async () => {
    const token = signedIdToken(validPayload({ exp: Math.floor(Date.now() / 1000) - 10 }));
    await expect(verifyIdToken(token, expected)).rejects.toThrow(/süresi dolmuş/);
  });

  it("jwks_uri yoksa imza doğrulanamaz diyerek reddeder", async () => {
    await expect(
      verifyIdToken(signedIdToken(validPayload()), { ...expected, jwksUri: "" })
    ).rejects.toThrow(/jwks_uri/);
  });

  it("JWKS alınamazsa reddeder", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(verifyIdToken(signedIdToken(validPayload()), expected)).rejects.toThrow(/JWKS/);
  });
});

describe("getDiscoveryDocument güvenlik kontrolleri", () => {
  const issuer = "https://idp.example.com";
  const originalFetch = globalThis.fetch;

  function mockDoc(doc: Record<string, unknown>) {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(doc), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;
  }

  beforeEach(() => resetDiscoveryCache());
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetDiscoveryCache();
  });

  it("belgedeki issuer yapılandırmayla eşleşmezse reddeder", async () => {
    mockDoc({
      issuer: "https://saldirgan.example.com",
      authorization_endpoint: "https://idp.example.com/authorize",
      token_endpoint: "https://idp.example.com/token",
    });
    await expect(getDiscoveryDocument(issuer)).rejects.toThrow(/issuer/);
  });

  it("HTTPS olmayan (localhost dışı) uç noktayı reddeder", async () => {
    mockDoc({
      issuer,
      authorization_endpoint: "http://idp.example.com/authorize",
      token_endpoint: "https://idp.example.com/token",
    });
    await expect(getDiscoveryDocument(issuer)).rejects.toThrow(/HTTPS/);
  });

  it("geçerli HTTPS keşif belgesini kabul eder", async () => {
    mockDoc({
      issuer,
      authorization_endpoint: "https://idp.example.com/authorize",
      token_endpoint: "https://idp.example.com/token",
      jwks_uri: "https://idp.example.com/jwks",
    });
    await expect(getDiscoveryDocument(issuer)).resolves.toMatchObject({ issuer });
  });

  it("yerel geliştirme için localhost http kabul edilir", async () => {
    const localIssuer = "http://localhost:9000";
    mockDoc({
      issuer: localIssuer,
      authorization_endpoint: "http://localhost:9000/authorize",
      token_endpoint: "http://localhost:9000/token",
    });
    await expect(getDiscoveryDocument(localIssuer)).resolves.toMatchObject({
      issuer: localIssuer,
    });
  });
});
