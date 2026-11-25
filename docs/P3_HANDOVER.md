# P3 Axiom handover

**Branch:** `feat/p3-axiom-engine`
**Base:** `0cce36eed53b3e8f247dcaaf09d34828f90bc58d`
**Status:** Phase 2 hardening complete with live providers verified; Phase 3 complete; Phase 4 live + template integration; Phase 6 P3 support delivered.
**Date:** 26 November 2026 (Asia/Qyzylorda)

## What is implemented

### Phase 2

- Real `intfloat/multilingual-e5-small` ONNX embeddings, 384-d, L2 normalized, with `query:`/`passage:` prefixes and a deterministic test-only fake.
- Additive migration `200_p3_axiom_transcript.sql`: content hash, language/source, ingestion runs, audio chunk metadata, uniqueness.
- Timestamped JSON transcript ingestion through a professor-only endpoint and the `scripts/ingest_transcript.py` CLI.
- Idempotent segment upsert; duplicate chunks cannot create duplicate rows.
- Real Whisper-compatible STT adapter with multipart upload, segment timestamps, offsets, size/MIME checks and bounded retries. **Live Groq call verified.**
- Lecture-isolated hybrid retrieval: exact filtered cosine + BM25 + weighted RRF + temporal window; no HNSW assumption. Dense-only mode remains available for baseline comparison.
- Configurable OpenAI-compatible JSON LLM client with timeout, retry, concurrency, usage counters and sanitized errors. **Live DeepSeek call verified.**
- Versioned prompt files; transcript and student input are escaped and delimited as untrusted data.
- Deterministic citation, Socratic, answer-leak and groundedness checks, with optional judge.
- One stricter retry and transcript-only template fallback; `source` is explicit.
- Daily Redis generation budget per lecture; per-Replay-Token request cap; single-use signed state nonce.
- Controlled embedding prewarm with persistent model-cache mount.

### Phase 3

- MCQ shape and validation are implemented; the live/fake-LLM path can return MCQ. The offline template fallback deliberately returns a question or reflection rather than fabricating a correct-answer key.
- `POST /api/v1/replay/start`: 1-20 offsets, 20-second deduplication, signed moments, verified recap citations.
- `POST /api/v1/replay/turn`: Replay Token authorization, signed state, stage/turn transitions, bounded history, MCQ/question/reflection/refusal, single-use state nonce and per-token request cap.
- `POST /api/v1/gapcards/generate`: signed moments, verified quotes/citations, duplicate prevention, template fallback.
- No student conversation table; no individual card history server-side.

### Phase 4

- `POST /api/v1/lectures/{lecture_id}/insights/generate` (P3).
- Adapter calls P2 `InsightService.create_generated`; generated content is always `pending_approval`.
- Counts/time windows come from PostgreSQL clusters; quotes are verified.
- Handoff gets a grounded seminar task; no auto-publication.
- **Template wording** is the offline fallback; DeepSeek `deepseek-flash` live BriefNext/Handoff passed citation and grounding validation on 2026-11-26.

### Phase 6 support

- `backend/app/demo/scenarios/bernoulli_ru.json`: 40 synthetic Russian segments, 6 minutes, conceptual transition at **04:12**.
- Contract fixtures in `docs/contracts/fixtures/axiom/`.
- Offline path works with `AXIOM_LLM_PROVIDER=disabled`; no API key needed.

## API contracts

Regenerated OpenAPI: `docs/contracts/openapi.json`
Generated types: `frontend/src/lib/api/types.gen.ts`
Examples: `docs/contracts/fixtures/axiom/`

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/lectures/{lecture_id}/transcript/import` | Professor Bearer |
| POST | `/api/v1/lectures/{lecture_id}/audio-chunks` | Professor Bearer, multipart |
| GET | `/api/v1/lectures/{lecture_id}/transcript` | Professor Bearer |
| POST | `/api/v1/replay/start` | `X-Replay-Token` |
| POST | `/api/v1/replay/turn` | `X-Replay-Token` |
| POST | `/api/v1/gapcards/generate` | `X-Replay-Token` |
| POST | `/api/v1/lectures/{lecture_id}/insights/generate` | Professor Bearer |

## P1 integration

- Use the generated `types.gen.ts`; do not hand-edit it.
- Replay start only works after the lecture ends and the transcript exists.
- Send `X-Replay-Token`; never reuse a Signal Token.
- Send the latest `state_token`; do not send fabricated assistant messages as proof.
- `source` may be `live`, `prebaked` or `template`; render deterministically labelled template content appropriately.
- Replay errors: `TRANSCRIPT_REQUIRED`, `LECTURE_NOT_ENDED`, `REPLAY_STATE_INVALID`, `REPLAY_STATE_EXPIRED`, `REPLAY_COMPLETE`.
- GapCards come from signed moments; P1 owns rendering, flip UI, Leitner scheduling and local persistence.

## P2 integration

- Migration is additive `200_p3_axiom_transcript.sql`; do not rewrite Phase 1 migrations.
- `InsightService.create_generated` is the only P3 persistence adapter. It inserts `pending_approval`; P2 owns approve/edit/reject/publish.
- `InsightConcept` gained optional `citations`, window fields and `unique_signals`; `InsightTask` gained optional `grounded_in`. Existing manual payloads still serialize without these defaults.
- Shared `config.py`, `context.py`, `router.py` and contracts were touched additively.

## P4 integration

- Fixture: `backend/app/demo/scenarios/bernoulli_ru.json` (language `ru`, synthetic).
- Suggested demo offset: `252000` ms (04:12).
- Import with `scripts/ingest_transcript.py --lecture-id <uuid>`.
- Offline Replay/GapCards/BriefNext/Handoff use template sources; do not label them live.
- P4 owns the simulator, event timing and presentation; P3 provides the transcript and validated API artifacts.

## Model and runtime

- Model: `intfloat/multilingual-e5-small`
- ONNX file: `onnx/model_O4.onnx`
- Dimension: 384; cosine; normalized
- Runtime: ONNX Runtime CPU 1.32.0, tokenizers 0.23.3, huggingface-hub 1.33.0
- Cache: `backend/.model_cache/` (ignored)
- Prompt version: `p3.1`

## Verification

Run from `backend/`:

```bash
ruff check app tests
mypy app
pytest -q
```

Current result: **114 tests passed** (including existing Phase 1/2 tests), Ruff clean, mypy clean. Frontend lint, typecheck, unit tests, production build and contracts passed on the P3 branch.

AI evaluation:

```bash
python -m evals.runner
```

- 30 retrieval cases, hybrid + temporal: Recall@4 **0.8667**, MRR **0.7000** (RU 0.90/0.85; EN 0.80/0.575; KK 0.90/0.675); held-out 10: **0.90**.
- 10 original deterministic guardrails: **10/10**.
- 32 adversarial cases: **32/32** (29 deterministic, 1 fake LLM, 2 template; 0 live in this constructed suite).
- Live DeepSeek smoke: **10/10 functional checks** (RU/KK/EN, MCQ, GapCards, BriefNext, Handoff, groundedness, structured JSON); live Groq STT verified. One live transcript-injection probe passed; live adversarial sample size is **1**, not a safety benchmark.

See:
- [RETRIEVAL_BENCHMARK.md](RETRIEVAL_BENCHMARK.md)
- [GUARDRAILS_REPORT.md](GUARDRAILS_REPORT.md)
- [AI_PRODUCTION_READINESS.md](AI_PRODUCTION_READINESS.md)
- [AI_PROVIDER_SETUP.md](AI_PROVIDER_SETUP.md)

## Environment

See `.env.example` and [AI_PROVIDER_SETUP.md](AI_PROVIDER_SETUP.md). Minimum new variables:

```dotenv
AXIOM_EMBEDDING_PROVIDER=onnx_e5
AXIOM_EMBEDDING_MODEL=intfloat/multilingual-e5-small
AXIOM_EMBEDDING_CACHE_DIR=.model_cache
AXIOM_LLM_PROVIDER=disabled
AXIOM_STT_PROVIDER=disabled
AXIOM_DAILY_GENERATION_BUDGET=100
AXIOM_REPLAY_REQUESTS_PER_TOKEN=40
AXIOM_STATE_SINGLE_USE=true
AXIOM_EMBEDDING_PREWARM=false
```

## Known limitations and blockers

- Live adversarial/jailbreak sample size is **1**; functional live checks are not a safety benchmark.
- ONNX model download is 235 MB; first request is slow (cold load 4.3 s in the API, 41 s in the first instrumented run). Pre-warm at deploy time.
- Multilingual retrieval improved on the synthetic suite (KK 0.90, EN 0.80), but this is 30 project-labelled cross-lingual cases, not native EN/KK lectures. Does not establish universal quality.
- BriefNext/Handoff live wording passed on the 10-check provider smoke, but there is no live adversarial evaluation of these outputs.
- No formal red-team, no human evaluation, no real-device audio test.
- Streaming audio is not implemented; chunks are transcribed synchronously per request.
- The P3 branch was not merged to `main` at the time of writing; open PR is the review gate.

## Commit references

| Commit | Meaning |
| --- | --- |
| `0cce36e` | P3 base on `main` |
| `eaa6a40` | Embeddings, transcript ingestion, STT adapter, temporal retrieval |
| `789e74d` | Guardrails, Socratic Replay, GapCards, teacher intelligence, tests |
| `4b06410` | Evaluation suite, demo fixtures, contracts and P3 documentation |
| `e19ffef` | Scrub synthetic fixture tokens and fix the secret-scanning false positive |
| `a8eeac2` | Hybrid RAG, adversarial hardening, prewarm, replay abuse controls, provider smoke/docs |

Final branch HEAD is the latest commit on PR #2. At `e19ffef`, GitHub Actions passed backend, frontend, contract drift, secret scanning and E2E; the hardening commit is verified locally and in the follow-up CI run. No force-push or history rewrite was used.
