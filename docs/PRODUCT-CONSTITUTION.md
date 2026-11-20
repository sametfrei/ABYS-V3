# ABYS — Product Constitution and Target Architecture

Status: accepted direction for engineering execution. This document separates shipped capabilities from planned capabilities and supplements the takeover audit.

## 1. Product category and global positioning

ABYS is a vendor-independent, organization-wide Decision Intelligence and Business Orchestration layer. It sits above existing ERP, CRM, finance, HR, supply-chain, process, data-warehouse, and industry systems. It does not replace those systems and does not require a particular application vendor, cloud, database, or AI model.

The product promise is **30 Seconds to Clarity**: an executive sees the few developments that matter, why they matter, what may happen next, what alternatives exist, and what evidence supports a decision.

ABYS is not an ERP, CRM, conventional BI dashboard, reporting tool, or general-purpose chatbot.

## 2. The enterprise problem

Enterprises already own the transactions and operational records needed to understand their business. The missing layer is connected understanding: systems use different entities, identifiers, calendars, currencies, semantics, and levels of data quality. Decisions are fragmented across reports, meetings, spreadsheets, and individual memory. The result is slow diagnosis, weak prioritization, unmeasured recommendations, and little institutional learning.

ABYS addresses that gap by building a governed representation of the enterprise and turning it into evidence-backed decisions with measurable outcomes. It must earn trust through data lineage, explicit uncertainty, permission enforcement, and reproducible calculations.

## 3. Ideal customer and users

The initial ideal customer is a multi-entity organization with consequential operational and financial decisions, several source systems, and a need for cross-functional visibility. This includes mid-market groups and larger organizations in manufacturing, distribution, retail, logistics, services, and other operationally complex sectors.

Primary users are CEOs, CFOs, COOs, CIOs, and business-unit leaders. Analysts, controllers, process owners, data teams, and operational managers need drill-down workspaces. Most users should not need to understand the connector, ontology, or modeling internals to receive clear, auditable answers.

## 4. Competitive landscape and differentiation

The reference map covers distinct strengths: Palantir for ontology-grounded operations, SAP and Oracle for deep business processes, Microsoft and ServiceNow for enterprise context and workflow, Celonis for process intelligence, Databricks and Snowflake for data and AI infrastructure, Salesforce for customer context, and IBM for AI governance.

ABYS does not copy these products. Its differentiation is the integration of universal enterprise connectivity, automatic business understanding, a persistent semantic model, a continuously updated enterprise state, predictive and causal intelligence, prescriptive decisions, economic impact measurement, governed execution, and institutional memory. Each capability can exist elsewhere; the product thesis is a coherent decision layer spanning systems, industries, entities, and outcomes.

## 5. Core product capabilities

- Read-only connector framework with schema discovery, mapping, incremental synchronization, provenance, validation, and observable failures.
- Business understanding that separates a discovered field, a mapped field, a calculable metric, a validated metric, and an approved KPI.
- Semantic business model and knowledge relationships spanning organizations, entities, processes, events, assets, obligations, risks, decisions, and outcomes.
- Enterprise digital twin representing current and historical state, dependencies, capacity, constraints, and scenario-ready relationships.
- Deterministic and statistical forecasting, anomaly detection, process mining, causal evidence, scenario simulation, and constrained optimization.
- Executive prioritization of a small number of issues with cause, consequence, alternatives, expected impact, confidence, and evidence.
- Decision lifecycle from detection through diagnosis, prediction, simulation, recommendation, approval, execution, measurement, and learning.
- Decision Value Ledger that keeps expected impact separate from realized impact.
- Organization-scoped institutional memory that is versioned, auditable, and correctable.
- External-context integration with source time, observation time, licensing, and relevance recorded separately from internal accounting data.

Shipped, partial, mocked, disconnected, and planned capabilities must remain explicitly labeled. The living maturity record is `docs/ROADMAP.md`.

## 6. Target logical architecture

1. **Enterprise Connectivity Fabric**: reusable adapters, credential lifecycle, synchronization, metadata, event ingestion, health, and source provenance.
2. **Data Quality and Canonicalization**: contracts, normalization, entity resolution, deduplication, quarantine, and source identity.
3. **Semantic Business Context**: ontology, relationships, industry packs, business rules, versioned entities, and KPI definitions.
4. **Enterprise State and Digital Twin**: current and historical state, events, constraints, dependencies, and scenario models.
5. **Intelligence Engine**: deterministic calculations, statistics, forecasting, anomalies, causal analysis, simulation, optimization, ML, and bounded AI reasoning.
6. **Decision Intelligence Orchestration**: evidence synthesis, prioritization, decision cases, alternatives, impact, memory, and value measurement.
7. **Governed Action Gateway**: permissions, approvals, plans, idempotency, execution status, compensation, and audit.
8. **Executive and Operational Experience**: executive intelligence center, role-aware drill-down, decision workflows, explanations, and controlled AI interaction.

The cross-cutting control plane covers identity, tenant isolation, policy, observability, model governance, data governance, retention, auditability, compliance, cost, backup, and recovery. Modular boundaries and interfaces take precedence over premature microservices.

## 7. Business data and intelligence lifecycle

`CONNECT → DISCOVER → CANONICALIZE → UNDERSTAND → MODEL → OBSERVE → PREDICT → EXPLAIN → SIMULATE → RECOMMEND → APPROVE → EXECUTE → MEASURE → LEARN`

Every transition must preserve source identity and provenance. Raw evidence remains immutable or reconstructable. Canonical records do not erase source-specific fields. Derived metrics retain their formula, inputs, freshness, validation state, and responsible definitions. Recommendations retain alternatives, constraints, assumptions, uncertainty, confidence, expected impact, and approval history.

AI may classify, summarize, critique, and explain verified context. It must not invent source records, authoritative KPI values, causal proof, accounting results, or realized financial impact. Consequential calculations remain deterministic or reproducible.

## 8. Trust, governance, and execution principles

- Source-system access defaults to read-only. Write-back requires a separate governed action gateway and explicit customer permission.
- Organization identity comes from the authenticated session, never from a caller-supplied tenant identifier.
- Least privilege, role- and attribute-aware permissions, tenant isolation, and complete audit records are release-blocking requirements.
- High-impact financial, personnel, legal, and operational actions require human authorization unless a formally bounded autonomy policy applies.
- Every action has identity, scope, policy, approval, idempotency, execution state, failure handling, and compensation where possible.
- Predictions expose method, inputs, assumptions, uncertainty, freshness, historical accuracy, and limitations.
- Correlation is never presented as causal proof. Causal status must state the available evidence and unresolved uncertainty.
- Data remains exportable and customer-owned. The moat must come from value, not artificial lock-in.

## 9. Product moat and defensibility

Defensibility compounds through a validated, vendor-independent model of each enterprise; cross-system relationships; normalized business context; historical state; forecasts grounded in company evidence; decision and outcome history; governed execution; executive trust; and measured value.

The platform should become more useful as it learns a customer's operating logic. That advantage must remain portable, auditable, and explainable to the customer. Product breadth alone is not a moat.

## 10. Measurable product success

Metrics must use customer evidence and validated baselines, not invented percentages.

- Integration: time to first connection, time to first validated KPI, mapping coverage, provenance coverage, data freshness, sync reliability, quarantine rate.
- Intelligence: forecast error and calibration, anomaly precision and recall, false-positive rate, evidence quality, scenario reproducibility, confidence calibration.
- Decisions: detection-to-decision time, decision-to-execution time, recommendation acceptance, cycle-time improvement, expected-versus-realized impact, avoided cost, incremental value.
- Executive experience: time to understand the top issue, time to evidence, engagement with priority insights, disposition rate for actionable insights.
- Trust: audit verification, tenant-isolation regressions, permission enforcement, data-quality reliability, provider availability, recovery performance.

## 11. Multi-phase strategic roadmap

- **Phase 0 — Trustworthy Foundation**: safe migration execution, production-safe identity and tenancy, read-only sources, reliable persistence, connector-to-intelligence pipeline, release-blocking integration and security tests.
- **Phase 1 — Universal Business Understanding**: connector framework, discovery, canonical contracts, entity resolution, semantic context, versioned KPI catalog, industry-pack activation.
- **Phase 2 — Enterprise Digital Twin**: relationship model, events and processes, historical state, dependencies, capacity and constraints, simulation foundation.
- **Phase 3 — Advanced Decision Intelligence**: predictive models, causal evidence, optimization, scenario comparison, financial impact, evidence-grounded decision briefs.
- **Phase 4 — Closed-Loop Operations**: Decision Value Ledger, governed actions, approved write-back, outcome tracking, organizational learning.
- **Phase 5 — Global Enterprise Scale**: deployment options, advanced governance, multi-region requirements, high-volume ingestion, observability, industry ecosystems, native integrations, benchmarking.

Dependencies and customer evidence may reorder work. Phase labels are not permission to claim future capabilities as shipped.

## 12. Relationship to Sprint 1

Sprint 1 is the trust gate for every later phase. It removes production demo seeding, prevents unapproved migration execution, enforces read-only source access, promotes connector output into KPI observations and process events, verifies consumption by intelligence modules, and adds release-blocking regression tests.

The long-term vision must not expand Sprint 1 beyond these fundamentals. Semantic modeling, digital-twin depth, optimization, governed write-back, and decision-value automation follow only after the data path and trust boundary are demonstrably reliable.

## Verified baseline that constrains this constitution

- Runtime persistence is embedded PostgreSQL through PGlite (`src/lib/db/client.ts`), not an independently operated PostgreSQL service.
- The generic REST/OData adapter is the implemented connector path; vendor-named ERP/CRM entries reuse it and remain unverified without customer credentials.
- Authentication, repository-level tenant scoping, hash-chained audit records, deterministic forecasting, anomaly detection, scenario simulation, decision options, and process mining exist in the repository.
- Migration 18 is gated and is not authorized for automatic application.
- The executive experience is Turkish-first, Next.js based, and preserves the existing ABYS visual language.
- Full production-scale migration, HA/DR, SSO/SAML lifecycle, cross-region deployment, and browser end-to-end proof are not established by unit tests alone.

## Verified implementation record (2026-11-20)

- Automatic demo seeding is removed from login/OIDC; demo bootstrap is explicit and production-gated.
- Migration 18 remains approval-gated while later migrations apply, and `/api/health` exposes pending approval state.
- Generic connector output reaches canonical records, KPI observations, process events, forecasting, anomaly detection, and process mining under automated tests.
- Canonical contracts now validate field types, dates, and references before persistence; rejected rows are linked to the sync run in the tenant-scoped quarantine.
- Source-schema observation stores paths/types only and produces deterministic mapping suggestions without persisting sample values.
- Confirmed business context is versioned and organization-scoped. Industry-pack activation is atomic with profile insertion and preserves operator-authored KPI definitions.
- Deterministic entity resolution now links records across sources only through normalized e-mail/SKU identities; all other records remain source-scoped. Links are organization-scoped, tenant-checked, and store hashes rather than raw identity values.
- The semantic graph supports bounded, tenant-scoped multi-hop traversal and neighborhood queries, but it remains a projection rather than a formal ontology service.
- Identity-conflict review, scheduled synchronization with health telemetry, current/historical digital-twin projections, deterministic scenario comparison, constrained optimization, governed decision lifecycle and economic outcome measurement are implemented and covered by local integration tests.
- Live vendor validation, external governed write execution and browser end-to-end proof remain open; they are not implied by passing local tests.
