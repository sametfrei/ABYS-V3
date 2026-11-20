# Two-Founder Decision Log

## D-001 — Equal primary founders
- Date: 2026-11-20
- Decision: Operate Founder A and Founder B as independent primary Codex sessions, not as a parent/subagent hierarchy.
- Reason: Product and engineering accountability must be independently exercised with equal model capability.
- Status: Verified for the initial Founder A bounded task.

## D-002 — EVREN request discipline
- Date: 2026-11-20
- Decision: Keep two primary sessions and no additional model-active subagents while the model concurrency limit is 2.
- Evidence: Fresh quota response reports `model_concurrency_limit: 2`, `concurrent_requests: 0`, and `daily_remaining_tokens: 10,859,567`.
- Status: Active.

## D-003 — Single Git integrator
- Date: 2026-11-20
- Decision: Founder B is the only writer of task-board state, Git staging, commits and non-force pushes.
- Reason: Prevent conflicting integrations and preserve the user's dirty working tree.
- Status: Active.

## D-004 — No retry storm
- Date: 2026-11-20
- Decision: A 429 keeps the task queued with its request ID; no unlimited retry and no replacement-agent storm.
- Evidence: Session records provide HTTP 429 and `response_too_many_failed_attempts`, but no usable `Retry-After` value or gateway headers.
- Status: Active.

## D-005 — Secret exposure incident
- Date: 2026-11-20
- Decision: The EVREN credential value must not be repeated or committed. The user should rotate it because a shell inspection accidentally displayed it in tool output.
- Status: Requires user action; this file intentionally contains no credential.
