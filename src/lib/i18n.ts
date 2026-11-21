/**
 * Arayüz dili — kabuk ve aksiyon ekranı metinleri.
 *
 * Kapsam bilerek sınırlıdır. Eksik anahtar her zaman Türkçe metne düşer,
 * böylece yarım çeviri yüzünden boş etiket görünmez.
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
  | "login.sso"
  | "actions.title"
  | "actions.titleAccent"
  | "actions.subtitle"
  | "actions.empty"
  | "actions.loading"
  | "actions.unauthorized"
  | "actions.forbidden"
  | "actions.notFound"
  | "actions.loadFailed"
  | "actions.updateFailed"
  | "actions.overdueBadge"
  | "actions.days"
  | "actions.owner"
  | "actions.due"
  | "actions.notSpecified"
  | "actions.originDecision"
  | "actions.decisionState"
  | "actions.executionEvents"
  | "actions.lastEvent"
  | "actions.relatedRisk"
  | "actions.noRiskReference"
  | "actions.progressNote"
  | "actions.startProgress"
  | "actions.markDone"
  | "actions.cancel"
  | "actions.saveNote"
  | "actions.closeOutcome"
  | "actions.saveOutcome"
  | "actions.closePreparation"
  | "actions.executePrep"
  | "actions.summaryHeading"
  | "actions.openWork"
  | "actions.completedWork"
  | "actions.statusOpen"
  | "actions.statusInProgress"
  | "actions.statusDone"
  | "actions.statusCancelled"
  | "actions.hintNotStarted"
  | "actions.hintInProgress"
  | "actions.hintDone"
  | "actions.hintCancelled"
  | "actions.summarySr"
  | "actions.decisionDraft"
  | "actions.decisionUnderReview"
  | "actions.decisionAwaitingApproval"
  | "actions.decisionApproved"
  | "actions.decisionRejected"
  | "actions.decisionInExecution"
  | "actions.decisionCompleted"
  | "actions.decisionOutcomeReview"
  | "actions.decisionClosed"
  | "actions.prepLoadFailed"
  | "actions.prepCreateFailed"
  | "actions.prepApproveFailed"
  | "actions.prepDescription"
  | "actions.modeManual"
  | "actions.modeSystem"
  | "actions.targetSystemPlaceholder"
  | "actions.summaryPlaceholder"
  | "actions.saving"
  | "actions.savePreparation"
  | "actions.intentPrepared"
  | "actions.intentApproved"
  | "actions.intentCancelled"
  | "actions.approvedBy"
  | "actions.approveHuman"
  | "actions.outcomeRequired"
  | "actions.outcomeSaveFailed"
  | "actions.outcomeHeading"
  | "actions.outcomeImproved"
  | "actions.outcomeUnchanged"
  | "actions.outcomeWorsened"
  | "actions.outcomeNotePlaceholder"
  | "actions.lessonPlaceholder"
  | "actions.saveOutcomeFull"
  | "actions.attemptStatus"
  | "actions.attemptLoading"
  | "actions.attemptNone"
  | "actions.attemptUnreadable"
  | "actions.attemptLoadFailed"
  | "actions.attemptLoadFailedHttp"
  | "actions.pending"
  | "actions.succeeded"
  | "actions.failed"
  | "actions.notAvailable"
  | "actions.startedAt"
  | "actions.finishedAt"
  | "actions.noResultYet"
  | "actions.providerHttp"
  | "actions.providerResponse"
  | "actions.reference"
  | "actions.errorCode"
  | "actions.executionError";

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
  "actions.title": { tr: "Kararların", en: "Execution" },
  "actions.titleAccent": { tr: "yürütülmesi.", en: "of decisions." },
  "actions.subtitle": {
    tr: "Her aksiyon bir karara bağlıdır. İlerlemeyi güncelleyin, tamamlanınca gerçekleşen sonucu ve dersi kaydedin.",
    en: "Every action is tied to a decision. Update progress, then record the actual outcome and lesson when complete.",
  },
  "actions.empty": {
    tr: "Henüz aksiyon yok. Karar Merkezi'nde bir öneriyi kabul edin — onaylanan karar burada hesap verebilir bir aksiyona dönüşür.",
    en: "No actions yet. Accept a recommendation in the Decision Center — an approved decision becomes an accountable action here.",
  },
  "actions.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "actions.unauthorized": {
    tr: "Bu sayfa kurumsal oturum gerektirir. Lütfen giriş yapın.",
    en: "This page requires an enterprise session. Please sign in.",
  },
  "actions.forbidden": {
    tr: "Bu deneme durumunu görüntüleme izniniz yok.",
    en: "You do not have permission to view this attempt status.",
  },
  "actions.notFound": {
    tr: "Yürütme hazırlığı bulunamadı.",
    en: "Execution preparation was not found.",
  },
  "actions.loadFailed": { tr: "Aksiyonlar yüklenemedi.", en: "Actions could not be loaded." },
  "actions.updateFailed": { tr: "Aksiyon güncellenemedi.", en: "Action could not be updated." },
  "actions.overdueBadge": { tr: "Vadesi geçti", en: "Overdue" },
  "actions.days": { tr: "gün", en: "days" },
  "actions.owner": { tr: "Sorumlu", en: "Owner" },
  "actions.due": { tr: "Son tarih", en: "Due date" },
  "actions.notSpecified": { tr: "belirlenmedi", en: "not specified" },
  "actions.originDecision": { tr: "Köken karar", en: "Origin decision" },
  "actions.decisionState": { tr: "Karar durumu", en: "Decision state" },
  "actions.executionEvents": { tr: "yürütme olayı", en: "execution events" },
  "actions.lastEvent": { tr: "Son olay", en: "Last event" },
  "actions.relatedRisk": { tr: "İlgili risk", en: "Related risk" },
  "actions.noRiskReference": { tr: "risk referansı yok", en: "no risk reference" },
  "actions.progressNote": { tr: "İlerleme notu…", en: "Progress note…" },
  "actions.startProgress": { tr: "Yürütmeye al", en: "Start execution" },
  "actions.markDone": { tr: "Tamamlandı işaretle", en: "Mark done" },
  "actions.cancel": { tr: "İptal et", en: "Cancel action" },
  "actions.saveNote": { tr: "Notu kaydet", en: "Save note" },
  "actions.closeOutcome": { tr: "Sonuç formunu kapat", en: "Close outcome form" },
  "actions.saveOutcome": { tr: "Sonuç & ders kaydet", en: "Record outcome & lesson" },
  "actions.closePreparation": { tr: "Hazırlığı kapat", en: "Close preparation" },
  "actions.executePrep": { tr: "Yürütme hazırlığı", en: "Execution preparation" },
  "actions.summaryHeading": { tr: "Yönetici özeti", en: "Executive summary" },
  "actions.openWork": { tr: "Açık iş", en: "Open work" },
  "actions.completedWork": { tr: "Tamamlanan iş", en: "Completed work" },
  "actions.statusOpen": { tr: "Açık", en: "Open" },
  "actions.statusInProgress": { tr: "Yürütülüyor", en: "In progress" },
  "actions.statusDone": { tr: "Tamamlandı", en: "Completed" },
  "actions.statusCancelled": { tr: "İptal", en: "Cancelled" },
  "actions.hintNotStarted": { tr: "Henüz başlamadı", en: "Not started yet" },
  "actions.hintInProgress": { tr: "Devam ediyor", en: "In progress" },
  "actions.hintDone": { tr: "Tamamlanan iş", en: "Completed work" },
  "actions.hintCancelled": { tr: "İptal edilen iş", en: "Cancelled work" },
  "actions.summarySr": {
    tr: "Açık iş, açık ve yürütülmekte olan aksiyonların toplamıdır; tamamlanan iş yalnızca tamamlandı durumundaki aksiyonları kapsar.",
    en: "Open work is the total of open and in-progress actions; completed work includes only actions in the completed state.",
  },
  "actions.decisionDraft": { tr: "Taslak", en: "Draft" },
  "actions.decisionUnderReview": { tr: "İnceleniyor", en: "Under review" },
  "actions.decisionAwaitingApproval": { tr: "Onay bekliyor", en: "Awaiting approval" },
  "actions.decisionApproved": { tr: "Onaylandı", en: "Approved" },
  "actions.decisionRejected": { tr: "Reddedildi", en: "Rejected" },
  "actions.decisionInExecution": { tr: "Yürütmede", en: "In execution" },
  "actions.decisionCompleted": { tr: "Tamamlandı", en: "Completed" },
  "actions.decisionOutcomeReview": { tr: "Sonuç incelemesi", en: "Outcome review" },
  "actions.decisionClosed": { tr: "Kapandı", en: "Closed" },
  "actions.prepLoadFailed": {
    tr: "Yürütme hazırlıkları yüklenemedi.",
    en: "Execution preparations could not be loaded.",
  },
  "actions.prepCreateFailed": {
    tr: "Yürütme hazırlığı oluşturulamadı.",
    en: "Execution preparation could not be created.",
  },
  "actions.prepApproveFailed": {
    tr: "Yürütme hazırlığı onaylanamadı.",
    en: "Execution preparation could not be approved.",
  },
  "actions.prepDescription": {
    tr: "Bu adım dış sistemde işlem yapmaz. Yalnızca insan onaylı, idempotent niyet kaydı oluşturur.",
    en: "This step does not act on external systems. It only creates a human-approved, idempotent intent record.",
  },
  "actions.modeManual": { tr: "Manuel", en: "Manual" },
  "actions.modeSystem": { tr: "Sistem", en: "System" },
  "actions.targetSystemPlaceholder": {
    tr: "Hedef sistem (opsiyonel, ör. ERP)",
    en: "Target system (optional, e.g. ERP)",
  },
  "actions.summaryPlaceholder": {
    tr: "Ne yapılacak? (dış çağrı yapılmayacak)",
    en: "What will be done? (no external call will be made)",
  },
  "actions.saving": { tr: "Kaydediliyor…", en: "Saving…" },
  "actions.savePreparation": { tr: "Hazırlığı kaydet", en: "Save preparation" },
  "actions.intentPrepared": { tr: "Onay bekliyor", en: "Awaiting approval" },
  "actions.intentApproved": { tr: "Onaylandı", en: "Approved" },
  "actions.intentCancelled": { tr: "İptal", en: "Cancelled" },
  "actions.approvedBy": { tr: "onay", en: "approved by" },
  "actions.approveHuman": { tr: "İnsan onayı ver", en: "Approve as human" },
  "actions.outcomeRequired": { tr: "Sonuç açıklaması gerekli.", en: "Outcome description is required." },
  "actions.outcomeSaveFailed": { tr: "Sonuç kaydedilemedi.", en: "Outcome could not be saved." },
  "actions.outcomeHeading": { tr: "Gerçekleşen sonuç", en: "Actual outcome" },
  "actions.outcomeImproved": { tr: "İyileşti", en: "Improved" },
  "actions.outcomeUnchanged": { tr: "Değişmedi", en: "Unchanged" },
  "actions.outcomeWorsened": { tr: "Kötüleşti", en: "Worsened" },
  "actions.outcomeNotePlaceholder": {
    tr: "Ne oldu? (ör. rötar 34 dk yerine 12 dk)",
    en: "What happened? (e.g. delay fell from 34 min to 12 min)",
  },
  "actions.lessonPlaceholder": {
    tr: "Kurumsal ders (opsiyonel — sonraki analizlere beslenir)",
    en: "Institutional lesson (optional — feeds later analyses)",
  },
  "actions.saveOutcomeFull": { tr: "Sonucu ve dersi kaydet", en: "Save outcome and lesson" },
  "actions.attemptStatus": { tr: "Adaptör denemesi", en: "Adapter attempt" },
  "actions.attemptLoading": { tr: "Deneme durumu yükleniyor…", en: "Loading attempt status…" },
  "actions.attemptNone": {
    tr: "Henüz adaptör denemesi yok. Bu kayıt yalnızca yürütme hazırlığıdır.",
    en: "No adapter attempt yet. This record is only an execution preparation.",
  },
  "actions.attemptUnreadable": { tr: "Deneme durumu okunamadı.", en: "Attempt status could not be read." },
  "actions.attemptLoadFailed": { tr: "Deneme durumu yüklenemedi.", en: "Attempt status could not be loaded." },
  "actions.attemptLoadFailedHttp": {
    tr: "Deneme durumu yüklenemedi (HTTP {status}).",
    en: "Attempt status could not be loaded (HTTP {status}).",
  },
  "actions.pending": { tr: "Sürüyor", en: "In progress" },
  "actions.succeeded": { tr: "Başarılı", en: "Succeeded" },
  "actions.failed": { tr: "Başarısız", en: "Failed" },
  "actions.notAvailable": { tr: "henüz yok", en: "not yet" },
  "actions.startedAt": { tr: "Başlangıç", en: "Started" },
  "actions.finishedAt": { tr: "Bitiş", en: "Finished" },
  "actions.noResultYet": { tr: "Sonuç henüz kaydedilmedi.", en: "No result has been recorded yet." },
  "actions.providerHttp": { tr: "Sağlayıcı HTTP", en: "Provider HTTP" },
  "actions.providerResponse": { tr: "Sağlayıcı yanıtı", en: "Provider response" },
  "actions.reference": { tr: "Referans", en: "Reference" },
  "actions.errorCode": { tr: "Hata kodu", en: "Error code" },
  "actions.executionError": { tr: "Yürütme hatası", en: "Execution error" },
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
