import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  parseLocale,
  readLocale,
  shellKeys,
  t,
  type ShellKey,
} from "@/lib/i18n";
import { DASHBOARD_NAV } from "@/lib/navigation";

describe("i18n kabuk sözlüğü", () => {
  it("bilinmeyen veya boş dil değeri varsayılana düşer", () => {
    expect(parseLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
    expect(parseLocale("")).toBe(DEFAULT_LOCALE);
    expect(parseLocale("de")).toBe(DEFAULT_LOCALE);
    expect(parseLocale("  EN ")).toBe("en");
    expect(parseLocale("tr")).toBe("tr");
  });

  it("her gezinme girdisinin iki dilde de etiketi vardır", () => {
    const keys = new Set(shellKeys());
    expect(DASHBOARD_NAV.length).toBeGreaterThan(20);
    const hrefs = new Set<string>();
    for (const item of DASHBOARD_NAV) {
      expect(hrefs.has(item.href)).toBe(false);
      hrefs.add(item.href);
      expect(keys.has(item.labelKey)).toBe(true);
      for (const locale of LOCALES) {
        const label = t(locale, item.labelKey);
        expect(label.length).toBeGreaterThan(1);
        expect(label).not.toBe(item.labelKey);
      }
    }
  });

  it("kabuk metinleri iki dilde dolu ve Türkçe varsayılan korunur", () => {
    for (const key of shellKeys()) {
      expect(t("tr", key).length).toBeGreaterThan(1);
      expect(t("en", key).length).toBeGreaterThan(1);
    }
    expect(t("tr", "shell.logout")).toBe("Çıkış yap");
    expect(t("en", "shell.logout")).toBe("Sign out");
    expect(t("en", "nav.decisionLedger")).toBe("Decision Ledger");
  });

  it("aksiyon ekranı anahtarları iki dilde dolu", () => {
    const actionKeys: ShellKey[] = [
      "actions.title",
      "actions.subtitle",
      "actions.empty",
      "actions.overdueBadge",
      "actions.loading",
      "actions.unauthorized",
      "actions.forbidden",
      "actions.notFound",
      "actions.pending",
      "actions.succeeded",
      "actions.failed",
      "actions.attemptStatus",
      "actions.executePrep",
    ];
    const keys = new Set(shellKeys());
    for (const key of actionKeys) {
      expect(keys.has(key)).toBe(true);
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("aksiyon metinleri Türkçe ve İngilizcede farklıdır", () => {
    for (const key of [
      "actions.title",
      "actions.subtitle",
      "actions.empty",
      "actions.pending",
      "actions.succeeded",
      "actions.failed",
    ] satisfies ShellKey[]) {
      expect(t("tr", key)).not.toBe(t("en", key));
    }
  });

  it("bağlantı ekranı anahtarları iki dilde dolu", () => {
    const connectorKeys = shellKeys().filter((key) => key.startsWith("connectors."));
    expect(connectorKeys.length).toBeGreaterThan(20);
    for (const key of connectorKeys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("tahmin ekranı anahtarları iki dilde dolu", () => {
    const forecastKeys = shellKeys().filter((key) => key.startsWith("forecast."));
    expect(forecastKeys.length).toBeGreaterThan(20);
    for (const key of forecastKeys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("karar defteri ekranı anahtarları iki dilde dolu", () => {
    const ledgerKeys = shellKeys().filter((key) => key.startsWith("ledger."));
    expect(ledgerKeys.length).toBeGreaterThan(20);
    for (const key of ledgerKeys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("denetim ekranı anahtarları iki dilde dolu", () => {
    const auditKeys = shellKeys().filter((key) => key.startsWith("audit."));
    expect(auditKeys.length).toBeGreaterThan(20);
    for (const key of auditKeys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("ayarlar ekranı anahtarları iki dilde dolu", () => {
    const settingsKeys = shellKeys().filter((key) => key.startsWith("settings."));
    expect(settingsKeys.length).toBeGreaterThan(20);
    for (const key of settingsKeys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("ayarlar gömülü bileşen anahtarları iki dilde dolu", () => {
    for (const prefix of ["settings.password.", "settings.sessions.", "settings.users."]) {
      const keys = shellKeys().filter((key) => key.startsWith(prefix));
      expect(keys.length).toBeGreaterThan(5);
      for (const key of keys) {
        expect(t("tr", key).trim().length).toBeGreaterThan(0);
        expect(t("en", key).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("veri kalitesi ekranı anahtarları iki dilde dolu", () => {
    const keys = shellKeys().filter((key) => key.startsWith("dataQuality."));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("risk ve sinyal ekranı anahtarları iki dilde dolu", () => {
    const keys = shellKeys().filter((key) => key.startsWith("alerts."));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("süreç zekâsı ekranı anahtarları iki dilde dolu", () => {
    const keys = shellKeys().filter((key) => key.startsWith("process."));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("veri kaynakları ekranı anahtarları iki dilde dolu", () => {
    const keys = shellKeys().filter((key) => key.startsWith("integrations."));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("veri kalitesi skor anahtarları iki dilde dolu", () => {
    const keys = shellKeys().filter((key) => key.startsWith("dataQuality.score."));
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("raporlar ekranı anahtarları iki dilde dolu", () => {
    const keys = shellKeys().filter((key) => key.startsWith("reports."));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
  });

  it("KPI verisi ekranı anahtarları iki dilde dolu ve farklı", () => {
    const keys = shellKeys().filter((key) => key.startsWith("kpi."));
    expect(keys.length).toBeGreaterThan(25);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
    expect(t("tr", "kpi.save")).toBe("Kaydet");
    expect(t("en", "kpi.save")).toBe("Save");
    expect(t("tr", "kpi.metricsHeading")).not.toBe(t("en", "kpi.metricsHeading"));
  });

  it("Ask ABYS ekranı anahtarları iki dilde dolu", () => {
    const keys = shellKeys().filter((key) => key.startsWith("ask."));
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(t("tr", key).trim().length).toBeGreaterThan(0);
      expect(t("en", key).trim().length).toBeGreaterThan(0);
    }
    expect(t("tr", "ask.submit")).toBe("Sor");
    expect(t("en", "ask.submit")).toBe("Ask");
    expect(t("tr", "ask.sourcesHeading")).toContain("{count}");
  });

  it("bilinmeyen anahtar çökmez, anahtarın kendisini döndürür", () => {
    expect(t("tr", "nav.missing" as ShellKey)).toBe("nav.missing");
  });

  it("tarayıcı ortamı yokken varsayılan dil okunur", () => {
    expect(readLocale()).toBe(DEFAULT_LOCALE);
  });
});
