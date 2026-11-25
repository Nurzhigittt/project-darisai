# ADR-006: Privacy allowlists and pseudonymity

**Status:** Accepted · 25 November 2026

## Context

A blanket schema rule banning every `name` column would reject legitimate professor identity. At the same time, a raw bearer token is not proof of absolute anonymity. Privacy claims must be technically checkable.

## Decision

- Explicitly allowlist `professors.name`; reject `name` and other identity columns elsewhere.
- Generate the privacy manifest from the live PostgreSQL `information_schema`.
- Store invite codes only as keyed hashes.
- Keep raw student tokens in browser storage only; store SHA-256 hashes in Redis with TTLs.
- Log only an explicit allowlist of operational fields; never bodies, cookies, headers, IPs or tokens.
- Use keyed, date-scoped IP HMACs for rate limiting with a 60 s TTL; never persist raw IPs.
- State clearly that tokens are pseudonymous and multi-device joins cannot be linked or deduplicated.

## Consequences

- The manifest can prove what columns exist, not what every future feature will collect.
- Future features must extend the allowlist and tests deliberately.
- Clearing browser data removes local study history; this is disclosed in the UI.
