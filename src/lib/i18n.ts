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
  | "connectors.retryAdviceRateLimit"
  | "connectors.retryAdviceTransient"
  | "connectors.retryAdviceAuth"
  | "connectors.retryAdviceManual"
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
  | "connectors.footnote"
  | "forecast.title"
  | "forecast.titleAccent"
  | "forecast.subtitle"
  | "forecast.loading"
  | "forecast.forbidden"
  | "forecast.kpiListLoadFailedHttp"
  | "forecast.loadFailed"
  | "forecast.noSeries"
  | "forecast.kpiDataLink"
  | "forecast.noSeriesHelp"
  | "forecast.seriesNumeric"
  | "forecast.earlyWarning"
  | "forecast.anomalyScore"
  | "forecast.above"
  | "forecast.below"
  | "forecast.medianMadNote"
  | "forecast.calculating"
  | "forecast.forecastLoadFailed"
  | "forecast.forecastLoadFailedHttp"
  | "forecast.evidenceHeading"
  | "forecast.evidenceLevel"
  | "forecast.missingInResponse"
  | "forecast.evidenceUnknown"
  | "forecast.evidenceHigh"
  | "forecast.evidenceMedium"
  | "forecast.evidenceLow"
  | "forecast.backtestMae"
  | "forecast.maeMissing"
  | "forecast.dataFreshness"
  | "forecast.lastObservationTime"
  | "forecast.lastObservationMissing"
  | "forecast.uncertaintyRange"
  | "forecast.firstPeriodP10P90"
  | "forecast.p10P90Missing"
  | "forecast.insufficientEvidenceBody"
  | "forecast.assumptionsHeading"
  | "forecast.noAssumptions"
  | "forecast.modelNaive"
  | "forecast.modelSes"
  | "forecast.modelLinearTrend"
  | "forecast.chartAria"
  | "forecast.insufficientData"
  | "forecast.addMissingHistory"
  | "forecast.intervalAdjusted"
  | "forecast.selectedModel"
  | "forecast.period"
  | "forecast.modelComparisonHeading"
  | "forecast.tableModel"
  | "forecast.tableMae"
  | "forecast.tableRmse"
  | "forecast.tableMape"
  | "forecast.tablePoints"
  | "forecast.provenanceHeading"
  | "forecast.engine"
  | "forecast.observations"
  | "forecast.evidenceMae"
  | "forecast.calibrationHeading"
  | "forecast.saving"
  | "forecast.saveSnapshot"
  | "forecast.calibrationDescription"
  | "forecast.snapshotSaveFailed"
  | "forecast.snapshotSaved"
  | "forecast.measured"
  | "forecast.pendingCount"
  | "forecast.rangeHit"
  | "forecast.hitsMisses"
  | "forecast.meanAbsError"
  | "forecast.lastRecord"
  | "forecast.actual"
  | "forecast.insideRange"
  | "forecast.outsideRange"
  | "forecast.absError"
  | "forecast.evaluationPending"
  | "forecast.noSnapshots"
  | "forecast.retentionPolicy"
  | "forecast.noArchiveCandidates"
  | "forecast.archiveCandidates"
  | "ledger.eyebrow"
  | "ledger.title"
  | "ledger.titleAccent"
  | "ledger.subtitle"
  | "ledger.loading"
  | "ledger.unauthorized"
  | "ledger.forbidden"
  | "ledger.loadFailedHttp"
  | "ledger.loadFailed"
  | "ledger.empty"
  | "ledger.totalDecisions"
  | "ledger.withOutcome"
  | "ledger.improved"
  | "ledger.worsened"
  | "ledger.executionHeading"
  | "ledger.executionSummary"
  | "ledger.statusOpen"
  | "ledger.statusInProgress"
  | "ledger.statusDone"
  | "ledger.statusCancelled"
  | "ledger.economicsHeading"
  | "ledger.economicsSummary"
  | "ledger.economicsLine"
  | "ledger.economicsVariance"
  | "ledger.learningHeading"
  | "ledger.learningAcceptance"
  | "ledger.rangeAccuracy"
  | "ledger.rangeHits"
  | "ledger.rangeCoverage"
  | "ledger.rangeEvaluable"
  | "ledger.rangeGaps"
  | "ledger.acceptedRejected"
  | "ledger.modifiedCount"
  | "ledger.confidenceBuckets"
  | "ledger.bucketCount"
  | "ledger.lowSample"
  | "ledger.tableConfidence"
  | "ledger.tableDecisions"
  | "ledger.tableResolved"
  | "ledger.tableImprovement"
  | "ledger.tableRangeHit"
  | "ledger.sampleCount"
  | "ledger.calibrationHeading"
  | "ledger.calibrationInsufficient"
  | "ledger.calibrationDerived"
  | "ledger.tableSample"
  | "ledger.tableObservedImprovement"
  | "ledger.tableAssessment"
  | "ledger.tableAdjustedConfidence"
  | "ledger.directionOverconfident"
  | "ledger.directionAligned"
  | "ledger.directionUnderconfident"
  | "ledger.gapPoints"
  | "ledger.samplesNeeded"
  | "ledger.confidenceValue"
  | "ledger.choiceAccepted"
  | "ledger.choiceRejected"
  | "ledger.choiceModified"
  | "ledger.stateDraft"
  | "ledger.stateUnderReview"
  | "ledger.stateAwaitingApproval"
  | "ledger.stateApproved"
  | "ledger.stateRejected"
  | "ledger.stateInExecution"
  | "ledger.stateCompleted"
  | "ledger.stateOutcomeReview"
  | "ledger.stateClosed"
  | "ledger.actionOpen"
  | "ledger.actionInProgress"
  | "ledger.actionDone"
  | "ledger.actionCancelled"
  | "ledger.entryMeta"
  | "ledger.resultImproved"
  | "ledger.resultUnchanged"
  | "ledger.resultWorsened"
  | "ledger.resultPending"
  | "ledger.executionLabel"
  | "ledger.executionMeta"
  | "ledger.decisionState"
  | "ledger.dueDate"
  | "ledger.note"
  | "ledger.noExecution"
  | "ledger.businessImpact"
  | "ledger.expectedNumeric"
  | "ledger.rangeText"
  | "ledger.basis"
  | "ledger.assumptions"
  | "ledger.actual"
  | "ledger.variance"
  | "ledger.varianceUnavailable"
  | "ledger.evidence"
  | "ledger.outcome"
  | "ledger.lesson"
  | "ledger.percentBaseZero"
  | "ledger.rateNoSample"
  | "audit.eyebrow"
  | "audit.title"
  | "audit.titleAccent"
  | "audit.subtitle"
  | "audit.limitLabel"
  | "audit.limitOption"
  | "audit.verify"
  | "audit.verifying"
  | "audit.eventsHeading"
  | "audit.loading"
  | "audit.empty"
  | "audit.unauthorized"
  | "audit.forbidden"
  | "audit.invalidRequest"
  | "audit.loadFailed"
  | "audit.loadFailedHttp"
  | "audit.verifyMissing"
  | "audit.verifyFailed"
  | "audit.chainValid"
  | "audit.chainInvalid"
  | "audit.checkedSkipped"
  | "audit.firstBroken"
  | "audit.tableTime"
  | "audit.tableActor"
  | "audit.tableType"
  | "audit.tableSummary"
  | "audit.tableDetail"
  | "audit.tableHash"
  | "audit.type.login"
  | "audit.type.sessions_revoked"
  | "audit.type.session_revoked"
  | "audit.type.password_changed"
  | "audit.type.user_created"
  | "audit.type.user_updated"
  | "audit.type.api_key_created"
  | "audit.type.api_key_revoked"
  | "audit.type.business_profile_confirmed"
  | "audit.type.connector_config_created"
  | "audit.type.connector_schedule_updated"
  | "audit.type.connector_sync_completed"
  | "audit.type.connector_sync_failed"
  | "audit.type.connector_sync_succeeded"
  | "audit.type.bitrix24_connection_test"
  | "audit.type.data_ingested"
  | "audit.type.events_ingested"
  | "audit.type.document_ingested"
  | "audit.type.data_quality_quarantined"
  | "audit.type.data_quality_resolved"
  | "audit.type.decision_ledger_exported"
  | "audit.type.decision_state_updated"
  | "audit.type.decision_made"
  | "audit.type.decision_signal_linked"
  | "audit.type.action_created"
  | "audit.type.action_transition"
  | "audit.type.execution_intent_prepared"
  | "audit.type.execution_intent_approved"
  | "audit.type.causal_link_created"
  | "audit.type.causal_link_status_updated"
  | "audit.type.forecast_snapshot_created"
  | "audit.type.forecast_snapshots_captured"
  | "audit.type.kpi_point_deleted"
  | "audit.type.kpi_values_recorded"
  | "audit.type.local_migration"
  | "audit.type.outcome_recorded"
  | "audit.type.scenario_saved"
  | "audit.type.survivorship_policy_updated"
  | "audit.type.tais_decisions_seed"
  | "audit.type.tais_seed"
  | "audit.type.tais_seed_reset"
  | "audit.type.webhook_secret_rotated"
  | "settings.eyebrow"
  | "settings.sessionTitle"
  | "settings.sessionAccent"
  | "settings.sessionSubtitle"
  | "settings.organization"
  | "settings.user"
  | "settings.role"
  | "settings.roleLabel"
  | "settings.dataMode"
  | "settings.demoData"
  | "settings.profileTitle"
  | "settings.profileAccent"
  | "settings.profileSubtitle"
  | "settings.companyName"
  | "settings.sector"
  | "settings.saved"
  | "settings.sector.aviation"
  | "settings.sector.customerops"
  | "settings.sector.agri"
  | "settings.sector.manufacturing"
  | "settings.sector.retail"
  | "settings.sector.logistics"
  | "settings.sector.finance"
  | "settings.sector.health"
  | "settings.sector.energy"
  | "settings.sector.other"
  | "settings.role.ceo"
  | "settings.role.finance"
  | "settings.role.hr"
  | "settings.role.operations"
  | "settings.role.bizdev"
  | "settings.role.product";

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
  "connectors.retryAdviceRateLimit": {
    tr: "Sağlayıcı oran sınırı uyguladı; kısa bir beklemeden sonra yeniden deneyin.",
    en: "The provider applied a rate limit; wait briefly, then retry.",
  },
  "connectors.retryAdviceTransient": {
    tr: "Geçici bir hata görünüyor; yeniden denemek güvenli.",
    en: "This looks transient; retrying is safe.",
  },
  "connectors.retryAdviceAuth": {
    tr: "Kimlik/izin hatası; yeniden denemek düzeltmez, bağlantı ayarını güncelleyin.",
    en: "Authentication/authorization failure; retrying will not help — update the connection settings.",
  },
  "connectors.retryAdviceManual": {
    tr: "Hata sınıflandırılamadı; çalıştırma geçmişini inceleyip elle karar verin.",
    en: "The failure could not be classified; review the run history and decide manually.",
  },
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
  "forecast.title": { tr: "Gelecek tek bir sayı", en: "The future is not" },
  "forecast.titleAccent": { tr: "değildir", en: "a single number" },
  "forecast.subtitle": {
    tr: "KPI geçmişinden geriye dönük test edilmiş tahminler. Model karşılaştırması, hata metrikleri ve olasılık aralığı birlikte sunulur; yetersiz veride tahmin üretilmez.",
    en: "Backtested forecasts from KPI history. Model comparison, error metrics and probability intervals are shown together; no forecast is produced when data is insufficient.",
  },
  "forecast.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "forecast.forbidden": {
    tr: "Bu sayfayı görme yetkiniz yok.",
    en: "You do not have permission to view this page.",
  },
  "forecast.kpiListLoadFailedHttp": {
    tr: "KPI listesi yüklenemedi (HTTP {status}).",
    en: "KPI list could not be loaded (HTTP {status}).",
  },
  "forecast.loadFailed": { tr: "Yükleme başarısız.", en: "Loading failed." },
  "forecast.noSeries": { tr: "Henüz KPI serisi bulunmuyor.", en: "No KPI series yet." },
  "forecast.kpiDataLink": { tr: "KPI Verisi", en: "KPI Data" },
  "forecast.noSeriesHelp": {
    tr: "ekranından metriği ve geçmiş değerleri ekleyin; tahmin burada otomatik görünür.",
    en: "add the metric and historical values there; the forecast will appear here automatically.",
  },
  "forecast.seriesNumeric": { tr: "{count} sayısal", en: "{count} numeric" },
  "forecast.earlyWarning": {
    tr: "Erken uyarı — {count} seride sapma",
    en: "Early warning — deviation in {count} series",
  },
  "forecast.anomalyScore": { tr: "skor {score}", en: "score {score}" },
  "forecast.above": { tr: "üst", en: "above" },
  "forecast.below": { tr: "alt", en: "below" },
  "forecast.medianMadNote": {
    tr: "Median/MAD tabanlı istatistiksel sinyal; nedensellik iddiası değildir.",
    en: "A median/MAD-based statistical signal; not a claim of causality.",
  },
  "forecast.calculating": { tr: "Hesaplanıyor…", en: "Calculating…" },
  "forecast.forecastLoadFailed": {
    tr: "Tahmin yüklenemedi.",
    en: "Forecast could not be loaded.",
  },
  "forecast.forecastLoadFailedHttp": {
    tr: "Tahmin yüklenemedi (HTTP {status}).",
    en: "Forecast could not be loaded (HTTP {status}).",
  },
  "forecast.evidenceHeading": {
    tr: "Tahmin kanıtı ve sınırları",
    en: "Forecast evidence and limits",
  },
  "forecast.evidenceLevel": { tr: "Kanıt düzeyi", en: "Evidence level" },
  "forecast.missingInResponse": { tr: "Bu yanıtta yok", en: "Not in this response" },
  "forecast.evidenceUnknown": {
    tr: "Kanıt düzeyi belirtilmedi",
    en: "Evidence level not specified",
  },
  "forecast.evidenceHigh": { tr: "Yüksek kanıt", en: "High evidence" },
  "forecast.evidenceMedium": { tr: "Orta kanıt", en: "Medium evidence" },
  "forecast.evidenceLow": { tr: "Düşük kanıt", en: "Low evidence" },
  "forecast.backtestMae": {
    tr: "Geriye dönük test MAE {mae}",
    en: "Backtest MAE {mae}",
  },
  "forecast.maeMissing": { tr: "MAE bu yanıtta yok.", en: "MAE is not in this response." },
  "forecast.dataFreshness": { tr: "Veri tazeliği", en: "Data freshness" },
  "forecast.lastObservationTime": {
    tr: "Son gözlem zamanı",
    en: "Last observation time",
  },
  "forecast.lastObservationMissing": {
    tr: "Son gözlem zamanı bu yanıtta yok.",
    en: "Last observation time is not in this response.",
  },
  "forecast.uncertaintyRange": { tr: "Belirsizlik aralığı", en: "Uncertainty interval" },
  "forecast.firstPeriodP10P90": { tr: "İlk dönem, P10–P90", en: "First period, P10–P90" },
  "forecast.p10P90Missing": {
    tr: "P10–P90 aralığı üretilmedi.",
    en: "A P10–P90 interval was not produced.",
  },
  "forecast.insufficientEvidenceBody": {
    tr: "Yeterli veri olmadığı için kanıt düzeyi, geriye dönük MAE ve P10–P90 belirsizlik aralığı bu yanıtta yok.",
    en: "Because data is insufficient, evidence level, backtest MAE and the P10–P90 uncertainty interval are not in this response.",
  },
  "forecast.assumptionsHeading": { tr: "Varsayımlar ve sınırlar", en: "Assumptions and limits" },
  "forecast.noAssumptions": {
    tr: "Bu yanıtta varsayım veya sınırlama metni yok.",
    en: "There are no assumption or limitation notes in this response.",
  },
  "forecast.modelNaive": { tr: "Naif (son değer)", en: "Naive (last value)" },
  "forecast.modelSes": { tr: "Üstel düzeltme (SES)", en: "Exponential smoothing (SES)" },
  "forecast.modelLinearTrend": { tr: "Doğrusal trend", en: "Linear trend" },
  "forecast.chartAria": { tr: "Geçmiş ve tahmin grafiği", en: "History and forecast chart" },
  "forecast.insufficientData": {
    tr: "Tahmin için en az {min} sayısal gözlem gerekir. Mevcut: {current}.",
    en: "A forecast requires at least {min} numeric observations. Current: {current}.",
  },
  "forecast.addMissingHistory": { tr: "Eksik geçmişi ekle →", en: "Add missing history →" },
  "forecast.intervalAdjusted": {
    tr: "Aralıklar geçmiş kapsamaya göre ölçeklendi ({factor}×).",
    en: "Intervals were scaled to historical coverage ({factor}×).",
  },
  "forecast.selectedModel": { tr: "Seçilen model", en: "Selected model" },
  "forecast.period": { tr: "+{step} dönem", en: "+{step} periods" },
  "forecast.modelComparisonHeading": {
    tr: "Model karşılaştırması — geriye dönük test",
    en: "Model comparison — backtest",
  },
  "forecast.tableModel": { tr: "Model", en: "Model" },
  "forecast.tableMae": { tr: "MAE", en: "MAE" },
  "forecast.tableRmse": { tr: "RMSE", en: "RMSE" },
  "forecast.tableMape": { tr: "MAPE", en: "MAPE" },
  "forecast.tablePoints": { tr: "Nokta", en: "Points" },
  "forecast.provenanceHeading": { tr: "Hesap kaynağı", en: "Calculation provenance" },
  "forecast.engine": { tr: "Motor: {engine}", en: "Engine: {engine}" },
  "forecast.observations": {
    tr: "Kullanılan gözlem: {used} · dışlanan (sayısal olmayan): {excluded}",
    en: "Observations used: {used} · excluded (non-numeric): {excluded}",
  },
  "forecast.evidenceMae": { tr: "{evidence} · MAE {mae}", en: "{evidence} · MAE {mae}" },
  "forecast.calibrationHeading": {
    tr: "Tahmin kalibrasyonu — gerçekleşen",
    en: "Forecast calibration — actual",
  },
  "forecast.saving": { tr: "Kaydediliyor…", en: "Saving…" },
  "forecast.saveSnapshot": {
    tr: "Bu tahmini ölçüm için kaydet",
    en: "Save this forecast for measurement",
  },
  "forecast.calibrationDescription": {
    tr: "Kaydedilen ilk adım (P10–P90), sonraki gerçek KPI gözlemiyle karşılaştırılır. Sonuç bir garanti değil, kendi geçmiş isabetimizdir.",
    en: "The saved first step (P10–P90) is compared with the next actual KPI observation. The result is not a guarantee; it is our own historical hit rate.",
  },
  "forecast.snapshotSaveFailed": {
    tr: "Tahmin kaydedilemedi.",
    en: "Forecast could not be saved.",
  },
  "forecast.snapshotSaved": {
    tr: "Tahmin kaydedildi. Sonraki gözlem geldiğinde otomatik ölçülecek.",
    en: "Forecast saved. It will be measured automatically when the next observation arrives.",
  },
  "forecast.measured": { tr: "Ölçülen", en: "Measured" },
  "forecast.pendingCount": { tr: "{count} bekliyor", en: "{count} pending" },
  "forecast.rangeHit": { tr: "Aralık isabeti", en: "Interval hit rate" },
  "forecast.hitsMisses": { tr: "{hits} isabet · {misses} ıska", en: "{hits} hits · {misses} misses" },
  "forecast.meanAbsError": { tr: "Ortalama |hata|", en: "Mean |error|" },
  "forecast.lastRecord": { tr: "Son kayıt", en: "Last record" },
  "forecast.actual": { tr: "gerçek {value}", en: "actual {value}" },
  "forecast.insideRange": { tr: "aralıkta", en: "inside range" },
  "forecast.outsideRange": { tr: "aralık dışında", en: "outside range" },
  "forecast.absError": { tr: "|hata| {value}", en: "|error| {value}" },
  "forecast.evaluationPending": { tr: "ölçüm bekliyor", en: "pending measurement" },
  "forecast.noSnapshots": {
    tr: "Henüz kaydedilmiş tahmin yok.",
    en: "No saved forecasts yet.",
  },
  "forecast.retentionPolicy": {
    tr: "Saklama politikası: {maxAgeDays} gün / etiket başına {maxPerLabel} kayıt · kurumda {total} anlık görüntü · {archive}",
    en: "Retention policy: {maxAgeDays} days / {maxPerLabel} records per label · {total} snapshots in the organization · {archive}",
  },
  "forecast.noArchiveCandidates": { tr: "arşiv adayı yok.", en: "no archive candidates." },
  "forecast.archiveCandidates": {
    tr: "{count} arşiv adayı (silme yapılmaz, yalnızca rapor).",
    en: "{count} archive candidates (nothing is deleted; report only).",
  },
  "ledger.eyebrow": { tr: "KARAR DEFTERİ", en: "DECISION LEDGER" },
  "ledger.title": { tr: "Ne karar verdik,", en: "What did we decide," },
  "ledger.titleAccent": { tr: "ne oldu?", en: "and what happened?" },
  "ledger.subtitle": {
    tr: "Alınan kararlar ve kaydedilmiş sonuçları. Kurumsal öğrenme: hangi karar hangi koşulda işe yaradı.",
    en: "Decisions made and their recorded outcomes. Institutional learning: which decision worked under which conditions.",
  },
  "ledger.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "ledger.unauthorized": {
    tr: "Bu sayfa için oturum gerekir.",
    en: "This page requires an enterprise session.",
  },
  "ledger.forbidden": {
    tr: "Karar geçmişini görüntüleme yetkiniz yok.",
    en: "You do not have permission to view decision history.",
  },
  "ledger.loadFailedHttp": {
    tr: "Karar geçmişi yüklenemedi (HTTP {status}).",
    en: "Decision history could not be loaded (HTTP {status}).",
  },
  "ledger.loadFailed": { tr: "Yükleme başarısız.", en: "Loading failed." },
  "ledger.empty": {
    tr: "Henüz karar kaydı bulunmuyor.",
    en: "No decision records yet.",
  },
  "ledger.totalDecisions": { tr: "Toplam karar", en: "Total decisions" },
  "ledger.withOutcome": { tr: "Sonuçlanan", en: "With outcome" },
  "ledger.improved": { tr: "İyileşen", en: "Improved" },
  "ledger.worsened": { tr: "Kötüleşen", en: "Worsened" },
  "ledger.executionHeading": {
    tr: "KARAR → YÜRÜTME BAĞLANTISI",
    en: "DECISION → EXECUTION LINK",
  },
  "ledger.executionSummary": {
    tr: "{count} aksiyon · her geçiş değişmez olay kaydı taşır",
    en: "{count} actions · every transition carries an immutable event record",
  },
  "ledger.statusOpen": { tr: "Açık", en: "Open" },
  "ledger.statusInProgress": { tr: "Yürütülüyor", en: "In progress" },
  "ledger.statusDone": { tr: "Tamamlandı", en: "Done" },
  "ledger.statusCancelled": { tr: "İptal", en: "Cancelled" },
  "ledger.economicsHeading": {
    tr: "SAYISAL EKONOMİK ETKİ",
    en: "QUANTIFIED ECONOMIC IMPACT",
  },
  "ledger.economicsSummary": {
    tr: "{count} mutabık karar · para birimleri ayrı toplanır",
    en: "{count} reconciled decisions · currencies are totaled separately",
  },
  "ledger.economicsLine": {
    tr: "Beklenen {expected} · Gerçekleşen {actual}",
    en: "Expected {expected} · Actual {actual}",
  },
  "ledger.economicsVariance": {
    tr: "Mutabık fark {variance} · {count} çift",
    en: "Reconciled variance {variance} · {count} pairs",
  },
  "ledger.learningHeading": { tr: "KAPALI DÖNGÜ ÖĞRENME", en: "CLOSED-LOOP LEARNING" },
  "ledger.learningAcceptance": {
    tr: "Öneri kabul oranı {rate} · {count} karar",
    en: "Recommendation acceptance rate {rate} · {count} decisions",
  },
  "ledger.rangeAccuracy": { tr: "Aralık isabeti", en: "Interval hit rate" },
  "ledger.rangeHits": {
    tr: "{hits} isabet · {misses} ıska",
    en: "{hits} hits · {misses} misses",
  },
  "ledger.rangeCoverage": { tr: "Aralık kapsamı", en: "Interval coverage" },
  "ledger.rangeEvaluable": {
    tr: "{count} değerlendirilebilir",
    en: "{count} evaluable",
  },
  "ledger.rangeGaps": {
    tr: "{missing} aralıksız · {mismatch} para birimi farkı",
    en: "{missing} without range · {mismatch} currency mismatches",
  },
  "ledger.acceptedRejected": { tr: "Kabul / ret", en: "Accepted / rejected" },
  "ledger.modifiedCount": {
    tr: "{count} değiştirilmiş",
    en: "{count} modified",
  },
  "ledger.confidenceBuckets": { tr: "Güven kovaları", en: "Confidence buckets" },
  "ledger.bucketCount": { tr: "{count} kova", en: "{count} buckets" },
  "ledger.lowSample": {
    tr: "Düşük örneklem açıkça gösterilir",
    en: "Low sample sizes are shown explicitly",
  },
  "ledger.tableConfidence": { tr: "Güven", en: "Confidence" },
  "ledger.tableDecisions": { tr: "Karar", en: "Decisions" },
  "ledger.tableResolved": { tr: "Sonuçlanan", en: "Resolved" },
  "ledger.tableImprovement": { tr: "İyileşme", en: "Improvement" },
  "ledger.tableRangeHit": { tr: "Aralık isabeti", en: "Interval hit rate" },
  "ledger.sampleCount": { tr: "({count} örnek)", en: "({count} samples)" },
  "ledger.calibrationHeading": { tr: "GÜVEN KALİBRASYONU", en: "CONFIDENCE CALIBRATION" },
  "ledger.calibrationInsufficient": {
    tr: "Kanıt yetersiz · kova başına en az {threshold} sonuç gerekir",
    en: "Insufficient evidence · at least {threshold} outcomes per bucket required",
  },
  "ledger.calibrationDerived": {
    tr: "{count} sonuçlanan karardan türetildi",
    en: "Derived from {count} resolved decisions",
  },
  "ledger.tableSample": { tr: "Örnek", en: "Sample" },
  "ledger.tableObservedImprovement": {
    tr: "Gözlenen iyileşme",
    en: "Observed improvement",
  },
  "ledger.tableAssessment": { tr: "Değerlendirme", en: "Assessment" },
  "ledger.tableAdjustedConfidence": {
    tr: "Düzeltilmiş güven",
    en: "Adjusted confidence",
  },
  "ledger.directionOverconfident": { tr: "Aşırı güvenli", en: "Overconfident" },
  "ledger.directionAligned": { tr: "Tutarlı", en: "Aligned" },
  "ledger.directionUnderconfident": { tr: "Temkinli", en: "Underconfident" },
  "ledger.gapPoints": { tr: "(fark {gap} puan)", en: "(gap {gap} points)" },
  "ledger.samplesNeeded": {
    tr: "Kanıt yetersiz · {count} sonuç daha gerekli",
    en: "Insufficient evidence · {count} more outcomes required",
  },
  "ledger.confidenceValue": { tr: "%{value}", en: "{value}%" },
  "ledger.choiceAccepted": { tr: "Kabul", en: "Accepted" },
  "ledger.choiceRejected": { tr: "Ret", en: "Rejected" },
  "ledger.choiceModified": { tr: "Değiştirilmiş", en: "Modified" },
  "ledger.stateDraft": { tr: "Taslak", en: "Draft" },
  "ledger.stateUnderReview": { tr: "İnceleniyor", en: "Under review" },
  "ledger.stateAwaitingApproval": { tr: "Onay bekliyor", en: "Awaiting approval" },
  "ledger.stateApproved": { tr: "Onaylandı", en: "Approved" },
  "ledger.stateRejected": { tr: "Reddedildi", en: "Rejected" },
  "ledger.stateInExecution": { tr: "Yürütmede", en: "In execution" },
  "ledger.stateCompleted": { tr: "Tamamlandı", en: "Completed" },
  "ledger.stateOutcomeReview": { tr: "Sonuç incelemesi", en: "Outcome review" },
  "ledger.stateClosed": { tr: "Kapandı", en: "Closed" },
  "ledger.actionOpen": { tr: "Açık", en: "Open" },
  "ledger.actionInProgress": { tr: "Yürütülüyor", en: "In progress" },
  "ledger.actionDone": { tr: "Tamamlandı", en: "Done" },
  "ledger.actionCancelled": { tr: "İptal", en: "Cancelled" },
  "ledger.entryMeta": {
    tr: "{choice} · {decidedBy} · {date} · güven {confidence}",
    en: "{choice} · {decidedBy} · {date} · confidence {confidence}",
  },
  "ledger.resultImproved": { tr: "İyileşti", en: "Improved" },
  "ledger.resultUnchanged": { tr: "Değişmedi", en: "Unchanged" },
  "ledger.resultWorsened": { tr: "Kötüleşti", en: "Worsened" },
  "ledger.resultPending": { tr: "Sonuç bekliyor", en: "Awaiting outcome" },
  "ledger.executionLabel": { tr: "Yürütme:", en: "Execution:" },
  "ledger.executionMeta": {
    tr: "{status} · {owner} · {count} olay",
    en: "{status} · {owner} · {count} events",
  },
  "ledger.decisionState": { tr: "Karar durumu: {state}", en: "Decision state: {state}" },
  "ledger.dueDate": { tr: "· Son tarih {date}", en: "· Due {date}" },
  "ledger.note": { tr: "· Not: {note}", en: "· Note: {note}" },
  "ledger.noExecution": {
    tr: "Yürütme kaydı yok · Karar durumu: {state}",
    en: "No execution record · Decision state: {state}",
  },
  "ledger.businessImpact": { tr: "Beklenen etki:", en: "Expected impact:" },
  "ledger.expectedNumeric": { tr: "Sayısal beklenti:", en: "Quantified expectation:" },
  "ledger.rangeText": { tr: "· aralık {low} – {high}", en: "· range {low} – {high}" },
  "ledger.basis": { tr: "Dayanak: {basis}", en: "Basis: {basis}" },
  "ledger.assumptions": { tr: "Varsayımlar: {list}", en: "Assumptions: {list}" },
  "ledger.actual": { tr: "Gerçekleşen:", en: "Actual:" },
  "ledger.variance": { tr: "· fark {amount} ({percent})", en: "· variance {amount} ({percent})" },
  "ledger.varianceUnavailable": {
    tr: "Fark hesaplanmadı: beklenen ve gerçekleşen para birimi farklı.",
    en: "Variance not calculated: expected and actual currencies differ.",
  },
  "ledger.evidence": { tr: "Kanıt: {evidence}", en: "Evidence: {evidence}" },
  "ledger.outcome": { tr: "Sonuç:", en: "Outcome:" },
  "ledger.lesson": { tr: "Ders:", en: "Lesson:" },
  "ledger.percentBaseZero": { tr: "taban sıfır", en: "zero baseline" },
  "ledger.rateNoSample": { tr: "örnek yok", en: "no samples" },
  "audit.eyebrow": { tr: "DENETİM", en: "AUDIT" },
  "audit.title": { tr: "Denetim", en: "Audit" },
  "audit.titleAccent": { tr: "günlüğü.", en: "log." },
  "audit.subtitle": {
    tr: "Kurumunuzdaki kritik işlemler hash zinciriyle kayıt altına alınır. Bu ekran salt okunurdur.",
    en: "Critical operations in your organization are recorded in a hash chain. This screen is read-only.",
  },
  "audit.limitLabel": { tr: "GÖSTERİLECEK OLAY", en: "EVENTS TO SHOW" },
  "audit.limitOption": { tr: "Son {count} olay", en: "Last {count} events" },
  "audit.verify": { tr: "Zinciri doğrula", en: "Verify chain" },
  "audit.verifying": { tr: "Doğrulanıyor…", en: "Verifying…" },
  "audit.eventsHeading": { tr: "DENETİM OLAYLARI", en: "AUDIT EVENTS" },
  "audit.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "audit.empty": {
    tr: "Kayıtlı denetim olayı bulunmuyor.",
    en: "No audit events recorded.",
  },
  "audit.unauthorized": {
    tr: "Bu ekranı görmek için oturum açmanız gerekiyor.",
    en: "You must sign in to view this screen.",
  },
  "audit.forbidden": {
    tr: "Bu ekranı görüntülemek için yetkiniz yok.",
    en: "You do not have permission to view this screen.",
  },
  "audit.invalidRequest": { tr: "Geçersiz istek.", en: "Invalid request." },
  "audit.loadFailed": {
    tr: "Denetim olayları yüklenemedi.",
    en: "Audit events could not be loaded.",
  },
  "audit.loadFailedHttp": {
    tr: "Denetim verisi yüklenemedi (HTTP {status}).",
    en: "Audit data could not be loaded (HTTP {status}).",
  },
  "audit.verifyMissing": {
    tr: "Doğrulama sonucu alınamadı.",
    en: "Verification result was not received.",
  },
  "audit.verifyFailed": {
    tr: "Zincir doğrulanamadı.",
    en: "The chain could not be verified.",
  },
  "audit.chainValid": { tr: "Zincir geçerli.", en: "Chain is valid." },
  "audit.chainInvalid": { tr: "Zincir geçersiz.", en: "Chain is invalid." },
  "audit.checkedSkipped": {
    tr: "Kontrol edilen: {checked} olay · Atlanan: {skipped}",
    en: "Checked: {checked} events · Skipped: {skipped}",
  },
  "audit.firstBroken": { tr: "İlk bozulma:", en: "First break:" },
  "audit.tableTime": { tr: "Tarih / saat", en: "Date / time" },
  "audit.tableActor": { tr: "Aktör", en: "Actor" },
  "audit.tableType": { tr: "Tür", en: "Type" },
  "audit.tableSummary": { tr: "Özet", en: "Summary" },
  "audit.tableDetail": { tr: "Ayrıntı", en: "Detail" },
  "audit.tableHash": { tr: "Hash", en: "Hash" },
  "audit.type.login": { tr: "Oturum açma", en: "Sign-in" },
  "audit.type.sessions_revoked": { tr: "Oturumlar iptal edildi", en: "Sessions revoked" },
  "audit.type.session_revoked": { tr: "Oturum iptal edildi", en: "Session revoked" },
  "audit.type.password_changed": { tr: "Parola değiştirildi", en: "Password changed" },
  "audit.type.user_created": { tr: "Kullanıcı oluşturuldu", en: "User created" },
  "audit.type.user_updated": { tr: "Kullanıcı güncellendi", en: "User updated" },
  "audit.type.api_key_created": { tr: "API anahtarı oluşturuldu", en: "API key created" },
  "audit.type.api_key_revoked": { tr: "API anahtarı iptal edildi", en: "API key revoked" },
  "audit.type.business_profile_confirmed": { tr: "İş bağlamı onaylandı", en: "Business profile confirmed" },
  "audit.type.connector_config_created": { tr: "Bağlantı yapılandırması oluşturuldu", en: "Connector configuration created" },
  "audit.type.connector_schedule_updated": { tr: "Bağlantı zamanlaması güncellendi", en: "Connector schedule updated" },
  "audit.type.connector_sync_completed": { tr: "Bağlantı senkronu tamamlandı", en: "Connector sync completed" },
  "audit.type.connector_sync_failed": { tr: "Bağlantı senkronu başarısız", en: "Connector sync failed" },
  "audit.type.connector_sync_succeeded": { tr: "Bağlantı senkronu başarılı", en: "Connector sync succeeded" },
  "audit.type.bitrix24_connection_test": { tr: "Bitrix24 bağlantı testi", en: "Bitrix24 connection test" },
  "audit.type.data_ingested": { tr: "Veri alındı", en: "Data ingested" },
  "audit.type.events_ingested": { tr: "Süreç olayları alındı", en: "Process events ingested" },
  "audit.type.document_ingested": { tr: "Belge alındı", en: "Document ingested" },
  "audit.type.data_quality_quarantined": { tr: "Veri kalitesi karantinası", en: "Data quality quarantined" },
  "audit.type.data_quality_resolved": { tr: "Veri kalitesi sorunu çözüldü", en: "Data quality issue resolved" },
  "audit.type.decision_ledger_exported": { tr: "Karar defteri dışa aktarıldı", en: "Decision ledger exported" },
  "audit.type.decision_state_updated": { tr: "Karar durumu güncellendi", en: "Decision state updated" },
  "audit.type.decision_made": { tr: "Karar verildi", en: "Decision made" },
  "audit.type.decision_signal_linked": { tr: "Karar sinyali bağlandı", en: "Decision signal linked" },
  "audit.type.action_created": { tr: "Aksiyon oluşturuldu", en: "Action created" },
  "audit.type.action_transition": { tr: "Aksiyon durumu değişti", en: "Action transitioned" },
  "audit.type.execution_intent_prepared": { tr: "Yürütme niyeti hazırlandı", en: "Execution intent prepared" },
  "audit.type.execution_intent_approved": { tr: "Yürütme niyeti onaylandı", en: "Execution intent approved" },
  "audit.type.causal_link_created": { tr: "Nedensel bağlantı oluşturuldu", en: "Causal link created" },
  "audit.type.causal_link_status_updated": { tr: "Nedensel bağlantı durumu güncellendi", en: "Causal link status updated" },
  "audit.type.forecast_snapshot_created": { tr: "Tahmin anlık görüntüsü oluşturuldu", en: "Forecast snapshot created" },
  "audit.type.forecast_snapshots_captured": { tr: "Tahmin anlık görüntüleri alındı", en: "Forecast snapshots captured" },
  "audit.type.kpi_point_deleted": { tr: "KPI noktası silindi", en: "KPI point deleted" },
  "audit.type.kpi_values_recorded": { tr: "KPI değerleri kaydedildi", en: "KPI values recorded" },
  "audit.type.local_migration": { tr: "Yerel veri göçü", en: "Local migration" },
  "audit.type.outcome_recorded": { tr: "Sonuç kaydedildi", en: "Outcome recorded" },
  "audit.type.scenario_saved": { tr: "Senaryo kaydedildi", en: "Scenario saved" },
  "audit.type.survivorship_policy_updated": { tr: "Baskın kayıt politikası güncellendi", en: "Survivorship policy updated" },
  "audit.type.tais_decisions_seed": { tr: "TAIS karar verisi yüklendi", en: "TAIS decision fixture seeded" },
  "audit.type.tais_seed": { tr: "TAIS verisi yüklendi", en: "TAIS fixture seeded" },
  "audit.type.tais_seed_reset": { tr: "TAIS verisi sıfırlandı", en: "TAIS fixture reset" },
  "audit.type.webhook_secret_rotated": { tr: "Webhook sırrı yenilendi", en: "Webhook secret rotated" },
  "settings.eyebrow": { tr: "AYARLAR", en: "SETTINGS" },
  "settings.sessionTitle": { tr: "Kurum", en: "Organization" },
  "settings.sessionAccent": { tr: "bilgileri.", en: "details." },
  "settings.sessionSubtitle": {
    tr: "Kurumsal oturum bilgileri sunucu oturumundan okunur; kurum ve rol bu ekrandan değiştirilemez.",
    en: "Enterprise session details are read from the server session; organization and role cannot be changed here.",
  },
  "settings.organization": { tr: "Kurum:", en: "Organization:" },
  "settings.user": { tr: "Kullanıcı:", en: "User:" },
  "settings.role": { tr: "Rol:", en: "Role:" },
  "settings.roleLabel": { tr: "ROL", en: "ROLE" },
  "settings.dataMode": { tr: "Veri modu:", en: "Data mode:" },
  "settings.demoData": {
    tr: "Bitrix24 uyumlu demo verisi",
    en: "Bitrix24-compatible demo data",
  },
  "settings.profileTitle": { tr: "Profilinizi", en: "Manage your" },
  "settings.profileAccent": { tr: "yönetin.", en: "profile." },
  "settings.profileSubtitle": {
    tr: "Şirket, sektör ve rol bilgilerinizi buradan güncelleyebilirsiniz.",
    en: "You can update your company, sector, and role details here.",
  },
  "settings.companyName": { tr: "ŞİRKET ADI", en: "COMPANY NAME" },
  "settings.sector": { tr: "SEKTÖR", en: "SECTOR" },
  "settings.saved": { tr: "Kaydedildi.", en: "Saved." },
  "settings.sector.aviation": { tr: "Havacılık", en: "Aviation" },
  "settings.sector.customerops": { tr: "Müşteri Operasyonları", en: "Customer Operations" },
  "settings.sector.agri": { tr: "Tarım & Gıda", en: "Agriculture & Food" },
  "settings.sector.manufacturing": { tr: "Üretim & Sanayi", en: "Manufacturing & Industry" },
  "settings.sector.retail": { tr: "Perakende & Ticaret", en: "Retail & Commerce" },
  "settings.sector.logistics": { tr: "Lojistik & Ulaşım", en: "Logistics & Transport" },
  "settings.sector.finance": { tr: "Finans & Bankacılık", en: "Finance & Banking" },
  "settings.sector.health": { tr: "Sağlık", en: "Healthcare" },
  "settings.sector.energy": { tr: "Enerji", en: "Energy" },
  "settings.sector.other": { tr: "Diğer", en: "Other" },
  "settings.role.ceo": { tr: "CEO", en: "CEO" },
  "settings.role.finance": { tr: "Finans", en: "Finance" },
  "settings.role.hr": { tr: "İnsan Kaynakları", en: "Human Resources" },
  "settings.role.operations": { tr: "Operasyon", en: "Operations" },
  "settings.role.bizdev": { tr: "İş Geliştirme", en: "Business Development" },
  "settings.role.product": { tr: "Ürün / Teknoloji", en: "Product / Tech" },
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
