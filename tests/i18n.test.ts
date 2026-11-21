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

  it("bilinmeyen anahtar çökmez, anahtarın kendisini döndürür", () => {
    expect(t("tr", "nav.missing" as ShellKey)).toBe("nav.missing");
  });

  it("tarayıcı ortamı yokken varsayılan dil okunur", () => {
    expect(readLocale()).toBe(DEFAULT_LOCALE);
  });
});
