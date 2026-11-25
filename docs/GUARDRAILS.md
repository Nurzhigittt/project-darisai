# Axiom guardrails

Axiom is **not** hallucination-proof. It is a layered system that refuses or falls back when checks fail. This document records controls and limitations; measured results belong in [GUARDRAILS_REPORT.md](GUARDRAILS_REPORT.md).

## Threat model

| Threat | Control |
| --- | --- |
| Prompt injection in transcript | Transcript is serialized as escaped `<segment>` data, never concatenated into system instructions |
| Prompt injection in student text/history | Delimited, escaped, bounded, treated as untrusted; assistant history is not trusted as proof |
| Fabricated citation | Deterministic segment/lecture/timestamp/substring validation |
| Direct answer / homework completion | Rule + structural leak checks, optional judge, Socratic prompt |
| Cross-lecture access | Every SQL query filters `lecture_id`; moment/state tokens bind lecture |
| Signal Token used for Replay | Separate scope check; Replay requires `X-Replay-Token` with replay scope |
| State tampering | HMAC-signed `mom1`/`sst1` tokens; lecture/moment/stage/turn/expiry checked |
| Unbounded cost | Context/output limits, concurrency semaphores, per-lecture daily Redis budget, 429 |
| Raw audio retention | Audio is held in memory for the provider request; only metadata/hash is stored |
| Student identity leakage | No student table, no conversation table, no prompt/response logging |
| Provider credential leakage | Keys only in env; sanitized provider errors; never returned to clients |

## Deterministic checks

- **Schema:** Pydantic models with `extra="forbid"`; enum and length checks; MCQ option structure.
- **Citations:** canonical transcript segment must exist in the supplied context; timestamps must fall inside it; normalized quote must be a substring.
- **Socratic behavior:** allowed kinds only; a question must actually ask a question; MCQ options must be unique/nonempty; no answer-key option.
- **Answer leakage:** patterns for English/Russian/Kazakh direct answers plus structural checks. This is deliberately not just a keyword list, but it is still fallible.
- **Groundedness:** deterministic content-token overlap between answer and supplied evidence. Optional bounded LLM judge lowers the score; the result is a review signal, not proof.
- **Retrieval floor:** a configurable cosine floor rejects weak semantic candidates. `evidence_sufficient=false` produces a refusal, not a generated answer.

## Retry and fallback

- Maximum one stricter retry by default (`AXIOM_LLM_MAX_RETRIES=1`).
- Timeout default 8 s, output cap 1,200 tokens, concurrency 2.
- Validated live output is labelled `source=live`.
- A deterministic quote-based response is labelled `source=template`.
- A malformed response is never shown as live; it falls back or refuses.

## Known limitations

- The deterministic groundedness score is a heuristic, not entailment.
- Leak detection can miss a novel paraphrased answer; the optional judge is not configured or verified live.
- Citation validation confirms that a quote exists and is attributed; it does not prove that the quote supports the whole claim.
- Prompt injection resistance is not formally proven. The transcript is data, but a sufficiently capable model can still be influenced.
- Cross-lingual retrieval quality is uneven (see report). The model is multilingual, not equally strong in RU/EN/KK.
- No formal red-team, penetration test or live-model safety evaluation was completed.
- No per-user budget; the budget is lecture-scoped and can be reset by a professor creating a new lecture.
- State tokens are signed, not encrypted. They contain lecture/moment references, not secrets.
