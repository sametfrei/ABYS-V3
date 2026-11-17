# ABYS agent team (shared context)

Single source of truth for every project subagent in `.claude/agents/`. Keep it short and current.

## Product
ABYS is an Executive Decision Intelligence platform: **DATA → UNDERSTANDING → RISK → PREDICTION → DECISION → ACTION**.
Principle: **30 Seconds to Clarity** — surface the 3–5 things an executive must act on, each with evidence. ABYS is an
intelligence layer on top of existing ERP/CRM/accounting systems; it does not replace them.

## Architecture (verified at commit 8b8f3f1; re-check before relying on it)
- Next.js 16 + React 19 + TypeScript (strict), App Router. **Read `node_modules/next/dist/docs/` before writing Next.js code** (see `AGENTS.md`).
- Embedded Postgres (PGlite) via `src/lib/db/client.ts`; hand-written SQL repositories in `src/lib/db/repos/`; ordered append-only migrations in `src/lib/db/migrations.ts`. Every business table carries `org_id`.
- Auth: `src/lib/auth/*` (scrypt, server-side sessions, OIDC), RBAC in `src/lib/auth/permissions.ts`, hash-chained audit log in `src/lib/db/repos/audit.ts` (single write path).
- AI: `src/lib/ai/*` (provider policy `AI_POLICY`, number verifier `verify-cases.ts`). Models explain; code computes every number.
- Deterministic intelligence: `src/lib/demo/tais/*`, `src/lib/scenario-engine.ts`, `src/lib/scenarios.ts`, `src/lib/calculators.ts`, `src/lib/kpi.ts`.
- Integrations: `src/lib/integrations/*` (Bitrix24 is the reference connector), `src/app/api/connectors/*`, webhooks, API keys.
- Tests: Vitest in `tests/` (28 files). Evals in `evals/`.
- Roadmap and known gaps: the assessment document "ABYS — Technical Assessment & Autonomous Development Roadmap".

## Delivery approach

There is no arbitrary calendar deadline. Deliver as quickly as practical without
compromising correctness, security, data integrity, or maintainability.

The Lead Architect defines and tracks completion through working product
capabilities and verifiable acceptance criteria. Prioritize the smallest
complete, production-minded increments. Avoid endless planning: inspect,
implement, test, document, and report.

ABYS is complete only when its agreed release scope works end-to-end, including
realistic data flows, evidence-backed intelligence, executive usability,
security checks, and reproducible installation. Clearly identify any remaining
limitations before release.

## Rules for all agents
1. Preserve V3. Never rewrite from scratch, never create a second app, never add a competing design system or framework.
2. Security and data integrity beat speed. No secrets in code, logs or commits. `org_id` comes from the session, never from the request.
3. Stay in your lane (see ownership below). If a task needs a file you do not own, stop and tell the Lead what change is needed and why.
4. Subagents never start other subagents. Do not use the Agent tool.
5. Do not run `git commit`, `git push`, `npm install`, or anything destructive; the Lead integrates, commits and runs the full test suite.
6. Write code comments in the repo's existing language (Turkish). Report to the Lead in Turkish, concisely, listing files read/changed and anything unverified.
7. Never claim something works without evidence (a test you ran, a file/line you read). Mark assumptions as assumptions.

## File ownership (one writer per file)
| Area | Owner | Notes |
| --- | --- | --- |
| `src/lib/integrations/**`, `src/lib/data/**`, `src/lib/db/**` (incl. migrations), `src/app/api/{ingest,connectors,webhook,integration,integrations,webhook-config,migrate-local}/**`, `config/**`, matching tests | data-integration-engineer | New migrations are append-only; tell the Lead before touching a table another area reads |
| `src/lib/demo/tais/**`, `src/lib/{scenario-engine,scenarios,calculators,kpi,signals,domain-knowledge}.ts`, `src/lib/ai/{verify-cases,decision-prompt}.ts`, `evals/**`, matching tests | intelligence-engineer | Pure functions; no DB or framework imports in new engine code |
| `src/app/dashboard/**`, `src/app/{page,layout}.tsx`, `src/app/{login,onboarding}/**`, `src/components/**`, `src/app/globals.css`, `public/**` | frontend-ux-engineer | Reuse existing components and Tailwind tokens |
| `src/lib/auth/**`, `src/app/api/auth/**`, `package.json`, lockfile, `next.config.ts`, `Dockerfile`, `docker-compose.yml`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**` | **Lead only** | Security-sensitive or cross-cutting |
| Everything | codebase-architect and security-qa-reviewer: **read-only** | They never edit |

Two agents never work on overlapping files at the same time. The Lead serializes any task touching shared files
(for example a new table used by both integration and engine code) and runs agents in parallel only for independent areas.
