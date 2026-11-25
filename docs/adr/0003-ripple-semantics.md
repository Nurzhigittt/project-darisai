# ADR-003: Deterministic Ripple and conservative small groups

**Status:** Accepted · 25 November 2026

## Context

The specified Ripple algorithm uses a sliding window, a minimum threshold and EWMA smoothing. Two ambiguity risks emerged:

1. Low or absent signals could be read as universal understanding.
2. Rooms with fewer than three active participants cannot satisfy `max(3, …)`.

## Decision

- Compute on a fixed 250 ms cadence, independent of message arrival.
- Use a 20 s unique window and 60 s heartbeat-active set.
- Threshold `max(3, ceil(0.15 × active))`; raw intensity `min(1, unique / (2×threshold))`.
- EWMA α = 0.4 for display and release hysteresis.
- Threshold crossings use raw intensity with an EWMA floor of 0.35 so an exact 0.5 intensity can form a cluster.
- Never create a persisted cluster when `active < 3`; label as insufficient participation.
- Silence is always `few_signals`, never understanding.
- Enforce a 500 ms minimum broadcast spacing and send only on state change or intensity delta ≥ 0.02.

## Consequences

- The engine is pure and unit-testable without a browser or LLM.
- Very small classes receive no cluster analytics; this is intentionally conservative.
- Intensity is a signal-density measure, not a comprehension score.
