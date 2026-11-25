# ADR-002: Separate Signal and Replay token scopes

**Status:** Accepted · 25 November 2026

## Context

The specification's single blind token hash expires roughly 15 minutes after a lecture, yet future post-lecture learning requires access later. Reusing a live-participation credential for replay would grant excessive authority and create a confusing lifecycle.

## Decision

Issue two HMAC-signed credentials at join time:

- **Signal Token:** `scp=signal`, 4-hour default TTL. The server stores only its SHA-256 hash in Redis. It authorizes student WebSocket hello and live signals.
- **Replay Token:** `scp=replay`, 24-hour default TTL. It is stateless and never stored in PostgreSQL. It cannot authorize live signals or professor operations; future replay endpoints must explicitly validate it.

Both carry `lecture_id`, issue time, expiry and a unique token ID. Validation checks signature, expiry, scope and lecture. No student account or identity record is created.

## Consequences

- A long lecture may require rejoin after the Signal Token expires.
- Token theft has a bounded blast radius but is still pseudonymous impersonation.
- No revocation list is needed for Replay Tokens because no replay endpoints exist yet; future endpoints must add misuse controls.
- Tests cover scope separation, expiry, tampering and cross-lecture use.
