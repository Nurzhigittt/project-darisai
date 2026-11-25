# Roadmap

Status is honest and reflects this repository, not a pitch deck.

## Phase 0 — Engineering Foundation

**Status: COMPLETE (local verification), with Docker/remote-CI unverified.**

- Monorepo, typed config, FastAPI lifecycle, async PostgreSQL and Redis.
- SQL migrations, pgvector, privacy allowlist and manifest.
- Contract export, generated TypeScript, CI workflows.
- Design system, EN/RU/KK, PWA shell, accessibility foundations.
- Backend/frontend tests and production build.

Environment limitation: Docker was not installed and remote GitHub Actions were not executed here.

## Phase 1 — Signal & Ripple

**Status: COMPLETE as a working vertical slice, with documented limitations.**

- Professor invite auth and lecture lifecycle.
- Anonymous join, QR URL, scoped Signal/Replay tokens.
- Authenticated WebSocket gateway, atomic signal processing, cooldown, idempotency.
- Deterministic Ripple, clusters, aggregates and factual summary.
- Student local history, post-lecture states, PWA.
- E2E workflow, 300-client load test and reconnect/duplicate probes.

Known limitations: one API worker, no join-code rotation UI, no full manual accessibility audit, Docker/remote CI unverified.

## Phase 2 — Axiom & Temporal RAG

**Status: NOT STARTED. Interfaces and schemas only.**

Planned:

- Fake/deterministic LLM + provider adapter behind `LLMClient`.
- Transcript ingestion from a pre-recorded lecture.
- Embedding provider and 384-dim pgvector retrieval.
- Temporal window [−90 s, +10 s], top-k = 4, strict lecture filter.
- Citation validator, answer-leak and groundedness validators.
- Deterministic template fallback and feature flags.
- Evals for jailbreak, out-of-lecture, citation and injection cases.
- No student-visible generation until evals and teacher approval are real.

## Phase 3 — Socratic Replay & GapCards

**Status: NOT STARTED.**

Stateless Replay using the Replay Token and local offsets; MCQ/question/refusal turns; citation chips; local Leitner GapCards; Anki export.

## Phase 4 — BriefNext & Handoff

**Status: NOT STARTED.**

Teacher-approved insights, pending/approved/published states, magic-link Handoff, edit/reject reasons.

## Phase 5 — Cohort Memory & Staged Autonomy

**Status: NOT STARTED.**

Synthetic cohort tables exist but no live UI; autonomy policy, 30-day approval display, structural-gap detection, dean report.

## Phase 6 — Judge Demo

**Status: NOT STARTED.**

Prebaked transcript fixtures, deterministic 40-bot scenario, Inspector, 90-second split-screen. Only after Phases 2–4 are real.

## Phase 7 — Security, Performance & Release

**Status: PARTIAL FOUNDATIONS.**

Done: threat model, token isolation, logs, rate limits, 300-client load test, CI definitions.
Remaining: Docker verification, remote CI, external penetration test, full axe/screen-reader pass, cloud deployment, secret rotation runbook, SLOs.
