# AI production readiness

**Date:** 25 November 2026
**Scope:** P3 Axiom embedding/retrieval/generation runtime.
**Deployment status:** not deployed. Docker was unavailable; this document records local production-shape measurements and the required deployment controls.

## Readiness summary

| Area | State |
| --- | --- |
| Embedding runtime | **Ready** — real ONNX E5, 384-d, cached |
| Hybrid retrieval | **Ready** — dense + BM25 + RRF + temporal; see benchmark |
| LLM provider adapter | **Implemented, unverified live** — no credentials |
| Whisper STT adapter | **Implemented, unverified live** — no credentials |
| Template fallback | **Ready** — offline demo path |
| Model prewarm | **Implemented** — `AXIOM_EMBEDDING_PREWARM=true` |
| Abuse/cost controls | **Implemented locally** — Redis token limit, single-use state, daily budget |
| Observability | `/api/v1/status` shows embedding readiness and LLM usage counters |
| Production deployment | **Not verified** |

## Required environment

```dotenv
ENVIRONMENT=production
APP_BASE_URL=https://<app-host>
CORS_ORIGINS=https://<app-host>
WS_ALLOWED_ORIGINS=https://<app-host>

AXIOM_EMBEDDING_PROVIDER=onnx_e5
AXIOM_EMBEDDING_MODEL=intfloat/multilingual-e5-small
AXIOM_EMBEDDING_ONNX_FILE=onnx/model_O4.onnx
AXIOM_EMBEDDING_CACHE_DIR=/var/cache/daris/model
AXIOM_EMBEDDING_PREWARM=true
AXIOM_EMBEDDING_BATCH_SIZE=16
AXIOM_EMBEDDING_CONCURRENCY=2

AXIOM_RETRIEVAL_MODE=hybrid
AXIOM_RETRIEVAL_TOP_K=4
AXIOM_DENSE_CANDIDATES=16
AXIOM_LEXICAL_CANDIDATES=16
AXIOM_RRF_K=60
AXIOM_BEFORE_MS=90000
AXIOM_AFTER_MS=10000
AXIOM_SIMILARITY_FLOOR=0.78

# Set only with verified provider credentials. Keep out of Git.
AXIOM_LLM_PROVIDER=openai_compatible
AXIOM_LLM_BASE_URL=https://api.deepseek.com
AXIOM_LLM_API_KEY=<secret>
AXIOM_LLM_MODEL=deepseek-flash
AXIOM_LLM_TIMEOUT_SECONDS=8
AXIOM_LLM_MAX_RETRIES=1
AXIOM_LLM_CONCURRENCY=2

AXIOM_STT_PROVIDER=openai_compatible
AXIOM_STT_BASE_URL=https://api.groq.com/openai/v1
AXIOM_STT_API_KEY=<secret>
AXIOM_STT_MODEL=whisper-large-v3-turbo
AXIOM_STT_TIMEOUT_SECONDS=90
AXIOM_STT_MAX_FILE_BYTES=26214400

AXIOM_DAILY_GENERATION_BUDGET=100
AXIOM_REPLAY_REQUESTS_PER_TOKEN=40
AXIOM_STATE_SINGLE_USE=true
AXIOM_REPLAY_MAX_TURNS=6
```

DeepSeek model/base identifiers were checked against the current [DeepSeek API docs](https://api-docs.deepseek.com/): `deepseek-flash` and `https://api.deepseek.com`. Groq STT model/endpoint were checked against the [Groq speech-to-text docs](https://console.groq.com/docs/speech-to-text): `whisper-large-v3-turbo` and `https://api.groq.com/openai/v1`. Neither provider was called live because no API key was present.

## Model cache and prewarm

- The ONNX artifact is downloaded lazily to `AXIOM_EMBEDDING_CACHE_DIR` (default `.model_cache/`, ignored by Git).
- `AXIOM_EMBEDDING_PREWARM=true` loads the model once during application lifespan. If prewarm fails, the app logs a warning and remains available with lexical/temporal retrieval.
- Mount the cache on a persistent volume in Docker/host deployment so restarts do not re-download 235 MB.
- `/api/v1/status` reports `Axiom embedding` and its model identifier. Before first use it is `degraded` with `lazy, not loaded`; after prewarm/first use it is `available`.
- Model inference runs in a worker thread; it never blocks the event loop. Concurrency is bounded by `AXIOM_EMBEDDING_CONCURRENCY`.

## Measured performance

Local Windows CPU, one Uvicorn worker, model cached:

| Measurement | Result |
| --- | ---: |
| Direct model load + warm-up | 5.25 s |
| API prewarm readiness (including app startup) | 12.30 s |
| 40 passage embeddings | 0.912 s |
| Cold Replay turn (lazy load) | 3,870 ms |
| Warm Replay turn p50 / p95 | 26.0 / 106.9 ms |
| AI requests during 30-client load p50 / p95 | 32.6 / 101.6 ms |
| 30-client Signal-to-Ripple p95 during AI workload | 491.84 ms |
| 30-client ack p95 | 9.99 ms |
| AI workload errors | 0 |
| API working set after model load | ~694 MB |
| LLM / STT latency | **unverified** |

The realtime path was not modified. The 300-client Phase 1 baseline (493.25 ms p95) and the 30-client run under AI load (491.84 ms p95) are close; this is a spot check, not proof of no regression under all conditions.

Raw measurement: `artifacts/evals/hardening/performance.json`.

## Abuse and cost controls

- `AXIOM_DAILY_GENERATION_BUDGET` — per-lecture Redis INCR, 24 h TTL, HTTP 429.
- `AXIOM_REPLAY_REQUESTS_PER_TOKEN` — per Replay Token request counter, 24 h TTL, HTTP 429. A Replay Token is pseudonymous, not a unique person.
- `AXIOM_STATE_SINGLE_USE=true` — signed state nonce is atomically consumed in Redis; a replay returns `REPLAY_STATE_REPLAYED`.
- LLM concurrency, embedding concurrency, history/input/context/output limits, audio size/MIME limits.
- LLM token usage is exposed as `axiom_llm_usage` in `/api/v1/status`; this is usage accounting, not billed cost.
- **No monetary cost estimate is reported.** No live provider usage or verified pricing was collected.

## Degraded behavior

| Failure | Behavior |
| --- | --- |
| Model download/load fails | Status degraded; lexical/temporal retrieval; ingestion stores text without vectors and marks run degraded |
| LLM disabled/no key | Template responses, `source=template` |
| LLM timeout/invalid JSON | One retry, then template |
| Redis unavailable | AI request controls fail closed; Signal/Ripple readiness reports degraded |
| Provider outage | Template/refusal path; no fabricated live label |

## Deployment checklist

1. Set `ENVIRONMENT=production`; strong `JWT_SECRET`, `TOKEN_SIGNING_SECRET`, `RATE_LIMIT_SECRET`.
2. Set `AUTO_SEED=false`, `RUN_MIGRATIONS=false` (run migrations as a release step).
3. Mount model cache; set `AXIOM_EMBEDDING_PREWARM=true`.
4. Set only verified provider credentials; run `python scripts/verify_ai_providers.py`.
5. Run a real STT sample through `POST /api/v1/lectures/{id}/audio-chunks`.
6. Confirm `/api/v1/status` embedding `available`, no `axiom_llm_usage` errors.
7. Confirm `pending_approval` for generated insights; never auto-publish.
8. Run `pytest`, `pnpm e2e`, contract drift and secret scanning.
9. Keep one API worker unless evaluator ownership is implemented.

## Known blockers

- No DeepSeek/Groq/OpenAI credentials in this environment; **live LLM/STT verification is blocked**, not passed.
- No Docker/cloud deployment test.
- Model is 235 MB; cold start/prewarm is operationally significant.
- `deepseek-flash` is the current documented model at the time of writing; provider model names can change. Re-verify at deployment.
- Public demo still needs a per-token/lecture budget review by P2/P4 before exposure.
