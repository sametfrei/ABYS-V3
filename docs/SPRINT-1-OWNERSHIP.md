# Sprint 1 — Production Safety and Trusted Intelligence Pipeline

This map supplements `docs/agents/README.md` for the approved Sprint 1 scope. One writer owns each file. Security and QA review remains independent from implementation.

| Workstream | Files | Writer | Required review |
| --- | --- | --- | --- |
| Demo-seed removal and login regression | `src/app/api/auth/login/route.ts`, `src/app/api/auth/oidc/callback/route.ts`, deleted `src/lib/db/seed.ts`, `tests/login-flow.test.ts` | Lead Architect | Security & QA |
| Migration governance | `src/lib/db/client.ts`, `src/lib/db/migrations.ts`, `tests/migration-governance.test.ts` | Lead Architect | Security & QA |
| Read-only outbound access | `src/lib/net/ssrf.ts`, `src/lib/net/pinned-fetch.ts`, `src/app/api/connectors/rest/route.ts`, `src/lib/connectors/rest-adapter.ts`, `src/lib/connectors/types.ts`, `tests/source-readonly.test.ts` | Lead Architect | Security & QA |
| Connector promotion | `src/lib/db/repos/connector-promotion.ts`, `src/app/api/connectors/[id]/sync/route.ts`, `src/app/api/connectors/[id]/runs/route.ts`, `src/app/api/connectors/route.ts`, `tests/connectors.test.ts` | Data Integration Engineer | Intelligence Engineer + Security & QA |
| Connector operator experience | `src/app/dashboard/connectors/page.tsx` | Frontend UX Engineer | Data Integration Engineer |
| Product and engineering record | `docs/PRODUCT-CONSTITUTION.md`, `docs/SPRINT-1-OWNERSHIP.md`, `docs/ROADMAP.md`, `README.md`, `docs/agents/README.md` | Lead Architect | None |
| Intelligence consumption evidence | `tests/connectors.test.ts` forecast, anomaly, and process assertions | Intelligence Engineer | Lead Architect |

## Acceptance gates

- A login attempt cannot create a TAIS demo tenant or user.
- Migration 18 remains absent unless `ABYS_MIGRATION_18_APPROVED=true` is set by an authorized operator.
- Source requests are GET-only, reject embedded credentials, validate every redirect hop, and connect to the validated DNS address.
- A sync response distinguishes fetched, canonicalized, KPI-promoted, event-promoted, and skipped counts.
- Repeating a sync does not duplicate KPI observations or integration events.
- Promoted KPI values are consumed by forecasting and anomaly APIs.
- Promoted events are consumed by process-mining repositories.
- Tenant isolation tests cover configuration, sync, run history, and promotion counts.
- Verified, independently owned slices are committed automatically with focused Conventional Commits and pushed normally when the remote is healthy; subagents never run Git writes. Migration 18 application, production deployment, destructive database operations and live customer-data changes remain explicitly approval-gated.

## Phase 1-2 extension — trusted canonical pipeline

| Slice | Primary files | Owner | Required review |
| --- | --- | --- | --- |
| Persistent business context and industry-pack activation | `src/lib/db/repos/business-context.ts`, `src/lib/industry/{packs,kpi-calculators}.ts`, migration 21, discovery route/UI, matching tests | Data Integration Engineer | Intelligence Engineer + Security & QA |
| Semantic graph projection | `src/lib/db/repos/semantic-graph.ts`, `src/app/api/semantic-graph/route.ts`, `src/app/api/discovery/route.ts` | Data Integration Engineer | Codebase Architect |
| Canonical contracts and source-schema observation | `src/lib/connectors/{contracts,schema-discovery}.ts`, `src/lib/connectors/{types,rest-adapter}.ts`, `src/app/api/canonical-contracts/route.ts` | Data Integration Engineer | Security & QA |
| Contract rejection and quarantine observability | `src/lib/db/repos/{connectors,data-quality}.ts`, `src/app/api/connectors/[id]/sync/route.ts`, migration 22, connectors UI/tests | Data Integration Engineer | Security & QA + Intelligence Engineer |
| Deterministic cross-source entity resolution | `src/lib/connectors/entity-resolution.ts`, `src/lib/db/repos/{connectors,semantic-graph}.ts`, migration 23, `tests/entity-resolution.test.ts` | Data Integration Engineer | Codebase Architect + Security & QA |

Current acceptance gates:

- Invalid canonical fields never reach `connector_records`, KPI observations, process events, or forecasting inputs.
- Every rejected sync row has an explicit reason/code and a connector-run link in the tenant-scoped quarantine.
- Source schema persistence contains field paths/types only, never source values or credentials.
- Business-profile insert and KPI activation commit atomically under a per-organization lock.
- Ambiguous cross-pack KPI keys require an explicit `packId:kpiId` instead of silently choosing the first package.
- Strong identity links are organization-scoped and tenant-checked at write time; raw e-mail/SKU values are not stored in the link table.
- Records without a strong identity remain source-scoped and are not merged by name similarity or colliding external IDs.
