/**
 * Arayüz dili — kabuk, aksiyon ve bağlantı ekranı metinleri.
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
  | "actions.executionError"
  | "connectors.title"
  | "connectors.titleAccent"
  | "connectors.subtitle"
  | "connectors.loading"
  | "connectors.loadFailed"
  | "connectors.loadFailedHttp"
  | "connectors.catalogHeading"
  | "connectors.statusReady"
  | "connectors.statusRequiresCredentials"
  | "connectors.statusPlanned"
  | "connectors.newConnection"
  | "connectors.connectionName"
  | "connectors.baseUrlPlaceholder"
  | "connectors.apiPathPlaceholder"
  | "connectors.entityCustomer"
  | "connectors.entitySupplier"
  | "connectors.entityEmployee"
  | "connectors.entityProduct"
  | "connectors.entityOrder"
  | "connectors.entityInvoice"
  | "connectors.entityPayment"
  | "connectors.entityAccount"
  | "connectors.entityProject"
  | "connectors.entityInventory"
  | "connectors.entityEvent"
  | "connectors.authNone"
  | "connectors.authBearer"
  | "connectors.authApiKey"
  | "connectors.authBasic"
  | "connectors.authOAuth2"
  | "connectors.secretOAuthPlaceholder"
  | "connectors.secretEnvPlaceholder"
  | "connectors.oauthClientIdPlaceholder"
  | "connectors.oauthScopePlaceholder"
  | "connectors.idFieldPlaceholder"
  | "connectors.recordsPathPlaceholder"
  | "connectors.updatedAtFieldPlaceholder"
  | "connectors.paginationPage"
  | "connectors.paginationNone"
  | "connectors.fieldMapLabel"
  | "connectors.kpiFieldMapLabel"
  | "connectors.computedKpiMapLabel"
  | "connectors.computedKpiPlaceholder"
  | "connectors.kpiObservedAtPlaceholder"
  | "connectors.eventTypePlaceholder"
  | "connectors.eventSubjectPlaceholder"
  | "connectors.eventTimePlaceholder"
  | "connectors.saving"
  | "connectors.saveConnection"
  | "connectors.selectConnectorFirst"
  | "connectors.fieldMapJsonInvalid"
  | "connectors.kpiFieldMapJsonInvalid"
  | "connectors.computedKpiMapJsonInvalid"
  | "connectors.defaultConnectorName"
  | "connectors.saveFailed"
  | "connectors.saveFailedHttp"
  | "connectors.connectionCreated"
  | "connectors.syncFailed"
  | "connectors.syncFailedHttp"
  | "connectors.syncSummary"
  | "connectors.mappingLoadFailed"
  | "connectors.mappingLoadFailedHttp"
  | "connectors.mappingJsonInvalid"
  | "connectors.mappingApproveFailed"
  | "connectors.mappingApproveFailedHttp"
  | "connectors.mappingApproved"
  | "connectors.scheduleUpdateFailed"
  | "connectors.scheduleUpdateFailedHttp"
  | "connectors.scheduleDisabled"
  | "connectors.scheduleSet"
  | "connectors.scheduleValidation"
  | "connectors.schedulerRunFailed"
  | "connectors.schedulerRunFailedHttp"
  | "connectors.schedulerSummary"
  | "connectors.scheduleOff"
  | "connectors.durationDays"
  | "connectors.durationHours"
  | "connectors.durationMinutes"
  | "connectors.scheduleHealthHeading"
  | "connectors.checkedAt"
  | "connectors.notMeasured"
  | "connectors.scheduledConnections"
  | "connectors.due"
  | "connectors.staleRunning"
  | "connectors.consecutiveFailures"
  | "connectors.healthNextLast"
  | "connectors.healthDelay"
  | "connectors.healthErrors"
  | "connectors.scheduleHealthy"
  | "connectors.scheduleDue"
  | "connectors.scheduleOverdue"
  | "connectors.scheduleRunning"
  | "connectors.scheduleStale"
  | "connectors.scheduleFailing"
  | "connectors.scheduleUnscheduled"
  | "connectors.schedulerNotRun"
  | "connectors.connectionsHeading"
  | "connectors.schedulerRunning"
  | "connectors.runDue"
  | "connectors.noConnections"
  | "connectors.history"
  | "connectors.mappingApproval"
  | "connectors.syncNow"
  | "connectors.scheduleLabel"
  | "connectors.scheduleIntervalWithMinutes"
  | "connectors.nextScheduled"
  | "connectors.scheduleIntervalMinutesAria"
  | "connectors.minutesPlaceholder"
  | "connectors.saveInterval"
  | "connectors.close"
  | "connectors.scheduleHelp"
  | "connectors.syncIssue"
  | "connectors.syncIssueNoError"
  | "connectors.retry"
  | "connectors.records"
  | "connectors.none"
  | "connectors.intelligenceTransfer"
  | "connectors.noRunHistory"
  | "connectors.runTriggerScheduled"
  | "connectors.runTriggerManual"
  | "connectors.runStatusSuccess"
  | "connectors.runStatusFailed"
  | "connectors.runStatusRunning"
  | "connectors.runHistoryLine"
  | "connectors.sourceSchemaSummary"
  | "connectors.sourceFields"
  | "connectors.suggestions"
  | "connectors.noSafeSuggestion"
  | "connectors.mappingApprovedVersion"
  | "connectors.mappingSchemaSummary"
  | "connectors.noSchemaObservation"
  | "connectors.addSuggestionsToDraft"
  | "connectors.mappingConflicts"
  | "connectors.mappingFieldLabel"
  | "connectors.approving"
  | "connectors.approveNewVersion"
  | "connectors.mappingVersionHistory"
  | "connectors.footnote";

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
  "connectors.title": { tr: "Sistemleriniz", en: "Your systems" },
  "connectors.titleAccent": { tr: "ABYS'ye bağlanır", en: "connect to ABYS" },
  "connectors.subtitle": {
    tr: "Genel REST/OData adaptörüyle ERP/CRM uçlarını bağlayın: alan eşlemesi, sayfalama, artımlı checkpoint ve otomatik yeniden deneme. Kimlik bilgileri yalnızca sunucu ortam değişkenlerinden okunur.",
    en: "Connect ERP/CRM endpoints through the generic REST/OData adapter: field mapping, pagination, incremental checkpoints and automatic retries. Credentials are read only from server environment variables.",
  },
  "connectors.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "connectors.loadFailed": { tr: "Yüklenemedi.", en: "Could not load." },
  "connectors.loadFailedHttp": {
    tr: "Yüklenemedi (HTTP {status}).",
    en: "Could not load (HTTP {status}).",
  },
  "connectors.catalogHeading": { tr: "Konnektör kataloğu", en: "Connector catalog" },
  "connectors.statusReady": { tr: "Hazır", en: "Ready" },
  "connectors.statusRequiresCredentials": {
    tr: "Kimlik bilgisi gerekir",
    en: "Requires credentials",
  },
  "connectors.statusPlanned": { tr: "Planlı", en: "Planned" },
  "connectors.newConnection": { tr: "Yeni bağlantı", en: "New connection" },
  "connectors.connectionName": { tr: "Bağlantı adı", en: "Connection name" },
  "connectors.baseUrlPlaceholder": { tr: "https://api.sirket.com", en: "https://api.company.com" },
  "connectors.apiPathPlaceholder": { tr: "/v1/customers", en: "/v1/customers" },
  "connectors.entityCustomer": { tr: "Müşteri", en: "Customer" },
  "connectors.entitySupplier": { tr: "Tedarikçi", en: "Supplier" },
  "connectors.entityEmployee": { tr: "Çalışan", en: "Employee" },
  "connectors.entityProduct": { tr: "Ürün", en: "Product" },
  "connectors.entityOrder": { tr: "Sipariş", en: "Order" },
  "connectors.entityInvoice": { tr: "Fatura", en: "Invoice" },
  "connectors.entityPayment": { tr: "Ödeme", en: "Payment" },
  "connectors.entityAccount": { tr: "Hesap", en: "Account" },
  "connectors.entityProject": { tr: "Proje", en: "Project" },
  "connectors.entityInventory": { tr: "Envanter", en: "Inventory" },
  "connectors.entityEvent": { tr: "Olay", en: "Event" },
  "connectors.authNone": { tr: "Kimlik yok", en: "No authentication" },
  "connectors.authBearer": { tr: "Bearer token", en: "Bearer token" },
  "connectors.authApiKey": { tr: "API key", en: "API key" },
  "connectors.authBasic": { tr: "Basic", en: "Basic" },
  "connectors.authOAuth2": {
    tr: "OAuth2 client credentials",
    en: "OAuth2 client credentials",
  },
  "connectors.secretOAuthPlaceholder": {
    tr: "İstemci sırrı ortam değişkeni",
    en: "Client secret environment variable",
  },
  "connectors.secretEnvPlaceholder": {
    tr: "Ortam değişkeni (ör. CRM_TOKEN)",
    en: "Environment variable (e.g. CRM_TOKEN)",
  },
  "connectors.oauthClientIdPlaceholder": {
    tr: "İstemci kimliği ortam değişkeni",
    en: "Client ID environment variable",
  },
  "connectors.oauthScopePlaceholder": { tr: "Scope (isteğe bağlı)", en: "Scope (optional)" },
  "connectors.idFieldPlaceholder": { tr: "Kimlik alanı (id)", en: "ID field (id)" },
  "connectors.recordsPathPlaceholder": { tr: "Kayıt yolu (data)", en: "Records path (data)" },
  "connectors.updatedAtFieldPlaceholder": {
    tr: "Güncelleme zamanı alanı",
    en: "Updated-at field",
  },
  "connectors.paginationPage": { tr: "Sayfa numaralı", en: "Page-based" },
  "connectors.paginationNone": { tr: "Tek sayfa", en: "Single page" },
  "connectors.fieldMapLabel": {
    tr: "Alan eşlemesi (kanonik alan → kaynak yol, JSON)",
    en: "Field mapping (canonical field → source path, JSON)",
  },
  "connectors.kpiFieldMapLabel": {
    tr: "KPI eşlemesi (kanonik sayısal alan → KPI etiketi, JSON)",
    en: "KPI mapping (canonical numeric field → KPI label, JSON)",
  },
  "connectors.computedKpiMapLabel": {
    tr: "Hesaplanan KPI (kpiId veya packId:kpiId → etiket, JSON)",
    en: "Computed KPI (kpiId or packId:kpiId → label, JSON)",
  },
  "connectors.computedKpiPlaceholder": {
    tr: '{ "manufacturing:first_pass_yield": "İlk Geçiş Verimi" }',
    en: '{ "manufacturing:first_pass_yield": "First Pass Yield" }',
  },
  "connectors.kpiObservedAtPlaceholder": {
    tr: "KPI gözlem zamanı alanı",
    en: "KPI observation-time field",
  },
  "connectors.eventTypePlaceholder": { tr: "Olay türü alanı", en: "Event type field" },
  "connectors.eventSubjectPlaceholder": { tr: "Olay öznesi alanı", en: "Event subject field" },
  "connectors.eventTimePlaceholder": { tr: "Olay zamanı alanı", en: "Event time field" },
  "connectors.saving": { tr: "Kaydediliyor…", en: "Saving…" },
  "connectors.saveConnection": { tr: "Bağlantıyı kaydet", en: "Save connection" },
  "connectors.selectConnectorFirst": {
    tr: "Önce bir konnektör türü seçin.",
    en: "Select a connector type first.",
  },
  "connectors.fieldMapJsonInvalid": {
    tr: "Alan eşlemesi geçerli JSON olmalı.",
    en: "Field mapping must be valid JSON.",
  },
  "connectors.kpiFieldMapJsonInvalid": {
    tr: "KPI eşlemesi geçerli JSON olmalı.",
    en: "KPI mapping must be valid JSON.",
  },
  "connectors.computedKpiMapJsonInvalid": {
    tr: "Hesaplanan KPI eşlemesi geçerli JSON olmalı.",
    en: "Computed KPI mapping must be valid JSON.",
  },
  "connectors.defaultConnectorName": { tr: "Konnektör", en: "Connector" },
  "connectors.saveFailed": { tr: "Kaydetme başarısız.", en: "Save failed." },
  "connectors.saveFailedHttp": {
    tr: "Kaydetme başarısız (HTTP {status}).",
    en: "Save failed (HTTP {status}).",
  },
  "connectors.connectionCreated": { tr: "Konnektör tanımlandı.", en: "Connector created." },
  "connectors.syncFailed": { tr: "Senkron başarısız.", en: "Sync failed." },
  "connectors.syncFailedHttp": {
    tr: "Senkron başarısız (HTTP {status}).",
    en: "Sync failed (HTTP {status}).",
  },
  "connectors.syncSummary": {
    tr: "Senkron tamam: {fetched} okundu, {canonicalized} kanonikleştirildi, {kpi} KPI gözlemi ({computed} hesaplanan), {events} süreç olayı, {skipped} atlandı, {quarantined} karantinaya alındı, {warnings} uyarı.",
    en: "Sync complete: {fetched} read, {canonicalized} canonicalized, {kpi} KPI observations ({computed} computed), {events} process events, {skipped} skipped, {quarantined} quarantined, {warnings} warnings.",
  },
  "connectors.mappingLoadFailed": {
    tr: "Eşleme yüklenemedi.",
    en: "Mapping could not be loaded.",
  },
  "connectors.mappingLoadFailedHttp": {
    tr: "Eşleme yüklenemedi (HTTP {status}).",
    en: "Mapping could not be loaded (HTTP {status}).",
  },
  "connectors.mappingJsonInvalid": {
    tr: "Eşleme geçerli JSON olmalı.",
    en: "Mapping must be valid JSON.",
  },
  "connectors.mappingApproveFailed": {
    tr: "Eşleme onaylanamadı.",
    en: "Mapping could not be approved.",
  },
  "connectors.mappingApproveFailedHttp": {
    tr: "Eşleme onaylanamadı (HTTP {status}).",
    en: "Mapping could not be approved (HTTP {status}).",
  },
  "connectors.mappingApproved": {
    tr: "Eşleme v{version} olarak onaylandı; {count} şema önerisi izlendi.",
    en: "Mapping approved as v{version}; {count} schema suggestions tracked.",
  },
  "connectors.scheduleUpdateFailed": {
    tr: "Zamanlama güncellenemedi.",
    en: "Schedule could not be updated.",
  },
  "connectors.scheduleUpdateFailedHttp": {
    tr: "Zamanlama güncellenemedi (HTTP {status}).",
    en: "Schedule could not be updated (HTTP {status}).",
  },
  "connectors.scheduleDisabled": {
    tr: "Konnektör zamanlaması kapatıldı.",
    en: "Connector schedule disabled.",
  },
  "connectors.scheduleSet": {
    tr: "Konnektör zamanlaması {interval} olarak ayarlandı.",
    en: "Connector schedule set to {interval}.",
  },
  "connectors.scheduleValidation": {
    tr: "Zamanlama aralığı 5 ile 525600 dakika arasında bir tam sayı olmalı.",
    en: "Schedule interval must be an integer between 5 and 525600 minutes.",
  },
  "connectors.schedulerRunFailed": {
    tr: "Zamanlayıcı çalıştırılamadı.",
    en: "Scheduler could not run.",
  },
  "connectors.schedulerRunFailedHttp": {
    tr: "Zamanlayıcı çalıştırılamadı (HTTP {status}).",
    en: "Scheduler could not run (HTTP {status}).",
  },
  "connectors.schedulerSummary": {
    tr: "Zamanlayıcı: {due} vadesi gelen çalıştırma, {succeeded} başarılı, {failed} başarısız, {skipped} atlandı.",
    en: "Scheduler: {due} due runs, {succeeded} succeeded, {failed} failed, {skipped} skipped.",
  },
  "connectors.scheduleOff": { tr: "Kapalı", en: "Off" },
  "connectors.durationDays": { tr: "{count} gün", en: "{count} days" },
  "connectors.durationHours": { tr: "{count} sa", en: "{count} hr" },
  "connectors.durationMinutes": { tr: "{count} dk", en: "{count} min" },
  "connectors.scheduleHealthHeading": {
    tr: "Zamanlayıcı sağlığı",
    en: "Scheduler health",
  },
  "connectors.checkedAt": { tr: "Kontrol: {date}", en: "Checked: {date}" },
  "connectors.notMeasured": { tr: "Henüz ölçülmedi", en: "Not measured yet" },
  "connectors.scheduledConnections": { tr: "Planlı bağlantı", en: "Scheduled connections" },
  "connectors.due": { tr: "Vadesi gelen", en: "Due" },
  "connectors.staleRunning": { tr: "Takılı çalıştırma", en: "Stale running" },
  "connectors.consecutiveFailures": { tr: "Ardışık hata", en: "Consecutive failures" },
  "connectors.healthNextLast": {
    tr: "Sonraki çalışma: {next} · Son başarı: {last}",
    en: "Next run: {next} · Last success: {last}",
  },
  "connectors.healthDelay": { tr: " · {minutes} dk gecikme", en: " · {minutes} min overdue" },
  "connectors.healthErrors": { tr: " · {count} hata", en: " · {count} errors" },
  "connectors.scheduleHealthy": { tr: "Sağlıklı", en: "Healthy" },
  "connectors.scheduleDue": { tr: "Vadesi geldi", en: "Due" },
  "connectors.scheduleOverdue": { tr: "Gecikmiş", en: "Overdue" },
  "connectors.scheduleRunning": { tr: "Çalışıyor", en: "Running" },
  "connectors.scheduleStale": { tr: "Takıldı", en: "Stale" },
  "connectors.scheduleFailing": { tr: "Hata veriyor", en: "Failing" },
  "connectors.scheduleUnscheduled": { tr: "Zamanlanmamış", en: "Unscheduled" },
  "connectors.schedulerNotRun": {
    tr: "Zamanlayıcı henüz çalıştırılmadı; kayıtlı çalıştırma yok.",
    en: "The scheduler has not run yet; there are no recorded runs.",
  },
  "connectors.connectionsHeading": { tr: "Kayıtlı bağlantılar", en: "Saved connections" },
  "connectors.schedulerRunning": { tr: "Zamanlayıcı çalışıyor…", en: "Scheduler running…" },
  "connectors.runDue": { tr: "Vadesi gelenleri çalıştır", en: "Run due schedules" },
  "connectors.noConnections": {
    tr: "Henüz bağlantı yok. Katalogdan bir sistem seçip tanımlayın.",
    en: "No connections yet. Select a system from the catalog and define it.",
  },
  "connectors.history": { tr: "Geçmiş", en: "History" },
  "connectors.mappingApproval": { tr: "Eşleme onayı", en: "Mapping approval" },
  "connectors.syncNow": { tr: "Senkronize et", en: "Sync now" },
  "connectors.scheduleLabel": { tr: "Zamanlama", en: "Schedule" },
  "connectors.scheduleIntervalWithMinutes": {
    tr: "{interval} ({minutes} dk aralık)",
    en: "{interval} ({minutes} min interval)",
  },
  "connectors.nextScheduled": {
    tr: "Sonraki çalıştırma: {next} · Son zamanlanmış: {last}",
    en: "Next run: {next} · Last scheduled: {last}",
  },
  "connectors.scheduleIntervalMinutesAria": {
    tr: "Zamanlama aralığı (dakika)",
    en: "Schedule interval (minutes)",
  },
  "connectors.minutesPlaceholder": { tr: "Dakika", en: "Minutes" },
  "connectors.saveInterval": { tr: "Aralığı kaydet", en: "Save interval" },
  "connectors.close": { tr: "Kapat", en: "Disable" },
  "connectors.scheduleHelp": {
    tr: "5–525600 dakika arasında bir aralık girin. Zamanlama kapatıldığında yalnızca manuel senkron çalışır.",
    en: "Enter an interval between 5 and 525600 minutes. When the schedule is off, only manual syncs run.",
  },
  "connectors.syncIssue": {
    tr: "{count} ardışık senkron hatası: {error}",
    en: "{count} consecutive sync failures: {error}",
  },
  "connectors.syncIssueNoError": {
    tr: "{count} ardışık senkron hatası",
    en: "{count} consecutive sync failures",
  },
  "connectors.retry": { tr: "Yeniden dene", en: "Retry" },
  "connectors.records": { tr: "Kayıtlar", en: "Records" },
  "connectors.none": { tr: "yok", en: "none" },
  "connectors.intelligenceTransfer": {
    tr: "Zekâya aktarım: {kpi} KPI gözlemi · {events} süreç olayı",
    en: "Intelligence transfer: {kpi} KPI observations · {events} process events",
  },
  "connectors.noRunHistory": { tr: "Çalıştırma geçmişi yok.", en: "No run history." },
  "connectors.runTriggerScheduled": { tr: "Zamanlanmış", en: "Scheduled" },
  "connectors.runTriggerManual": { tr: "Manuel", en: "Manual" },
  "connectors.runStatusSuccess": { tr: "Başarılı", en: "Succeeded" },
  "connectors.runStatusFailed": { tr: "Başarısız", en: "Failed" },
  "connectors.runStatusRunning": { tr: "Çalışıyor", en: "Running" },
  "connectors.runHistoryLine": {
    tr: "{written} yazıldı / {read} okundu · {rejected} karantina",
    en: "{written} written / {read} read · {rejected} quarantined",
  },
  "connectors.sourceSchemaSummary": {
    tr: "Kaynak şema ve eşleme önerileri ({count} alan)",
    en: "Source schema and mapping suggestions ({count} fields)",
  },
  "connectors.sourceFields": { tr: "Kaynak alanları: {fields}", en: "Source fields: {fields}" },
  "connectors.suggestions": { tr: "Öneriler: {suggestions}", en: "Suggestions: {suggestions}" },
  "connectors.noSafeSuggestion": {
    tr: "Kanonik alanlar için güvenli bir eşleme önerisi bulunamadı.",
    en: "No safe mapping suggestion was found for canonical fields.",
  },
  "connectors.mappingApprovedVersion": {
    tr: "Onaylı eşleme v{version}",
    en: "Approved mapping v{version}",
  },
  "connectors.mappingSchemaSummary": {
    tr: "Son şema: {count} alan · {accepted}/{suggested} öneri kabul edildi",
    en: "Latest schema: {count} fields · {accepted}/{suggested} suggestions accepted",
  },
  "connectors.noSchemaObservation": {
    tr: "Henüz şema gözlemi yok; ilk senkrondan sonra öneriler oluşur.",
    en: "No schema observation yet; suggestions appear after the first sync.",
  },
  "connectors.addSuggestionsToDraft": {
    tr: "Önerileri taslağa ekle",
    en: "Add suggestions to draft",
  },
  "connectors.mappingConflicts": {
    tr: "{count} kanonik alan için çelişkili kaynak önerisi var; taslakta otomatik birleştirilmedi.",
    en: "{count} canonical fields have conflicting source suggestions; they were not merged automatically in the draft.",
  },
  "connectors.mappingFieldLabel": {
    tr: "Kanonik alan → kaynak JSON yolu",
    en: "Canonical field → source JSON path",
  },
  "connectors.approving": { tr: "Onaylanıyor…", en: "Approving…" },
  "connectors.approveNewVersion": {
    tr: "Yeni sürümü onayla",
    en: "Approve new version",
  },
  "connectors.mappingVersionHistory": {
    tr: "Eşleme sürüm geçmişi ({count})",
    en: "Mapping version history ({count})",
  },
  "connectors.footnote": {
    tr: "Not: Katalogda “Kimlik bilgisi gerekir” işaretli sistemler aynı REST adaptörünü kullanır; canlı bağlantı müşteri uç noktası ve anahtarı sağlanana kadar doğrulanmış sayılmaz.",
    en: "Note: Systems marked “Requires credentials” use the same REST adapter; a live connection is not considered verified until the customer endpoint and key are provided.",
  },
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
