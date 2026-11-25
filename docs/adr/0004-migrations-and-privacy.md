# ADR-004: Raw SQL migrations and aggregate-only durability

**Status:** Accepted · 25 November 2026

## Context

The competition spec prioritizes a small, reproducible schema with minimal tooling. Alembic would add merge complexity during parallel work. Privacy requires that individual student signal history never reaches PostgreSQL.

## Decision

- Use numbered SQL migrations with a transactional Python runner and an advisory lock.
- Store a checksum per applied migration; reject silent edits to history.
- Persist only aggregates: 10 s `signal_buckets`, 60 s `lecture_minutes`, clusters, and aggregate counters.
- Keep the exact unique-participant count in a temporary Redis set and persist only the final number.
- Fix the embedding dimension at `vector(384)` for a multilingual small model and create an HNSW cosine index now.
- Do not create `students`, `student_tokens` or individual signal tables.

## Consequences

- The migration path is simple and testable on a clean database.
- Minute unique counts are exact within the minute and never computed by summing bucket uniques.
- Future per-student replay cannot use PostgreSQL history; it must rely on the student's local IndexedDB history and scoped Replay Token.
