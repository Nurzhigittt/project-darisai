# Build log

Timezone: Asia/Qyzylorda (UTC+05:00). Date: 25 November 2026.
This log records what was actually run. It does not reconstruct work that did not happen.

## Starting state

- Original implementation repository: `https://github.com/hackathon-worldAI-2026-ULTRA/daris-ai`
- Original base commit: `fd9e564b734d41c6e5b05a41c270c0e8fe353f16` (`Create README.md`)
- Original content: a 7-byte `README.md` with the text `ignore`.
- Original branch: `feat/phase-0-1-foundation-realtime`.
- New canonical repository: `https://github.com/Nurzhigittt/project-darisai`
- New repository initial commit: `b3b9546d01e0ac0f79c468161590c95f599dc1cd` (`Initial commit`, 17-byte README).
- The old and new histories were joined with **merge commit `ebee09c`**, so neither the original history nor the new repository's initial commit was rewritten.
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

### 6.5 Visual refresh for the new repository

- Replaced the app icon with an original open-ripple mark and regenerated PWA 192/512/maskable/apple icons.
- Built a new iMac-style hero composition with an original warm cream → peach → sage gradient, aluminium all-in-one monitor, dock glyphs and a real production-build professor screenshot. No third-party brand logo was used.
- Captured a fresh real-data product run: 8 synthetic students connected through the actual WebSocket gateway, 8 accepted signals, a persisted cluster, then the professor summary. The final captures include 9 accepted signals, 9 unique participants and 1 cluster.
- Updated the browser logo to the new mark and improved the one-minute summary chart with a centred bar, grid and value label.
- Added a 1280×640 social preview and wired it into Next.js Open Graph/Twitter metadata.
- Final checks after the refresh: ESLint, TypeScript and production build passed; Playwright **7/7** passed; frontend unit tests **11/11** passed.

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
| `5063876c2e8c5f15fdcf9c14c87163b481cf2426` | `docs: audit specification and record delivery evidence` |
| `ebee09c` | `merge: bring Phase 0 and Phase 1 into project-darisai` |
| `ef1e93dda2d385cdf50ba7e7f41f95c638f789a1` | `feat(brand): refresh README, icons and product visuals` |

The original implementation was pushed to the old target at `5063876...` and its historical PR is <https://github.com/hackathon-worldAI-2026-ULTRA/daris-ai/pull/1>. The project was then imported into the new repository without rewriting either history: the old project history and the new repository's initial commit `b3b9546` meet at merge `ebee09c`. The final new-repository HEAD is reported after the documentation commit in the execution report and can be verified with `git rev-parse HEAD` / `git ls-remote origin`.

## Reproduction notes

The repository is self-contained for Docker and CI. The local verification also used infrastructure outside the repository:

- PostgreSQL extension path at `C:\daris-runtime\pgvector` because Program Files was not writable.
- Redis binary from the local workspace.
- Virtual environments in `backend/.venv` and `frontend/node_modules` are ignored by Git.

A clean reviewer should follow `README.md` and use Docker Compose or their own PostgreSQL/Redis with `pgvector` enabled. The committed migrations, contracts, tests and lockfiles are the reproducible artifacts.


## Post-merge contract drift fix

The Phase 2 backend merge (`31929a6`, merged as `dc72db3`) added insight, handoff, autonomy and cohort routes, but the committed `docs/contracts/openapi.json` and generated `types.gen.ts` were not regenerated in that commit. GitHub Actions correctly failed the **API and WebSocket contract drift** job at the `git diff --exit-code` step.

Fix: ran `python scripts/export_schemas.py` and `pnpm contracts`, then verified `pnpm typecheck` and `pnpm lint`. This is an additive contract update; no existing Phase 1 shape was removed.

## P1 BriefNext / Handoff frontend — 2026-11-26

Implemented the professor review/manual-authoring flow and public fragment-token Handoff route against the existing P2 contracts at `0cce36e`. Added summary/home navigation, EN/RU/KK text, state/error handling, server-authoritative transitions and test-only contract coverage. Fixed stale publication links after refresh, native dialog cancellation and the skip link overwriting the Handoff fragment. No backend or generated schema changes.

Actual local verification:

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed; final build TypeScript check also passed |
| `pnpm test` | 31/31 tests, 7/7 files |
| `pnpm build --webpack` | Passed; 10 static pages generated and both new routes included |
| Default `pnpm build` | Interrupted after remaining at Turbopack compilation without further output |
| New Playwright contract scenarios | 3 attempted; Chrome launch failed before test execution (`SIGABRT`/`EPERM`), no axe pass claimed |
| Manual browser | Handoff missing-token/network states, desktop and 390×844 light/dark; keyboard skip preserves fragment and focuses main; no mobile horizontal overflow |
| Real API / existing full E2E / backend checks | Not run: no running API, PostgreSQL/pgvector, Redis or provided P2 test backend |

This is a locally implemented frontend slice, not verified end-to-end delivery. See `docs/handover/P1.md` for the integration checklist and deferred scope. No push, PR or deployment was performed.

Implementation commit: `283fae3c99f6842f5e30e3cf83cca4a709ca16f3` — `feat(frontend): add BriefNext review and public Handoff`, on `feat/p1-frontend-experience`.

## User-supplied design tokens — 2026-11-26

Applied the supplied light/dark background, primary, foreground, secondary, accent and surface values exactly. Updated their paired RGB variables for Tailwind opacity utilities and derived hover, soft, muted, border and focus tones. Added a primary-foreground token so pink buttons use dark text in dark mode. Warning states use the existing semantic attention color. Updated browser/PWA colors, the app-shell cache version, presentation background and QR foreground.

Verification: `pnpm lint`, `pnpm typecheck`, all 31 frontend tests (7 files), and `pnpm build --webpack` passed. A one-off calculation checked the exact supplied values and every paired RGB value; sampled body, muted, primary-button and badge text/background combinations exceeded 4.5:1. Primary-button text contrast is 7.65:1 in light mode and 5.66:1 in dark mode. This is not a complete WCAG audit.

Inspected the login screen in the built-in browser at desktop and 390×844 in both themes, confirmed computed colors, and found no horizontal overflow. Saved light/dark screenshots as session deliverables. Existing full-backend/E2E limitations above remain unchanged; no push or deployment was performed.

## User-supplied application icon — 2026-11-26

Replaced the active header, browser and installed-app icon references with exports of the supplied PNG. The canonical `docs/assets/app-icon.png` is byte-identical to the user's original; 64/180/192/512-pixel exports preserve the image composition and background. Removed the old SVG favicon, added `src/app/icon.png`, and updated the exporter to derive future icons from the checked-in artwork. New asset filenames avoid the previous Next image-optimizer cache; service-worker cache version v5 refreshes the manifest and app-shell assets.

Verification: `pnpm lint`, `pnpm typecheck`, all 31 frontend tests (7 files), and `pnpm build --webpack` passed. The build includes `/icon.png`. Verified PNG dimensions, manifest targets, canonical-source hash equality and exporter Python syntax. The browser loaded the new header image and metadata links; inspected the mark in light/dark themes and saved a header screenshot as a session deliverable. No push or deployment was performed.

## User-selected typography — 2026-11-26

Replaced Manrope with locally bundled Fontsource packages: Source Serif 4 600 for headings and IBM Plex Sans 400 for body copy, with 500/600 for controls and navigation. Normalized the old 700/800 utility weights to 600, preserved monospace codes/timers, and loosened the landing hero's tracking and line height. Concept, lecture-card and student-history titles now use heading elements. Font imports include Latin, Cyrillic and Cyrillic-ext subsets with `font-display: swap`; no runtime Google Fonts requests are introduced. The lockfile changes only the font dependencies.

Verification: `pnpm lint`, `pnpm typecheck`, all 31 frontend tests (7 files), and `pnpm build --webpack` passed. Checked computed heading/body/button/navigation families and weights in the built-in browser. Visually inspected Russian/Kazakh login copy at 390×844 and the landing page at mobile and 1280×800 desktop widths, including English copy and both themes; observed no horizontal overflow. The browser check caught an unquoted numeric family name, corrected to `"Source Serif 4"` in Tailwind before the successful build. Saved light/dark landing screenshots as session deliverables. Real-backend/E2E limitations above are unchanged; no push or deployment was performed.

## P3 Axiom milestone (`feat/p3-axiom-engine`)

- Added `200_p3_axiom_transcript.sql` and applied it to the local PostgreSQL instance.
- Downloaded and ran `intfloat/multilingual-e5-small` ONNX (384-d); 40/40 demonstration segments embedded, L2-normalized, finite.
- Imported the synthetic 40-segment Russian Bernoulli fixture through the real API; run status `completed`, `embedded=40`.
- Exercised Replay start/turn, GapCards and BriefNext/Handoff against the local API. Template source was returned because no LLM/STT credentials were available.
- `pytest -q`: **108 passed**; Ruff and mypy clean.
- Frontend: ESLint, TypeScript, Vitest 11/11 and production build passed; contracts regenerated and stable.
- AI evaluation: 30 retrieval cases, Recall@4 **0.600**, MRR **0.4819**; 10/10 deterministic guardrails. Raw result `artifacts/evals/eval-20261125T180048Z.json`.
- The earlier baseline made no live LLM/Whisper call; the hardening pass later verified live DeepSeek and Groq calls. No deployment or Docker run was performed.
- PR #2 GitHub Actions at `e19ffef`: backend, frontend, contract drift, secret scanning and E2E all passed.

## P3 AI hardening (commit `a8eeac2`)

- Hybrid retrieval added: exact filtered cosine + BM25 + weighted RRF + temporal RRF; dense-only mode retained.
- Corrected off-by-one relevance labels in the 30-case suite before reporting the new benchmark.
- Retrieval: overall Recall@4 **0.8667**, MRR **0.7000**; RU 0.90, EN 0.80, KK 0.90; held-out Recall@4 **0.90**.
- Adversarial suite: **32/32** constructed cases (29 deterministic, 1 fake LLM, 2 template). Live adversarial sample size: **0**.
- Live provider smoke: **10/10 functional checks** with DeepSeek `deepseek-flash`; Groq `whisper-large-v3-turbo` returned a timestamped transcription. Live P2 API BriefNext returned `source=live` and `pending_approval`. Raw artifacts `artifacts/evals/hardening/live-provider-smoke.json`, `provider-smoke.json` and `live-api-insight.json`.
- Added per-Replay-Token request cap, single-use state nonce, model prewarm and status readiness.
- Verification: **114 backend tests passed**, Ruff/mypy clean; frontend lint/typecheck/build/tests still run in the PR.
- Cold Replay turn 3.87 s; warm p50/p95 26.0/106.9 ms; 30-client Signal-to-Ripple p95 491.84 ms under AI load; 0 errors.
- No Docker or cloud deployment was performed. Live provider functional checks passed, but no live adversarial safety benchmark was run.

## P1 remaining frontend workflows — 2026-11-26

Implemented Cohort Memory and server-authoritative Autonomy controls in `2f828d7`. After discovering that the team had delivered the actual P3 APIs/contracts on `feat/p3-axiom-engine`, merged P3 `c21446a` into the P1 branch as `6deb064`, preserving both histories. Resolved CORS by retaining P1's PUT and P3's X-Replay-Token header allowance; shared main was not changed. The P3 evidence above belongs to that team's earlier environment and is not a successful backend run on this Mac.

Added Transcript JSON/audio import, BriefNext/Handoff server generation and evidence rendering, Socratic Replay, GapCards with local review scheduling, and the local learning library. Added EN/RU/KK copy and navigation. Replay credentials are separate from professor/Signal credentials; signed moments and state capabilities remain in memory. IndexedDB migration preserves prior records and revision checks prevent stale Replay/card writes from restoring cleared history. Uncertain professor mutations reconcile with one read and never automatically repeat the write. Moved the CORS regression tests into `tests/unit` so CI's explicit unit selection runs them.

Local verification:

| Check | Actual result |
| --- | --- |
| Frontend ESLint / TypeScript | Passed |
| Frontend Vitest | 175/175 tests in 15 files, including the final late-Signal-ACK/local-history deletion regressions |
| `pnpm build --webpack` | Passed; all new routes included. Default Turbopack build is not claimed as passing locally |
| Backend Ruff after P3 integration | Passed |
| Backend before P3 integration | Ruff/mypy and four real CORS middleware tests passed. Full pytest stopped because PostgreSQL at 127.0.0.1:55432 was unavailable |
| Backend after P3 integration | Mypy and pytest collection blocked by missing numpy. Exact dependency installation could not resolve `filelock==4.3.1` / `numpy==2.5.5` in this environment. No substitute dependencies installed |
| Contract regeneration after integration | Not completed locally because the backend import dependencies are unavailable; P3's committed generated schemas/types were used unchanged |
| Playwright contract E2E | 1 failed before scenario execution and 2 not run: missing Chromium headless shell. Official browser installation reports unsupported mac13-arm64 for this version. No passing E2E or axe result claimed |

Inspected an isolated build with a prominent synthetic-data banner and a local fixture API, outside the repository. The actual production routes have no fixture fallback. Through the built-in browser, exercised Replay selection → MCQ → free text → completion → GapCards generation/flip/local rating; inspected Transcript, Cohort and Autonomy. Checked 390×844 and 1280×800 layouts and light/dark themes. Found and fixed escaped table accessibility text causing mobile overflow, an Autonomy action squeezing the mobile concept title, and a malformed GitHub navigation link. The long-name confirmation dialog stays within a 390-pixel viewport. Preview uses a same-origin test proxy and does not prove production CORS, real STT, real provider results or real backend integration.

Remaining: real PostgreSQL/pgvector/Redis/API setup, migration and transcript import, professor/public/student end-to-end scenarios, supported-browser/axe and manual assistive-technology checks, actual STT, final CI/team review, then P4's real-flow demo. Richer Cohort semester/title/structural-gap data and actual automatic AI publication require backend work. See `docs/handover/P1.md`.

Final follow-up: clearing local history also records the highest allocated Signal sequence in the same IndexedDB transaction. Late accepted/duplicate acknowledgements and pending writes for earlier sequences cannot recreate erased signals; newly allocated signals still work. Confirmed the repaired mobile Autonomy titles use the full 308-pixel card content width at a 390-pixel viewport, instead of collapsing beside the action button. Final lint, TypeScript, 175 tests and production webpack build all passed after these fixes.
