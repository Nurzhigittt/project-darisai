# ADR-007: Axiom interfaces and honest AI safety

**Status:** Accepted · 25 November 2026

## Context

The future Axiom experience depends on transcript-grounded retrieval, citation checks, question-only Socratic output, answer-leak detection and groundedness checks. The specification's claim that this makes hallucination impossible is not credible. Phase 1 must not pretend the AI exists.

## Decision

- Define typed interfaces for `LLMClient`, `EmbeddingProvider`, `TranscriptProvider`, `TemporalRetriever`, `CitationValidator`, `GroundednessValidator`, `AnswerLeakValidator`, `SocraticEngine`, `IntelligenceGenerator` and `AutonomyPolicy`.
- Define shared domain models for transcripts, citations, context, turns, validation, GapCards and insights.
- Call no LLM or embedding provider in Phase 1.
- Plan temporal retrieval at [offset − 90 s, offset + 10 s], top-k = 4, strictly filtered by lecture.
- Treat transcripts as untrusted data in future prompts.
- Require one strict retry, then deterministic template fallback.
- Use risk-reduction language: validation and teacher approval reduce risk; they do not guarantee truth.
- Keep generated insights in `pending_approval` by default.

## Consequences

- The Phase 1 product has no provider cost and starts without API keys.
- Phase 2 can implement providers behind stable interfaces without changing the Ripple pipeline.
- Safety tests and provider-backed evals remain future work.
