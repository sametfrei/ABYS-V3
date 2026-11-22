import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { requestLocale, localizedError } = await import("../src/lib/api-i18n");
const { GET: actionsGET } = await import("../src/app/api/actions/route");
const { GET: outcomesGET } = await import("../src/app/api/outcomes/route");

function apiRequest(path: string, locale?: "tr" | "en") {
  const headers: Record<string, string> = {};
  if (locale) headers.cookie = `abys_lang=${locale}`;
  return new NextRequest(path, { headers });
}

describe("API error localization", () => {
  it("resolves the locale from the abys_lang cookie with Turkish default", () => {
    expect(requestLocale(apiRequest("http://localhost/api/x"))).toBe("tr");
    expect(requestLocale(apiRequest("http://localhost/api/x", "en"))).toBe("en");
    expect(requestLocale(apiRequest("http://localhost/api/x", "tr"))).toBe("tr");
  });

  it("returns the message in the request locale with the requested status", async () => {
    const tr = localizedError(apiRequest("http://localhost/api/x"), "api.auth.sessionRequired", 401);
    expect(tr.status).toBe(401);
    expect(await tr.json()).toEqual({ error: "Oturum gerekli." });

    const en = localizedError(apiRequest("http://localhost/api/x", "en"), "api.auth.sessionRequired", 401);
    expect(await en.json()).toEqual({ error: "Sign-in required." });
  });

  it("keeps response headers such as Retry-After", async () => {
    const res = localizedError(
      apiRequest("http://localhost/api/x", "en"),
      "api.auth.tooManyPasswordAttempts",
      429,
      { headers: { "Retry-After": "30" } }
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toEqual({ error: "Too many incorrect password attempts." });
  });

  it("localizes unauthenticated actions and outcomes responses", async () => {
    const actionsEn = await actionsGET(apiRequest("http://localhost/api/actions", "en"));
    expect(actionsEn.status).toBe(401);
    expect(await actionsEn.json()).toEqual({ error: "Sign-in required." });

    const outcomesTr = await outcomesGET(apiRequest("http://localhost/api/outcomes"));
    expect(outcomesTr.status).toBe(401);
    expect(await outcomesTr.json()).toEqual({ error: "Oturum gerekli." });
  });
});
