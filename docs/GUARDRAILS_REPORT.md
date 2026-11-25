# Axiom evaluation report

**Date:** 25 November 2026
**Fixture:** `backend/app/demo/scenarios/bernoulli_ru.json` (40 synthetic Russian segments)
**Embedding:** `intfloat/multilingual-e5-small`, `onnx/model_O4.onnx`, 384-d, L2
**Runner:** `cd backend && python -m evals.runner` and `python -m evals.adversarial`

## Result summary

| Suite | Cases | Result | Layer |
| --- | ---: | ---: | --- |
| Hybrid retrieval | 30 | Recall@4 **0.8667**, MRR **0.7000** | real embeddings |
| Original guardrails | 10 | 10/10 | deterministic |
| Hardening adversarial | 32 | 32/32 | 29 deterministic + 1 fake LLM + 2 template |
| Live LLM safety | **0** | **not run** | no credentials |
| Live Whisper | **0** | **not run** | no credentials |

The 32/32 adversarial result is **not** evidence of live-model prompt-injection
resistance. It measures the deterministic guards, prompt serialization, and
fallback pipeline. No live LLM was called.

## Retrieval

See [RETRIEVAL_BENCHMARK.md](RETRIEVAL_BENCHMARK.md) for the full method comparison.

| Method | Recall@4 | MRR |
| --- | ---: | ---: |
| Dense baseline (corrected labels) | 0.700 | 0.5722 |
| Lexical BM25 | 0.800 | 0.7222 |
| Hybrid RRF | 0.8667 | 0.6222 |
| **Hybrid + temporal RRF** | **0.8667** | **0.7000** |

Per language for the selected method: RU **0.90**, EN **0.80**, KK **0.90**.
Held-out split (10 cases): Recall@4 **0.90**.

The previous report's 0.600/0.4819 baseline used labels with off-by-one segment
indices; those labels were corrected before this comparison. The previous number
should not be compared as if it were measured on the same labels.

## Adversarial suite

Raw result: `artifacts/evals/hardening/adversarial.json`.

| Category | Cases | Passed |
| --- | ---: | ---: |
| Citation integrity | 7 | 7 |
| Answer leakage | 8 | 8 |
| Groundedness | 2 | 2 |
| MCQ structure | 2 | 2 |
| Socratic structure | 2 | 2 |
| Prompt injection / role manipulation | 8 | 8 |
| Provider timeout / fabricated live citation | 2 | 2 |
| Signed-state tampering | 1 | 1 |

Coverage includes fabricated segment IDs, wrong timestamps, empty/overlong
quotes, cross-lecture segments, direct answer requests in EN/RU/KK, homework
completion, final-answer phrasing, base64-encoded answer leakage, MCQ duplicate
options/too-few options/answer-key wording, missing question marks, short
reflections, hidden system-prompt requests, transcript injection, history
escaping, provider timeout, fabricated live citations, student injection
refusal and state tamper.

### What was actually exercised

- **Deterministic (29):** citation validator, leak rules, base64 decode, MCQ and
  Socratic structure, grounding heuristic, ingestion/prompt escaping, state HMAC.
- **Fake LLM (1):** a malicious/fabricated live citation is rejected and falls
  back to template.
- **Template (2):** provider timeout and student instruction-manipulation refusal.
- **Live LLM (0).**

## Original guardrail suite

10/10 deterministic cases passed: valid/fabricated citations, timestamp mismatch,
direct-answer EN/RU, clean question, transcript escaping, grounded claim, valid
MCQ. This suite is retained for regression.

## Provider verification

`artifacts/evals/hardening/provider-smoke-blocked.json`:

- LLM: blocked — no `AXIOM_LLM_API_KEY` / `DEEPSEEK_API_KEY`.
- STT: blocked — no `AXIOM_STT_API_KEY` / `GROQ_API_KEY`.
- No live structured JSON, RU/KK/EN Socratic, MCQ, GapCards, BriefNext/Handoff,
  groundedness or timestamped transcription was executed.
- Required variables are listed in [AI_PROVIDER_SETUP.md](AI_PROVIDER_SETUP.md).
- The current DeepSeek model identifier was checked against the provider docs:
  `deepseek-flash`; the old `deepseek-chat` is retired.
- Groq's current STT endpoint/model were checked: `whisper-large-v3-turbo`.

## Performance

| Measurement | Result |
| --- | ---: |
| Model load direct | 5.25 s |
| API prewarm ready | 12.30 s |
| Cold Replay turn | 3,870 ms |
| Warm Replay turn p50 / p95 | 26.0 / 106.9 ms |
| AI requests during 30-client load p50 / p95 | 32.6 / 101.6 ms |
| 30-client Signal-to-Ripple p95 under AI load | 491.84 ms |
| 30-client ack p95 | 9.99 ms |
| AI workload errors | 0 |
| API working set after model load | ~694 MB |
| LLM / STT latency | unverified |

Raw result: `artifacts/evals/hardening/performance.json`.

## Known failures and limitations

- Retrieval misses remain for `ret-10` (Bernoulli limitations), `ret-12`
  (molecular collisions), `ret-17` (suction), `ret-27` (Kazakh aspirator).
- 30 queries, synthetic labels, one Russian corpus; no independent annotators.
- English/Kazakh are cross-lingual queries over a Russian transcript, not native
  EN/KK lectures.
- Groundedness is a token-overlap heuristic unless a live judge is configured;
  it is not entailment.
- Citation validation proves existence/attribution, not that the quote supports
  the whole claim.
- No live model means no live prompt-injection, toxicity, refusal-quality or
  multilingual generation result.
- No human evaluation, red-team, penetration test, or provider retention review.
- The Axiom system is **not hallucination-proof**.
