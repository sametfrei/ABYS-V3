# ABYS Two-Founder Operating Model

Updated: 2026-11-20

## Peer roles

- **Founder A — CEO / Product Strategy / Business Intelligence.** Owns executive workflows, product acceptance, business value and selected product slices.
- **Founder B — CTO / Chief Architect / Engineering Leader.** Owns architecture, backend, data integrity, security, integration, verification and the single Git integration path.

Both founders use the same Codex CLI, EVREN profile, model and repository. Neither founder is a subagent.

## Verified configuration

| Item | Value |
|---|---|
| Codex CLI | `0.170.0` |
| Provider | `evren` |
| Endpoint | unchanged: `https://evren-llmapi.ssyz.org.tr/v1` |
| Model | `deepseek-v4.1-flash` |
| Reasoning effort | `high` |
| Founder A thread | `01a1f8d2-cba6-76b1-8556-ad8b51b5f7d9` |
| Founder A bounded-test process | PID `31357`; exited after verified turn |
| Founder B | current primary Codex session |

No credential, endpoint or model change is part of this operating model.

## Capacity policy

The EVREN model permits **2 concurrent DeepSeek requests** while the account limit is 8. The operating ceiling is therefore:

- 2 primary Codex sessions;
- 0 extra model-active subagents while both founders are invoking the model;
- local tests, lint, build, file review and integration may proceed independently of a model slot;
- a third workstream remains `READY` or `BLOCKED`, not falsely labelled active.

Codex's subagent thread limit is not claimed to be a model-request semaphore. Capacity is controlled by keeping exactly two primary model sessions and no extra agents.

## Task and file discipline

1. Founder B is the only writer of `docs/two-founder/task-board.json`, decisions, Git staging, commits and pushes.
2. Each active task declares its file set. No two founders edit the same file concurrently.
3. Founder A reports into `docs/two-founder/founder-a/`; Founder B reports into `docs/two-founder/founder-b/`.
4. Failed 429 work stays queued with its request ID. No unbounded retry.
5. A task is `VERIFIED` only after its named checks ran. `INTEGRATED` requires the change in the shared working tree. `COMPLETED` requires both.

## Approval gates

Production deploy, migration 18, destructive database operations, live customer-data changes and irreversible external actions remain explicit human-approval gates. Normal verified commits and non-force pushes follow the standing delivery policy.
