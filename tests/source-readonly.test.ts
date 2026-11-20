import { describe, expect, it } from "vitest";

const { validateRestConfig } = await import("../src/lib/connectors/rest-adapter");
const { fetchPinned, fetchPinnedTokenRequest, headersForRedirectHop, resolvePinnedAddress } = await import(
  "../src/lib/net/pinned-fetch"
);

const CONFIG = {
  kind: "rest" as const,
  baseUrl: "https://api.example.com",
  path: "/v1/orders",
  authType: "none" as const,
  entity: "order" as const,
  idField: "id",
  fieldMap: { amount: "amount" },
  pagination: { type: "none" as const },
};

describe("read-only source access", () => {
  it("POST ve URL içindeki kimlik bilgilerini reddeder", () => {
    expect(validateRestConfig({ ...CONFIG, method: "POST" })).toContain(
      "Kaynak konnektörleri yalnızca GET kullanabilir."
    );
    expect(validateRestConfig({ ...CONFIG, baseUrl: "https://user:pass@api.example.com" })).toContain(
      "baseUrl içinde kimlik bilgisi olamaz."
    );
  });

  it("kayıt konfigürasyonunda kimlik bilgisi taşıyan başlıkları reddeder", () => {
    expect(validateRestConfig({ ...CONFIG, headers: { Authorization: "Bearer exposed" } })).toContain(
      "'Authorization' başlığında kimlik bilgisi saklanamaz; secretEnvVar kullanın."
    );
    expect(validateRestConfig({ ...CONFIG, headers: { "X-API-Key": "exposed" } })).toContain(
      "'X-API-Key' başlığında kimlik bilgisi saklanamaz; secretEnvVar kullanın."
    );
  });

  it("aynı kanonik alana çözülen alias çiftlerini ve alias KPI eşlemesini doğru ele alır", () => {
    expect(
      validateRestConfig({
        ...CONFIG,
        entity: "product",
        fieldMap: { unit_cost: "cost", unitCost: "legacy_cost" },
        computedKpiMap: { "manufacturing:unit_production_cost": "Birim üretim maliyeti" },
      })
    ).toContain("'unit_cost' ve 'unitCost' aynı kanonik alana ('unit_cost') eşleniyor.");

    expect(
      validateRestConfig({
        ...CONFIG,
        entity: "product",
        fieldMap: { unitCost: "cost", total_units: "units" },
        computedKpiMap: { "manufacturing:unit_production_cost": "Birim üretim maliyeti" },
      })
    ).not.toEqual(
      expect.arrayContaining([expect.stringContaining("eksik kanonik alanlar: unit_cost")])
    );
  });

  it("pinned istemci GET dışındaki metotları ağ çağrısından önce reddeder", async () => {
    await expect(fetchPinned("https://api.example.com", { method: "POST" })).rejects.toThrow(
      "Kaynak konnektörleri yalnızca GET kullanabilir."
    );
  });

  it("token istemcisi yalnızca HTTPS POST kabul eder", async () => {
    await expect(
      fetchPinnedTokenRequest("https://login.example.com/token", { method: "GET" })
    ).rejects.toThrow("Token istemcisi yalnızca POST kullanabilir.");
    await expect(
      fetchPinnedTokenRequest(
        "http://login.example.com/token",
        { method: "POST", body: "grant_type=client_credentials" },
        async () => ["93.184.216.34"]
      )
    ).rejects.toThrow("OAuth2 token endpoint'i HTTPS olmalı.");
  });

  it("özel veya karışık DNS cevaplarını reddeder", async () => {
    await expect(
      resolvePinnedAddress("https://api.example.com", async () => ["93.184.216.34", "127.0.0.1"])
    ).rejects.toThrow();
  });

  it("farklı origin'e yönlendirmede kimlik başlıklarını taşımaz", () => {
    const headers = new Headers({
      Authorization: "Bearer secret",
      "X-API-Key": "secret",
      Accept: "application/json",
    });
    const sameOrigin = headersForRedirectHop(headers, "https://api.example.com", "https://api.example.com");
    expect(sameOrigin.get("authorization")).toBe("Bearer secret");

    const crossOrigin = headersForRedirectHop(headers, "https://api.example.com", "https://other.example.com");
    expect(crossOrigin.get("authorization")).toBeNull();
    expect(crossOrigin.get("x-api-key")).toBeNull();
    expect(crossOrigin.get("accept")).toBe("application/json");
  });
});
