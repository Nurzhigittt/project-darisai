# ADR-005: Redis Pub/Sub fan-out with a single-worker evaluator

**Status:** Accepted · 25 November 2026

## Context

Ripple updates need lecture-level fan-out without coupling the WebSocket handler to every professor connection. The spec allows one Redis instance and explicitly rules out Redis Cluster.

## Decision

- Publish every `ripple_update` and `lecture_state` event on `daris:lecture:{lecture_id}`.
- Each API process subscribes with a pattern and dispatches only to its local connections.
- The evaluator runs on a fixed cadence, uses a short Redis lock per lecture and mirrors its state to Redis.
- The supported Phase 1 deployment is one API worker.
- WebSocket credentials travel in the hello payload, never in the URL.
- A connection registry tracks connection/role/lecture, and ending a lecture closes students with 4409.

## Consequences

- No direct in-process coupling between evaluator and WebSocket routes.
- Multiple workers can fan out events, but evaluator state is not yet fully distributed; scaling out requires a lease/ownership design or a dedicated evaluator worker.
- Pub/Sub is best-effort; the cached snapshot lets a reconnecting professor recover the last state.
