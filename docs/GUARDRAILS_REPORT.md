# Axiom evaluation report

**Date:** 25 November 2026 (Asia/Qyzylorda)  
**Fixture:** `backend/app/demo/scenarios/bernoulli_ru.json` (40 synthetic Russian segments)  
**Model:** `intfloat/multilingual-e5-small`, `onnx/model_O4.onnx`, 384-d, L2 normalized  
**Raw result:** `artifacts/evals/eval-20261125T180048Z.json`  
**Runner:** `cd backend && python -m evals.runner`

## What was measured

This report separates three things that must not be combined into one “AI accuracy” number:

1. **Real embedding retrieval** on 30 manually labelled synthetic cases.
2. **Deterministic guardrail checks** on constructed citation/leak/MCQ examples.
3. **Unverified live generation** — no LLM or Whisper credentials were available, so no live-model quality claim is made.

The retrieval metric is exact in-memory cosine, not the PostgreSQL query path. That keeps this suite independent of database state, but it is a retrieval-quality test, not an end-to-end latency test.

## Retrieval Recall@4 and MRR

**30 cases, overall Recall@4 = 0.600, MRR = 0.4819**

| Language | Cases | Recall@4 | MRR |
| --- | ---: | ---: | ---: |
| Russian | 10 | **0.900** | **0.8091** |
| English (against Russian transcript) | 10 | **0.600** | **0.3815** |
| Kazakh (against Russian transcript) | 10 | **0.300** | **0.2550** |

### Interpretation

- Russian queries are the strongest: 9/10 cases put a relevant segment in the top 4.
- Cross-lingual English is partial: 6/10; Kazakh is weak: 3/10.
- This contradicts any assumption that “multilingual” means equally good in RU/EN/KK.
- The main misses were conceptual paraphrases (`assumptions of Bernoulli`, `suction`, `equal transit time`, `lift`, `Pitot`, `viscosity`). The model often retrieves adjacent lecture content rather than the exact labelled segment.
- A full-precision `onnx/model.onnx` run produced **identical** Recall@4/MRR on this suite, so quantization is not the cause of these misses.

### Known retrieval misses

| Case | Query | Relevant | Top-4 result |
| --- | --- | --- | --- |
| ret-05 | Какие допущения используются в уравнении Бернулли? | 12, 13 | 27, 39, 16, 35 |
| ret-15 | assumptions of the Bernoulli equation | 12, 13 | 39, 27, 35, 0 |
| ret-17 | is low pressure the same as suction | 17, 19, 20 | 7, 39, 10, 30 |
| ret-18 | equal transit time fallacy for lift | 25, 26 | 37, 12, 13, 39 |
| ret-19 | lift from downwash and circulation | 24, 26 | 30, 18, 31, 0 |
| ret-21 | неге қысым азаяды | 10, 11, 15 | 7, 32, 18, 9 |
| ret-22 | Бернулли теңдеуінің шарттары | 12, 13 | 35, 27, 11, 39 |
| ret-23 | ағын үзіліссіздігі | 6, 8 | 21, 12, 18, 32 |
| ret-27 | сорғыш құбыр | 32, 33 | 12, 18, 21, 36 |
| ret-28 | Пито түтігі | 34 | 33, 0, 18, 21 |
| ret-29 | тұтқырлық әсері | 29, 39 | 36, 18, 30, 21 |
| ret-30 | Бернулли қорытындысы | 37, 38 | 35, 0, 11, 39 |

The production path adds the ±90 s temporal window, which often recovers the relevant lecture moment even when global semantic ranking misses it. The 0.600 figure is therefore a **lower-bound semantic retrieval metric**, not the full Replay retrieval path.

## Guardrails

**10/10 constructed deterministic cases passed.** These are not live model outputs.

| Check | Cases | Result |
| --- | ---: | --- |
| Valid citation canonicalized | 1 | pass |
| Fabricated segment ID rejected | 1 | pass |
| Fabricated quote rejected | 1 | pass |
| Timestamp outside segment rejected | 1 | pass |
| Direct answer detected (EN) | 1 | pass |
| Direct answer detected (RU) | 1 | pass |
| Clean Socratic question not flagged | 1 | pass |
| Transcript injection is escaped as data | 1 | pass |
| Grounded transcript answer ≥ 0.8 | 1 | pass |
| Valid MCQ structure | 1 | pass |

### What this does **not** prove

- It does not prove that a live LLM will resist prompt injection. The transcript is escaped and separated, but no live adversarial model run was performed.
- It does not prove citation **support**; it proves that a quote exists in the cited segment and that the segment was retrieved.
- The groundedness score is a token-overlap heuristic unless a live judge is configured. No live judge was verified.
- The deterministic 10/10 result must not be reported as a 100% live guardrail pass rate.

## Performance

Measured on the local Windows CPU environment with the model cached:

| Measurement | Result |
| --- | ---: |
| Embedding model load + warm-up (cached) | 5.25 s |
| First instrumented cold load/run | 41.23 s |
| 40 passage embeddings (batch 16) | 0.912 s |
| Temporal retrieval p50 | 18.69 ms |
| Temporal retrieval p95 | 26.48 ms |
| Replay start p50 / p95 | 17.5 / 132.8 ms |
| Replay turn, cold (first request after model load) | 4.30 s |
| Replay turn, warm p50 / p95 | 34.5 / 37.4 ms |
| Live LLM latency | **unverified** |
| Live Whisper latency | **unverified** |

The first AI request after process start is slow because the ONNX model loads lazily. The correct response is to warm the embedding provider explicitly at deployment startup, or accept a one-time cold request. This was not changed in the Phase 1 hot path.

## Limitations

- 30 retrieval cases with labels authored by the project, not independent annotators. The labels are narrow and can understate temporal retrieval.
- The fixture is synthetic and Russian-only; English/Kazakh queries are evaluated cross-lingually against a Russian lecture.
- No live LLM or STT call; `source=live` is implemented but unverified.
- No human evaluation, no formal red-team, no interoperability test with P1 screens.
- The 95% guardrail target is an engineering goal, not achieved or claimed for live generation. Deterministic checks pass, but they cover constructed cases.
