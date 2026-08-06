import { describe, expect, it } from "vitest";
import {
  checkLiveCredentials,
  getConnectorPublicStatus,
  loadFieldMapping,
  redactConfig,
  resolveAuthMode,
  resolveBitrixConfig,
  type BitrixConnectorConfig,
} from "../src/lib/integrations/bitrix24/config";
import {
  mapActivity,
  mapCompany,
  mapContact,
  mapDeal,
  mapDepartment,
  mapLead,
  mapSmartProcessItem,
  mapTask,
  mapUser,
} from "../src/lib/integrations/bitrix24/mapper";
import { computeCursor, dedupeByExternalId, runLiveSync } from "../src/lib/integrations/bitrix24/sync";
import { redactWebhookEvent, verifyWebhookToken } from "../src/lib/integrations/bitrix24/events";
import type {
  BitrixActivityRaw,
  BitrixCompanyRaw,
  BitrixContactRaw,
  BitrixDealRaw,
  BitrixDepartmentRaw,
  BitrixLeadRaw,
  BitrixSmartProcessItemRaw,
  BitrixTaskRaw,
  BitrixUserRaw,
} from "../src/lib/integrations/bitrix24/types";

const fieldMapping = loadFieldMapping();

describe("bitrix24 mapper — nesne eşlemeleri", () => {
  it("Company → NormalizedCustomer", () => {
    const raw: BitrixCompanyRaw = {
      ID: "1",
      TITLE: "Baku Crystal Plaza AVM",
      DATE_MODIFY: "2026-01-10T00:00:00.000Z",
      [fieldMapping.company!.districtField!]: "Nasimi",
      [fieldMapping.company!.categoryField!]: "cleaning",
    };
    const customer = mapCompany(raw, fieldMapping);
    expect(customer).toEqual({
      externalId: "1",
      name: "Baku Crystal Plaza AVM",
      district: "Nasimi",
      category: "cleaning",
      updatedAt: "2026-01-10T00:00:00.000Z",
    });
  });

  it("Contact → NormalizedContact", () => {
    const raw: BitrixContactRaw = { ID: "2", NAME: "Elvin", LAST_NAME: "Aliyev", COMPANY_ID: "1", POST: "Tesis Müdürü" };
    const contact = mapContact(raw, fieldMapping);
    expect(contact.fullName).toBe("Elvin Aliyev");
    expect(contact.companyExternalId).toBe("1");
    expect(contact.role).toBe("Tesis Müdürü");
  });

  it("Lead → NormalizedServiceLead", () => {
    const raw: BitrixLeadRaw = {
      ID: "3",
      TITLE: "Yeni hizmet talebi",
      STATUS_ID: "NEW",
      SOURCE_ID: "Referans",
      [fieldMapping.lead!.categoryField!]: "pest_control",
    };
    const lead = mapLead(raw, fieldMapping);
    expect(lead.stage).toBe("NEW");
    expect(lead.category).toBe("pest_control");
    expect(lead.source).toBe("Referans");
  });

  it("Deal → NormalizedDeal (sözleşme/yenileme)", () => {
    const raw: BitrixDealRaw = {
      ID: "4",
      TITLE: "Sözleşme — X",
      COMPANY_ID: "1",
      STAGE_ID: "WON",
      OPPORTUNITY: "12500",
      [fieldMapping.deal!.categoryField!]: "catering",
      [fieldMapping.deal!.renewalDateField!]: "2026-03-01T00:00:00.000Z",
    };
    const deal = mapDeal(raw, fieldMapping);
    expect(deal.valueAzn).toBe(12500);
    expect(deal.renewalDate).toBe("2026-03-01T00:00:00.000Z");
    expect(deal.stage).toBe("WON");
  });

  it("Deal geçersiz OPPORTUNITY için 0'a düşer (sayı uydurmaz)", () => {
    const raw: BitrixDealRaw = { ID: "5", TITLE: "X", OPPORTUNITY: "not-a-number" };
    expect(mapDeal(raw, fieldMapping).valueAzn).toBe(0);
  });

  it("Activity → NormalizedActivity (tip eşlemesi + follow_up özel alanı)", () => {
    const call: BitrixActivityRaw = { ID: "6", TYPE_ID: "1", SUBJECT: "Arama" };
    expect(mapActivity(call, fieldMapping).type).toBe("call");

    const meeting: BitrixActivityRaw = { ID: "7", TYPE_ID: "2", SUBJECT: "Toplantı" };
    expect(mapActivity(meeting, fieldMapping).type).toBe("meeting");

    const followUp: BitrixActivityRaw = {
      ID: "8",
      TYPE_ID: "1",
      SUBJECT: "Takip",
      [fieldMapping.activity!.followUpField!]: "Y",
    };
    expect(mapActivity(followUp, fieldMapping).type).toBe("follow_up");
  });

  it("Task → NormalizedTask (durum + config alanları)", () => {
    const raw: BitrixTaskRaw = {
      id: "9",
      title: "Saha görevi",
      status: "5",
      deadline: "2026-01-05T00:00:00.000Z",
      closedDate: "2026-01-04T00:00:00.000Z",
      [fieldMapping.task!.categoryField!]: "cleaning",
      [fieldMapping.task!.locationField!]: "loc-1",
      [fieldMapping.task!.customerField!]: "1",
    };
    const task = mapTask(raw, fieldMapping);
    expect(task.status).toBe("completed");
    expect(task.completedAt).toBe("2026-01-04T00:00:00.000Z");
    expect(task.category).toBe("cleaning");
    expect(task.locationExternalId).toBe("loc-1");
  });

  it("Task açık durumda completedAt üretmez", () => {
    const raw: BitrixTaskRaw = { id: "10", status: "2" };
    const task = mapTask(raw, fieldMapping);
    expect(task.status).toBe("open");
    expect(task.completedAt).toBeNull();
  });

  it("User → NormalizedEmployee", () => {
    const raw: BitrixUserRaw = { ID: "11", NAME: "Nigar", LAST_NAME: "Mammadova", UF_DEPARTMENT: ["100"], ACTIVE: true };
    const employee = mapUser(raw, fieldMapping);
    expect(employee.fullName).toBe("Nigar Mammadova");
    expect(employee.departmentExternalIds).toEqual(["100"]);
    expect(employee.active).toBe(true);
  });

  it("Department → NormalizedDepartment", () => {
    const raw: BitrixDepartmentRaw = { ID: "100", NAME: "Cleaning Team B", PARENT: "1" };
    expect(mapDepartment(raw)).toEqual({
      externalId: "100",
      name: "Cleaning Team B",
      parentExternalId: "1",
      updatedAt: null,
    });
  });

  it("Smart Process item → NormalizedSmartProcessItem (alt tür bazlı alan eşlemesi)", () => {
    const spMapping = fieldMapping.smartProcess!.serviceRequest!;
    const raw: BitrixSmartProcessItemRaw = {
      id: "12",
      title: "Hizmet talebi",
      stageId: "open",
      companyId: "1",
      [spMapping.categoryField!]: "cleaning",
      [spMapping.locationField!]: "loc-2",
    };
    const item = mapSmartProcessItem(raw, fieldMapping, "serviceRequest");
    expect(item.subtype).toBe("serviceRequest");
    expect(item.category).toBe("cleaning");
    expect(item.locationExternalId).toBe("loc-2");
    expect(item.customerExternalId).toBe("1");
  });
});

describe("dedupeByExternalId — idempotency", () => {
  it("aynı externalId'ye sahip kayıtları tekilleştirir", () => {
    const items = [
      { externalId: "a", updatedAt: null },
      { externalId: "b", updatedAt: null },
      { externalId: "a", updatedAt: null },
    ];
    const { items: deduped, duplicates } = dedupeByExternalId(items);
    expect(deduped).toHaveLength(2);
    expect(duplicates).toBe(1);
  });

  it("tekrar yoksa duplicates 0 döner", () => {
    const { duplicates } = dedupeByExternalId([{ externalId: "x", updatedAt: null }]);
    expect(duplicates).toBe(0);
  });
});

describe("computeCursor — artan senkron imleci", () => {
  it("en yeni updatedAt değerini seçer", () => {
    const cursor = computeCursor([
      { updatedAt: "2026-01-01T00:00:00.000Z" },
      { updatedAt: "2026-01-05T00:00:00.000Z" },
      { updatedAt: "2026-01-03T00:00:00.000Z" },
    ]);
    expect(cursor).toBe("2026-01-05T00:00:00.000Z");
  });

  it("önceki imleçten daha eski değer varsa öncekini korur", () => {
    const cursor = computeCursor([{ updatedAt: "2026-01-01T00:00:00.000Z" }], "2026-02-01T00:00:00.000Z");
    expect(cursor).toBe("2026-02-01T00:00:00.000Z");
  });

  it("updatedAt olmayan öğeleri yok sayar", () => {
    expect(computeCursor([{ updatedAt: null }], null)).toBeNull();
  });
});

describe("demo/live mod ayrımı ve kimlik bilgisi eksikliği", () => {
  it("BITRIX24_MODE tanımsızsa demo kabul edilir", () => {
    const config = resolveBitrixConfig({});
    expect(config.mode).toBe("demo");
  });

  it("BITRIX24_MODE=live açıkça istenmeden live moda geçmez", () => {
    const config = resolveBitrixConfig({ BITRIX24_MODE: "something-else" });
    expect(config.mode).toBe("demo");
  });

  it("live modda kimlik bilgisi eksikse checkLiveCredentials başarısız döner", () => {
    const config = resolveBitrixConfig({ BITRIX24_MODE: "live" });
    const check = checkLiveCredentials(config);
    expect(check.ok).toBe(false);
    expect(check.missing.length).toBeGreaterThan(0);
  });

  it("live modda kimlik bilgisi eksikken runLiveSync ağa hiç çıkmadan credentials_missing döner", async () => {
    const originalFetch = global.fetch;
    let fetchCalled = false;
    global.fetch = (async (...args: unknown[]) => {
      fetchCalled = true;
      throw new Error("fetch çağrılmamalıydı: " + JSON.stringify(args));
    }) as typeof fetch;
    try {
      const config = resolveBitrixConfig({ BITRIX24_MODE: "live" });
      const result = await runLiveSync(config);
      expect(result.status).toBe("credentials_missing");
      expect(result.importedCounts).toEqual({});
      expect(fetchCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("webhook token ile authMode 'webhook' olur", () => {
    const config = resolveBitrixConfig({ BITRIX24_MODE: "live", BITRIX24_WEBHOOK_TOKEN: "1/abc" });
    expect(resolveAuthMode(config)).toBe("webhook");
  });

  it("oauth kimlik bilgileriyle authMode 'oauth' olur", () => {
    const config = resolveBitrixConfig({
      BITRIX24_MODE: "live",
      BITRIX24_CLIENT_ID: "id",
      BITRIX24_CLIENT_SECRET: "secret",
      BITRIX24_REFRESH_TOKEN: "refresh",
    });
    expect(resolveAuthMode(config)).toBe("oauth");
  });

  it("demo modda getConnectorPublicStatus her zaman configured=true döner", () => {
    const config = resolveBitrixConfig({});
    expect(getConnectorPublicStatus(config).configured).toBe(true);
  });

  it("live modda eksik kimlik bilgisiyle getConnectorPublicStatus configured=false döner", () => {
    const config = resolveBitrixConfig({ BITRIX24_MODE: "live" });
    expect(getConnectorPublicStatus(config).configured).toBe(false);
  });
});

describe("sır maskesi (secret redaction)", () => {
  it("redactConfig secret alanlarını asla açık döndürmez", () => {
    const config: BitrixConnectorConfig = resolveBitrixConfig({
      BITRIX24_MODE: "live",
      BITRIX24_BASE_URL: "https://tais.bitrix24.com",
      BITRIX24_WEBHOOK_TOKEN: "1/cok-gizli-token",
      BITRIX24_CLIENT_SECRET: "cok-gizli-sir",
      BITRIX24_REFRESH_TOKEN: "cok-gizli-yenileme",
    });
    const redacted = JSON.stringify(redactConfig(config));
    expect(redacted).not.toContain("cok-gizli-token");
    expect(redacted).not.toContain("cok-gizli-sir");
    expect(redacted).not.toContain("cok-gizli-yenileme");
  });

  it("getConnectorPublicStatus hiçbir sır alanı içermez", () => {
    const config = resolveBitrixConfig({
      BITRIX24_MODE: "live",
      BITRIX24_WEBHOOK_TOKEN: "1/cok-gizli-token",
    });
    const status = JSON.stringify(getConnectorPublicStatus(config));
    expect(status).not.toContain("cok-gizli-token");
  });

  it("verifyWebhookToken doğru token için true, yanlış/eksik için false döner", () => {
    const config = resolveBitrixConfig({ BITRIX24_MODE: "live", BITRIX24_WEBHOOK_TOKEN: "1/dogru-token" });
    expect(verifyWebhookToken(config, "1/dogru-token")).toBe(true);
    expect(verifyWebhookToken(config, "1/yanlis-token")).toBe(false);
    expect(verifyWebhookToken(config, null)).toBe(false);

    const unconfigured = resolveBitrixConfig({});
    expect(verifyWebhookToken(unconfigured, "her-hangi-bir-deger")).toBe(false);
  });

  it("redactWebhookEvent application_token'ı asla döndürmez", () => {
    const redacted = redactWebhookEvent({
      event: "ONCRMCOMPANYUPDATE",
      data: {},
      ts: "1700000000",
      auth: { application_token: "cok-gizli-app-token" },
    });
    expect(JSON.stringify(redacted)).not.toContain("cok-gizli-app-token");
    expect(redacted.hasAuth).toBe(true);
  });
});
