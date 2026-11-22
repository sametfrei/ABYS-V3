import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: {} as Record<string, string> }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.values[name] ? { value: state.values[name] } : undefined,
  }),
}));

process.env.OIDC_ISSUER = "https://idp.example.com";
process.env.OIDC_CLIENT_ID = "abys-client";
process.env.OIDC_CLIENT_SECRET = "secret";
process.env.OIDC_REDIRECT_URI = "https://app.example.com/api/auth/oidc/callback";

const { GET } = await import("../src/app/api/auth/oidc/callback/route");

const CALLBACK = "https://app.example.com/api/auth/oidc/callback";

function callbackRequest(locale?: "tr" | "en", query = "state=wrong&code=abc") {
  const headers: Record<string, string> = {};
  if (locale) headers.cookie = `abys_lang=${locale}`;
  return new NextRequest(`${CALLBACK}?${query}`, { headers });
}

function ssoError(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location).searchParams.get("sso_error") : null;
}

afterAll(() => {
  for (const key of ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"]) {
    delete process.env[key];
  }
});

describe("OIDC callback user-visible errors follow abys_lang", () => {
  it("defaults to Turkish when no locale cookie is present", async () => {
    state.values = {
      abys_oidc_state: "expected",
      abys_oidc_verifier: "verifier",
      abys_oidc_nonce: "nonce",
    };
    const response = await GET(callbackRequest());
    expect(response.status).toBe(307);
    expect(ssoError(response)).toBe(
      "Oturum durumu eşleşmedi; giriş iptal edildi. Lütfen tekrar deneyin."
    );
  });

  it("returns an English state-mismatch message for English users", async () => {
    state.values = {
      abys_oidc_state: "expected",
      abys_oidc_verifier: "verifier",
      abys_oidc_nonce: "nonce",
    };
    const response = await GET(callbackRequest("en"));
    expect(response.status).toBe(307);
    expect(ssoError(response)).toBe(
      "The sign-in session did not match; sign-in was cancelled. Please try again."
    );
  });

  it("returns a localized 404 when SSO is not configured", async () => {
    const saved = process.env.OIDC_ISSUER;
    delete process.env.OIDC_ISSUER;
    try {
      const response = await GET(callbackRequest("en"));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Enterprise sign-in (SSO) is not configured.",
      });
    } finally {
      process.env.OIDC_ISSUER = saved;
    }
  });
});
