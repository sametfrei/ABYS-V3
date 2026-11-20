# ABYS agent team (shared context)

Shared context for every project agent. The machine-readable 31-role organization is
`docs/agents/organization.json`; durable queues and evidence live in
`docs/agents/OPERATING-STATE.md`. Keep all three current.

## Product
ABYS is an Executive Decision Intelligence platform: **DATA → UNDERSTANDING → RISK → PREDICTION → DECISION → ACTION**.
Principle: **30 Seconds to Clarity** — surface the 3–5 things an executive must act on, each with evidence. ABYS is an
intelligence layer on top of existing ERP/CRM/accounting systems; it does not replace them.

## Architecture (last code integration commit: 9877024; re-check before relying on it)
- Next.js 16 + React 19 + TypeScript (strict), App Router. **Read `node_modules/next/dist/docs/` before writing Next.js code** (see `AGENTS.md`).
- Embedded Postgres (PGlite) via `src/lib/db/client.ts`; hand-written SQL repositories in `src/lib/db/repos/`; ordered append-only migrations in `src/lib/db/migrations.ts`. Every business table carries `org_id`.
- Auth: `src/lib/auth/*` (scrypt, server-side sessions, OIDC), RBAC in `src/lib/auth/permissions.ts`, hash-chained audit log in `src/lib/db/repos/audit.ts` (single write path).
- AI: `src/lib/ai/*` (provider policy `AI_POLICY`, number verifier `verify-cases.ts`). Models explain; code computes every number.
- Deterministic intelligence: `src/lib/demo/tais/*`, `src/lib/scenario-engine.ts`, `src/lib/scenario-simulation.ts` (tohumlanmış Monte Carlo), `src/lib/forecasting.ts` (geriye dönük testli tahmin), `src/lib/anomaly.ts` (median/MAD erken uyarı), `src/lib/process-mining.ts` (olay günlüğünden süreç akışı), `src/lib/scenarios.ts`, `src/lib/calculators.ts`, `src/lib/kpi.ts`.
- Integrations: generic REST/OData connector, canonical contracts, deterministic cross-source entity links, webhooks, and API keys.
- Tests: Vitest in `tests/` (verified 2026-11-20 baseline: 76 files passed + 1 skipped; 708 tests passed, 9 skipped). Evals in `evals/`.
- Mimari haritası: `docs/ARCHITECTURE.md`; veri modeli: `docs/DATA_MODEL.md`; ürün yol haritası ve kanıt durumu: `docs/ROADMAP.md`.
- Denetim zinciri kararlı: `recordAuditEvent` yazımları sıralanır ve `created_at` kesin artar;
  tam süit geçer. Kilit yalnızca süreç içidir (çok örnekli dağıtımda DB kilidi gerekir).

## Delivery approach

The delivery target is **23 November 2026, 23:59 Europe/Istanbul**. Use the remaining
time for the highest-value verified increments without compromising correctness,
security, data integrity, or maintainability.

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
4. The hierarchy is exactly **Codex → Department Director → Specialist**. Specialists never start other agents. Directors may coordinate bounded specialist work packages only where the native runtime supports it. A defined role is not an active agent; never represent one as active without a real thread.
5. Subagents do not run `git commit`, `git push`, `npm install`, or destructive Git commands. The Lead reviews and tests their output, then may create Conventional Commits for verified slices. Production, migration 18 and live customer-data changes remain approval-gated.
6. Write code comments in the repo's existing language (Turkish). Report to the Lead in Turkish, concisely, listing files read/changed and anything unverified.
7. Never claim something works without evidence (a test you ran, a file/line you read). Mark assumptions as assumptions.

## Organization and operating model

- **Level 1:** Codex, CEO / Chief Architect / Executive Orchestrator. Implements work directly, owns priorities, integration and final acceptance.
- **Level 2:** five directors: Platform & Architecture; Enterprise Connectivity; Intelligence & Digital Twin; Product Experience; Security, Quality & Reliability.
- **Level 3:** five specialists per department (25 total). Exact keys, aliases and responsibilities are in `docs/agents/organization.json`.
- Only instantiate agents when there is real bounded work. Reuse an existing thread before creating another.
- The Security, Quality & Reliability Director has independent review authority and escalates Critical findings directly to Codex.
- Keep the configured future cap at 8 subagent threads, but honor the observed EVREN model limit of **2 simultaneous `deepseek-v4.1-flash` requests**. A 429 burst stops new model work immediately; queued work keeps its state and no retry loop is allowed.
- Departments maintain prioritized queues in `docs/agents/OPERATING-STATE.md`. Each assignment records objective, owned files, dependencies, acceptance criteria and required tests.

## File ownership (one writer per file)

Every file in the repo has exactly one writer. The globs below are exhaustive: if a file is not matched, stop and ask
the Lead. A new migration is append-only; tell the Lead before touching a table another area reads.

| Area | Owner |
| --- | --- |
| `src/lib/integrations/**`, `src/lib/data/**`, `src/lib/db/**` (client, migrations, repos), `src/lib/documents/**`, `config/**`, `scripts/demo-tais-bootstrap.ts`, `scripts/demo-tais-reset.ts`, matching tests | data-integration-engineer |
| `src/app/api/{ingest,connectors,webhook,webhook-config,integration,integrations,migrate-local,audit,documents,demo}/**` (18 routes) | data-integration-engineer |
| `src/lib/demo/tais/**`, `src/lib/{scenario-engine,scenarios,calculators,kpi,signals,domain-knowledge,market-pulse}.ts`, `src/lib/ai/{verify-cases,decision-prompt}.ts`, `evals/**`, matching tests | intelligence-engineer |
| `src/app/api/{actions,analyze,ask,assess-risk,briefing,causal,command-center,decision-cases,decisions,kpi-definitions,market-pulse,outcomes,scenarios,signals,trace,tais}/**` (18 routes) | intelligence-engineer |
| `src/app/dashboard/**`, `src/app/{page,layout}.tsx`, `src/app/{login,onboarding}/**`, `src/components/**`, `src/app/globals.css`, `public/**`, `assets/**` | frontend-ux-engineer |
| `src/lib/{entities,constraints,decisions,profile,roles,sectors,use-session,use-stored,ndjson-client}.ts` | frontend-ux-engineer |
| `src/lib/auth/**`, `src/app/api/auth/**`, `src/app/api/health/**` | **Lead only** |
| `src/lib/ai/{provider.ts,providers/**,embeddings.ts,stream-route.ts}`, `src/lib/{public-demo,rate-limit,validation}.ts` | **Lead only** |
| `package.json`, lockfile, `next.config.ts`, `Dockerfile`, `docker-compose.yml`, `.github/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/**` | **Lead only** |
| `scripts/{build-desktop.mjs,windows/**}`, `desktop/**`, `TAIS-ABYS-*.cmd`, `KURULUM-VE-GIRIS-BILGILERI.txt`, `FINAL-QA-REPORT.txt`, `SHA256SUMS.txt` | **Lead only** |
| Everything | codebase-architect and security-qa-reviewer: **read-only** (they never edit; they may run read-only Git via the Bash guard) |

**Route adapters:** API handlers are thin adapters owned by the agent above. They may import `src/lib/db/repos/**`, but
their owner never edits those repo files. The intelligence rule "no DB or framework imports in new engine code" applies
to `src/lib` engine modules, not to route handlers.

## Test ownership (58 files)

| Owner | Test files |
| --- | --- |
| **Lead** | `api-auth, permissions, login-flow, login-bootstrap, oidc, password-change, sessions-api, ask-validation, api-type-robustness, organizations, migration-governance, organization-migration-guard, source-readonly, canonical-contracts, business-context, entity-resolution, kpi-calculators, data-quality, decision-ledger, scenario-simulation, forecasting, anomaly, process-mining, decision-options, kpi-values, connectors, decision-brief, health, public-demo-gate, ollama-diagnosis-retry, tais-windows-package, users-api` |
| data-integration-engineer | `audit-chain, data-route-validation, users-repo, bitrix24-api, bitrix24-mapper, bitrix-sync-quarantine, integration-gateway, webhook, tenant-isolation, document-access, parse-table, advisor-analytics` |
| intelligence-engineer | `kpi, scenario-engine, verify-cases, decision-prompt, decision-cases-validation, tais-ask, tais-bootstrap, tais-consistency, tais-decisions, tais-executive-summary, tais-kpi, tais-risks, tais-seed` |
| frontend-ux-engineer | None today. Future `tests/frontend-*.test.ts`; adding `jsdom`/`@testing-library` needs Lead approval. |

The owner of a production file owns its test. Multi-area tests (for example `tenant-isolation`) are written by
data-integration-engineer, reviewed by security-qa-reviewer, approved by the Lead. security-qa-reviewer never writes
tests; it only recommends them.

## Verification and reporting

- Yerel izleme: `npm run agent:center` (http://127.0.0.1:3200) ve
  `npm run dev:preview` (http://127.0.0.1:3100). Command Center, Claude
  transkriptleri ile `~/.codex/sessions/**/*.jsonl` rollout kayıtlarını birleştirir;
  yalnızca gerçek oturum/tool olaylarını gösterir, sahte ilerleme üretmez.

- Canonical check: `bash scripts/agent-verify.sh <changed files...> <owned test files...>` (runs
  `npx tsc --noEmit`, `npx eslint` on non-test paths, and `npx vitest run` on `tests/*.test.ts` paths).
  `node_modules` is installed by the Lead; agents never run `npm install`/`npm ci`.
- Every report ends with: files read, files changed, commands run and results, what could not be verified, assumptions,
  and blocking issues.
- Separate verified (read/run) from assumed. Never claim a check passed unless the command was run.

## Parallel work protocol

- **Configured future concurrency cap: 8 specialist threads globally**, excluding Codex. The observed EVREN
  `deepseek-v4.1-flash` model limit is **2 simultaneous model requests**; do not start more model work than that.
  A four-process target is acceptable only when each process also performs independent local work; it is not permission
  to exceed the model-request semaphore. Do not start agents merely because configured capacity exists.
- Do not retry repeated HTTP 429 responses. Reduce concurrency or take the work over in the Lead session.
- Agents never gate each other: the Lead integrates each completed slice immediately and does not wait for background work.
- Tasks are small, single-output, with explicit file ownership and acceptance criteria. No broad research briefs.
- If an agent shows no progress for ~5 minutes, query it, shrink the task, or take it over as Lead.
- The Lead serializes any task touching shared files or a table read by another area, and runs agents in parallel only
  on disjoint file sets.
- Before editing, an agent runs `git status --short`; if owned files contain unexpected changes, it stops and reports.
- Two agents never edit the same file at the same time.
- `git stash`, `git checkout`, `git reset`, `git clean`, `git commit` and `git push` are forbidden for every subagent.
  The Lead validates ownership and test evidence, commits only the completed slice with a Conventional Commit message,
  and checks `origin/main` before a normal, non-force push. Unverified and in-progress files never enter that commit.
