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
  | "settings.role.product"
  | "settings.password.title"
  | "settings.password.help"
  | "settings.password.current"
  | "settings.password.new"
  | "settings.password.confirm"
  | "settings.password.currentRequired"
  | "settings.password.min"
  | "settings.password.max"
  | "settings.password.same"
  | "settings.password.mismatch"
  | "settings.password.failedHttp"
  | "settings.password.network"
  | "settings.password.success"
  | "settings.password.submitting"
  | "settings.password.submit"
  | "settings.sessions.title"
  | "settings.sessions.subtitle"
  | "settings.sessions.loading"
  | "settings.sessions.empty"
  | "settings.sessions.current"
  | "settings.sessions.other"
  | "settings.sessions.activeBadge"
  | "settings.sessions.started"
  | "settings.sessions.expires"
  | "settings.sessions.revoke"
  | "settings.sessions.revokeAll"
  | "settings.sessions.revoked"
  | "settings.sessions.failedHttp"
  | "settings.sessions.network"
  | "settings.users.title"
  | "settings.users.subtitle"
  | "settings.users.loading"
  | "settings.users.retry"
  | "settings.users.empty"
  | "settings.users.newTitle"
  | "settings.users.tempPasswordHelp"
  | "settings.users.email"
  | "settings.users.displayName"
  | "settings.users.role"
  | "settings.users.tempPassword"
  | "settings.users.created"
  | "settings.users.creating"
  | "settings.users.create"
  | "settings.users.failedHttp"
  | "settings.users.network"
  | "settings.users.passwordMin"
  | "settings.users.passwordMax"
  | "settings.users.statusActive"
  | "settings.users.statusDisabled"
  | "settings.users.status"
  | "settings.users.save"
  | "settings.users.saving"
  | "settings.users.resetPassword"
  | "settings.users.resetPasswordAria"
  | "settings.users.statusAria"
  | "settings.users.saveAria"
  | "settings.users.newPassword"
  | "settings.users.cancel"
  | "settings.users.passwordReset"
  | "settings.users.passwordHelp"
  | "settings.users.role.board"
  | "settings.users.role.ceo"
  | "settings.users.role.clevel"
  | "settings.users.role.dept_manager"
  | "settings.users.role.risk_manager"
  | "settings.users.role.analyst"
  | "settings.users.role.auditor"
  | "settings.users.role.data_admin"
  | "settings.users.role.sys_admin"
  | "dataQuality.eyebrow"
  | "dataQuality.title"
  | "dataQuality.titleAccent"
  | "dataQuality.subtitle"
  | "dataQuality.filterPending"
  | "dataQuality.filterAll"
  | "dataQuality.loading"
  | "dataQuality.emptyPending"
  | "dataQuality.emptyAll"
  | "dataQuality.noticeAcceptProposed"
  | "dataQuality.noticeKeepExisting"
  | "dataQuality.noticeResolved"
  | "dataQuality.noticeDiscarded"
  | "dataQuality.errorUnauthorized"
  | "dataQuality.errorForbidden"
  | "dataQuality.errorHttp"
  | "dataQuality.errorNetwork"
  | "dataQuality.errorLoadFailed"
  | "dataQuality.actionApplyProposed"
  | "dataQuality.actionKeepExisting"
  | "dataQuality.actionResolved"
  | "dataQuality.actionDiscard"
  | "dataQuality.status.pending"
  | "dataQuality.status.resolved"
  | "dataQuality.status.discarded"
  | "alerts.eyebrow"
  | "alerts.title"
  | "alerts.titleAccent"
  | "alerts.subtitle"
  | "alerts.loadingTais"
  | "alerts.empty"
  | "alerts.taisDemoBadge"
  | "alerts.recommendedAction"
  | "alerts.serviceType"
  | "alerts.customer"
  | "alerts.location"
  | "alerts.rootCause"
  | "alerts.expectedImpact"
  | "alerts.confidence"
  | "alerts.confidenceValue"
  | "alerts.dataAsOf"
  | "alerts.sources"
  | "alerts.taisStatusNote"
  | "alerts.warRoom"
  | "alerts.noNotes"
  | "alerts.notePlaceholder"
  | "alerts.send"
  | "alerts.you"
  | "alerts.evidenceRef"
  | "alerts.severity.critical"
  | "alerts.severity.warning"
  | "alerts.severity.info"
  | "alerts.severity.healthy"
  | "alerts.status.open"
  | "alerts.status.handled"
  | "alerts.status.snoozed"
  | "alerts.status.escalated"
  | "alerts.evidenceType.task"
  | "alerts.evidenceType.complaint"
  | "alerts.evidenceType.deal"
  | "alerts.evidenceType.quality_issue"
  | "alerts.evidenceType.service_request"
  | "alerts.evidenceType.contract"
  | "alerts.rule.overdue_open_task"
  | "alerts.rule.sla_risk_task"
  | "alerts.rule.unassigned_task"
  | "alerts.rule.team_capacity_overload"
  | "alerts.rule.recurring_complaint"
  | "alerts.rule.stale_deal"
  | "alerts.rule.renewal_without_activity"
  | "alerts.rule.overdue_periodic_service"
  | "alerts.rule.recurring_quality_issue"
  | "alerts.rule.stale_data_source"
  | "alerts.rule.unmatched_service_request"
  | "alerts.rule.high_delay_critical_customer"
  | "alerts.serviceType.cleaning"
  | "alerts.serviceType.catering"
  | "alerts.serviceType.pest_control"
  | "alerts.serviceType.horeca"
  | "alerts.serviceType.property_mgmt"
  | "alerts.serviceType.office_mgmt"
  | "process.eyebrow"
  | "process.title"
  | "process.titleAccent"
  | "process.subtitle"
  | "process.loading"
  | "process.errorHttp"
  | "process.errorLoadFailed"
  | "process.cardSubjects"
  | "process.cardEvents"
  | "process.cardTransitionTypes"
  | "process.cardMedianCase"
  | "process.bottlenecksHeading"
  | "process.bottlenecksEmpty"
  | "process.bottleneckRow"
  | "process.transitionsHeading"
  | "process.colTransition"
  | "process.colCount"
  | "process.colMedian"
  | "process.colP90"
  | "process.coverageHeading"
  | "process.window"
  | "process.provenance"
  | "process.evidence.high"
  | "process.evidence.medium"
  | "process.evidence.low"
  | "process.duration.hours"
  | "process.duration.minutes"
  | "process.duration.seconds"
  | "process.event.lead.created"
  | "process.event.lead.opened"
  | "process.event.lead.assigned"
  | "process.event.lead.updated"
  | "process.event.lead.synced"
  | "process.event.call.started"
  | "process.event.call.completed"
  | "process.event.call.finished"
  | "process.event.session.started"
  | "process.event.session.ended"
  | "process.event.sale.started"
  | "process.event.sale.completed"
  | "process.event.department.snapshot"
  | "integrations.eyebrow"
  | "integrations.title"
  | "integrations.titleAccent"
  | "integrations.subtitle"
  | "integrations.tab.ingestion"
  | "integrations.tab.csv"
  | "integrations.tab.oauth"
  | "integrations.tab.webhook"
  | "integrations.tab.apiKeys"
  | "integrations.taisNote"
  | "integrations.errorUnknown"
  | "integrations.ingestion.description"
  | "integrations.ingestion.selectedFile"
  | "integrations.ingestion.placeholder"
  | "integrations.ingestion.submit"
  | "integrations.ingestion.submitting"
  | "integrations.ingestion.noFields"
  | "integrations.csv.description"
  | "integrations.csv.sectorFallback"
  | "integrations.csv.reportTitle"
  | "integrations.csv.templatePeriodHeader"
  | "integrations.csv.downloadTemplate"
  | "integrations.csv.periodLabel"
  | "integrations.csv.periodPlaceholder"
  | "integrations.csv.periodStart"
  | "integrations.csv.periodEnd"
  | "integrations.csv.preview"
  | "integrations.csv.assess"
  | "integrations.csv.assessing"
  | "integrations.csv.kpiSavedSuffix"
  | "integrations.csv.recommendation"
  | "integrations.csv.savedPrefix"
  | "integrations.csv.savedLink"
  | "integrations.csv.savedSuffix"
  | "integrations.bitrix24.demoBadge"
  | "integrations.bitrix24.connectedBadge"
  | "integrations.bitrix24.unconfiguredBadge"
  | "integrations.bitrix24.modeLine"
  | "integrations.bitrix24.modeDemo"
  | "integrations.bitrix24.modeLive"
  | "integrations.bitrix24.notSynced"
  | "integrations.bitrix24.companies"
  | "integrations.bitrix24.deals"
  | "integrations.bitrix24.tasks"
  | "integrations.bitrix24.activities"
  | "integrations.bitrix24.users"
  | "integrations.bitrix24.serviceRequests"
  | "integrations.bitrix24.complaints"
  | "integrations.bitrix24.qualityRecords"
  | "integrations.oauth.description"
  | "integrations.oauth.soon"
  | "integrations.oauth.connect"
  | "integrations.webhook.sessionRequired"
  | "integrations.webhook.configUnavailable"
  | "integrations.webhook.loading"
  | "integrations.webhook.descriptionPrefix"
  | "integrations.webhook.descriptionLive"
  | "integrations.webhook.descriptionSuffix"
  | "integrations.webhook.delivery"
  | "integrations.webhook.endpointActive"
  | "integrations.webhook.urlLabel"
  | "integrations.webhook.secretLabel"
  | "integrations.webhook.show"
  | "integrations.webhook.hide"
  | "integrations.webhook.rotate"
  | "integrations.webhook.headersLabel"
  | "integrations.webhook.exampleLabel"
  | "integrations.apiKeys.loadFailed"
  | "integrations.apiKeys.loading"
  | "integrations.apiKeys.description"
  | "integrations.apiKeys.currentKeys"
  | "integrations.apiKeys.empty"
  | "integrations.apiKeys.colName"
  | "integrations.apiKeys.colPrefix"
  | "integrations.apiKeys.colScopes"
  | "integrations.apiKeys.colLastUsed"
  | "integrations.apiKeys.colStatus"
  | "integrations.apiKeys.neverUsed"
  | "integrations.apiKeys.revoked"
  | "integrations.apiKeys.active"
  | "integrations.apiKeys.revoking"
  | "integrations.apiKeys.revoke"
  | "integrations.apiKeys.newKey"
  | "integrations.apiKeys.namePlaceholder"
  | "integrations.apiKeys.create"
  | "integrations.apiKeys.creating"
  | "integrations.apiKeys.createFailed"
  | "integrations.apiKeys.scope.events_write"
  | "integrations.apiKeys.scope.read_advisors"
  | "integrations.apiKeys.scope.read_all"
  | "dataQuality.score.heading"
  | "dataQuality.score.overall"
  | "dataQuality.score.worst"
  | "dataQuality.score.noData"
  | "dataQuality.score.sample"
  | "dataQuality.score.total"
  | "dataQuality.score.sampled"
  | "dataQuality.score.filterLabel"
  | "dataQuality.score.allMetrics"
  | "dataQuality.score.error"
  | "dataQuality.score.dimension.completeness"
  | "dataQuality.score.dimension.validity"
  | "dataQuality.score.dimension.uniqueness"
  | "dataQuality.score.dimension.freshness"
  | "reports.eyebrow"
  | "reports.title"
  | "reports.titleAccent"
  | "reports.subtitle"
  | "reports.subtitleTais"
  | "reports.dailyHeading"
  | "reports.empty"
  | "reports.downloadPdf"
  | "reports.delete"
  | "reports.printHeader"
  | "reports.percent"
  | "reports.tais.error"
  | "reports.tais.loading"
  | "reports.tais.executiveHeading"
  | "reports.tais.opsSummary"
  | "reports.tais.activeTasks"
  | "reports.tais.overdueTasks"
  | "reports.tais.slaCompliance"
  | "reports.tais.openComplaints"
  | "reports.tais.serviceBreakdown"
  | "reports.tais.colService"
  | "reports.tais.colTotal"
  | "reports.tais.colOpen"
  | "reports.tais.colOverdue"
  | "reports.tais.customerContract"
  | "reports.tais.noRenewals"
  | "reports.tais.colCustomer"
  | "reports.tais.colRenewal"
  | "reports.tais.colValue"
  | "reports.tais.slaStatus"
  | "reports.tais.slaSummary"
  | "reports.tais.overdueSummary"
  | "reports.tais.complaintQuality"
  | "reports.tais.complaintSummary"
  | "reports.tais.recurringSummary"
  | "reports.tais.workload"
  | "reports.tais.colTeam"
  | "reports.tais.colCapacity"
  | "reports.tais.colUtilization"
  | "reports.tais.decisionSummary"
  | "reports.tais.mainDecision"
  | "reports.tais.noMainDecision"
  | "reports.kpi.heading"
  | "reports.kpi.source"
  | "reports.counselor.heading"
  | "reports.counselor.colName"
  | "reports.counselor.colAssigned"
  | "reports.counselor.colSales"
  | "reports.counselor.colAmount"
  | "reports.counselor.assignedLabel"
  | "reports.counselor.salesLabel"
  | "reports.counselor.amountLabel"
  | "reports.counselor.conversionLabel"
  | "reports.status.open"
  | "reports.status.in_progress"
  | "reports.status.done"
  | "ledger.exportCsv"
  | "audit.exportCsv"
  | "forecast.exportCsv"
  | "decisions.eyebrow"
  | "decisions.title"
  | "decisions.titleAccent"
  | "decisions.subtitle"
  | "decisions.taisSubtitle"
  | "decisions.loading"
  | "decisions.taisEmpty"
  | "decisions.noOpenCases"
  | "decisions.closeAnalyzer"
  | "decisions.openAnalyzer"
  | "decisions.caseCounts"
  | "decisions.defaultUser"
  | "decisions.decidedHeading"
  | "decisions.decidedBadge"
  | "decisions.unknownError"
  | "decisions.analyzer.dataHeading"
  | "decisions.analyzer.dataPlaceholder"
  | "decisions.analyzer.constraintsHeading"
  | "decisions.analyzer.constraintsHint"
  | "decisions.analyzer.deleteConstraint"
  | "decisions.analyzer.newConstraint"
  | "decisions.analyzer.addConstraint"
  | "decisions.analyzer.running"
  | "decisions.analyzer.run"
  | "decisions.analyzer.busyHint"
  | "decisions.analyzer.noData"
  | "decisions.severity.critical"
  | "decisions.severity.warning"
  | "decisions.severity.info"
  | "decisions.severity.healthy"
  | "decisions.cancel"
  | "decisions.yes"
  | "decisions.no"
  | "decisions.causal.heading"
  | "decisions.causal.count"
  | "decisions.causal.addLink"
  | "decisions.causal.empty"
  | "decisions.causal.loadFailed"
  | "decisions.causal.addFailed"
  | "decisions.causal.methodUnset"
  | "decisions.causal.dataQuality"
  | "decisions.causal.uncertainty"
  | "decisions.causal.confidenceUnit"
  | "decisions.causal.methodAria"
  | "decisions.causal.sampleAria"
  | "decisions.causal.dataQualityAria"
  | "decisions.causal.uncertaintyAria"
  | "decisions.causal.notePlaceholder"
  | "decisions.causal.addButton"
  | "decisions.causal.fromPlaceholder"
  | "decisions.causal.toPlaceholder"
  | "decisions.trace.button"
  | "decisions.trace.title"
  | "decisions.trace.loadFailed"
  | "decisions.trace.modelRun"
  | "decisions.trace.provider"
  | "decisions.trace.policy"
  | "decisions.trace.duration"
  | "decisions.trace.outputValid"
  | "decisions.trace.noRecord"
  | "decisions.trace.derived"
  | "decisions.trace.decision"
  | "decisions.trace.reason"
  | "decisions.trace.outcome"
  | "decisions.trace.action"
  | "decisions.trace.auditEvents"
  | "decisions.relation.observed_correlation"
  | "decisions.relation.inferred"
  | "decisions.relation.expert_confirmed"
  | "decisions.relation.data_confirmed"
  | "decisions.relation.disputed"
  | "decisions.causalMethod.randomized_controlled_trial"
  | "decisions.causalMethod.quasi_experimental"
  | "decisions.causalMethod.difference_in_differences"
  | "decisions.causalMethod.instrumental_variable"
  | "decisions.causalMethod.regression_adjustment"
  | "decisions.causalMethod.observational"
  | "decisions.causalMethod.expert_judgment"
  | "decisions.level.high"
  | "decisions.level.medium"
  | "decisions.level.low"
  | "decisions.options.noAction"
  | "decisions.options.saveFailed"
  | "decisions.choice.accepted"
  | "decisions.choice.rejected"
  | "decisions.choice.modified"
  | "decisions.options.feasibleHeading"
  | "decisions.options.noFeasible"
  | "decisions.options.infeasibleSummary"
  | "decisions.options.acceptRecommended"
  | "decisions.options.reject"
  | "decisions.options.orPickAnother"
  | "decisions.options.willAccept"
  | "decisions.options.willApplyOther"
  | "decisions.options.willReject"
  | "decisions.options.reasonOptional"
  | "decisions.options.reasonRequired"
  | "decisions.options.save"
  | "decisions.options.infeasibleBadge"
  | "decisions.options.recommendedBadge"
  | "decisions.options.constraint"
  | "decisions.options.feasibility"
  | "decisions.options.tradeoff"
  | "decisions.options.expectedOutcome"
  | "decisions.options.detailHide"
  | "decisions.options.detailShow"
  | "decisions.options.select"
  | "decisions.recommended"
  | "decisions.collapse"
  | "decisions.expand"
  | "decisions.percent"
  | "decisions.evidenceHeading"
  | "decisions.evidenceSource"
  | "decisions.assumptionsHeading"
  | "decisions.historicalHeading"
  | "decisions.counterfactualHeading"
  | "decisions.projectedImpact"
  | "decisions.timeHorizon"
  | "decisions.stateUpdateFailed"
  | "decisions.alternativesHeading"
  | "decisions.statusLine"
  | "decisions.state.approve"
  | "decisions.state.review"
  | "decisions.state.defer"
  | "decisions.reliability.verified"
  | "decisions.reliability.estimated"
  | "decisions.reliability.unknown"
  | "decisions.confidenceHeading"
  | "decisions.calibration.measured"
  | "decisions.calibration.rate"
  | "decisions.calibration.adjusted"
  | "decisions.calibration.insufficient"
  | "decisions.calibration.bucketInfo"
  | "decisions.calibration.overconfident"
  | "decisions.calibration.aligned"
  | "decisions.calibration.underconfident"
  | "discovery.eyebrow"
  | "discovery.title"
  | "discovery.titleAccent"
  | "discovery.subtitle"
  | "discovery.loadFailed"
  | "discovery.loadFailedHttp"
  | "discovery.analyzing"
  | "discovery.priorityRange"
  | "discovery.priorityUnique"
  | "discovery.selectPack"
  | "discovery.profileCurrent"
  | "discovery.confirmFailed"
  | "discovery.primaryHeading"
  | "discovery.confidence"
  | "discovery.subsectorPrefix"
  | "discovery.score"
  | "discovery.requiresConfirmation"
  | "discovery.diversified"
  | "discovery.evidenceHeading"
  | "discovery.noEvidence"
  | "discovery.noSignal"
  | "discovery.connectLink"
  | "discovery.connectHintBefore"
  | "discovery.kpiLink"
  | "discovery.connectHintAfter"
  | "discovery.contextHeading"
  | "discovery.confirmedProfile"
  | "discovery.noConfirmedProfile"
  | "discovery.confirmedAt"
  | "discovery.confirmedSubsector"
  | "discovery.profileStale"
  | "discovery.versionedBadge"
  | "discovery.packLabel"
  | "discovery.packPlaceholder"
  | "discovery.subsectorLabel"
  | "discovery.subsectorGeneral"
  | "discovery.confirmHint"
  | "discovery.confirming"
  | "discovery.confirm"
  | "discovery.alternativesHeading"
  | "discovery.kpiHeading"
  | "discovery.kpiEmpty"
  | "discovery.colStatus"
  | "discovery.colFormula"
  | "discovery.colMissing"
  | "discovery.availability.available"
  | "discovery.availability.partial"
  | "discovery.availability.unavailable"
  | "discovery.schemaHeading"
  | "discovery.schemaEmpty"
  | "discovery.recordCount"
  | "discovery.graphHeading"
  | "discovery.graphCounts"
  | "discovery.unresolved"
  | "discovery.multiSource"
  | "discovery.strongIdentity"
  | "discovery.sourceScoped"
  | "discovery.graphEmpty"
  | "discovery.goldenHeading"
  | "discovery.goldenEmpty"
  | "discovery.goldenMeta"
  | "discovery.conflicts"
  | "discovery.consistent"
  | "discovery.policyApplied"
  | "discovery.freshnessApplied"
  | "discovery.goldenNote"
  | "discovery.policyHeading"
  | "discovery.policyHint"
  | "discovery.policyEntityAria"
  | "discovery.policyNoSources"
  | "discovery.sourceMeta"
  | "discovery.sourcePolicyUpdated"
  | "discovery.sourceNoPolicy"
  | "discovery.priorityLabel"
  | "discovery.policySaving"
  | "discovery.policySave"
  | "discovery.twinHeading"
  | "discovery.twinAsOf"
  | "discovery.twinEmpty"
  | "discovery.twinCanonical"
  | "discovery.twinOrders"
  | "discovery.twinRisks"
  | "discovery.twinNoFinancials"
  | "discovery.twinFinancialLine"
  | "discovery.twinUnclassified"
  | "discovery.twinHistorical"
  | "discovery.twinCurrent"
  | "discovery.twinAge"
  | "discovery.twinMinutes"
  | "discovery.twinStale"
  | "discovery.twinFresh"
  | "discovery.inputsHeading"
  | "discovery.inputsEntities"
  | "discovery.inputsNone"
  | "discovery.inputsSummary"
  | "discovery.missingHeading"
  | "discovery.catalogLine"
  | "organization.eyebrow"
  | "organization.title"
  | "organization.titleAccent"
  | "organization.subtitle"
  | "organization.sessionRequired"
  | "organization.forbidden"
  | "organization.loadFailed"
  | "organization.loading"
  | "organization.empty"
  | "organization.topDecisions"
  | "organization.confidence"
  | "organization.rootBadge"
  | "organization.totals.signals"
  | "organization.totals.decisions"
  | "organization.totals.actions"
  | "organization.totals.overdue"
  | "organization.metric.signals"
  | "organization.metric.decisions"
  | "organization.metric.actions"
  | "organization.metric.overdue"
  | "organization.severity.critical"
  | "organization.severity.high"
  | "organization.severity.medium"
  | "organization.severity.low"
  | "organization.kind.group"
  | "organization.kind.company"
  | "organization.kind.branch"
  | "options.eyebrow"
  | "options.title"
  | "options.titleAccent"
  | "options.subtitle"
  | "options.criteriaHeading"
  | "options.addCriterion"
  | "options.criterionName"
  | "options.direction"
  | "options.higherIsBetter"
  | "options.lowerIsBetter"
  | "options.weight"
  | "options.remove"
  | "options.optionsHeading"
  | "options.addOption"
  | "options.colOption"
  | "options.optionName"
  | "options.reset"
  | "options.evaluating"
  | "options.evaluate"
  | "options.resultHeading"
  | "options.colScore"
  | "options.colPareto"
  | "options.colBestWorst"
  | "options.dominatedBy"
  | "options.onFrontier"
  | "options.allocationHeading"
  | "options.allocationDescription"
  | "options.addAllocation"
  | "options.colAllocation"
  | "options.colMin"
  | "options.colMax"
  | "options.colUnitValue"
  | "options.perUnit"
  | "options.allocationName"
  | "options.optimizing"
  | "options.optimize"
  | "options.statusOptimal"
  | "options.statusFeasible"
  | "options.statusInfeasible"
  | "options.infeasibleLine"
  | "options.allocationLine"
  | "options.methodLine"
  | "options.evaluateFailed"
  | "options.optimizeFailed"
  | "advisors.eyebrow"
  | "advisors.title"
  | "advisors.titleAccent"
  | "advisors.subtitle"
  | "advisors.loadFailed"
  | "advisors.timelineFailed"
  | "advisors.sessionRequired"
  | "advisors.loading"
  | "advisors.empty"
  | "advisors.openTimeline"
  | "advisors.active"
  | "advisors.gap"
  | "advisors.unknownNoSession"
  | "advisors.unknownOffSession"
  | "advisors.metric.firstResponse"
  | "advisors.metric.noteAfterCall"
  | "advisors.metric.saleCycle"
  | "advisors.metric.abandoned"
  | "advisors.footer"
  | "advisors.note"
  | "advisors.modalTitle"
  | "advisors.close"
  | "advisors.modalEmpty"
  | "advisors.gapLine"
  | "advisors.minutes"
  | "advisors.hoursMinutes"
  | "analysis.eyebrow"
  | "analysis.title"
  | "analysis.titleAccent"
  | "analysis.subtitle"
  | "analysis.loading"
  | "analysis.unknownError"
  | "analysis.analyzing"
  | "analysis.analyze"
  | "analysis.saveReport"
  | "analysis.savedReport"
  | "analysis.result.status"
  | "analysis.result.problem"
  | "analysis.result.action"
  | "analysis.tab.ai"
  | "analysis.tab.calculator"
  | "analysis.calculator.intro"
  | "analysis.tais.title"
  | "analysis.tais.titleAccent"
  | "analysis.tais.subtitle"
  | "analysis.tais.noData"
  | "analysis.byCategoryHeading"
  | "analysis.colService"
  | "analysis.colTotal"
  | "analysis.colOpen"
  | "analysis.colOverdue"
  | "analysis.byTeamHeading"
  | "analysis.colTeam"
  | "analysis.colOpenTask"
  | "analysis.colCapacity"
  | "analysis.colUtilization"
  | "analysis.byLocationHeading"
  | "analysis.noOpenWork"
  | "analysis.kpi.opsHealth"
  | "analysis.kpi.sla"
  | "analysis.kpi.teamCapacity"
  | "analysis.kpi.customerRisk"
  | "analysis.kpi.openDeals"
  | "analysis.kpi.upcomingRenewal"
  | "memory.eyebrow"
  | "memory.title"
  | "memory.titleAccent"
  | "memory.subtitle"
  | "memory.statTotal"
  | "memory.statAcceptance"
  | "memory.statOutcome"
  | "memory.statSuccess"
  | "memory.tabDecisions"
  | "memory.tabAudit"
  | "memory.tabDocuments"
  | "memory.emptyDecisions"
  | "memory.emptyAudit"
  | "memory.actor"
  | "memory.tais.eyebrow"
  | "memory.tais.titleAccent"
  | "memory.tais.subtitle"
  | "memory.tais.statCases"
  | "memory.tais.statAudit"
  | "memory.tais.casesHeading"
  | "memory.tais.statusLine"
  | "memory.tais.auditHeading"
  | "memory.docs.heading"
  | "memory.docs.intro"
  | "memory.docs.titlePlaceholder"
  | "memory.docs.typeTitle"
  | "memory.docs.roleHint"
  | "memory.docs.roleAny"
  | "memory.docs.roleCeo"
  | "memory.docs.roleSysAdmin"
  | "memory.docs.roleAuditor"
  | "memory.docs.textPlaceholder"
  | "memory.docs.adding"
  | "memory.docs.add"
  | "memory.docs.fileHeading"
  | "memory.docs.fileIntro"
  | "memory.docs.fileTitlePlaceholder"
  | "memory.docs.uploading"
  | "memory.docs.addFile"
  | "memory.docs.listHeading"
  | "memory.docs.listHeadingCount"
  | "memory.docs.loading"
  | "memory.docs.empty"
  | "memory.docs.chunkInfo"
  | "memory.docs.docsFailed"
  | "memory.docs.uploadFailed"
  | "memory.docs.addFailed"
  | "memory.docs.added"
  | "memory.row.confidence"
  | "memory.row.recommendation"
  | "memory.row.applied"
  | "memory.row.reason"
  | "memory.row.outcomeHeading"
  | "memory.row.notePlaceholder"
  | "memory.row.save"
  | "memory.row.cancel"
  | "memory.row.record"
  | "memory.outcome.improved"
  | "memory.outcome.unchanged"
  | "memory.outcome.worsened"
  | "memory.choice.accepted"
  | "memory.choice.rejected"
  | "memory.choice.modified"
  | "memory.auditType.analysis_run"
  | "memory.auditType.case_generated"
  | "memory.auditType.decision_made"
  | "memory.auditType.outcome_recorded"
  | "memory.auditType.data_ingested"
  | "scenarios.eyebrow"
  | "scenarios.title"
  | "scenarios.titleAccent"
  | "scenarios.subtitle"
  | "scenarios.loading"
  | "scenarios.runFailed"
  | "scenarios.unauthorized"
  | "scenarios.templatesFailed"
  | "scenarios.defaultName"
  | "scenarios.twinNeedCurrency"
  | "scenarios.twinRiskTitle"
  | "scenarios.twinRiskEvidence"
  | "scenarios.twinFailedHttp"
  | "scenarios.twinFailed"
  | "scenarios.namePlaceholder"
  | "scenarios.calculating"
  | "scenarios.compare"
  | "scenarios.calculateAndSave"
  | "scenarios.formula"
  | "scenarios.twinHeading"
  | "scenarios.twinDescription"
  | "scenarios.twinBusy"
  | "scenarios.twinCompare"
  | "scenarios.twinBalance"
  | "scenarios.twinDelta"
  | "scenarios.twinSummary"
  | "scenarios.twinCurrencyNew"
  | "scenarios.twinCurrencyExisting"
  | "scenarios.sensitivityHeading"
  | "scenarios.provenanceHeading"
  | "scenarios.engine"
  | "scenarios.calculatedAt"
  | "scenarios.limitsHeading"
  | "scenarios.saved"
  | "scenarios.sim.heading"
  | "scenarios.sim.p10"
  | "scenarios.sim.p50"
  | "scenarios.sim.p90"
  | "scenarios.sim.summary"
  | "scenarios.sim.probability"
  | "scenarios.sim.assumptionsHeading"
  | "scenarios.sim.assumptionLine"
  | "scenarios.sim.engineNote"
  | "kpi.eyebrow"
  | "kpi.title"
  | "kpi.titleAccent"
  | "kpi.subtitle"
  | "kpi.loadFailed"
  | "kpi.needMetricAndValue"
  | "kpi.saveFailedHttp"
  | "kpi.saveFailed"
  | "kpi.deleteFailed"
  | "kpi.savedPoints"
  | "kpi.invalidDate"
  | "kpi.numericValue"
  | "kpi.bulkNoValidRows"
  | "kpi.newValue"
  | "kpi.metricPlaceholder"
  | "kpi.observedAtAria"
  | "kpi.valuePlaceholder"
  | "kpi.saving"
  | "kpi.save"
  | "kpi.bulkSummary"
  | "kpi.bulkSave"
  | "kpi.metricsHeading"
  | "kpi.goForecast"
  | "kpi.forecast"
  | "kpi.loading"
  | "kpi.emptyLabels"
  | "kpi.pointCounts"
  | "kpi.latestPoints"
  | "kpi.emptyPoints"
  | "kpi.colTime"
  | "kpi.colValue"
  | "kpi.delete"
  | "ask.eyebrow"
  | "ask.title"
  | "ask.titleAccent"
  | "ask.subtitle"
  | "ask.placeholder"
  | "ask.submit"
  | "ask.busy"
  | "ask.sessionRequired"
  | "ask.failed"
  | "ask.label.fact"
  | "ask.label.inference"
  | "ask.label.recommendation"
  | "ask.statementSource"
  | "ask.sourcesHeading"
  | "ask.example.risk"
  | "ask.example.delayedTasks"
  | "ask.example.capacity"
  | "ask.example.renewals"
  | "ask.example.pest"
  | "ask.example.catering"
  | "ask.example.decision"
  | "ask.example.taisHealth";

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
  "settings.password.title": { tr: "Parola değiştir", en: "Change password" },
  "settings.password.help": {
    tr: "Parola en az {min}, en fazla {max} karakter olmalıdır. Boşluklar da parolanın parçasıdır.",
    en: "Password must be between {min} and {max} characters. Spaces are part of the password.",
  },
  "settings.password.current": { tr: "MEVCUT PAROLA", en: "CURRENT PASSWORD" },
  "settings.password.new": { tr: "YENİ PAROLA", en: "NEW PASSWORD" },
  "settings.password.confirm": { tr: "YENİ PAROLA TEKRAR", en: "CONFIRM NEW PASSWORD" },
  "settings.password.currentRequired": {
    tr: "Mevcut parolanızı girin.",
    en: "Enter your current password.",
  },
  "settings.password.min": {
    tr: "Yeni parola en az {min} karakter olmalı.",
    en: "New password must be at least {min} characters.",
  },
  "settings.password.max": {
    tr: "Yeni parola en fazla {max} karakter olmalı.",
    en: "New password must be at most {max} characters.",
  },
  "settings.password.same": {
    tr: "Yeni parola mevcut parolayla aynı olamaz.",
    en: "New password cannot be the same as the current password.",
  },
  "settings.password.mismatch": {
    tr: "Yeni parola ve tekrarı eşleşmiyor.",
    en: "New password and confirmation do not match.",
  },
  "settings.password.failedHttp": {
    tr: "Parola değiştirilemedi (HTTP {status}).",
    en: "Password could not be changed (HTTP {status}).",
  },
  "settings.password.network": {
    tr: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.",
    en: "Could not reach the server. Check your connection and try again.",
  },
  "settings.password.success": { tr: "Parola değiştirildi.", en: "Password changed." },
  "settings.password.submitting": { tr: "Değiştiriliyor…", en: "Changing…" },
  "settings.password.submit": { tr: "Parolayı değiştir", en: "Change password" },
  "settings.sessions.title": { tr: "Aktif oturumlar", en: "Active sessions" },
  "settings.sessions.subtitle": {
    tr: "Hesabınızdaki cihaz/oturumlar. Tanımadığınız bir oturum varsa kapatın.",
    en: "Devices and sessions on your account. Close any session you do not recognize.",
  },
  "settings.sessions.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "settings.sessions.empty": { tr: "Aktif oturum bulunamadı.", en: "No active sessions found." },
  "settings.sessions.current": { tr: "Bu oturum", en: "This session" },
  "settings.sessions.other": { tr: "Diğer oturum", en: "Other session" },
  "settings.sessions.activeBadge": { tr: "AKTİF", en: "ACTIVE" },
  "settings.sessions.started": { tr: "Başlangıç: {date}", en: "Started: {date}" },
  "settings.sessions.expires": { tr: "Bitiş: {date}", en: "Expires: {date}" },
  "settings.sessions.revoke": { tr: "Oturumu kapat", en: "Revoke session" },
  "settings.sessions.revokeAll": {
    tr: "Diğer tüm oturumları kapat",
    en: "Revoke all other sessions",
  },
  "settings.sessions.revoked": { tr: "Oturum kapatıldı.", en: "Session revoked." },
  "settings.sessions.failedHttp": {
    tr: "İşlem başarısız oldu (HTTP {status}).",
    en: "Operation failed (HTTP {status}).",
  },
  "settings.sessions.network": {
    tr: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.",
    en: "Could not reach the server. Check your connection and try again.",
  },
  "settings.users.title": { tr: "Kullanıcılar", en: "Users" },
  "settings.users.subtitle": {
    tr: "Kurumunuzdaki kullanıcıları ve rollerini yönetin. Yetkiler her istekte sunucuda denetlenir.",
    en: "Manage users and roles in your organization. Permissions are checked server-side on every request.",
  },
  "settings.users.loading": { tr: "Kullanıcılar yükleniyor…", en: "Loading users…" },
  "settings.users.retry": { tr: "Yeniden dene", en: "Try again" },
  "settings.users.empty": {
    tr: "Bu kurumda henüz kullanıcı yok.",
    en: "There are no users in this organization yet.",
  },
  "settings.users.newTitle": { tr: "Yeni kullanıcı", en: "New user" },
  "settings.users.tempPasswordHelp": {
    tr: "Geçici parola en az {min} karakter olmalıdır.",
    en: "Temporary password must be at least {min} characters.",
  },
  "settings.users.email": { tr: "E-POSTA", en: "EMAIL" },
  "settings.users.displayName": { tr: "GÖRÜNEN AD", en: "DISPLAY NAME" },
  "settings.users.role": { tr: "ROL", en: "ROLE" },
  "settings.users.tempPassword": { tr: "GEÇİCİ PAROLA", en: "TEMPORARY PASSWORD" },
  "settings.users.created": { tr: "Kullanıcı oluşturuldu.", en: "User created." },
  "settings.users.creating": { tr: "Oluşturuluyor…", en: "Creating…" },
  "settings.users.create": { tr: "Kullanıcı oluştur", en: "Create user" },
  "settings.users.failedHttp": {
    tr: "İşlem başarısız oldu (HTTP {status}).",
    en: "Operation failed (HTTP {status}).",
  },
  "settings.users.network": {
    tr: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.",
    en: "Could not reach the server. Check your connection and try again.",
  },
  "settings.users.passwordMin": {
    tr: "Parola en az {min} karakter olmalı.",
    en: "Password must be at least {min} characters.",
  },
  "settings.users.passwordMax": {
    tr: "Parola en fazla {max} karakter olmalı.",
    en: "Password must be at most {max} characters.",
  },
  "settings.users.statusActive": { tr: "Etkin", en: "Active" },
  "settings.users.statusDisabled": { tr: "Devre dışı", en: "Disabled" },
  "settings.users.status": { tr: "DURUM", en: "STATUS" },
  "settings.users.save": { tr: "Kaydet", en: "Save" },
  "settings.users.saving": { tr: "Kaydediliyor…", en: "Saving…" },
  "settings.users.resetPassword": { tr: "Parola sıfırla", en: "Reset password" },
  "settings.users.resetPasswordAria": {
    tr: "{name} için parola sıfırla",
    en: "Reset password for {name}",
  },
  "settings.users.statusAria": {
    tr: "{name} hesabı {status}",
    en: "Account for {name} is {status}",
  },
  "settings.users.saveAria": {
    tr: "{name} değişikliklerini kaydet",
    en: "Save changes for {name}",
  },
  "settings.users.newPassword": { tr: "YENİ PAROLA", en: "NEW PASSWORD" },
  "settings.users.cancel": { tr: "Vazgeç", en: "Cancel" },
  "settings.users.passwordReset": { tr: "Parola sıfırlandı.", en: "Password reset." },
  "settings.users.passwordHelp": {
    tr: "Parola en az {min} karakter olmalıdır.",
    en: "Password must be at least {min} characters.",
  },
  "settings.users.role.board": { tr: "Yönetim Kurulu", en: "Board" },
  "settings.users.role.ceo": { tr: "CEO", en: "CEO" },
  "settings.users.role.clevel": { tr: "C-Level", en: "C-Level" },
  "settings.users.role.dept_manager": { tr: "Departman Yöneticisi", en: "Department Manager" },
  "settings.users.role.risk_manager": { tr: "Risk Yöneticisi", en: "Risk Manager" },
  "settings.users.role.analyst": { tr: "Analist", en: "Analyst" },
  "settings.users.role.auditor": { tr: "Denetçi", en: "Auditor" },
  "settings.users.role.data_admin": { tr: "Veri Yöneticisi", en: "Data Administrator" },
  "settings.users.role.sys_admin": { tr: "Sistem Yöneticisi", en: "System Administrator" },
  "dataQuality.eyebrow": { tr: "VERİ KALİTESİ", en: "DATA QUALITY" },
  "dataQuality.title": { tr: "Karantina", en: "Quarantine" },
  "dataQuality.titleAccent": { tr: "kuyruğu.", en: "queue." },
  "dataQuality.subtitle": {
    tr: "Entegrasyonlarda eşleştirilemeyen veya doğrulanamayan satırlar. Sessizce atılmaz; burada incelenir.",
    en: "Rows from integrations that could not be matched or validated. They are not silently dropped; they are reviewed here.",
  },
  "dataQuality.filterPending": { tr: "Bekleyen", en: "Pending" },
  "dataQuality.filterAll": { tr: "Tümü", en: "All" },
  "dataQuality.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "dataQuality.emptyPending": {
    tr: "Bekleyen karantina kaydı yok.",
    en: "No pending quarantine records.",
  },
  "dataQuality.emptyAll": {
    tr: "Karantina kaydı yok.",
    en: "No quarantine records.",
  },
  "dataQuality.noticeAcceptProposed": {
    tr: "Önerilen güçlü kimlik bağlantısı uygulandı.",
    en: "The proposed strong identity link was applied.",
  },
  "dataQuality.noticeKeepExisting": {
    tr: "Mevcut kimlik bağlantısı korunarak çakışma kapatıldı.",
    en: "The conflict was closed while keeping the existing identity link.",
  },
  "dataQuality.noticeResolved": { tr: "Kayıt çözüldü.", en: "Record resolved." },
  "dataQuality.noticeDiscarded": { tr: "Kayıt atıldı.", en: "Record discarded." },
  "dataQuality.errorUnauthorized": {
    tr: "Bu sayfa için oturum gerekir.",
    en: "This page requires an enterprise session.",
  },
  "dataQuality.errorForbidden": {
    tr: "Veri kalitesi görünümü için yetkiniz yok.",
    en: "You do not have permission to view data quality.",
  },
  "dataQuality.errorHttp": {
    tr: "İşlem başarısız (HTTP {status}).",
    en: "Operation failed (HTTP {status}).",
  },
  "dataQuality.errorNetwork": {
    tr: "Sunucuya ulaşılamadı.",
    en: "Could not reach the server.",
  },
  "dataQuality.errorLoadFailed": { tr: "Yükleme başarısız.", en: "Loading failed." },
  "dataQuality.actionApplyProposed": { tr: "Öneriyi uygula", en: "Apply proposal" },
  "dataQuality.actionKeepExisting": { tr: "Mevcudu koru", en: "Keep existing" },
  "dataQuality.actionResolved": { tr: "Çözüldü", en: "Resolved" },
  "dataQuality.actionDiscard": { tr: "At", en: "Discard" },
  "dataQuality.status.pending": { tr: "bekliyor", en: "pending" },
  "dataQuality.status.resolved": { tr: "çözüldü", en: "resolved" },
  "dataQuality.status.discarded": { tr: "atıldı", en: "discarded" },
  "alerts.eyebrow": { tr: "ALARMLAR", en: "ALERTS" },
  "alerts.title": { tr: "Aktif", en: "Active" },
  "alerts.titleAccent": { tr: "sinyaller.", en: "signals." },
  "alerts.subtitle": {
    tr: "Sektörünüze özel risk sinyalleri. Bir sinyali açarak kaynaklarını görebilir, durumunu değiştirebilir ve War Room'da not bırakabilirsiniz.",
    en: "Risk signals specific to your sector. Open a signal to see its sources, change its status, and leave a note in the War Room.",
  },
  "alerts.loadingTais": {
    tr: "TAIS risk kayıtları yükleniyor…",
    en: "Loading TAIS risk records…",
  },
  "alerts.empty": { tr: "Sinyal bulunamadı.", en: "No signals found." },
  "alerts.taisDemoBadge": { tr: "TAIS demo kaydı", en: "TAIS demo record" },
  "alerts.recommendedAction": { tr: "ÖNERİLEN AKSİYON", en: "RECOMMENDED ACTION" },
  "alerts.serviceType": { tr: "Hizmet türü:", en: "Service type:" },
  "alerts.customer": { tr: "Müşteri:", en: "Customer:" },
  "alerts.location": { tr: "Lokasyon:", en: "Location:" },
  "alerts.rootCause": { tr: "Kök neden:", en: "Root cause:" },
  "alerts.expectedImpact": { tr: "Beklenen etki:", en: "Expected impact:" },
  "alerts.confidence": { tr: "Güven seviyesi:", en: "Confidence:" },
  "alerts.confidenceValue": { tr: "%{value}", en: "{value}%" },
  "alerts.dataAsOf": { tr: "Veri güncelliği:", en: "Data as of:" },
  "alerts.sources": { tr: "KAYNAKLAR", en: "SOURCES" },
  "alerts.taisStatusNote": {
    tr: "Durum merkezi TAIS risk motorundan gelir; bu hesaplanan bulgu halen açıktır.",
    en: "Status comes from the central TAIS risk engine; this calculated finding is still open.",
  },
  "alerts.warRoom": { tr: "SAVAŞ ODASI", en: "WAR ROOM" },
  "alerts.noNotes": { tr: "Henüz not yok.", en: "No notes yet." },
  "alerts.notePlaceholder": { tr: "Not ekle...", en: "Add a note..." },
  "alerts.send": { tr: "Gönder", en: "Send" },
  "alerts.you": { tr: "Siz", en: "You" },
  "alerts.evidenceRef": { tr: "{type} kaydı: {id}", en: "{type} record: {id}" },
  "alerts.severity.critical": { tr: "KRİTİK", en: "CRITICAL" },
  "alerts.severity.warning": { tr: "DİKKAT", en: "WARNING" },
  "alerts.severity.info": { tr: "BİLGİ", en: "INFO" },
  "alerts.severity.healthy": { tr: "SAĞLIKLI", en: "HEALTHY" },
  "alerts.status.open": { tr: "Açık", en: "Open" },
  "alerts.status.handled": { tr: "Çözüldü", en: "Handled" },
  "alerts.status.snoozed": { tr: "Ertelendi", en: "Snoozed" },
  "alerts.status.escalated": { tr: "Yükseltildi", en: "Escalated" },
  "alerts.evidenceType.task": { tr: "Görev", en: "Task" },
  "alerts.evidenceType.complaint": { tr: "Şikâyet", en: "Complaint" },
  "alerts.evidenceType.deal": { tr: "Satış Fırsatı", en: "Deal" },
  "alerts.evidenceType.quality_issue": { tr: "Kalite Uygunsuzluğu", en: "Quality issue" },
  "alerts.evidenceType.service_request": { tr: "Hizmet Talebi", en: "Service request" },
  "alerts.evidenceType.contract": { tr: "Sözleşme", en: "Contract" },
  "alerts.rule.overdue_open_task": { tr: "Gecikmiş açık görev", en: "Overdue open task" },
  "alerts.rule.sla_risk_task": { tr: "SLA riski taşıyan görev", en: "Task at SLA risk" },
  "alerts.rule.unassigned_task": { tr: "Atanmamış görev", en: "Unassigned task" },
  "alerts.rule.team_capacity_overload": { tr: "Ekip kapasitesi aşımı", en: "Team capacity overload" },
  "alerts.rule.recurring_complaint": { tr: "Tekrarlayan şikâyet", en: "Recurring complaint" },
  "alerts.rule.stale_deal": { tr: "Hareketsiz satış fırsatı", en: "Stale deal" },
  "alerts.rule.renewal_without_activity": { tr: "Hareketsiz yenileme", en: "Renewal without activity" },
  "alerts.rule.overdue_periodic_service": { tr: "Gecikmiş periyodik hizmet", en: "Overdue periodic service" },
  "alerts.rule.recurring_quality_issue": { tr: "Tekrarlayan kalite sorunu", en: "Recurring quality issue" },
  "alerts.rule.stale_data_source": { tr: "Güncel olmayan veri kaynağı", en: "Stale data source" },
  "alerts.rule.unmatched_service_request": { tr: "Eşleşmemiş hizmet talebi", en: "Unmatched service request" },
  "alerts.rule.high_delay_critical_customer": { tr: "Kritik müşteride yüksek gecikme", en: "High delay for critical customer" },
  "alerts.serviceType.cleaning": { tr: "Temizlik", en: "Cleaning" },
  "alerts.serviceType.catering": { tr: "Yemek Hizmeti", en: "Catering" },
  "alerts.serviceType.pest_control": { tr: "Haşere Kontrolü", en: "Pest Control" },
  "alerts.serviceType.horeca": { tr: "HORECA Çözümleri", en: "HORECA Solutions" },
  "alerts.serviceType.property_mgmt": { tr: "Tesis Yönetimi", en: "Property Management" },
  "alerts.serviceType.office_mgmt": { tr: "Ofis Yönetimi", en: "Office Management" },
  "process.eyebrow": { tr: "SÜREÇ ZEKÂSI", en: "PROCESS INTELLIGENCE" },
  "process.title": { tr: "Süreç gerçekte", en: "How the process" },
  "process.titleAccent": { tr: "nasıl işliyor?", en: "actually runs" },
  "process.subtitle": {
    tr: "Entegrasyon olay günlüğünden gözlenen akış: geçiş hacimleri, medyan/P90 süreler ve darboğazlar. Hedef model karşılaştırması yapılmadığı için sapma iddiası içermez.",
    en: "Observed flow from the integration event log: transition volumes, median/P90 durations and bottlenecks. It makes no deviation claim because no target model comparison is performed.",
  },
  "process.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "process.errorHttp": {
    tr: "Süreç verisi yüklenemedi (HTTP {status}).",
    en: "Process data could not be loaded (HTTP {status}).",
  },
  "process.errorLoadFailed": { tr: "Yükleme başarısız.", en: "Loading failed." },
  "process.cardSubjects": { tr: "Özne", en: "Subjects" },
  "process.cardEvents": { tr: "Olay", en: "Events" },
  "process.cardTransitionTypes": { tr: "Geçiş türü", en: "Transition types" },
  "process.cardMedianCase": { tr: "Medyan vaka", en: "Median case" },
  "process.bottlenecksHeading": { tr: "DARBOĞAZLAR (P90)", en: "BOTTLENECKS (P90)" },
  "process.bottlenecksEmpty": {
    tr: "Darboğaz için yeterli geçiş verisi yok.",
    en: "Not enough transition data for a bottleneck.",
  },
  "process.bottleneckRow": {
    tr: "medyan {median} · P90 {p90} · {count} kez",
    en: "median {median} · P90 {p90} · {count} times",
  },
  "process.transitionsHeading": { tr: "GEÇİŞLER", en: "TRANSITIONS" },
  "process.colTransition": { tr: "Geçiş", en: "Transition" },
  "process.colCount": { tr: "Adet", en: "Count" },
  "process.colMedian": { tr: "Medyan", en: "Median" },
  "process.colP90": { tr: "P90", en: "P90" },
  "process.coverageHeading": { tr: "KAPSAM VE KAYNAK", en: "COVERAGE AND SOURCE" },
  "process.window": {
    tr: "Pencere: son {days} gün · okunan {read} olay · kullanılan {used} · öznesiz (dışlanan) {withoutSubject}",
    en: "Window: last {days} days · read {read} events · used {used} · without subject (excluded) {withoutSubject}",
  },
  "process.provenance": { tr: "Motor: {engine} · Kaynak: {source}", en: "Engine: {engine} · Source: {source}" },
  "process.evidence.high": { tr: "Yüksek kanıt", en: "High evidence" },
  "process.evidence.medium": { tr: "Orta kanıt", en: "Medium evidence" },
  "process.evidence.low": { tr: "Düşük kanıt", en: "Low evidence" },
  "process.duration.hours": { tr: "{value} sa", en: "{value} h" },
  "process.duration.minutes": { tr: "{value} dk", en: "{value} min" },
  "process.duration.seconds": { tr: "{value} sn", en: "{value} s" },
  "process.event.lead.created": { tr: "Potansiyel müşteri oluşturuldu", en: "Lead created" },
  "process.event.lead.opened": { tr: "Potansiyel müşteri açıldı", en: "Lead opened" },
  "process.event.lead.assigned": { tr: "Potansiyel müşteri atandı", en: "Lead assigned" },
  "process.event.lead.updated": { tr: "Potansiyel müşteri güncellendi", en: "Lead updated" },
  "process.event.lead.synced": { tr: "Potansiyel müşteri eşitlendi", en: "Lead synced" },
  "process.event.call.started": { tr: "Arama başladı", en: "Call started" },
  "process.event.call.completed": { tr: "Arama tamamlandı", en: "Call completed" },
  "process.event.call.finished": { tr: "Arama bitti", en: "Call finished" },
  "process.event.session.started": { tr: "Oturum başladı", en: "Session started" },
  "process.event.session.ended": { tr: "Oturum bitti", en: "Session ended" },
  "process.event.sale.started": { tr: "Satış başladı", en: "Sale started" },
  "process.event.sale.completed": { tr: "Satış tamamlandı", en: "Sale completed" },
  "process.event.department.snapshot": { tr: "Departman anlık görüntüsü", en: "Department snapshot" },
  "integrations.eyebrow": { tr: "ENTEGRASYONLAR", en: "INTEGRATIONS" },
  "integrations.title": { tr: "Veri", en: "Connect your" },
  "integrations.titleAccent": { tr: "kaynaklarınızı bağlayın.", en: "data sources." },
  "integrations.subtitle": {
    tr: "Sektörünüze uygun veri kaynaklarını buradan içeri aktarın veya bağlayın.",
    en: "Import or connect data sources suited to your sector here.",
  },
  "integrations.tab.ingestion": { tr: "Evrensel İçe Aktarma", en: "Universal Ingestion" },
  "integrations.tab.csv": { tr: "CSV İçe Aktarma", en: "CSV Import" },
  "integrations.tab.oauth": { tr: "OAuth", en: "OAuth" },
  "integrations.tab.webhook": { tr: "Webhook", en: "Webhook" },
  "integrations.tab.apiKeys": { tr: "API Anahtarları", en: "API Keys" },
  "integrations.taisNote": {
    tr: "Bu demo Bitrix24 uyumlu sentetik verilerle çalışmaktadır. Gerçek Bitrix24 portalı, salt-okunur webhook ve alan eşleme bilgileri sağlandığında mevcut connector üzerinden veri bağlantısı yapılandırılacaktır.",
    en: "This demo runs on synthetic Bitrix24-compatible data. Once a real Bitrix24 portal, a read-only webhook and field mappings are provided, the data connection will be configured through the existing connector.",
  },
  "integrations.errorUnknown": { tr: "Bilinmeyen hata.", en: "Unknown error." },
  "integrations.ingestion.description": {
    tr: "Rapor, e-posta veya tutanak metnini yapıştırın ya da bir metin/CSV/XLSX dosyası yükleyin — AI içindeki yapılandırılmış alanları çıkarsın. (PDF/görsel çıkarımı sonraki adım.)",
    en: "Paste a report, email or minutes text, or upload a text/CSV/XLSX file — let AI extract the structured fields inside. (PDF/image extraction comes next.)",
  },
  "integrations.ingestion.selectedFile": {
    tr: "Seçilen dosya: {name} (tablo AI'ya gönderilmeden önce ayrıştırılacak)",
    en: "Selected file: {name} (the sheet will be parsed before being sent to AI)",
  },
  "integrations.ingestion.placeholder": { tr: "Metni buraya yapıştırın...", en: "Paste text here..." },
  "integrations.ingestion.submit": { tr: "AI ile Çıkar →", en: "Extract with AI →" },
  "integrations.ingestion.submitting": { tr: "Çıkarılıyor…", en: "Extracting…" },
  "integrations.ingestion.noFields": {
    tr: "Yapılandırılmış alan bulunamadı.",
    en: "No structured fields found.",
  },
  "integrations.csv.description": {
    tr: "CRM/sisteminizden dışa aktardığınız veriyi bu şablona uyarlayıp yükleyin. AI, gerçek verinize dayanarak {sector} risk kategorilerini değerlendirecek.",
    en: "Adapt the data exported from your CRM/system to this template and upload it. AI will assess {sector} risk categories based on your real data.",
  },
  "integrations.csv.sectorFallback": { tr: "sektörünüz", en: "your sector" },
  "integrations.csv.reportTitle": { tr: "Günlük Analiz — {date} ({count} kritik bulgu)", en: "Daily Analysis — {date} ({count} critical findings)" },
  "integrations.csv.templatePeriodHeader": { tr: "Dönem", en: "Period" },
  "integrations.csv.downloadTemplate": { tr: "Şablon indir (.csv) ↓", en: "Download template (.csv) ↓" },
  "integrations.csv.periodLabel": { tr: "Dönem Etiketi", en: "Period Label" },
  "integrations.csv.periodPlaceholder": { tr: "Örn: Ocak 2026", en: "e.g. January 2026" },
  "integrations.csv.periodStart": { tr: "Başlangıç", en: "Start" },
  "integrations.csv.periodEnd": { tr: "Bitiş", en: "End" },
  "integrations.csv.preview": { tr: "{name} — önizleme", en: "{name} — preview" },
  "integrations.csv.assess": { tr: "AI ile Risk Değerlendirmesi Yap →", en: "Run AI Risk Assessment →" },
  "integrations.csv.assessing": { tr: "Değerlendiriliyor…", en: "Assessing…" },
  "integrations.csv.kpiSavedSuffix": {
    tr: " — Yine de verinizdeki {count} KPI kaydedildi ve ana sayfada görüntüleniyor.",
    en: " — Still, {count} KPIs from your data were saved and are shown on the home page.",
  },
  "integrations.csv.recommendation": { tr: "Öneri: {text}", en: "Recommendation: {text}" },
  "integrations.csv.savedPrefix": { tr: "Bu değerlendirme kaydedildi —", en: "This assessment was saved —" },
  "integrations.csv.savedLink": { tr: "Alerts sayfasında", en: "on the Alerts page" },
  "integrations.csv.savedSuffix": { tr: "görüntülenebilir.", en: "you can view it." },
  "integrations.bitrix24.demoBadge": { tr: "Bitrix24 uyumlu demo verisi", en: "Bitrix24-compatible demo data" },
  "integrations.bitrix24.connectedBadge": { tr: "Bitrix24 bağlantısı doğrulandı", en: "Bitrix24 connection verified" },
  "integrations.bitrix24.unconfiguredBadge": {
    tr: "Bitrix24 bağlantısı yapılandırılmamış",
    en: "Bitrix24 connection not configured",
  },
  "integrations.bitrix24.modeLine": { tr: "Mod: {mode} · Son senkron: {sync}", en: "Mode: {mode} · Last sync: {sync}" },
  "integrations.bitrix24.modeDemo": { tr: "Demo", en: "Demo" },
  "integrations.bitrix24.modeLive": { tr: "Yapılandırılmış", en: "Configured" },
  "integrations.bitrix24.notSynced": { tr: "Henüz senkronize edilmedi", en: "Not synced yet" },
  "integrations.bitrix24.companies": { tr: "Müşteriler", en: "Companies" },
  "integrations.bitrix24.deals": { tr: "Fırsatlar", en: "Deals" },
  "integrations.bitrix24.tasks": { tr: "Görevler", en: "Tasks" },
  "integrations.bitrix24.activities": { tr: "Aktiviteler", en: "Activities" },
  "integrations.bitrix24.users": { tr: "Kullanıcılar", en: "Users" },
  "integrations.bitrix24.serviceRequests": { tr: "Hizmet talepleri", en: "Service requests" },
  "integrations.bitrix24.complaints": { tr: "Şikâyetler", en: "Complaints" },
  "integrations.bitrix24.qualityRecords": { tr: "Kalite kayıtları", en: "Quality records" },
  "integrations.oauth.description": {
    tr: "{sector} için önerilen sistem bağlantıları. OAuth entegrasyonları henüz aktif değil — bağlantı kurulduğunda burada listelenecek.",
    en: "Recommended system connections for {sector}. OAuth integrations are not active yet — they will be listed here once connected.",
  },
  "integrations.oauth.soon": { tr: "YAKINDA", en: "SOON" },
  "integrations.oauth.connect": { tr: "Bağlan", en: "Connect" },
  "integrations.webhook.sessionRequired": {
    tr: "Webhook yapılandırması kurumsal oturum gerektirir.",
    en: "Webhook configuration requires an organization session.",
  },
  "integrations.webhook.configUnavailable": {
    tr: "Yapılandırma alınamadı.",
    en: "Configuration could not be loaded.",
  },
  "integrations.webhook.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "integrations.webhook.descriptionPrefix": {
    tr: "Bu uç",
    en: "This endpoint is",
  },
  "integrations.webhook.descriptionLive": { tr: "canlıdır", en: "live" },
  "integrations.webhook.descriptionSuffix": {
    tr: ": imzalı POST istekleri gerçek veri olarak kaydedilir, KPI'lar ayıklanır ve denetim günlüğüne işlenir. Güvenlik HMAC imzası, ±5 dakika zaman penceresi (replay koruması), idempotency anahtarı ve hız sınırı ile sağlanır.",
    en: ": signed POST requests are recorded as real data, KPIs are extracted and written to the audit log. Security is provided by an HMAC signature, a ±5 minute time window (replay protection), an idempotency key and rate limiting.",
  },
  "integrations.webhook.delivery": {
    tr: "Teslimat: {accepted} kabul / {total} deneme",
    en: "Delivery: {accepted} accepted / {total} attempts",
  },
  "integrations.webhook.endpointActive": { tr: "● uç aktif", en: "● endpoint active" },
  "integrations.webhook.urlLabel": { tr: "WEBHOOK URL", en: "WEBHOOK URL" },
  "integrations.webhook.secretLabel": { tr: "GİZLİ ANAHTAR", en: "SECRET KEY" },
  "integrations.webhook.show": { tr: "göster", en: "show" },
  "integrations.webhook.hide": { tr: "gizle", en: "hide" },
  "integrations.webhook.rotate": { tr: "yenile", en: "rotate" },
  "integrations.webhook.headersLabel": { tr: "ZORUNLU BAŞLIKLAR", en: "REQUIRED HEADERS" },
  "integrations.webhook.exampleLabel": { tr: "ÖRNEK (Node.js)", en: "EXAMPLE (Node.js)" },
  "integrations.apiKeys.loadFailed": { tr: "Anahtarlar alınamadı.", en: "Keys could not be loaded." },
  "integrations.apiKeys.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "integrations.apiKeys.description": {
    tr: "Portal entegrasyonlarınızın kullanacağı API anahtarlarını buradan yönetin. Anahtar yalnızca oluşturulduğu anda tam olarak gösterilir.",
    en: "Manage the API keys your portal integrations will use here. A key is shown in full only at the moment it is created.",
  },
  "integrations.apiKeys.currentKeys": { tr: "MEVCUT ANAHTARLAR", en: "EXISTING KEYS" },
  "integrations.apiKeys.empty": { tr: "Henüz API anahtarı oluşturulmadı.", en: "No API key has been created yet." },
  "integrations.apiKeys.colName": { tr: "Ad", en: "Name" },
  "integrations.apiKeys.colPrefix": { tr: "Önek", en: "Prefix" },
  "integrations.apiKeys.colScopes": { tr: "Kapsam", en: "Scopes" },
  "integrations.apiKeys.colLastUsed": { tr: "Son kullanım", en: "Last used" },
  "integrations.apiKeys.colStatus": { tr: "Durum", en: "Status" },
  "integrations.apiKeys.neverUsed": { tr: "Hiç kullanılmadı", en: "Never used" },
  "integrations.apiKeys.revoked": { tr: "İPTAL EDİLDİ", en: "REVOKED" },
  "integrations.apiKeys.active": { tr: "AKTİF", en: "ACTIVE" },
  "integrations.apiKeys.revoking": { tr: "iptal ediliyor…", en: "revoking…" },
  "integrations.apiKeys.revoke": { tr: "iptal et", en: "revoke" },
  "integrations.apiKeys.newKey": { tr: "YENİ ANAHTAR", en: "NEW KEY" },
  "integrations.apiKeys.namePlaceholder": {
    tr: "Anahtar adı (örn: Portal Entegrasyonu)",
    en: "Key name (e.g. Portal Integration)",
  },
  "integrations.apiKeys.create": { tr: "Anahtar Oluştur →", en: "Create Key →" },
  "integrations.apiKeys.creating": { tr: "Oluşturuluyor…", en: "Creating…" },
  "integrations.apiKeys.createFailed": { tr: "Anahtar oluşturulamadı.", en: "Key could not be created." },
  "integrations.apiKeys.scope.events_write": { tr: "olay gönderimi", en: "event submission" },
  "integrations.apiKeys.scope.read_advisors": { tr: "danışman verisi okuma", en: "read advisor data" },
  "integrations.apiKeys.scope.read_all": { tr: "tüm veriyi okuma", en: "read all data" },
  "dataQuality.score.heading": { tr: "Kalite skoru", en: "Quality score" },
  "dataQuality.score.filterLabel": { tr: "Metrik", en: "Metric" },
  "dataQuality.score.allMetrics": { tr: "Tüm metrikler", en: "All metrics" },
  "dataQuality.score.overall": { tr: "Genel skor", en: "Overall score" },
  "dataQuality.score.worst": { tr: "En zayıf: {dimension}", en: "Weakest: {dimension}" },
  "dataQuality.score.noData": { tr: "Yeterli veri yok", en: "Not enough data" },
  "dataQuality.score.sample": { tr: "{count} örneklem", en: "{count} samples" },
  "dataQuality.score.total": { tr: "Toplam {count} satır", en: "{count} rows total" },
  "dataQuality.score.sampled": {
    tr: "İlk {count} satır üzerinden hesaplandı.",
    en: "Calculated over the first {count} rows.",
  },
  "dataQuality.score.error": {
    tr: "Kalite skoru yüklenemedi.",
    en: "Quality score could not be loaded.",
  },
  "dataQuality.score.dimension.completeness": { tr: "Tamlık", en: "Completeness" },
  "dataQuality.score.dimension.validity": { tr: "Geçerlilik", en: "Validity" },
  "dataQuality.score.dimension.uniqueness": { tr: "Tekillik", en: "Uniqueness" },
  "dataQuality.score.dimension.freshness": { tr: "Tazelik", en: "Freshness" },
  "reports.eyebrow": { tr: "RAPORLAR", en: "REPORTS" },
  "reports.title": { tr: "Kayıtlı", en: "Saved" },
  "reports.titleAccent": { tr: "raporlar.", en: "reports." },
  "reports.subtitle": {
    tr: "Tüm KPI'lar ve otomatik üretilen günlük analizler burada.",
    en: "All KPIs and automatically generated daily analyses are here.",
  },
  "reports.subtitleTais": {
    tr: "TAIS operasyon, müşteri, sözleşme, SLA, ekip, kalite, karar ve aksiyon raporları.",
    en: "TAIS operations, customer, contract, SLA, team, quality, decision and action reports.",
  },
  "reports.dailyHeading": { tr: "GÜNLÜK ANALİZ RAPORLARI", en: "DAILY ANALYSIS REPORTS" },
  "reports.empty": {
    tr: "Henüz kaydedilmiş rapor yok. Integrations > CSV Import'tan veri yükleyip risk değerlendirmesi yaptığınızda ya da Analysis sayfasında \"Rapor olarak kaydet\" dediğinizde buraya eklenir.",
    en: "No saved reports yet. They are added here when you upload data and run a risk assessment in Integrations > CSV Import, or choose \"Save as report\" on the Analysis page.",
  },
  "reports.downloadPdf": { tr: "PDF olarak indir", en: "Download as PDF" },
  "reports.delete": { tr: "Sil", en: "Delete" },
  "reports.printHeader": { tr: "ABYS — RAPOR", en: "ABYS — REPORT" },
  "reports.percent": { tr: "%{value}", en: "{value}%" },
  "reports.tais.error": { tr: "TAIS rapor verileri yüklenemedi.", en: "TAIS report data could not be loaded." },
  "reports.tais.loading": { tr: "TAIS raporları yükleniyor…", en: "Loading TAIS reports…" },
  "reports.tais.executiveHeading": { tr: "TAIS OPERASYON RAPORLARI", en: "TAIS OPERATIONS REPORTS" },
  "reports.tais.opsSummary": { tr: "OPERASYON ÖZETİ", en: "OPERATIONS SUMMARY" },
  "reports.tais.activeTasks": { tr: "Aktif görev", en: "Active tasks" },
  "reports.tais.overdueTasks": { tr: "Geciken görev", en: "Overdue tasks" },
  "reports.tais.slaCompliance": { tr: "SLA uyumu", en: "SLA compliance" },
  "reports.tais.openComplaints": { tr: "Açık şikâyet", en: "Open complaints" },
  "reports.tais.serviceBreakdown": { tr: "HİZMET TÜRÜ KIRILIMI", en: "SERVICE TYPE BREAKDOWN" },
  "reports.tais.colService": { tr: "Hizmet", en: "Service" },
  "reports.tais.colTotal": { tr: "Toplam", en: "Total" },
  "reports.tais.colOpen": { tr: "Açık", en: "Open" },
  "reports.tais.colOverdue": { tr: "Geciken", en: "Overdue" },
  "reports.tais.customerContract": { tr: "MÜŞTERİ / SÖZLEŞME GÖRÜNÜMÜ", en: "CUSTOMER / CONTRACT VIEW" },
  "reports.tais.noRenewals": { tr: "Yaklaşan yenileme kaydı yok.", en: "No upcoming renewals." },
  "reports.tais.colCustomer": { tr: "Müşteri", en: "Customer" },
  "reports.tais.colRenewal": { tr: "Yenileme", en: "Renewal" },
  "reports.tais.colValue": { tr: "Değer", en: "Value" },
  "reports.tais.slaStatus": { tr: "SLA DURUMU", en: "SLA STATUS" },
  "reports.tais.slaSummary": {
    tr: "%{pct} uyum · {count} görev SLA penceresinde.",
    en: "{pct}% compliance · {count} tasks within the SLA window.",
  },
  "reports.tais.overdueSummary": {
    tr: "{count} görev gecikmiş durumda.",
    en: "{count} tasks are overdue.",
  },
  "reports.tais.complaintQuality": { tr: "ŞİKÂYET VE KALİTE", en: "COMPLAINTS AND QUALITY" },
  "reports.tais.complaintSummary": {
    tr: "{complaints} açık şikâyet · {quality} açık kalite kaydı.",
    en: "{complaints} open complaints · {quality} open quality records.",
  },
  "reports.tais.recurringSummary": {
    tr: "{count} müşteride tekrarlanan şikâyet deseni.",
    en: "Recurring complaint pattern on {count} customers.",
  },
  "reports.tais.workload": { tr: "EKİP İŞ YÜKÜ", en: "TEAM WORKLOAD" },
  "reports.tais.colTeam": { tr: "Ekip", en: "Team" },
  "reports.tais.colCapacity": { tr: "Kapasite", en: "Capacity" },
  "reports.tais.colUtilization": { tr: "Kullanım", en: "Utilization" },
  "reports.tais.decisionSummary": { tr: "KARAR VE AKSİYON ÖZETİ", en: "DECISION AND ACTION SUMMARY" },
  "reports.tais.mainDecision": {
    tr: "{title} · {risks} bağlı risk · {evidence} kanıt",
    en: "{title} · {risks} linked risks · {evidence} evidence items",
  },
  "reports.tais.noMainDecision": { tr: "Bekleyen ana karar yok.", en: "No pending main decision." },
  "reports.kpi.heading": { tr: "TÜM KPI'LAR", en: "ALL KPIs" },
  "reports.kpi.source": {
    tr: "Kaynak: {file} · {start} – {end}",
    en: "Source: {file} · {start} – {end}",
  },
  "reports.counselor.heading": { tr: "SATIŞ DANIŞMANLARI ({count})", en: "SALES COUNSELORS ({count})" },
  "reports.counselor.colName": { tr: "DANIŞMAN", en: "COUNSELOR" },
  "reports.counselor.colAssigned": { tr: "ATANAN", en: "ASSIGNED" },
  "reports.counselor.colSales": { tr: "SATIŞ", en: "SALES" },
  "reports.counselor.colAmount": { tr: "TUTAR", en: "AMOUNT" },
  "reports.counselor.assignedLabel": { tr: "Atanan Başvuru", en: "Assigned Leads" },
  "reports.counselor.salesLabel": { tr: "Satış Sayısı", en: "Sales Count" },
  "reports.counselor.amountLabel": { tr: "Satış Tutarı", en: "Sales Amount" },
  "reports.counselor.conversionLabel": { tr: "Dönüşüm Oranı", en: "Conversion Rate" },
  "reports.status.open": { tr: "açık", en: "open" },
  "reports.status.in_progress": { tr: "devam ediyor", en: "in progress" },
  "reports.status.done": { tr: "tamamlandı", en: "done" },
  "ledger.exportCsv": { tr: "CSV indir", en: "Download CSV" },
  "audit.exportCsv": { tr: "CSV indir", en: "Download CSV" },
  "forecast.exportCsv": { tr: "Kalibrasyonu CSV indir", en: "Download calibration CSV" },
  "decisions.eyebrow": { tr: "KARAR MERKEZİ", en: "DECISION CENTER" },
  "decisions.title": { tr: "Ne oluyor, neden önemli,", en: "What is happening, why it matters," },
  "decisions.titleAccent": { tr: "ne yapmalı.", en: "what to do." },
  "decisions.subtitle": { tr: "ABYS operasyonel veriyi kanıt zinciri, güven skoru, karşı senaryo ve kısıt-farkındalıklı seçeneklerle karar vakalarına dönüştürür. Karar sizde kalır — sistem her kararı hafızasına işler.", en: "ABYS turns operational data into decision cases with an evidence chain, confidence score, counterfactual and constraint-aware options. The decision stays with you — the system records every decision in its memory." },
  "decisions.taisSubtitle": { tr: "Kurumun kayıtlı karar vakaları — kanıt zinciri, güven skoru, karşı senaryo ve alternatiflerle.", en: "The organization's recorded decision cases — with evidence chain, confidence score, counterfactual and alternatives." },
  "decisions.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "decisions.taisEmpty": { tr: "Henüz kayıtlı karar vakası yok.", en: "No recorded decision cases yet." },
  "decisions.noOpenCases": { tr: "Açık karar vakası yok. Operasyonel veri girerek yeni analiz çalıştırın.", en: "No open decision cases. Run a new analysis by entering operational data." },
  "decisions.closeAnalyzer": { tr: "Analiz panelini kapat", en: "Close the analysis panel" },
  "decisions.openAnalyzer": { tr: "Yeni analiz çalıştır", en: "Run new analysis" },
  "decisions.caseCounts": { tr: "{open} açık vaka · {decided} karara bağlandı", en: "{open} open cases · {decided} decided" },
  "decisions.defaultUser": { tr: "Kullanıcı", en: "User" },
  "decisions.decidedHeading": { tr: "KARARA BAĞLANAN VAKALAR", en: "DECIDED CASES" },
  "decisions.decidedBadge": { tr: "✓ karar verildi", en: "✓ decided" },
  "decisions.unknownError": { tr: "Bilinmeyen hata.", en: "Unknown error." },
  "decisions.analyzer.dataHeading": { tr: "OPERASYONEL VERİ", en: "OPERATIONAL DATA" },
  "decisions.analyzer.dataPlaceholder": { tr: "Sistem export'u, vardiya raporu, operasyon notları... ABYS ham veriyi okur, uydurma sayı üretmez.", en: "System export, shift report, operations notes... ABYS reads raw data and never invents numbers." },
  "decisions.analyzer.constraintsHeading": { tr: "CANLI KISIT MODELİ ({count})", en: "LIVE CONSTRAINT MODEL ({count})" },
  "decisions.analyzer.constraintsHint": { tr: "ABYS aksiyon önermeden önce bu kısıtlara bakar — sahada uygulanamayacak seçenek önermez.", en: "ABYS checks these constraints before recommending an action — it will not suggest something that cannot be applied in the field." },
  "decisions.analyzer.deleteConstraint": { tr: "Kısıtı sil", en: "Delete constraint" },
  "decisions.analyzer.newConstraint": { tr: "Yeni kısıt", en: "New constraint" },
  "decisions.analyzer.addConstraint": { tr: "+ Kısıt ekle", en: "+ Add constraint" },
  "decisions.analyzer.running": { tr: "ABYS analiz ediyor...", en: "ABYS is analyzing..." },
  "decisions.analyzer.run": { tr: "Analiz et", en: "Analyze" },
  "decisions.analyzer.busyHint": { tr: "Yerel model çalışıyor — veri makinenizden çıkmıyor. Bu birkaç dakika sürebilir.", en: "The local model is running — data never leaves your machine. This can take a few minutes." },
  "decisions.analyzer.noData": { tr: "Analiz için operasyonel veri girin ya da bir senaryo seçin.", en: "Enter operational data or pick a scenario to analyze." },
  "decisions.severity.critical": { tr: "KRİTİK", en: "CRITICAL" },
  "decisions.severity.warning": { tr: "DİKKAT", en: "WARNING" },
  "decisions.severity.info": { tr: "BİLGİ", en: "INFO" },
  "decisions.severity.healthy": { tr: "SAĞLIKLI", en: "HEALTHY" },
  "decisions.cancel": { tr: "Vazgeç", en: "Cancel" },
  "decisions.yes": { tr: "Evet", en: "Yes" },
  "decisions.no": { tr: "Hayır", en: "No" },
  "decisions.causal.heading": { tr: "KÖK NEDEN ZİNCİRİ", en: "ROOT CAUSE CHAIN" },
  "decisions.causal.count": { tr: "({count})", en: "({count})" },
  "decisions.causal.addLink": { tr: "+ bağlantı ekle", en: "+ add link" },
  "decisions.causal.empty": { tr: "Henüz kök neden bağlantısı eklenmedi.", en: "No root-cause links added yet." },
  "decisions.causal.loadFailed": { tr: "Kök neden zinciri yüklenemedi.", en: "Root cause chain could not be loaded." },
  "decisions.causal.addFailed": { tr: "Bağlantı eklenemedi.", en: "Link could not be added." },
  "decisions.causal.methodUnset": { tr: "Yöntem belirtilmedi", en: "Method not specified" },
  "decisions.causal.dataQuality": { tr: "veri kalitesi {level}", en: "data quality {level}" },
  "decisions.causal.uncertainty": { tr: "belirsizlik {level}", en: "uncertainty {level}" },
  "decisions.causal.confidenceUnit": { tr: "% güven", en: "% confidence" },
  "decisions.causal.methodAria": { tr: "Kanıt yöntemi", en: "Evidence method" },
  "decisions.causal.sampleAria": { tr: "Örneklem", en: "Sample size" },
  "decisions.causal.dataQualityAria": { tr: "Veri kalitesi", en: "Data quality" },
  "decisions.causal.uncertaintyAria": { tr: "Belirsizlik", en: "Uncertainty" },
  "decisions.causal.notePlaceholder": { tr: "Not (isteğe bağlı)", en: "Note (optional)" },
  "decisions.causal.addButton": { tr: "Bağlantı ekle", en: "Add link" },
  "decisions.causal.fromPlaceholder": { tr: "Neden (A)", en: "Cause (A)" },
  "decisions.causal.toPlaceholder": { tr: "Sonuç (B)", en: "Effect (B)" },
  "decisions.trace.button": { tr: "🔍 Kökeni göster", en: "🔍 Show provenance" },
  "decisions.trace.title": { tr: "Kanıt kökeni", en: "Evidence provenance" },
  "decisions.trace.loadFailed": { tr: "İzlenebilirlik verisi yüklenemedi.", en: "Traceability data could not be loaded." },
  "decisions.trace.modelRun": { tr: "MODEL KOŞUSU", en: "MODEL RUN" },
  "decisions.trace.provider": { tr: "Sağlayıcı:", en: "Provider:" },
  "decisions.trace.policy": { tr: "Politika:", en: "Policy:" },
  "decisions.trace.duration": { tr: "Süre:", en: "Duration:" },
  "decisions.trace.outputValid": { tr: "Çıktı geçerli mi:", en: "Output valid:" },
  "decisions.trace.noRecord": { tr: "Kayıt yok.", en: "No record." },
  "decisions.trace.derived": { tr: "BU VAKADAN DOĞANLAR", en: "DERIVED FROM THIS CASE" },
  "decisions.trace.decision": { tr: "Karar:", en: "Decision:" },
  "decisions.trace.reason": { tr: "Gerekçe: {reason}", en: "Rationale: {reason}" },
  "decisions.trace.outcome": { tr: "Sonuç:", en: "Outcome:" },
  "decisions.trace.action": { tr: "Aksiyon:", en: "Action:" },
  "decisions.trace.auditEvents": { tr: "DENETİM OLAYLARI", en: "AUDIT EVENTS" },
  "decisions.relation.observed_correlation": { tr: "Gözlemlenen korelasyon", en: "Observed correlation" },
  "decisions.relation.inferred": { tr: "Çıkarım", en: "Inference" },
  "decisions.relation.expert_confirmed": { tr: "Uzman onaylı", en: "Expert-confirmed" },
  "decisions.relation.data_confirmed": { tr: "Veri ile doğrulanmış", en: "Data-confirmed" },
  "decisions.relation.disputed": { tr: "Tartışmalı", en: "Disputed" },
  "decisions.causalMethod.randomized_controlled_trial": { tr: "Randomize kontrollü deney", en: "Randomized controlled trial" },
  "decisions.causalMethod.quasi_experimental": { tr: "Yarı deneysel", en: "Quasi-experimental" },
  "decisions.causalMethod.difference_in_differences": { tr: "Farkların farkı", en: "Difference in differences" },
  "decisions.causalMethod.instrumental_variable": { tr: "Araç değişken", en: "Instrumental variable" },
  "decisions.causalMethod.regression_adjustment": { tr: "Regresyon düzeltmesi", en: "Regression adjustment" },
  "decisions.causalMethod.observational": { tr: "Gözlemsel", en: "Observational" },
  "decisions.causalMethod.expert_judgment": { tr: "Uzman görüşü", en: "Expert judgment" },
  "decisions.level.high": { tr: "Yüksek", en: "High" },
  "decisions.level.medium": { tr: "Orta", en: "Medium" },
  "decisions.level.low": { tr: "Düşük", en: "Low" },
  "decisions.options.noAction": { tr: "Aksiyon alınmadı", en: "No action taken" },
  "decisions.options.saveFailed": { tr: "Karar kaydedilemedi.", en: "Decision could not be saved." },
  "decisions.choice.accepted": { tr: "Öneri kabul edildi", en: "Recommendation accepted" },
  "decisions.choice.rejected": { tr: "Öneri reddedildi", en: "Recommendation rejected" },
  "decisions.choice.modified": { tr: "Değiştirilerek uygulandı", en: "Applied with changes" },
  "decisions.options.feasibleHeading": { tr: "UYGULANABİLİR SEÇENEKLER — KISIT KONTROLÜNDEN GEÇTİ", en: "FEASIBLE OPTIONS — PASSED CONSTRAINT CHECK" },
  "decisions.options.noFeasible": { tr: "Mevcut kısıtlar altında uygulanabilir seçenek bulunamadı — kısıt modelini gözden geçirin.", en: "No feasible option under the current constraints — review the constraint model." },
  "decisions.options.infeasibleSummary": { tr: "Kısıtlara takılan {count} seçenek (gerekçesiyle)", en: "{count} options blocked by constraints (with reasons)" },
  "decisions.options.acceptRecommended": { tr: "✓ Öneriyi kabul et", en: "✓ Accept recommendation" },
  "decisions.options.reject": { tr: "Reddet", en: "Reject" },
  "decisions.options.orPickAnother": { tr: "ya da yukarıdan farklı bir seçenek seçin", en: "or pick a different option above" },
  "decisions.options.willAccept": { tr: "Öneri kabul edilecek:", en: "The recommendation will be accepted:" },
  "decisions.options.willApplyOther": { tr: "Farklı seçenekle uygulanacak:", en: "A different option will be applied:" },
  "decisions.options.willReject": { tr: "Öneri reddedilecek, aksiyon alınmayacak.", en: "The recommendation will be rejected and no action taken." },
  "decisions.options.reasonOptional": { tr: "Gerekçe (isteğe bağlı) — ABYS bundan öğrenir", en: "Rationale (optional) — ABYS learns from it" },
  "decisions.options.reasonRequired": { tr: "Gerekçe (zorunlu) — ABYS bir daha aynı hatayı yapmasın diye nedeninizi kaydeder", en: "Rationale (required) — ABYS records your reason so it does not repeat the mistake" },
  "decisions.options.save": { tr: "Kararı kaydet", en: "Save decision" },
  "decisions.options.infeasibleBadge": { tr: "UYGULANAMAZ", en: "NOT APPLICABLE" },
  "decisions.options.recommendedBadge": { tr: "★ ABYS önerisi", en: "★ ABYS recommendation" },
  "decisions.options.constraint": { tr: "Kısıt: {note}", en: "Constraint: {note}" },
  "decisions.options.feasibility": { tr: "Uygulanabilirlik:", en: "Feasibility:" },
  "decisions.options.tradeoff": { tr: "Trade-off:", en: "Trade-off:" },
  "decisions.options.expectedOutcome": { tr: "Beklenen sonuç:", en: "Expected outcome:" },
  "decisions.options.detailHide": { tr: "detay −", en: "details −" },
  "decisions.options.detailShow": { tr: "detay +", en: "details +" },
  "decisions.options.select": { tr: "Bunu seç", en: "Select this" },
  "decisions.recommended": { tr: "Önerilen:", en: "Recommended:" },
  "decisions.collapse": { tr: "kapat −", en: "close −" },
  "decisions.expand": { tr: "incele +", en: "inspect +" },
  "decisions.percent": { tr: "%{value}", en: "{value}%" },
  "decisions.evidenceHeading": { tr: "KANIT ZİNCİRİ ({count})", en: "EVIDENCE CHAIN ({count})" },
  "decisions.evidenceSource": { tr: "Kaynak: {source}", en: "Source: {source}" },
  "decisions.assumptionsHeading": { tr: "Varsayımlar", en: "Assumptions" },
  "decisions.historicalHeading": { tr: "Geçmişle karşılaştırma", en: "Comparison with history" },
  "decisions.counterfactualHeading": { tr: "KARŞI SENARYO — AKSİYON ALINMAZSA", en: "COUNTERFACTUAL — IF NO ACTION IS TAKEN" },
  "decisions.projectedImpact": { tr: "Tahmini etki:", en: "Projected impact:" },
  "decisions.timeHorizon": { tr: "Zaman ufku:", en: "Time horizon:" },
  "decisions.stateUpdateFailed": { tr: "Karar durumu güncellenemedi.", en: "Decision status could not be updated." },
  "decisions.alternativesHeading": { tr: "ALTERNATİFLER (A/B/C)", en: "ALTERNATIVES (A/B/C)" },
  "decisions.statusLine": { tr: "Durum: {status} · karar kaydı sunucu oturumuna bağlıdır.", en: "Status: {status} · the decision record is bound to the server session." },
  "decisions.state.approve": { tr: "Onayla", en: "Approve" },
  "decisions.state.review": { tr: "İncelemeye al", en: "Send to review" },
  "decisions.state.defer": { tr: "Ertele / reddet", en: "Defer / reject" },
  "decisions.reliability.verified": { tr: "Doğrulanmış veri", en: "Verified data" },
  "decisions.reliability.estimated": { tr: "Tahmini", en: "Estimated" },
  "decisions.reliability.unknown": { tr: "Bilinmiyor", en: "Unknown" },
  "decisions.confidenceHeading": { tr: "GÜVEN SKORU", en: "CONFIDENCE SCORE" },
  "decisions.calibration.measured": {
    tr: "Geçmişte bu güven düzeyinde ({outcomes} sonuç) iyileşme",
    en: "Historically at this confidence level ({outcomes} outcomes) improvement",
  },
  "decisions.calibration.rate": { tr: "%{value}", en: "{value}%" },
  "decisions.calibration.adjusted": { tr: "· düzeltilmiş güven %{value}", en: "· adjusted confidence {value}%" },
  "decisions.calibration.insufficient": {
    tr: "Kalibrasyon için kanıt yetersiz",
    en: "Not enough evidence for calibration",
  },
  "decisions.calibration.bucketInfo": {
    tr: " · bu kovada {outcomes}/{threshold} sonuç",
    en: " · this bucket has {outcomes}/{threshold} outcomes",
  },
  "decisions.calibration.overconfident": {
    tr: "geçmişte bu güven düzeyi fazla iyimser çıktı",
    en: "this confidence level proved over-optimistic historically",
  },
  "decisions.calibration.aligned": {
    tr: "geçmişte bu güven düzeyi tutarlı çıktı",
    en: "this confidence level proved aligned historically",
  },
  "decisions.calibration.underconfident": {
    tr: "geçmişte bu güven düzeyi temkinli kaldı",
    en: "this confidence level stayed cautious historically",
  },
  "discovery.eyebrow": { tr: "İŞ KEŞFİ", en: "BUSINESS DISCOVERY" },
  "discovery.title": { tr: "ABYS şirketinizi", en: "ABYS knows" },
  "discovery.titleAccent": { tr: "tanıyor", en: "your company" },
  "discovery.subtitle": { tr: "Bağlı sistemlerin yapısından sektör, alt sektör ve iş modeli çıkarımı; kanıtlarla ve güven düzeyiyle. KPI önerileri yalnızca gerekli alanlar mevcutsa kullanılabilir sayılır.", en: "Inference of sector, subsector and business model from connected systems, with evidence and confidence. KPI suggestions count as available only when the required fields exist." },
  "discovery.loadFailed": { tr: "Keşif analizi yüklenemedi.", en: "Discovery analysis could not be loaded." },
  "discovery.loadFailedHttp": { tr: "Keşif analizi yüklenemedi (HTTP {status}).", en: "Discovery analysis could not be loaded (HTTP {status})." },
  "discovery.analyzing": { tr: "Analiz ediliyor…", en: "Analyzing…" },
  "discovery.priorityRange": { tr: "Kaynak öncelikleri 1–1000 arasında tam sayı olmalı.", en: "Source priorities must be integers between 1 and 1000." },
  "discovery.priorityUnique": { tr: "Kaynak öncelikleri birbirinden farklı olmalı.", en: "Source priorities must be distinct." },
  "discovery.selectPack": { tr: "Onaylamak için bir sektör paketi seçin.", en: "Select an industry pack to confirm." },
  "discovery.profileCurrent": { tr: "Bu veri kümesi için onaylı profil zaten güncel.", en: "The confirmed profile is already current for this dataset." },
  "discovery.confirmFailed": { tr: "Onaylama başarısız.", en: "Confirmation failed." },
  "discovery.primaryHeading": { tr: "BİRİNCİL SINIFLANDIRMA", en: "PRIMARY CLASSIFICATION" },
  "discovery.confidence": { tr: "Güven %{value}", en: "Confidence {value}%" },
  "discovery.subsectorPrefix": { tr: "Alt sektör: {label} · ", en: "Subsector: {label} · " },
  "discovery.score": { tr: "Skor {score}/100", en: "Score {score}/100" },
  "discovery.requiresConfirmation": { tr: "Güven düşük veya sınıflandırmalar birbirine yakın. Yönetici onayı gerekir; ABYS bu sınıflandırmayı kritik bir varsayım olarak otomatik uygulamaz.", en: "Confidence is low or the classifications are close. Manager approval is required; ABYS does not apply this classification automatically as a critical assumption." },
  "discovery.diversified": { tr: "Birden fazla iş kolu sinyali var; holding/çok iş kollu yapı olarak değerlendirilmeli.", en: "Multiple lines-of-business signals exist; treat it as a holding/multi-business structure." },
  "discovery.evidenceHeading": { tr: "KANITLAR", en: "EVIDENCE" },
  "discovery.noEvidence": { tr: "Yapısal sinyal bulunamadı.", en: "No structural signal found." },
  "discovery.noSignal": { tr: "Henüz sınıflandırma için yeterli yapısal sinyal yok.", en: "Not enough structural signal to classify yet." },
  "discovery.connectLink": { tr: "Sistem Bağlantıları", en: "System Connections" },
  "discovery.connectHintBefore": { tr: "üzerinden ERP/CRM bağlayın veya", en: "connect an ERP/CRM there or" },
  "discovery.kpiLink": { tr: "KPI Verisi", en: "KPI Data" },
  "discovery.connectHintAfter": { tr: "ekleyin.", en: "add some." },
  "discovery.contextHeading": { tr: "İŞ BAĞLAMI", en: "BUSINESS CONTEXT" },
  "discovery.confirmedProfile": { tr: "Onaylı profil v{version}: {pack} v{packVersion}", en: "Confirmed profile v{version}: {pack} v{packVersion}" },
  "discovery.noConfirmedProfile": { tr: "Henüz onaylanmış iş profili yok. Aşağıdaki seçim yalnızca öneridir.", en: "No confirmed business profile yet. The selection below is a suggestion only." },
  "discovery.confirmedAt": { tr: "Onay: {at} · Güven %{confidence}{subsector}", en: "Confirmed: {at} · Confidence {confidence}%{subsector}" },
  "discovery.confirmedSubsector": { tr: " · Alt sektör {id}", en: " · Subsector {id}" },
  "discovery.profileStale": { tr: "Kaynak veri, onaylı profilden sonra değişti. Yeni sınıflandırmayı gözden geçirip profili yeniden onaylayın; eski profil sessizce güncellenmez.", en: "Source data changed after the confirmed profile. Review the new classification and re-confirm; the old profile is never updated silently." },
  "discovery.versionedBadge": { tr: "sürümlü · denetlenebilir", en: "versioned · auditable" },
  "discovery.packLabel": { tr: "Sektör paketi", en: "Industry pack" },
  "discovery.packPlaceholder": { tr: "Seçin", en: "Select" },
  "discovery.subsectorLabel": { tr: "Alt sektör (isteğe bağlı)", en: "Subsector (optional)" },
  "discovery.subsectorGeneral": { tr: "Genel", en: "General" },
  "discovery.confirmHint": { tr: "Onay, seçili paketin KPI tanımlarını kayıt defterine ekler. Elle yazılmış aynı adlı tanımlar korunur.", en: "Confirmation adds the selected pack's KPI definitions to the registry. Manually written definitions with the same name are preserved." },
  "discovery.confirming": { tr: "Onaylanıyor…", en: "Confirming…" },
  "discovery.confirm": { tr: "Profili onayla ve KPI’ları etkinleştir", en: "Confirm profile and enable KPIs" },
  "discovery.alternativesHeading": { tr: "ALTERNATİF SINIFLANDIRMALAR", en: "ALTERNATIVE CLASSIFICATIONS" },
  "discovery.kpiHeading": { tr: "ÖNERİLEN KPI ÇERÇEVESİ", en: "SUGGESTED KPI FRAMEWORK" },
  "discovery.kpiEmpty": { tr: "Sınıflandırma oluşmadığı için KPI önerisi yok.", en: "No KPI suggestion because no classification was produced." },
  "discovery.colStatus": { tr: "Durum", en: "Status" },
  "discovery.colFormula": { tr: "Formül", en: "Formula" },
  "discovery.colMissing": { tr: "Eksik alanlar", en: "Missing fields" },
  "discovery.availability.available": { tr: "Kullanılabilir", en: "Available" },
  "discovery.availability.partial": { tr: "Kısmi", en: "Partial" },
  "discovery.availability.unavailable": { tr: "Veri yok", en: "No data" },
  "discovery.schemaHeading": { tr: "GÖZLENEN KANONİK ŞEMA", en: "OBSERVED CANONICAL SCHEMA" },
  "discovery.schemaEmpty": { tr: "Bağlı kaynaklardan eşlenmiş alan yok.", en: "No mapped fields from connected sources." },
  "discovery.recordCount": { tr: "({count} kayıt)", en: "({count} records)" },
  "discovery.graphHeading": { tr: "SEMANTİK GRAFİK TEMELİ", en: "SEMANTIC GRAPH FOUNDATION" },
  "discovery.graphCounts": { tr: "{nodes} düğüm · {edges} ilişki", en: "{nodes} nodes · {edges} relationships" },
  "discovery.unresolved": { tr: "{count} referans hedefi kaynakta çözülemedi.", en: "{count} reference targets could not be resolved at the source." },
  "discovery.multiSource": { tr: "Çok kaynaklı varlık", en: "Multi-source entity" },
  "discovery.strongIdentity": { tr: "Güçlü kimlik", en: "Strong identity" },
  "discovery.sourceScoped": { tr: "Kaynağa özgü", en: "Source-scoped" },
  "discovery.graphEmpty": { tr: "Grafik için kanonik kayıt yok.", en: "No canonical records for the graph." },
  "discovery.goldenHeading": { tr: "ALTIN KAYIT KONTROLÜ", en: "GOLDEN RECORD CHECK" },
  "discovery.goldenEmpty": { tr: "Çok kaynaklı kanonik varlık henüz yok.", en: "No multi-source canonical entity yet." },
  "discovery.goldenMeta": { tr: "{entity} · {sources} kaynak · {records} kayıt", en: "{entity} · {sources} sources · {records} records" },
  "discovery.conflicts": { tr: "{count} çelişki", en: "{count} conflicts" },
  "discovery.consistent": { tr: "Tutarlı", en: "Consistent" },
  "discovery.policyApplied": { tr: "Onaylı kaynak güven sırası uygulanıyor.", en: "Approved source trust order applied." },
  "discovery.freshnessApplied": { tr: "Kaynak güncelliği kullanılıyor.", en: "Source freshness used." },
  "discovery.goldenNote": { tr: "Kaynak kayıtları değiştirilmez; alan seçimi ve kaynağı izlenebilir biçimde raporlanır.", en: "Source records are not modified; field selection and its source are reported traceably." },
  "discovery.policyHeading": { tr: "ALTIN KAYIT GÜVEN SIRASI", en: "GOLDEN RECORD TRUST ORDER" },
  "discovery.policyHint": { tr: "Alan çakıştığında düşük sayılı kaynak önce gelir. Kaynak kayıtları değiştirilmez.", en: "When fields conflict the lower-numbered source wins. Source records are not modified." },
  "discovery.policyEntityAria": { tr: "Altın kayıt varlık türü", en: "Golden record entity type" },
  "discovery.policyNoSources": { tr: "Bu varlık türü için kaynak konnektör yok. Önce Sistem Bağlantıları ekranından bir kaynak tanımlayın.", en: "No source connector for this entity type. Define a source in System Connections first." },
  "discovery.sourceMeta": { tr: "{id} · konfig v{version}{policy}", en: "{id} · config v{version}{policy}" },
  "discovery.sourcePolicyUpdated": { tr: " · son güncelleme {by} / {at}", en: " · last update {by} / {at}" },
  "discovery.sourceNoPolicy": { tr: " · henüz onaylı sıra yok", en: " · no approved order yet" },
  "discovery.priorityLabel": { tr: "Öncelik", en: "Priority" },
  "discovery.policySaving": { tr: "Kaydediliyor…", en: "Saving…" },
  "discovery.policySave": { tr: "Güven sırasını onayla", en: "Approve trust order" },
  "discovery.twinHeading": { tr: "DİJİTAL İKİZ · DURUM", en: "DIGITAL TWIN · STATE" },
  "discovery.twinAsOf": { tr: "Geçmiş an", en: "Historical as-of" },
  "discovery.twinEmpty": { tr: "Kurumsal durum projeksiyonu henüz oluşmadı.", en: "The enterprise state projection does not exist yet." },
  "discovery.twinCanonical": { tr: "Kanonik varlık", en: "Canonical entities" },
  "discovery.twinOrders": { tr: "Sipariş", en: "Orders" },
  "discovery.twinRisks": { tr: "Açık risk sinyali", en: "Open risk signals" },
  "discovery.twinNoFinancials": { tr: "Sınıflandırılmış finansal tutar yok.", en: "No classified financial amounts." },
  "discovery.twinFinancialLine": { tr: "{currency}: sipariş {orders} · fatura {invoices}", en: "{currency}: orders {orders} · invoices {invoices}" },
  "discovery.twinUnclassified": { tr: "{count} tutar para birimi olmadığı için toplama katılmadı.", en: "{count} amounts were excluded from totals because they have no currency." },
  "discovery.twinHistorical": { tr: "Geçmiş görünüm: {at} · ", en: "Historical view: {at} · " },
  "discovery.twinCurrent": { tr: "Güncel görünüm · ", en: "Current view · " },
  "discovery.twinAge": { tr: "Veri yaşı: {age}", en: "Data age: {age}" },
  "discovery.twinMinutes": { tr: "{value} dk", en: "{value} min" },
  "discovery.twinStale": { tr: " · eşik aşıldı", en: " · threshold exceeded" },
  "discovery.twinFresh": { tr: " · taze", en: " · fresh" },
  "discovery.inputsHeading": { tr: "GİRDİLER", en: "INPUTS" },
  "discovery.inputsEntities": { tr: "Varlık kayıtları:", en: "Entity records:" },
  "discovery.inputsNone": { tr: "yok", en: "none" },
  "discovery.inputsSummary": { tr: "Eşlenmiş alan: {fields} · KPI etiketi: {labels} · Kayıtlı sektör: {sector}", en: "Mapped fields: {fields} · KPI labels: {labels} · Registered sector: {sector}" },
  "discovery.missingHeading": { tr: "EKSİK BİLGİ", en: "MISSING INFORMATION" },
  "discovery.catalogLine": { tr: "Katalog: {list}", en: "Catalog: {list}" },
  "organization.eyebrow": { tr: "ORGANİZASYON", en: "ORGANIZATION" },
  "organization.title": { tr: "Şirket ve", en: "Companies and" },
  "organization.titleAccent": { tr: "şubeler.", en: "branches." },
  "organization.subtitle": { tr: "Oturumunuzun bağlı olduğu organizasyon ağacı ve konsolide açık iş yükü. Kapsam sunucu oturumundan belirlenir.", en: "The organization tree your session belongs to and the consolidated open workload. Scope comes from the server session." },
  "organization.sessionRequired": { tr: "Bu sayfa için oturum gerekir.", en: "This page requires a session." },
  "organization.forbidden": { tr: "Organizasyon görünümü için yetkiniz yok.", en: "You are not authorized for the organization view." },
  "organization.loadFailed": { tr: "Yükleme başarısız.", en: "Loading failed." },
  "organization.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "organization.empty": { tr: "Organizasyon kaydı bulunamadı.", en: "No organization records found." },
  "organization.topDecisions": { tr: "BUGÜNÜN ÖNCELİKLİ KARARLARI", en: "TODAY'S PRIORITY DECISIONS" },
  "organization.confidence": { tr: "Güven: %{value}", en: "Confidence: {value}%" },
  "organization.rootBadge": { tr: "KÖK", en: "ROOT" },
  "organization.totals.signals": { tr: "Açık risk", en: "Open risks" },
  "organization.totals.decisions": { tr: "Açık karar", en: "Open decisions" },
  "organization.totals.actions": { tr: "Açık aksiyon", en: "Open actions" },
  "organization.totals.overdue": { tr: "Gecikmiş aksiyon", en: "Overdue actions" },
  "organization.metric.signals": { tr: "Risk:", en: "Risk:" },
  "organization.metric.decisions": { tr: "Karar:", en: "Decision:" },
  "organization.metric.actions": { tr: "Aksiyon:", en: "Action:" },
  "organization.metric.overdue": { tr: "Gecikmiş:", en: "Overdue:" },
  "organization.severity.critical": { tr: "KRİTİK", en: "CRITICAL" },
  "organization.severity.high": { tr: "YÜKSEK", en: "HIGH" },
  "organization.severity.medium": { tr: "ORTA", en: "MEDIUM" },
  "organization.severity.low": { tr: "DÜŞÜK", en: "LOW" },
  "organization.kind.group": { tr: "Holding", en: "Group" },
  "organization.kind.company": { tr: "Şirket", en: "Company" },
  "organization.kind.branch": { tr: "Şube", en: "Branch" },
  "options.eyebrow": { tr: "KARAR SEÇENEKLERİ", en: "DECISION OPTIONS" },
  "options.title": { tr: "Hangi seçenek,", en: "Which option," },
  "options.titleAccent": { tr: "hangi ödünleşimle?", en: "at what trade-off?" },
  "options.subtitle": { tr: "Seçenekleri birden fazla kriterde puanlayın. Sonuç: ağırlıklı sıralama ve ağırlıktan bağımsız Pareto sınırı. Hiçbir seçenek tek doğru cevap olarak dayatılmaz.", en: "Score the options across several criteria. The result is a weighted ranking plus a weight-independent Pareto frontier. No option is pushed as the single right answer." },
  "options.criteriaHeading": { tr: "KRİTERLER", en: "CRITERIA" },
  "options.addCriterion": { tr: "+ Kriter", en: "+ Criterion" },
  "options.criterionName": { tr: "Kriter adı", en: "Criterion name" },
  "options.direction": { tr: "Yön", en: "Direction" },
  "options.higherIsBetter": { tr: "Yüksek iyi", en: "Higher is better" },
  "options.lowerIsBetter": { tr: "Düşük iyi", en: "Lower is better" },
  "options.weight": { tr: "Ağırlık", en: "Weight" },
  "options.remove": { tr: "Kaldır", en: "Remove" },
  "options.optionsHeading": { tr: "SEÇENEKLER", en: "OPTIONS" },
  "options.addOption": { tr: "+ Seçenek", en: "+ Option" },
  "options.colOption": { tr: "Seçenek", en: "Option" },
  "options.optionName": { tr: "Seçenek adı", en: "Option name" },
  "options.reset": { tr: "Sıfırla", en: "Reset" },
  "options.evaluating": { tr: "Değerlendiriliyor…", en: "Evaluating…" },
  "options.evaluate": { tr: "Değerlendir", en: "Evaluate" },
  "options.evaluateFailed": { tr: "Değerlendirme başarısız.", en: "Evaluation failed." },
  "options.optimizeFailed": { tr: "Optimizasyon başarısız.", en: "Optimization failed." },
  "options.resultHeading": { tr: "SONUÇ — AĞIRLIKLI SIRALAMA", en: "RESULT — WEIGHTED RANKING" },
  "options.colScore": { tr: "Skor", en: "Score" },
  "options.colPareto": { tr: "Pareto", en: "Pareto" },
  "options.colBestWorst": { tr: "En güçlü / zayıf", en: "Strongest / weakest" },
  "options.dominatedBy": { tr: "Baskın: {list}", en: "Dominated by: {list}" },
  "options.onFrontier": { tr: "Sınırda", en: "On frontier" },
  "options.allocationHeading": { tr: "KAYNAK TAHSİSİ · OPTİMİZASYON", en: "RESOURCE ALLOCATION · OPTIMIZATION" },
  "options.allocationDescription": { tr: "Kapasiteleri ve birim tüketimleri tanımlayın. Çözücü yalnızca verilen sayısal model altında en yüksek toplam katkıyı arar.", en: "Define capacities and per-unit consumption. The solver only searches for the highest total contribution under the given numeric model." },
  "options.addAllocation": { tr: "+ Tahsis", en: "+ Allocation" },
  "options.colAllocation": { tr: "Tahsis", en: "Allocation" },
  "options.colMin": { tr: "Min", en: "Min" },
  "options.colMax": { tr: "Maks", en: "Max" },
  "options.colUnitValue": { tr: "Birim değer", en: "Unit value" },
  "options.perUnit": { tr: "{unit}/birim", en: "{unit}/unit" },
  "options.allocationName": { tr: "Tahsis adı", en: "Allocation name" },
  "options.optimizing": { tr: "Optimize ediliyor…", en: "Optimizing…" },
  "options.optimize": { tr: "Optimal tahsisi hesapla", en: "Compute optimal allocation" },
  "options.statusOptimal": { tr: "Optimal tahsis", en: "Optimal allocation" },
  "options.statusFeasible": { tr: "Uygulanabilir tahsis (arama sınırı)", en: "Feasible allocation (search limit)" },
  "options.statusInfeasible": { tr: "Uygulanabilir tahsis yok", en: "No feasible allocation" },
  "options.infeasibleLine": { tr: "{resource}: gereken {required} / kapasite {capacity}", en: "{resource}: required {required} / capacity {capacity}" },
  "options.allocationLine": { tr: "{label}: {units} birim · {value} {unit}", en: "{label}: {units} units · {value} {unit}" },
  "options.methodLine": { tr: "{method} · {nodes} düğüm", en: "{method} · {nodes} nodes" },
  "advisors.eyebrow": { tr: "ADVISOR ANALYTICS", en: "ADVISOR ANALYTICS" },
  "advisors.title": { tr: "Danışman", en: "Advisor" },
  "advisors.titleAccent": { tr: "performans metrikleri.", en: "performance metrics." },
  "advisors.subtitle": { tr: "Portal iş olaylarından deterministik hesaplanan aktif/boşta süreleri, müdahale hızı ve satış döngüsü.", en: "Active/idle time, response speed and sales cycle computed deterministically from portal work events." },
  "advisors.loadFailed": { tr: "Danışman verileri alınamadı.", en: "Advisor data could not be loaded." },
  "advisors.timelineFailed": { tr: "Zaman çizelgesi alınamadı.", en: "Timeline could not be loaded." },
  "advisors.sessionRequired": { tr: "Bu sayfa kurumsal oturum gerektirir.", en: "This page requires an enterprise session." },
  "advisors.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "advisors.empty": { tr: "Portal entegrasyonu bağlandığında burada danışman metrikleri görünecek.", en: "Advisor metrics appear here once the portal integration is connected." },
  "advisors.openTimeline": { tr: "Zaman çizelgesi →", en: "Timeline →" },
  "advisors.active": { tr: "Aktif {pct}%", en: "Active {pct}%" },
  "advisors.gap": { tr: "Olay boşluğu {pct}%", en: "Event gap {pct}%" },
  "advisors.unknownNoSession": { tr: "Bilinmeyen süre: bu danışman için oturum verisi yok, ayrım yapılamıyor.", en: "Unknown time: no session data for this advisor, so the split cannot be made." },
  "advisors.unknownOffSession": { tr: "Bilinmeyen süre (oturum dışı): {duration}", en: "Unknown time (off session): {duration}" },
  "advisors.metric.firstResponse": { tr: "İlk müdahale", en: "First response" },
  "advisors.metric.noteAfterCall": { tr: "Not girme süresi", en: "Time to note" },
  "advisors.metric.saleCycle": { tr: "Satış döngüsü", en: "Sales cycle" },
  "advisors.metric.abandoned": { tr: "Yarım bırakılan", en: "Abandoned" },
  "advisors.footer": { tr: "{events} olay · olay boşluğu eşiği {threshold} dk", en: "{events} events · event gap threshold {threshold} min" },
  "advisors.note": { tr: "Bu metrikler iş olayı zaman damgalarından türetilir; portal dışı çalışmayı ölçmez.", en: "These metrics derive from work-event timestamps; they do not measure work outside the portal." },
  "advisors.modalTitle": { tr: "{advisor} — zaman çizelgesi", en: "{advisor} — timeline" },
  "advisors.close": { tr: "kapat ✕", en: "close ✕" },
  "advisors.modalEmpty": { tr: "Bu aralıkta olay bulunamadı.", en: "No events in this range." },
  "advisors.gapLine": { tr: "⋯ {minutes} dk olay boşluğu", en: "⋯ {minutes} min event gap" },
  "advisors.minutes": { tr: "{value} dk", en: "{value} min" },
  "advisors.hoursMinutes": { tr: "{hours} sa {minutes} dk", en: "{hours} h {minutes} min" },
  "analysis.eyebrow": { tr: "ANALYSIS", en: "ANALYSIS" },
  "analysis.title": { tr: "Senaryonuzu", en: "Let us analyze" },
  "analysis.titleAccent": { tr: "analiz edelim.", en: "your scenario." },
  "analysis.subtitle": { tr: "AI destekli senaryo analizi yapın ya da manuel hesaplayıcıları kullanın.", en: "Run an AI-assisted scenario analysis or use the manual calculators." },
  "analysis.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "analysis.unknownError": { tr: "Bilinmeyen hata.", en: "Unknown error." },
  "analysis.analyzing": { tr: "Analiz ediliyor…", en: "Analyzing…" },
  "analysis.analyze": { tr: "Analiz et →", en: "Analyze →" },
  "analysis.saveReport": { tr: "Rapor olarak kaydet", en: "Save as report" },
  "analysis.savedReport": { tr: "Rapor olarak kaydedildi ✓", en: "Saved as report ✓" },
  "analysis.result.status": { tr: "Durum", en: "Status" },
  "analysis.result.problem": { tr: "Sorun", en: "Problem" },
  "analysis.result.action": { tr: "Aksiyon", en: "Action" },
  "analysis.tab.ai": { tr: "AI Analiz", en: "AI Analysis" },
  "analysis.tab.calculator": { tr: "Hesaplayıcı", en: "Calculator" },
  "analysis.calculator.intro": { tr: "{sector} için hazırlanmış hesaplayıcılar.", en: "Calculators prepared for {sector}." },
  "analysis.tais.title": { tr: "Hizmet türü, ekip ve lokasyon", en: "Service type, team and location" },
  "analysis.tais.titleAccent": { tr: "kırılımları.", en: "breakdowns." },
  "analysis.tais.subtitle": { tr: "Operasyon, ticari ve yönetim KPI'ları — kayıtlardan hesaplanır, tüm ekranlarla tutarlıdır.", en: "Operational, commercial and management KPIs — computed from records, consistent with every screen." },
  "analysis.tais.noData": { tr: "Bu kurum için TAIS analiz verisi bulunmuyor.", en: "No TAIS analysis data exists for this organization." },
  "analysis.byCategoryHeading": { tr: "HİZMET TÜRÜNE GÖRE GÖREV", en: "TASKS BY SERVICE TYPE" },
  "analysis.colService": { tr: "HİZMET", en: "SERVICE" },
  "analysis.colTotal": { tr: "TOPLAM", en: "TOTAL" },
  "analysis.colOpen": { tr: "AÇIK", en: "OPEN" },
  "analysis.colOverdue": { tr: "GECİKEN", en: "OVERDUE" },
  "analysis.byTeamHeading": { tr: "EKİBE GÖRE İŞ YÜKÜ", en: "WORKLOAD BY TEAM" },
  "analysis.colTeam": { tr: "EKİP", en: "TEAM" },
  "analysis.colOpenTask": { tr: "AÇIK GÖREV", en: "OPEN TASKS" },
  "analysis.colCapacity": { tr: "KAPASİTE", en: "CAPACITY" },
  "analysis.colUtilization": { tr: "KULLANIM", en: "UTILIZATION" },
  "analysis.byLocationHeading": { tr: "LOKASYONA GÖRE AÇIK İŞ", en: "OPEN WORK BY LOCATION" },
  "analysis.noOpenWork": { tr: "Açık iş bulunmuyor.", en: "No open work." },
  "analysis.kpi.opsHealth": { tr: "Operasyon Sağlığı", en: "Operations health" },
  "analysis.kpi.sla": { tr: "SLA Uyum Oranı", en: "SLA compliance" },
  "analysis.kpi.teamCapacity": { tr: "Ekip Kapasite Skoru", en: "Team capacity score" },
  "analysis.kpi.customerRisk": { tr: "Müşteri Risk Skoru", en: "Customer risk score" },
  "analysis.kpi.openDeals": { tr: "Açık Satış Fırsatı", en: "Open deals" },
  "analysis.kpi.upcomingRenewal": { tr: "Yaklaşan Yenileme", en: "Upcoming renewals" },
  "memory.eyebrow": { tr: "KURUMSAL HAFIZA", en: "INSTITUTIONAL MEMORY" },
  "memory.title": { tr: "Karar geçmişi ve", en: "Decision history and" },
  "memory.titleAccent": { tr: "denetim günlüğü.", en: "the audit trail." },
  "memory.subtitle": { tr: "ABYS her öneriyi, her kararı ve her sonucu kaydeder. Sistemi değiştirmek bir yazılımı değiştirmek değil, kurumun karar hafızasını kaybetmek anlamına gelir — bu sayfa o hafızadır.", en: "ABYS records every recommendation, every decision and every outcome. Changing the system is not swapping software; it is losing the institution's decision memory — this page is that memory." },
  "memory.statTotal": { tr: "Toplam karar", en: "Total decisions" },
  "memory.statAcceptance": { tr: "Öneri kabul oranı", en: "Recommendation acceptance" },
  "memory.statOutcome": { tr: "Sonucu kaydedilen", en: "Outcomes recorded" },
  "memory.statSuccess": { tr: "İyileşme oranı", en: "Improvement rate" },
  "memory.tabDecisions": { tr: "Karar hafızası ({count})", en: "Decision memory ({count})" },
  "memory.tabAudit": { tr: "Denetim günlüğü ({count})", en: "Audit log ({count})" },
  "memory.tabDocuments": { tr: "Belgeler", en: "Documents" },
  "memory.emptyDecisions": { tr: "Henüz karar kaydı yok. Karar Merkezi'nde bir vakayı karara bağladığınızda burada görünür.", en: "No decision records yet. Once you decide a case in the Decision Center it appears here." },
  "memory.emptyAudit": { tr: "Henüz denetim kaydı yok.", en: "No audit records yet." },
  "memory.actor": { tr: "Aktör: {actor}", en: "Actor: {actor}" },
  "memory.tais.eyebrow": { tr: "TAIS KURUMSAL HAFIZA", en: "TAIS INSTITUTIONAL MEMORY" },
  "memory.tais.titleAccent": { tr: "denetim izi.", en: "the audit trail." },
  "memory.tais.subtitle": { tr: "TAIS oturumu yalnızca sunucu tarafındaki TAIS karar ve denetim kayıtlarını gösterir.", en: "The TAIS session shows only server-side TAIS decision and audit records." },
  "memory.tais.statCases": { tr: "TAIS karar vakası", en: "TAIS decision cases" },
  "memory.tais.statAudit": { tr: "Son denetim olayı", en: "Latest audit events" },
  "memory.tais.casesHeading": { tr: "TAIS KARARLARI", en: "TAIS DECISIONS" },
  "memory.tais.statusLine": { tr: "Durum: {status} · Güven %{confidence}", en: "Status: {status} · Confidence {confidence}%" },
  "memory.tais.auditHeading": { tr: "TAIS DENETİM OLAYLARI", en: "TAIS AUDIT EVENTS" },
  "memory.docs.heading": { tr: "BELGE EKLE", en: "ADD DOCUMENT" },
  "memory.docs.intro": { tr: "Prosedür, politika, olay raporu veya toplantı kararı ekleyin. Belge parçalara bölünür ve Ask ABYS cevaplarında atıfla kullanılır. İçerik talimat olarak değil, yalnızca veri olarak işlenir.", en: "Add a procedure, policy, incident report or meeting decision. The document is split into chunks and cited in Ask ABYS answers. Content is treated as data, never as instructions." },
  "memory.docs.titlePlaceholder": { tr: "Belge başlığı", en: "Document title" },
  "memory.docs.typeTitle": { tr: "Belge türü", en: "Document type" },
  "memory.docs.roleHint": {
    tr: "Rol kısıtı — boş bırakılırsa tüm roller erişebilir",
    en: "Role restriction — leave empty to allow all roles",
  },
  "memory.docs.roleAny": { tr: "Tüm roller erişebilir", en: "All roles can access" },
  "memory.docs.roleCeo": { tr: "Yalnızca CEO", en: "CEO only" },
  "memory.docs.roleSysAdmin": { tr: "Yalnızca sistem yöneticisi", en: "System administrator only" },
  "memory.docs.roleAuditor": { tr: "Yalnızca denetçi", en: "Auditor only" },
  "memory.docs.textPlaceholder": { tr: "Belge metnini yapıştırın ya da yukarıdan dosya seçin…", en: "Paste the document text or choose a file above…" },
  "memory.docs.adding": { tr: "Ekleniyor…", en: "Adding…" },
  "memory.docs.add": { tr: "Belgeyi kurumsal hafızaya ekle", en: "Add document to institutional memory" },
  "memory.docs.fileHeading": { tr: "DOSYADAN BELGE EKLE (PDF / DOCX)", en: "ADD DOCUMENT FROM FILE (PDF / DOCX)" },
  "memory.docs.fileIntro": { tr: "PDF veya Word (.docx) dosyasından metin otomatik çıkarılır. Diğer türler için yukarıdaki yapıştırma yolunu kullanın.", en: "Text is extracted automatically from PDF or Word (.docx) files. For other types use the paste path above." },
  "memory.docs.fileTitlePlaceholder": { tr: "Belge başlığı (boşsa dosya adı kullanılır)", en: "Document title (file name used if empty)" },
  "memory.docs.uploading": { tr: "Yükleniyor…", en: "Uploading…" },
  "memory.docs.addFile": { tr: "Dosyayı kurumsal hafızaya ekle", en: "Add file to institutional memory" },
  "memory.docs.listHeading": { tr: "KURUMSAL BELGELER", en: "INSTITUTIONAL DOCUMENTS" },
  "memory.docs.listHeadingCount": { tr: "KURUMSAL BELGELER ({count})", en: "INSTITUTIONAL DOCUMENTS ({count})" },
  "memory.docs.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "memory.docs.empty": { tr: "Henüz belge yok. Yukarıdan ekleyin.", en: "No documents yet. Add one above." },
  "memory.docs.chunkInfo": { tr: "{chunks} parça · {kb} KB · {by}", en: "{chunks} chunks · {kb} KB · {by}" },
  "memory.docs.docsFailed": { tr: "Belgeler yüklenemedi.", en: "Documents could not be loaded." },
  "memory.docs.uploadFailed": { tr: "Dosya yüklenemedi.", en: "File could not be uploaded." },
  "memory.docs.addFailed": { tr: "Belge eklenemedi.", en: "Document could not be added." },
  "memory.docs.added": { tr: "Belge eklendi — {chunks} parçaya bölündü ve Ask ABYS'te aranabilir.", en: "Document added — split into {chunks} chunks and searchable in Ask ABYS." },
  "memory.row.confidence": { tr: "Güven %{value}", en: "Confidence {value}%" },
  "memory.row.recommendation": { tr: "ABYS önerisi:", en: "ABYS recommendation:" },
  "memory.row.applied": { tr: "· Uygulanan: {action}", en: "· Applied: {action}" },
  "memory.row.reason": { tr: "Gerekçe: {reason}", en: "Rationale: {reason}" },
  "memory.row.outcomeHeading": { tr: "SONUÇ:", en: "OUTCOME:" },
  "memory.row.notePlaceholder": { tr: "Ne oldu? (örn: rötar 12 dk ile sınırlı kaldı)", en: "What happened? (e.g. delay stayed within 12 min)" },
  "memory.row.save": { tr: "Kaydet", en: "Save" },
  "memory.row.cancel": { tr: "Vazgeç", en: "Cancel" },
  "memory.row.record": { tr: "+ Sonucu kaydet — ABYS bundan öğrenir", en: "+ Record outcome — ABYS learns from it" },
  "memory.outcome.improved": { tr: "iyileşme sağlandı", en: "improved" },
  "memory.outcome.unchanged": { tr: "değişim olmadı", en: "unchanged" },
  "memory.outcome.worsened": { tr: "durum kötüleşti", en: "worsened" },
  "memory.choice.accepted": { tr: "Kabul edildi", en: "Accepted" },
  "memory.choice.rejected": { tr: "Reddedildi", en: "Rejected" },
  "memory.choice.modified": { tr: "Değiştirilerek uygulandı", en: "Applied with changes" },
  "memory.auditType.analysis_run": { tr: "Analiz çalıştırıldı", en: "Analysis run" },
  "memory.auditType.case_generated": { tr: "Vaka üretildi", en: "Case generated" },
  "memory.auditType.decision_made": { tr: "Karar verildi", en: "Decision made" },
  "memory.auditType.outcome_recorded": { tr: "Sonuç kaydedildi", en: "Outcome recorded" },
  "memory.auditType.data_ingested": { tr: "Veri alındı", en: "Data ingested" },
  "scenarios.eyebrow": { tr: "SENARYO LABORATUVARI", en: "SCENARIO LAB" },
  "scenarios.title": { tr: "Ya şöyle", en: "What if" },
  "scenarios.titleAccent": { tr: "olsaydı?", en: "it were so?" },
  "scenarios.subtitle": {
    tr: "Değişkenleri değiştirin, taban/iyimser/kötümser karşılaştırın. Tüm sayılar deterministik formüllerle hesaplanır — model sayı üretmez; formül, sınırlar ve duyarlılık her sonuçla birlikte gösterilir.",
    en: "Change the variables and compare base/optimistic/pessimistic cases. Every number comes from deterministic formulas — the model invents no values; the formula, limits and sensitivity are shown with each result.",
  },
  "scenarios.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "scenarios.runFailed": { tr: "Senaryo çalıştırılamadı.", en: "Scenario could not run." },
  "scenarios.unauthorized": {
    tr: "Senaryo Laboratuvarı kurumsal oturum gerektirir.",
    en: "Scenario Lab requires an enterprise session.",
  },
  "scenarios.templatesFailed": { tr: "Şablonlar yüklenemedi.", en: "Templates could not be loaded." },
  "scenarios.defaultName": { tr: "Senaryo", en: "Scenario" },
  "scenarios.twinNeedCurrency": {
    tr: "Dijital ikiz karşılaştırması için senaryo toplamı TRY, EUR, USD veya GBP cinsinden olmalı.",
    en: "For a digital twin comparison the scenario total must be in TRY, EUR, USD or GBP.",
  },
  "scenarios.twinRiskTitle": { tr: "{name} etkisi", en: "{name} impact" },
  "scenarios.twinRiskEvidence": {
    tr: "Senaryo toplamı {value} {unit}; nakit etkisi senaryo varsayımı olarak uygulandı.",
    en: "Scenario total {value} {unit}; cash impact applied as a scenario assumption.",
  },
  "scenarios.twinFailedHttp": { tr: "Karşılaştırma başarısız (HTTP {status}).", en: "Comparison failed (HTTP {status})." },
  "scenarios.twinFailed": { tr: "Dijital ikiz karşılaştırması başarısız.", en: "Digital twin comparison failed." },
  "scenarios.namePlaceholder": { tr: "Senaryo adı", en: "Scenario name" },
  "scenarios.calculating": { tr: "Hesaplanıyor…", en: "Calculating…" },
  "scenarios.compare": { tr: "Karşılaştır", en: "Compare" },
  "scenarios.calculateAndSave": { tr: "Hesapla ve kaydet", en: "Calculate and save" },
  "scenarios.formula": { tr: "Formül: {formula}", en: "Formula: {formula}" },
  "scenarios.twinHeading": { tr: "SENARYO → DİJİTAL İKİZ", en: "SCENARIO → DIGITAL TWIN" },
  "scenarios.twinDescription": {
    tr: "Senaryo toplamı, açık bir nakit etkisi varsayımı olarak mevcut kurumsal durumla karşılaştırılır. Para birimleri toplanmaz.",
    en: "The scenario total is compared with the current enterprise state as an explicit cash-impact assumption. Currencies are never summed.",
  },
  "scenarios.twinBusy": { tr: "Karşılaştırılıyor…", en: "Comparing…" },
  "scenarios.twinCompare": { tr: "Dijital ikizle karşılaştır", en: "Compare with digital twin" },
  "scenarios.twinBalance": { tr: "{currency} nakit dengesi", en: "{currency} cash balance" },
  "scenarios.twinDelta": { tr: "Fark: {value} {currency}", en: "Delta: {value} {currency}" },
  "scenarios.twinSummary": {
    tr: "{deltas} açık delta · {risks} senaryo riski · {currencies}",
    en: "{deltas} open deltas · {risks} scenario risks · {currencies}",
  },
  "scenarios.twinCurrencyNew": { tr: "Yeni para birimi: {list}", en: "New currency: {list}" },
  "scenarios.twinCurrencyExisting": { tr: "Mevcut para birimleri", en: "Existing currencies" },
  "scenarios.sensitivityHeading": { tr: "DUYARLILIK", en: "SENSITIVITY" },
  "scenarios.provenanceHeading": { tr: "HESAP KAYNAĞI", en: "CALCULATION SOURCE" },
  "scenarios.engine": { tr: "Motor: {engine}", en: "Engine: {engine}" },
  "scenarios.calculatedAt": { tr: "Hesaplandı: {at}", en: "Calculated: {at}" },
  "scenarios.limitsHeading": { tr: "SINIRLAR", en: "LIMITS" },
  "scenarios.saved": { tr: "Senaryo kaydedildi (kurumsal hafızada).", en: "Scenario saved (institutional memory)." },
  "scenarios.sim.heading": { tr: "BELİRSİZLİK ARALIĞI — MONTE CARLO", en: "UNCERTAINTY RANGE — MONTE CARLO" },
  "scenarios.sim.p10": { tr: "P10 (iyi)", en: "P10 (good)" },
  "scenarios.sim.p50": { tr: "P50 (beklenen)", en: "P50 (expected)" },
  "scenarios.sim.p90": { tr: "P90 (kötü)", en: "P90 (bad)" },
  "scenarios.sim.summary": {
    tr: "{label}: taban {base} {unit} · ortalama {mean} · std. sapma {stdDev}",
    en: "{label}: base {base} {unit} · mean {mean} · std. dev. {stdDev}",
  },
  "scenarios.sim.probability": {
    tr: "Tabanı aşma olasılığı %{above} · tabanın %20 üzerini aşma olasılığı %{above20} · {samples} örnek, tohum {seed}",
    en: "Probability of exceeding base {above}% · of exceeding base by 20% {above20}% · {samples} samples, seed {seed}",
  },
  "scenarios.sim.assumptionsHeading": { tr: "VARSAYIMLAR", en: "ASSUMPTIONS" },
  "scenarios.sim.assumptionLine": {
    tr: "{label}: alt {low} · mod {mode} · üst {high} {unit}",
    en: "{label}: low {low} · mode {mode} · high {high} {unit}",
  },
  "scenarios.sim.engineNote": { tr: "Motor: {engine}. {note}", en: "Engine: {engine}. {note}" },
  "kpi.eyebrow": { tr: "KPI VERİSİ", en: "KPI DATA" },
  "kpi.title": { tr: "Ne ölçüyorsunuz,", en: "What are you measuring," },
  "kpi.titleAccent": { tr: "hangi geçmişle?", en: "with which history?" },
  "kpi.subtitle": { tr: "Tahmin ve erken uyarı, kurumun gerçek zaman serisinden beslenir. Metriği tanımlayın, geçmiş değerleri tek tek veya toplu yapıştırarak ekleyin. Buradaki her nokta denetim kaydına ve veri soyuna bağlanır.", en: "Forecasting and early warning are fed by the institution's real time series. Define the metric, then add historical values one by one or by pasting a batch. Every point here is tied to the audit trail and data lineage." },
  "kpi.loadFailed": { tr: "KPI verisi yüklenemedi.", en: "KPI data could not be loaded." },
  "kpi.needMetricAndValue": { tr: "Metrik adı ve en az bir değer gerekir.", en: "A metric name and at least one value are required." },
  "kpi.saveFailedHttp": { tr: "Kaydetme başarısız (HTTP {status}).", en: "Save failed (HTTP {status})." },
  "kpi.saveFailed": { tr: "Kaydetme başarısız.", en: "Save failed." },
  "kpi.deleteFailed": { tr: "Silme başarısız.", en: "Delete failed." },
  "kpi.savedPoints": { tr: "{count} nokta kaydedildi: {label}", en: "{count} points saved: {label}" },
  "kpi.invalidDate": { tr: "Geçerli bir tarih seçin.", en: "Choose a valid date." },
  "kpi.numericValue": { tr: "Değer sayısal olmalı.", en: "The value must be numeric." },
  "kpi.bulkNoValidRows": { tr: "Yapıştırılan satırlarda geçerli tarih,değer bulunamadı.", en: "No valid date,value rows were found in the pasted text." },
  "kpi.newValue": { tr: "YENİ DEĞER", en: "NEW VALUE" },
  "kpi.metricPlaceholder": { tr: "Metrik adı (örn. Haftalık gelir)", en: "Metric name (e.g. Weekly revenue)" },
  "kpi.observedAtAria": { tr: "Gözlem zamanı", en: "Observation time" },
  "kpi.valuePlaceholder": { tr: "Değer", en: "Value" },
  "kpi.saving": { tr: "Kaydediliyor…", en: "Saving…" },
  "kpi.save": { tr: "Kaydet", en: "Save" },
  "kpi.bulkSummary": { tr: "Toplu yapıştırma (tarih,değer)", en: "Bulk paste (date,value)" },
  "kpi.bulkSave": { tr: "Toplu kaydet", en: "Save batch" },
  "kpi.metricsHeading": { tr: "METRİKLER", en: "METRICS" },
  "kpi.goForecast": { tr: "tahmine git →", en: "go to forecast →" },
  "kpi.forecast": { tr: "tahmin", en: "forecast" },
  "kpi.loading": { tr: "Yükleniyor…", en: "Loading…" },
  "kpi.emptyLabels": { tr: "Henüz KPI noktası yok. Yukarıdan ilk metriği ekleyin.", en: "No KPI points yet. Add the first metric above." },
  "kpi.pointCounts": { tr: "{numeric} sayısal / {total} toplam", en: "{numeric} numeric / {total} total" },
  "kpi.latestPoints": { tr: "{label} — SON NOKTALAR", en: "{label} — LATEST POINTS" },
  "kpi.emptyPoints": { tr: "Bu metrik için henüz nokta yok.", en: "No points for this metric yet." },
  "kpi.colTime": { tr: "Zaman", en: "Time" },
  "kpi.colValue": { tr: "Değer", en: "Value" },
  "kpi.delete": { tr: "Sil", en: "Delete" },
  "ask.eyebrow": { tr: "ASK ABYS", en: "ASK ABYS" },
  "ask.title": { tr: "Kuruma", en: "Ask your" },
  "ask.titleAccent": { tr: "sorun.", en: "institution." },
  "ask.subtitle": { tr: "ABYS yalnızca kurumun kendi kayıtlarından ve erişim izniniz olan belgelerden cevap verir. Her ifade kaynağıyla gelir; kanıt yoksa bunu açıkça söyler.", en: "ABYS answers only from the institution's own records and documents you are permitted to access. Every statement arrives with its source; when there is no evidence it says so plainly." },
  "ask.placeholder": { tr: "Örn: Hangi aksiyonlar gecikti?", en: "Example: Which actions are overdue?" },
  "ask.submit": { tr: "Sor", en: "Ask" },
  "ask.busy": { tr: "Yanıtlanıyor…", en: "Answering…" },
  "ask.sessionRequired": { tr: "Bu sayfa kurumsal oturum gerektirir. Lütfen giriş yapın.", en: "This page requires an institutional session. Please sign in." },
  "ask.failed": { tr: "Cevap alınamadı.", en: "No answer could be retrieved." },
  "ask.label.fact": { tr: "KAYIT", en: "RECORD" },
  "ask.label.inference": { tr: "ÇIKARIM", en: "INFERENCE" },
  "ask.label.recommendation": { tr: "ÖNERİ", en: "RECOMMENDATION" },
  "ask.statementSource": { tr: "kaynak: {source}", en: "source: {source}" },
  "ask.sourcesHeading": { tr: "KAYNAKLAR ({count})", en: "SOURCES ({count})" },
  "ask.example.risk": { tr: "Bugün en kritik operasyonel risk nedir?", en: "What is today's most critical operational risk?" },
  "ask.example.delayedTasks": { tr: "Hangi hizmet görevleri gecikiyor?", en: "Which service tasks are delayed?" },
  "ask.example.capacity": { tr: "Hangi ekipte kapasite problemi var?", en: "Which team has a capacity problem?" },
  "ask.example.renewals": { tr: "Yenileme tarihi yaklaşan müşteriler hangileri?", en: "Which customers have upcoming renewals?" },
  "ask.example.pest": { tr: "Hangi pest-control görevleri gecikti?", en: "Which pest-control tasks are overdue?" },
  "ask.example.catering": { tr: "Catering operasyonunda bugün risk var mı?", en: "Is there a risk in catering operations today?" },
  "ask.example.decision": { tr: "Yönetimin bugün vermesi gereken karar nedir?", en: "What decision should leadership make today?" },
  "ask.example.taisHealth": { tr: "TAIS'in genel operasyon sağlığı nedir?", en: "What is TAIS's overall operations health?" },
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
