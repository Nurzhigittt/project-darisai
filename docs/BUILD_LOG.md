# Build log

Timezone: Asia/Qyzylorda (UTC+05:00). Date: 25 November 2026.
This log records what was actually run. It does not reconstruct work that did not happen.

## Starting state

- Target repository: `https://github.com/hackathon-worldAI-2026-ULTRA/daris-ai`
- Base commit: `fd9e564b734d41c6e5b05a41c270c0e8fe353f16` (`Create README.md`)
- Existing content: a 7-byte `README.md` with the text `ignore`.
- Branch created: `feat/phase-0-1-foundation-realtime`.
- No force-push, history rewrite or fabricated authorship was used.

## Milestones and verification

### 1. Specification and environment

- Extracted and read all 36 PDF pages.
- Confirmed the local availability of Node 24, pnpm 12.4.1, Python 3.14.4, PostgreSQL 18.6 and a portable Redis 5.0.14.1.
- Docker and GitHub CLI were not installed.
- Built pgvector 0.8.1 for PostgreSQL 18 with Visual Studio Build Tools and installed it into a project-local extension path (`C:\daris-runtime`, not part of the repository).
- Initialized an isolated PostgreSQL cluster on `127.0.0.1:55432` with trust auth for local development.
- Verified `CREATE EXTENSION vector` and version `0.8.1`.

### 2. Backend foundation

- FastAPI lifecycle, typed settings, asyncpg pool, Redis client, request IDs, structured privacy-aware logs, CORS, readiness, Prometheus metrics and `/api/v1/status`.
- Raw SQL migration runner with advisory lock and checksum verification.
- Applied migration `001_initial_schema` successfully to the local database and the test database.
- Verified `/health`, `/ready`, `/api/v1/status` and `/api/v1/privacy/manifest` return real responses.
- Verified professor login, lecture creation, student join, start, signal acknowledgement, duplicate rejection and cooldown against the running API.

### 3. Realtime and analytics

- Implemented the WebSocket envelope, hello timeout, role/lecture authorization, heartbeat and close codes.
- Implemented atomic Redis Lua signal processing: idempotency then cooldown, then sliding window/buckets.
- Implemented the pure Ripple engine with tests for small groups, sustained clusters, recovery, hysteresis, consecutive clusters and deterministic EWMA.
- Implemented cluster persistence, minute/bucket flushing and factual summary endpoints.
- Fixed two implementation issues discovered by tests:
  - a zero-valued cluster start offset was treated as falsy;
  - a `name`-column privacy test would have rejected legitimate `professors.name`; replaced with an explicit allowlist.

### 4. Frontend

- Next.js App Router, TypeScript strict, Tailwind design system and EN/RU/KK dictionaries.
- Landing, join, student Signal, professor login/home/live, QR presentation, summary, privacy, status, offline and error screens.
- IndexedDB confirmed history, client sequence allocation, bounded offline queue, WebSocket reconnect with jitter and heartbeat.
- PWA manifest, icons, service worker app-shell cache and offline route.
- Fixed Tailwind CSS-variable opacity classes that silently omitted backgrounds; introduced RGB channel variables and named alpha colors.
- Fixed SignalButton pointer instability caused by a continuous scale animation.
- Fixed one WCAG contrast failure: muted text changed from `#706D79` to `#686570`.

### 5. Verification commands and actual results

All commands below were executed locally. The final passing run is the run recorded in the handover.

```text
backend:  ruff check app tests
          All checks passed!
backend:  mypy app
          Success: no issues found in 49 source files
backend:  pytest -q
          37 passed, 1 warning in 12.19s
frontend: pnpm lint
          passed
frontend: pnpm typecheck
          passed
frontend: pnpm test
          11 passed (4 files)
frontend: pnpm build
          compiled successfully; 13 routes emitted
e2e:      pnpm e2e
          7 passed (37.4s)
          (4 axe WCAG 2.2 AA scans + full workflow + invalid code + localization)
secrets:  gitleaks 8.24.3 --no-git
          no leaks found
```

One earlier Playwright run timed out at the end-of-lecture dialog. The dialog trigger/confirm got deterministic test IDs, the test was rerun alone (passed, 11.9 s), and the full suite then passed 7/7. This is recorded as a residual flake risk in the handover.

### 6. Load test

Final raw reports:

- `artifacts/loadtest/loadtest-20261125T104041Z.json` — 300 synthetic students, one lecture.
- `artifacts/loadtest/loadtest-20261125T103811Z.json` — 60 synthetic students, three lectures.

300-client result:

```text
connected: 300/300
accepted signals: 400
duplicate acknowledgements: 400
reconnect probes: 5/5 duplicate after reconnect
ack p50/p95/p99: 4.45 / 11.37 / 17.38 ms
signal-to-Ripple p50/p95/p99: 263.44 / 493.25 / 519.84 ms
errors: 0
```

60-student/3-lecture result:

```text
connected: 60/60
accepted signals: 60
duplicate acknowledgements: 60
ack p95: 13.16 ms
signal-to-Ripple p95: 487.41 ms
errors: 0
```

The 300-client p95 is below the 500 ms target by 6.75 ms. This is a narrow margin; p99 is above target. See `docs/PERFORMANCE_REPORT.md` for limits.

### 7. Unverified

- `docker compose up --build` was not executed: Docker is not installed in this environment.
- GitHub Actions workflows were committed but could not be executed remotely.
- No cloud deployment.
- No Lighthouse run, real-device 4G test or full manual screen-reader pass.
- No formal penetration test.

## Commits

| Commit | Subject |
| --- | --- |
| `2a47b81d065e3c76da90ba71b23be498c2abfa9f` | `chore: initialize DärisAI monorepo foundation` |
| `a319cabda50e00e0c9c70a78af5595f07f66d3f2` | `feat(backend): implement Signal and Ripple pipeline` |
| `d3f0363660ed2b017ce5668f4feebb592340c86d` | `feat(frontend): build accessible Signal and Ripple experience` |
| `2f0e799b1548cdfdbaa7e0fa8eeed631db2d7086` | `test(ci): add contract checks, E2E, load testing and quality gates` |

The documentation commit follows this log. The final remote HEAD is reported in the execution report and can be verified with `git rev-parse HEAD` / `git ls-remote`.

## Reproduction notes

The repository is self-contained for Docker and CI. The local verification also used infrastructure outside the repository:

- PostgreSQL extension path at `C:\daris-runtime\pgvector` because Program Files was not writable.
- Redis binary from the local workspace.
- Virtual environments in `backend/.venv` and `frontend/node_modules` are ignored by Git.

A clean reviewer should follow `README.md` and use Docker Compose or their own PostgreSQL/Redis with `pgvector` enabled. The committed migrations, contracts, tests and lockfiles are the reproducible artifacts.
