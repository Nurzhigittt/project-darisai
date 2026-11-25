# Specification Audit

**Source:** `DärisAI — Execution Plan & Technical Spec`, version 1.0, 25 November 2026, 36 pages.
**Audit date:** 25 November 2026.
**Scope audited:** Phase 0 engineering foundation and Phase 1 Signal & Ripple.
**Repository state at audit:** empty `README.md` only, initial commit `fd9e564`.

The complete PDF was extracted and read before implementation. Page references below are the PDF's printed page numbers, not extracted line numbers.

## 1. Requirements extracted

| Area | Requirement | PDF pages | Phase 1 status |
| --- | --- | --- | --- |
| Stack | Next.js App Router, TypeScript, Tailwind, PWA, FastAPI, Pydantic, Redis, PostgreSQL/pgvector, Docker | 2–4, 9–11 | Implemented except Docker runtime verification |
| Blind participation | Student joins with a code, no account; temporary token; no student table | 5, 19–20, 23 | Implemented with scoped Signal/Replay tokens |
| Privacy | Raw tokens not in PostgreSQL; only hashes in Redis; aggregate buckets/clusters | 5, 23 | Implemented; logs and schema checked |
| Professor auth | Invite-code login, JWT, 12 h | 15, 26 | Implemented |
| Lectures | Create, list, detail, start/pause/resume/end, ownership, server time | 15–16, 23 | Implemented |
| Join | Unique six-character join code; QR URL; no account | 15, 25, 32 | Implemented |
| Signal API | `POST /join` response includes token, lecture, WS URL, cooldown | 15–17 | Implemented (two tokens instead of one blind token) |
| WebSocket | `/ws`, hello within 3 s, close codes 4401/4408/4409/4429, no URL credentials | 19 | Implemented; extended codes 4403/1009 |
| Envelope | `{v,type,msg_id,ts,lecture_id,payload}` | 19–22 | Implemented |
| Signal event | `student_signal {client_seq,kind:'lost',client_ts_ms?}` | 20 | Implemented |
| Acknowledgement | `signal_ack {accepted,offset_ms,reason,retry_after_ms}` | 19–20 | Implemented plus `duplicate` and `stale_signal` reasons |
| Ripple | 20 s window, active 60 s, threshold `max(3, ceil(.15×active))`, raw and EWMA formulas | 21 | Implemented |
| Ripple states | connected/rising/cluster/recovering, hysteresis, at most 2 Hz | 21–22 | Implemented; cluster semantics clarified |
| Clusters | Persisted aggregate cluster boundaries and peak | 21–23 | Implemented |
| Analytics | 10 s buckets, minute heatmap, aggregate only | 21–23 | Implemented with explicit minute table |
| Student local history | IndexedDB confirmed offsets; no upload in Phase 1 | 5, 25 | Implemented |
| Professor UI | Ambience, no numbers by default, QR, controls, status text | 25–26, 32–33 | Implemented |
| Student UI | One dominant Signal button with all states; no fake acceptance | 25, 32–33 | Implemented |
| Post lecture | Factual aggregate summary; no AI | 33, 36 | Implemented |
| PWA | Manifest, icons, service worker, offline shell | 2, 9, 25 | Implemented; installability depends on browser/HTTPS |
| Accessibility | Keyboard, labels, live regions, reduced motion, contrast | 25, 32–35 | Implemented; automated checks partial |
| Localization | Russian and English in the PDF; user directive adds Kazakh | 32–35 | EN/RU/KK for primary flows |
| Axiom | Interfaces and future Temporal RAG; no LLM in Phases 0–1 | 5–6, 28–29 | Interfaces/models only |
| Tests | Unit, integration, E2E, load test, privacy check | 27–30 | Implemented and run locally |
| Docs | Audit, API, DB, security, build log, roadmap, handover, ADRs | 9–14, 30–31 | Implemented |

## 2. The five mandated corrections

### 2.1 Token lifecycle

**Specification (PDF p. 5):** server expires the student token hash approximately 15 minutes after the lecture ends, while post-lecture Replay needs later access.

**Resolution:** two independently scoped HMAC credentials.

- **Signal Token** — `scp=signal`, lecture-scoped, 4 h default. Its SHA-256 hash is stored in Redis with a TTL. It authorizes `hello` as a student and live signals; it cannot authorize replay or professor operations.
- **Replay Token** — `scp=replay`, lecture-scoped, 24 h default. It is stateless and signed. It cannot pass Signal Token validation or the student WebSocket handshake. No replay endpoint is implemented in Phase 1, so this is a validated foundation only.

No student account or persistent student record exists. Tests cover scope separation, expiry, signature tampering, cross-lecture use, and invalid tokens. See ADR-002.

**Consequence:** a lecture that starts more than four hours after a student joined requires a rejoin. This is a deliberate security/retention trade-off, not hidden.

### 2.2 Privacy verification

**Specification (PDF p. 5):** a test fails if the schema contains `user_id`, `email`, `ip`, `name`, or `device_id`.

**Resolution:** an explicit allowlist rather than a blanket ban:

- `professors.name` is allowed because professor identity is legitimate and required for login/ownership.
- Student identity names are prohibited everywhere.
- The actual manifest is generated from `information_schema`, not hand-maintained descriptions.
- `test_no_pii_columns` equivalent checks schema columns, and the manifest endpoint refuses to serve if a prohibited column appears.
- Invite codes are stored as keyed HMAC-SHA256 hashes.
- Logs whitelist known operational fields; no request body, cookie, Authorization header, IP or raw token is passed to the formatter.
- Redis keys use SHA-256 hashes and TTLs. Rate limits use a date-scoped keyed HMAC of the IP.
- PostgreSQL has no `students` table and no individual signal table.

**Honest limitation:** token possession is pseudonymity, not absolute anonymity. Multiple browsers/devices can join independently and cannot be linked or deduplicated as one human.

### 2.3 Ripple semantics

**Problem:** absence of signals is not evidence of understanding.

**Resolution:** the API and UI never emit "everyone understands" from low activity. The status labels are:

- `few_signals`
- `signals_increasing`
- `clarification_may_be_helpful`
- `signals_decreasing`
- `insufficient_participation`
- `connection_unavailable`

The summary states that signals are measured participation events, not comprehension rates. A low-signal lecture is presented as "few signals", not "understood".

### 2.4 Small-group behavior

**Problem:** `max(3, ceil(0.15 × active))` prevents clusters in rooms with fewer than three active participants.

**Policy:** small groups are conservative and never create a persisted confusion cluster.

- `active < 3` → `availability="insufficient_participation"`.
- The state machine may show `rising` on aggregate signals, but never `cluster`.
- Teacher-facing aggregate details are hidden behind an optional disclosure; no individual behavior or per-student timeline is exposed.
- The policy is documented in the Ripple module, API contract and UI copy, and is covered by a unit test and a Hypothesis test.

### 2.5 AI safety

**Problem:** the specification's phrase "Axiom never hallucinates" overstates what retrieval and validators can guarantee.

**Resolution:** interfaces and documentation describe **risk reduction**, not impossibility:

- Retrieval is lecture-filtered and temporal.
- Citation validation checks segment membership and normalized quote containment.
- Answer-leak and groundedness validators are planned with deterministic template fallback.
- Teacher approval remains mandatory in the default `locked` autonomy mode.
- Grounded generation can still be wrong; supervision and abstention are required.

Phase 1 never calls an LLM. The application starts and runs without provider credentials. See ADR-007.

## 3. Technical contradictions and resolutions

| # | Contradiction / risk | Resolution |
| --- | --- | --- |
| 1 | PDF uses one blind token for live and future replay, but the token hash expires 15 min after lecture while replay must work later. | Separate Signal/Replay scopes; see §2.1. |
| 2 | Privacy test blanket-rejects `name`, which would reject legitimate professor identity. | Explicit allowlist for `professors.name`; schema test verifies. |
| 3 | "Anonymous" implies absolute anonymity, but a bearer token is pseudonymous. | UI/docs say pseudonymous; bearer and multi-device limits documented. |
| 4 | Ripple low signal activity could be read as understanding. | Factual labels only; no inference from silence. |
| 5 | Minimum cluster threshold makes clusters impossible in small rooms. | Conservative small-group policy; no cluster under 3 active. |
| 6 | Exact raw intensity 0.5 approaches 0.5 asymptotically under EWMA and may never cross a `>=0.5` smoothed threshold. | Threshold crossings use raw intensity with EWMA floor (0.35); display remains smoothed. Documented and tested. |
| 7 | PDF's 1 KB WebSocket message limit may be too small for a JWT/invite hello envelope. | Configurable 4096-byte limit; documented deviation. |
| 8 | PDF asks for an offline queue, but stale offline signals must not silently count. | Queue up to 30 s; `client_ts_ms` older than 30 s is rejected as `stale_signal`; UI labels saved signals as not yet sent. |
| 9 | 15 s cooldown conflicts with clicking again while a request is unacknowledged. | Lua checks idempotency before cooldown; duplicate sequence gets `duplicate`; new sequence inside cooldown gets `cooldown` with retry-after. |
| 10 | PDF says "Redis clustering" but later clarifies it means temporal signal clustering, not Redis Cluster. | Single Redis instance + Pub/Sub; Redis Cluster is only a future scaling path. |
| 11 | PDF says 48 hours but also dates the start/deadline ambiguously. | Timeline does not affect the architecture; no fake development chronology. |
| 12 | PDF suggests a single 12 h professor JWT and no refresh/revocation model. | JWT has issuer/audience/expiry; session expiry returns the user to login. Revocation is future work. |
| 13 | PDF suggests `unique_tokens` per bucket but does not define minute/heatmap unique semantics. | Added `lecture_minutes` with distinct-per-minute counts; never sums bucket uniques. |
| 14 | PDF says "all live screens dark" but also asks for a light default product. | Light default; low-light theme switch; student stage works in both. |
| 15 | PDF mentions "no apps" but also PWA installability. | Works as an ordinary browser; install is optional and never required. |

## 4. Missing details and implementation assumptions

1. **Join-code alphabet.** The PDF says six Crockford base32 characters but does not define collision handling. We use the Crockford alphabet without I/L/O/U and retry on unique-index collision.
2. **Course bootstrap.** The required endpoints assume a `course_id`, but there is no specified course-creation endpoint. Added `GET /api/v1/courses` and `POST /api/v1/courses`.
3. **Professor seed.** The PDF references invite seeds but not a concrete development process. `SEED_PROFESSOR_INVITE_CODE` is used only in development; production validates `AUTO_SEED=false`.
4. **QR origin.** The backend builds `join_url` from `APP_BASE_URL`, so production QR codes cannot silently point at localhost.
5. **Pause timing.** Authoritative `offset_ms` excludes paused duration and uses only server timestamps.
6. **Lecture end.** Ending is terminal; live signals are rejected and student sockets close with 4409.
7. **WebSocket close codes not specified** for origin failure, message size, idle timeout and invalid schema. Added 4403, 1008, 1009 and 1001 without changing the specified 4401/4408/4409/4429 meanings.
8. **Rate limiting.** `/join` uses a keyed IP HMAC and a 300/min default suitable for a classroom behind one NAT. WebSocket messages use a per-connection token bucket. The IP is never logged or stored in PostgreSQL.
9. **Redis version.** Production Compose uses Redis 7; the implementation avoids `EXPIRE NX` and other newer-only commands so it also runs on Redis 5.0.14, which was used for local verification.
10. **Single worker.** Phase 1 runs one API worker. Pub/Sub is used, but evaluator state is process-local with a Redis mirror; multi-worker coordination remains a documented scaling task.
11. **Embedding dimension.** Fixed at 384 (`vector(384)`) for a multilingual small embedding model. No provider is called in Phase 1; the HNSW index already exists.
12. **Migrations.** Raw SQL and a transactional advisory-lock runner, as the PDF suggests. Checksums prevent silent edits to applied migrations.
13. **Cluster end semantics.** A cluster closes on recovery below the release threshold or at lecture end. Consecutive clusters get new UUIDs.
14. **Cluster unique count.** Exact distinct tokens observed across the cluster are tracked in a temporary Redis set and persisted as an aggregate.
15. **Analytics counters.** Status counters are process-local, not lifetime totals, and are labelled as such.
16. **`signal_ack` duplicate behavior.** A repeated `(token_hash, client_seq)` returns `accepted=false, duplicate=true`; it is already counted once. The student UI treats it as a confirmed prior signal only because the duplicate flag proves the server accepted the original. The local record uses the ack's offset.
17. **Offline queue.** Only one pending signal is retained per device; it expires after 30 s. This is deliberately bounded to avoid stale confusion signals.
18. **Accessibility verification.** Automated component/E2E coverage exists; a full manual screen-reader and axe audit remains incomplete. This is reported honestly.

## 5. Deliberately deferred functionality

- Production STT and audio chunk ingestion.
- Temporal RAG, embeddings generation, citations from live transcripts.
- Socratic Replay turns and stateless state tokens.
- AI GapCards.
- BriefNext, Handoff, approval workflow and magic links.
- Cohort Memory and autonomy configuration screens.
- Demo simulator, prebaked fixtures and 90-second judge mode.
- Multi-worker evaluator leases, Redis Cluster, multi-region deployment.
- Join-code rotation endpoint/UI (the PDF mentions it; Phase 1 exposes a stable code).
- Full WCAG audit with real assistive technology and Lighthouse scoring.
- Docker image build and Compose execution in the local environment.
- Remote GitHub Actions execution (workflows are committed but not run remotely here).

## 6. Spec versus actual implementation

| PDF specification | Actual Phase 1 implementation |
| --- | --- |
| `POST /join` returns `blind_token` | Returns `signal_token` and `replay_token`; `blind_token` is accepted as a WebSocket hello alias for compatibility |
| WS payload uses `blind_token` | `signal_token` is canonical; alias accepted |
| 1 KB message limit | Configurable 4096-byte limit |
| `ripple_update.state` only four values | Four values preserved; additive `availability`, `status_label`, aggregate counts |
| `signal_ack.reason` three values | Three values plus `duplicate`, `stale_signal`, `lecture_ended`, `invalid_token`, `invalid_payload` |
| `confusion_clusters` listed | Implemented with open/closed lifecycle and peak updates |
| `signal_buckets` only | Added `lecture_minutes` for exact minute distinct counts |
| No student table | Confirmed; privacy test and manifest |
| JWT 12 h | 12 h default; configurable |
| Token hash TTL lecture + 15 min | Signal Token TTL 4 h default; exact expiry documented |
| Student token localStorage | IndexedDB session, with fallback failure state; professor JWT in localStorage |
| 2 Hz Ripple cap | 500 ms minimum broadcast gap enforced by a 250 ms evaluation cadence and 500 ms spacing; test observes ≤ 2 Hz |
| Dark live screens | Light default, optional dark theme |
| 90-second demo | Not implemented; explicitly out of Phase 1 scope |
| "Axiom never hallucinates" | Risk-reduction language only; no LLM calls |

The 500 ms minimum spacing is a hard cap. The evaluator only sends on state change or intensity delta, so the observed broadcast rate is normally lower.

## 7. Repository and competition constraints

- The original target repository existed with an initial `README.md` commit. The new repository `Nurzhigittt/project-darisai` also had one initial commit (`b3b9546`).
- The project was imported into the new repository by merging the two unrelated histories (`ebee09c`), not by force-pushing over the initial commit.
- Work is on `feat/phase-0-1-foundation-realtime` (original) and `release/project-darisai` → `main` (new); no force-push or history rewrite was used.
- Existing files were preserved; both initial commits remain in history.
- The competition's AI-assistance rules could not be verified from this environment. The execution is documented transparently in `docs/BUILD_LOG.md`; the team must confirm eligibility with organizers.
- No real student, institutional or testimonial data is included. All demo/seed identities are labelled development fixtures.
- No performance figure is a prediction; measured results are in `docs/PERFORMANCE_REPORT.md`.

## 8. Architectural decisions

Recorded as ADRs:

- [ADR-001: Modular monolith and runtime boundaries](adr/0001-modular-monolith.md)
- [ADR-002: Separate Signal and Replay token scopes](adr/0002-token-scopes.md)
- [ADR-003: Deterministic Ripple and conservative small groups](adr/0003-ripple-semantics.md)
- [ADR-004: Raw SQL migrations and aggregate-only durability](adr/0004-migrations-and-privacy.md)
- [ADR-005: Redis Pub/Sub and single-worker evaluator](adr/0005-realtime-fanout.md)
- [ADR-006: Privacy allowlists and pseudonymity](adr/0006-privacy-allowlist.md)
- [ADR-007: Axiom interfaces and honest AI safety](adr/0007-axiom-safety.md)
