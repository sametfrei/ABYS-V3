# EVREN Capacity Diagnosis

Observed: 2026-11-20. This file separates measured facts from unavailable gateway evidence.

## Fresh quota response

`GET /v1/quota?model=deepseek-v4.1-flash` and `GET /v1/quota?model=glm-5.3` both returned HTTP 200:

| Field | Value |
|---|---:|
| `used_tokens` | 0 |
| `cap` | 2,500,000 |
| `window_minutes` | 5 |
| `usage_ratio` | 0.0 |
| `daily_used_tokens` | 4,140,433 |
| `daily_limit_tokens` | 15,000,000 |
| `daily_remaining_tokens` | 10,859,567 |
| `concurrent_requests` | 0 |
| `concurrency_limit` | 8 |
| `model_concurrent_requests` | 0 |
| `model_concurrency_limit` | 2 |
| `fair_share_active` | true |

The historical `3,216` five-minute figure was a transcription error; the source / user snapshot was `32,160`. The fresh authoritative observation is `0` used after the current window reset, with a `2,500,000` cap.

## 429 evidence

Codex session logs contain real HTTP 429 failures with `codex_error_info.response_too_many_failed_attempts.http_status_code = 429`. Examples:

- `bafaa582-395b-4aa9-8868-cb695c82ffe1`
- `f48e3f4b-d59f-4606-b6eb-03b8ef75780d`
- `14599560-41cb-455b-b6cc-903c9dcd9981`

Peirce's 429 occurred after a long analysis turn while trying to continue the Bitrix24 task; no Bitrix24 production files changed. The stored error body does not include `Retry-After`, `error.evren.resets_at` or `suggested_models`, and gateway response headers are not present in the Codex session records.

## Conclusion

- Daily quota is not exhausted: 10,859,567 tokens remain.
- The five-minute token window is not exhausted in the fresh observation.
- Account concurrency is not exhausted.
- The model-specific limit is 2; this is the binding capacity for DeepSeek.
- We cannot prove from local session logs alone whether a specific 429 was caused only by model concurrency, fair-share scheduling, request duration, or a gateway-side condition. Gateway logs/headers are unavailable.

Safe operating capacity: **two primary founders, no additional model-active agents**. A third responsibility stays queued. No retry storm is permitted.
