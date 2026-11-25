# ADR-009: Stateless signed Replay state

**Status:** Accepted  
**Date:** 25 November 2026

## Context

Socratic Replay needs to remember the lecture, moment, stage and turn without
creating a student conversation table. The privacy model forbids persistent
student profiles and individual dialogue history.

## Decision

Use two HMAC-signed opaque tokens:

- `mom1.*` binds lecture, offset, time window, concept and expiry.
- `sst1.*` binds lecture, moment, stage, turn and expiry.

The Replay Token remains the separate authorization credential. The client sends
the latest state token on every turn. Server-authoritative progress is the signed
turn/stage, not client history. History is bounded, escaped and treated as
untrusted.

## Consequences

- No server-side student conversation storage; no cleanup job.
- Tokens are signed, not encrypted; contents are not secrets.
- A copied state token can be replayed within its short lifetime. This is a
  deliberate MVP tradeoff; nonce tracking would add server state.
- The client cannot switch lecture/moment/stage without invalidating the HMAC.
- Stage length is bounded by `AXIOM_REPLAY_MAX_TURNS`.
