# ADR-001: Modular monolith with explicit realtime boundary

**Status:** Accepted · 25 November 2026

## Context

DärisAI needs a fast, reproducible Phase 1 vertical slice with REST, WebSockets, PostgreSQL and Redis. The specification explicitly excludes Kubernetes, Kafka and unnecessary microservices.

## Decision

Use a single FastAPI application with internal modules:

- `api/` — versioned REST endpoints.
- `realtime/` — WebSocket gateway, signal processing, Ripple engine, Pub/Sub.
- `services/` — auth, lectures, tokens, analytics, privacy.
- `axiom/` — typed future interfaces with no provider calls.
- `schemas/` — the single contract source.

Use Next.js as one web application with route groups rather than a separately deployed design system.

## Consequences

- One Docker image for API and migration runner; one for web.
- Tests can exercise the real pipeline without service stubs.
- Scaling requires splitting the evaluator before splitting CRUD.
- Module boundaries are enforced by review and imports, not network calls.
