# Handover

**Last updated:** 25 November 2026.
**Branch:** `feat/phase-0-1-foundation-realtime`
**Base:** `fd9e564b734d41c6e5b05a41c270c0e8fe353f16`
**Target:** `https://github.com/hackathon-worldAI-2026-ULTRA/daris-ai`

## Verified commits

| Commit | Meaning |
| --- | --- |
| `2a47b81d065e3c76da90ba71b23be498c2abfa9f` | Monorepo foundation, Compose, security/privacy overview, agent rules |
| `a319cabda50e00e0c9c70a78af5595f07f66d3f2` | Backend, schema, realtime pipeline, tests |
| `d3f0363660ed2b017ce5668f4feebb592340c86d` | Frontend product, PWA, design system, tests |
| `2f0e799b1548cdfdbaa7e0fa8eeed631db2d7086` | Contracts, CI, smoke/load tooling, raw load reports |
| documentation commit | Audit, ADRs, performance, build log, handover, screenshots |

The final branch HEAD after the documentation commit is the remote SHA reported in the execution report. Verify with `git log --oneline --decorate` and `git ls-remote origin`.

## Completed functionality

- Professor invite-code login with HS256 JWT.
- Courses and lecture CRUD/lifecycle: scheduled → live → paused → live → ended.
- Authoritative pause/resume timing.
- Unique six-character Crockford join codes and configured-origin join URLs.
- Anonymous join without accounts; separate short Signal and longer Replay tokens.
- QR professor screen and fullscreen presentation mode.
- Authenticated `/ws` gateway: 3 s hello, role, lecture, origin, size, rate, heartbeat, close codes.
- Atomic signal path with Redis Lua: idempotency → cooldown → window/buckets.
- Duplicate rejection after reconnect; cooldown enforcement; stale-signal bound.
- Deterministic Ripple engine with 20 s window, 60 s active set, threshold, EWMA, hysteresis, 2 Hz cap and small-group policy.
- Persisted clusters with open/close lifecycle.
- 10 s buckets, exact minute distinct counts, lecture aggregates and summary.
- Student IndexedDB confirmed history and bounded pending queue.
- Professor factual summary and locally stored student status/history.
- Privacy manifest generated from the live schema, with CI-style schema test.
- PWA manifest/icons/service worker/offline shell.
- EN/RU/KK primary flows, light/dark theme, accessible Signal states.
- 37 backend tests, 11 frontend tests, 7 Playwright tests (including axe), 300-client load test.

## Partially completed

| Area | State |
| --- | --- |
| Accessibility | Automated axe scans on `/`, `/privacy`, `/status`, `/login`; keyboard E2E; reduced-motion CSS. No manual screen-reader or Lighthouse audit. |
| PWA | Production build, manifest, icons and service worker committed. Installability not verified on real devices/HTTPS. |
| Docker | Compose, Dockerfiles, healthchecks and migration service written; not executed locally because Docker is unavailable. |
| CI | Two GitHub Actions workflows committed; not executed remotely. |
| Axiom | Interfaces and domain models only. No provider calls, no evals, no prompts executed. |
| Analytics | Factual signal/cluster reporting; no AI recommendations. |
| Replay | Replay Token issued/validated as scope-only; no replay endpoints. |

## Missing functionality

- Production STT and transcript ingestion.
- Temporal RAG, embeddings generation, citation-backed Socratic Replay.
- GapCards, BriefNext, Handoff, insight approval, Cohort Memory UI, autonomy settings.
- 90-second demo simulator and prebaked demo fixtures.
- Join-code rotation endpoint/UI.
- Multi-worker evaluator ownership.
- Full WCAG 2.2 AA manual audit and real-device testing.
- Cloud deployment, TLS/WSS termination and uptime monitoring.
- JWT revocation/refresh, MFA, admin console.
- Docker/CI execution evidence.

## Current architecture

FastAPI modular monolith + Next.js App Router; PostgreSQL 16+ with pgvector 0.8; Redis 7-compatible (verified on 5.0.14); Redis Pub/Sub lecture channels; one Uvicorn worker; WebSocket gateway with in-process connection registry; deterministic evaluator with Redis-mirrored state. Details and diagrams are in [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Important files

| File | Why |
| --- | --- |
| `backend/app/realtime/gateway.py` | WS handshake, role/lecture checks, rate limits, ack/control |
| `backend/app/realtime/signals.py` | Atomic Lua signal processing, keys and cooldowns |
| `backend/app/realtime/ripple.py` | Pure deterministic Ripple state machine |
| `backend/app/realtime/ripple_runtime.py` | Evaluation loop, cluster persistence, event publishing |
| `backend/app/services/tokens.py` | Signal/Replay issuance and validation |
| `backend/app/services/analytics.py` | Bucket/minute flush, heatmap, summary, cluster CRUD |
| `backend/app/services/privacy.py` | Allowlist and schema manifest |
| `backend/migrations/001_initial_schema.sql` | Complete schema and indexes |
| `frontend/src/features/signal/student-lecture-screen.tsx` | Signal UX, WS state, IndexedDB acks |
| `frontend/src/features/ripple/professor-live-screen.tsx` | QR, controls, Ripple display |
| `frontend/src/lib/ws/client.ts` | Reconnect/backoff, heartbeat, protocol envelope |
| `frontend/src/lib/storage/db.ts` | Local sessions, sequence allocation, confirmed history |
| `scripts/loadtest.py` | Real 300-client WebSocket load test |
| `docs/SPEC_AUDIT.md` | Contract/spec interpretation and corrections |
| `docs/API_CONTRACTS.md` | Endpoint and WS reference |
| `docs/SECURITY_PRIVACY.md` | Threat model and limitations |

## Setup

### Docker (unverified locally)

```bash
cp .env.example .env
docker compose up --build
```

Web `http://localhost:3000`, API `http://localhost:8000`. Development invite code `DARIS-TEACH-2026`.

### Local (verified)

See `README.md` §"Quick start without Docker". Required: PostgreSQL with pgvector, Redis, Python 3.12+, Node 24, pnpm. Run `python -m app.migrate` and `python -m app.seed` before the API.

Production settings must use strong secrets, HTTPS `APP_BASE_URL`, `AUTO_SEED=false` and explicit CORS/WS origins.

## Testing

```bash
cd backend
ruff check app tests
mypy app
TEST_DATABASE_URL=postgresql://.../daris_test pytest -q

cd ../frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
E2E_BASE_URL=http://127.0.0.1:3000 pnpm e2e
```

Backend tests require real PostgreSQL and Redis. The conftest drops and recreates `daris_test`; **never point `TEST_DATABASE_URL` at a database you care about**.

## Known bugs and risks

1. **Playwright end-dialog flake observed once.** A full run timed out waiting at the end-lecture dialog; after adding deterministic test IDs, the workflow passed alone (11.9 s) and the suite passed 7/7. Root cause was not conclusively reproduced; treat as a residual test flake, not a proven app bug.
2. Summary signal chart is visually sparse for a single one-minute lecture (one bar at the left). Data is correct; presentation can improve.
3. Duplicate acknowledgement semantics: `accepted=false, duplicate=true` means the original signal was already counted. The client records it as confirmed; other consumers must not interpret `accepted=false` as "not counted" without checking `duplicate`.
4. Service worker uses `skipWaiting` and cache versioning; there is no user-facing "update available" prompt. A live page may update on the next load.
5. No rate-limit handling UI beyond generic errors for professor actions; repeated auth/join limits return `429`.
6. The local Vue/Next dev HMR WebSocket failed in this DSH execution environment; production build and tests were unaffected. Do not confuse this with the app `/ws` gateway.
7. `lecture_minutes` late-flush unique counts use `GREATEST`; they can conservatively under/over-state in a rare boundary race. See `docs/DB_SCHEMA.md`.
8. If Redis is unavailable during a live lecture, new joins/signals fail safely; the professor may see a cached Ripple. No fabricated acknowledgements are returned.

## Security limitations

- Bearer student tokens are pseudonymous, not proof of a unique person.
- Multi-browser/device joins cannot be linked or deduplicated.
- No MFA, refresh token, JWT revocation or device management.
- No WAF/DDoS protection or managed secrets manager in the local setup.
- Full manual accessibility and penetration testing remain incomplete.
- Prompt-injection defenses are future interfaces/design, not implemented LLM behavior.
- Docker/remote CI not verified.

## Technical debt

- Single-worker evaluator; no distributed lease.
- One large initial migration; future migrations should be additive by owner.
- No join-code rotation.
- No browser install prompt / service-worker update UX.
- Summary chart needs a better single-point layout.
- Tests use fixed sleeps in cluster/load paths; CI timing margins should be monitored.
- `frontend/src/lib/api/types.gen.ts` is generated; never edit directly.
- Contract drift job currently regenerates and diffs, but remote CI has not run.

## Outstanding decisions

1. Production hosting and managed PostgreSQL/Redis with pgvector.
2. Whether evaluator moves to a dedicated worker before more WebSocket workers.
3. Join-code rotation policy vs classroom convenience.
4. Replay endpoint authorization and rate limits using the Replay Token.
5. Exact future provider selection behind `LLMClient` and embedding dimension/provider.
6. Manual accessibility sign-off process.

## Exact recommended next task

**Phase 2, first slice:** implement transcript ingestion for a single pre-recorded lecture plus a deterministic `FakeLLMClient`, then a `TemporalRetriever` that returns lecture-filtered [−90 s, +10 s] context and top-k=4 semantic segments, with citation validation and template fallback. Do not add student-visible AI generation until the validators and evals exist. Keep the Ripple pipeline unchanged.

Start by reading:

1. `backend/app/axiom/interfaces.py`
2. `backend/app/axiom/models.py`
3. `docs/SPEC_AUDIT.md` §2.5 and §5
4. `backend/migrations/001_initial_schema.sql` (`transcript_segments`, `concepts`, `insights`)
5. `docs/ROADMAP.md` Phase 2

Definition of done for that slice: a deterministic retrieval test with a fixture transcript, citation substring checks, lecture isolation, no external API key required, and no fabricated LLM output.
