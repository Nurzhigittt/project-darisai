# Axiom evaluation report

**Date:** 26 November 2026
**Fixture:** `backend/app/demo/scenarios/bernoulli_ru.json` (40 synthetic Russian segments)
**Embedding:** `intfloat/multilingual-e5-small`, `onnx/model_O4.onnx`, 384-d, L2
**Runner:** `cd backend && python -m evals.runner` and `python -m evals.adversarial`

## Result summary

| Suite | Cases | Result | Layer |
| --- | ---: | ---: | --- |
| Hybrid retrieval | 30 | Recall@4 **0.8667**, MRR **0.7000** | real embeddings |
| Original guardrails | 10 | 10/10 | deterministic |
| Hardening adversarial | 32 | 32/32 | 29 deterministic + 1 fake LLM + 2 template |
| Live LLM functional checks | **10** | **10/10 live source** | DeepSeek `deepseek-flash` |
| Live Whisper | **1** | provider call succeeded | Groq `whisper-large-v3-turbo` |
| Live adversarial safety | **1** | **1/1 transcript injection** | not a safety benchmark |

The 32/32 adversarial result is **not** evidence of live-model prompt-injection
resistance. It measures the deterministic guards, prompt serialization, and
fallback pipeline. The 10 live functional checks confirm provider wiring and
validation; they are not a safety benchmark.

## Live provider verification

**DeepSeek `deepseek-flash` and Groq `whisper-large-v3-turbo` were called live.**

Raw result: `artifacts/evals/hardening/live-provider-smoke.json`.

| Check | Result | Source |
| --- | --- | --- |
| Structured JSON | pass | live |
| RU Socratic | pass, 2 citations, grounded 1.0 | live |
| KK Socratic | pass, 2 citations, grounded 0.8 (citation-anchored) | live |
| EN Socratic | pass, 2 citations, grounded 0.8 (citation-anchored) | live |
| MCQ | pass, 4 options, 2 citations | live |
| GapCards | pass, 3 cards, verified citations | live |
| BriefNext | pass, 2 concepts, grounded 1.0 | live |
| Handoff | pass, 2 concepts + task, grounded 1.0 | live |
| Groundedness judge | score 1.0 | live |
| Timestamped Groq STT | pass, 1 segment, 4.93 s audio | live |

Live LLM latency: p50 **3.15 s**, p95 **6.09 s**. STT latency: **1.74 s**.
One transient failure occurred across 10 LLM calls; the retry/fallback policy
still returned validated output. The Groq transcript from synthetic Windows TTS
was inaccurate (“press refalls… neuro pipe”); this verifies the call path, not
audio quality.

DeepSeek reasoning was disabled for JSON calls (`AXIOM_LLM_DISABLE_THINKING=true`),
otherwise reasoning tokens consumed the output cap and returned empty JSON.

A single live transcript-injection probe (`artifacts/evals/hardening/live-adversarial.json`)
returned `source=live`, `answer_leak=false`, `citations_ok=true`. This is one
sample and must not be reported as general prompt-injection resistance.

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
- **Live adversarial LLM (1):** transcript injection was treated as data; no answer leak, citations valid. This is one probe, not a red-team.

## Original guardrail suite

10/10 deterministic cases passed: valid/fabricated citations, timestamp mismatch,
direct-answer EN/RU, clean question, transcript escaping, grounded claim, valid
MCQ. This suite is retained for regression.

## Provider verification

Live verification is recorded above and in
`artifacts/evals/hardening/live-provider-smoke.json`.

- DeepSeek: `https://api.deepseek.com`, `deepseek-flash`; live structured JSON,
  RU/KK/EN Socratic, MCQ, GapCards, BriefNext, Handoff and groundedness passed.
- Groq: `https://api.groq.com/openai/v1`, `whisper-large-v3-turbo`; live
  timestamped transcription passed.
- Credentials were supplied only through process environment variables and were
  not written to Git.
- The old `deepseek-chat` identifier is retired and is no longer the default.

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
| LLM / STT latency | 3.15/6.09 s p50/p95; STT 1.74 s |

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
- Only one live transcript-injection probe was run. There is no broad live
  prompt-injection, toxicity, refusal-quality or jailbreak-resistance benchmark.
- No human evaluation, red-team, penetration test, or provider retention review.
- The Axiom system is **not hallucination-proof**.
