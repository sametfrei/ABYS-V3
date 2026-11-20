/**
 * Arayüz dili — kabuk (gezinme, oturum, çıkış) metinleri.
 *
 * Kapsam bilerek sınırlıdır: şu an yalnızca uygulama kabuğu çevrilir; içerik
 * ekranları Türkçe kalır. Eksik anahtar her zaman Türkçe metne düşer, böylece
 * yarım çeviri yüzünden boş etiket görünmez.
 */

export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_COOKIE = "abys_lang";
export const LOCALE_STORAGE_KEY = "abys.locale";
export const LOCALE_EVENT = "abys-locale-change";

export type ShellKey =
  | "nav.dashboard"
  | "nav.organization"
  | "nav.decisionLedger"
  | "nav.forecast"
  | "nav.process"
  | "nav.options"
  | "nav.kpi"
  | "nav.dataQuality"
  | "nav.ask"
  | "nav.decisions"
  | "nav.actions"
  | "nav.scenarios"
  | "nav.memory"
  | "nav.analysis"
  | "nav.reports"
  | "nav.alerts"
  | "nav.integrations"
  | "nav.connectors"
  | "nav.discovery"
  | "nav.advisors"
  | "nav.audit"
  | "nav.settings"
  | "shell.session"
  | "shell.logout"
  | "shell.language"
  | "shell.user"
  | "login.title"
  | "login.accent"
  | "login.subtitle"
  | "login.email"
  | "login.password"
  | "login.submit"
  | "login.submitting"
  | "login.forgot"
  | "login.sso";

const DICTIONARY: Record<ShellKey, Record<Locale, string>> = {
  "nav.dashboard": { tr: "Yönetim Merkezi", en: "Command Center" },
  "nav.organization": { tr: "Organizasyon", en: "Organization" },
  "nav.decisionLedger": { tr: "Karar Defteri", en: "Decision Ledger" },
  "nav.forecast": { tr: "Tahmin", en: "Forecast" },
  "nav.process": { tr: "Süreç Zekâsı", en: "Process Intelligence" },
  "nav.options": { tr: "Karar Seçenekleri", en: "Decision Options" },
  "nav.kpi": { tr: "KPI Verisi", en: "KPI Data" },
  "nav.dataQuality": { tr: "Veri Kalitesi", en: "Data Quality" },
  "nav.ask": { tr: "Ask ABYS", en: "Ask ABYS" },
  "nav.decisions": { tr: "Karar Merkezi", en: "Decision Center" },
  "nav.actions": { tr: "Aksiyonlar", en: "Actions" },
  "nav.scenarios": { tr: "Senaryo Laboratuvarı", en: "Scenario Lab" },
  "nav.memory": { tr: "Kurumsal Hafıza", en: "Institutional Memory" },
  "nav.analysis": { tr: "Analiz", en: "Analysis" },
  "nav.reports": { tr: "Raporlar", en: "Reports" },
  "nav.alerts": { tr: "Riskler ve Sinyaller", en: "Risks & Signals" },
  "nav.integrations": { tr: "Veri Kaynakları", en: "Data Sources" },
  "nav.connectors": { tr: "Sistem Bağlantıları", en: "Connectors" },
  "nav.discovery": { tr: "İş Keşfi", en: "Business Discovery" },
  "nav.advisors": { tr: "Danışman Analitiği", en: "Advisor Analytics" },
  "nav.audit": { tr: "Denetim Günlüğü", en: "Audit Log" },
  "nav.settings": { tr: "Ayarlar", en: "Settings" },
  "shell.session": { tr: "Kurumsal oturum", en: "Enterprise session" },
  "shell.logout": { tr: "Çıkış yap", en: "Sign out" },
  "shell.language": { tr: "Dil", en: "Language" },
  "shell.user": { tr: "Kullanıcı", en: "User" },
  "login.title": { tr: "Kurumsal", en: "Enterprise" },
  "login.accent": { tr: "giriş.", en: "sign-in." },
  "login.subtitle": {
    tr: "Yetkileriniz rolünüze göre sunucuda uygulanır.",
    en: "Permissions are enforced server-side according to your role.",
  },
  "login.email": { tr: "E-posta", en: "Email" },
  "login.password": { tr: "Parola", en: "Password" },
  "login.submit": { tr: "Giriş yap →", en: "Sign in →" },
  "login.submitting": { tr: "Giriş yapılıyor…", en: "Signing in…" },
  "login.forgot": {
    tr: "Parolanızı unuttuysanız kurum yöneticinize başvurun.",
    en: "If you forgot your password, contact your organization administrator.",
  },
  "login.sso": { tr: "Kurumsal hesapla giriş →", en: "Sign in with enterprise account →" },
};

export function parseLocale(value: string | null | undefined): Locale {
  const token = String(value ?? "").trim().toLowerCase();
  return (LOCALES as readonly string[]).includes(token) ? (token as Locale) : DEFAULT_LOCALE;
}

/** Eksik anahtar Türkçe metne düşer; hiç yoksa anahtarın kendisi döner. */
export function t(locale: Locale, key: ShellKey): string {
  const entry = DICTIONARY[key];
  if (!entry) return key;
  return entry[locale] ?? entry[DEFAULT_LOCALE];
}

export function shellKeys(): ShellKey[] {
  return Object.keys(DICTIONARY) as ShellKey[];
}

/** Tarayıcıda dili saklar (çerez + localStorage); sunucu çerezi okur. */
export function persistLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage kapalıysa çerez yeterli.
  }
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

/** useSyncExternalStore aboneliği — dil değişimini ve sekmeler arası bildirimi dinler. */
export function subscribeLocale(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LOCALE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LOCALE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  if (cookie) return parseLocale(decodeURIComponent(cookie.slice(LOCALE_COOKIE.length + 1)));
  try {
    return parseLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}
