# AGENTS.md — instructions for future coding agents

These instructions are persistent project context. Read them before making changes.

## Mission

DärisAI makes confusion visible in lectures without creating student accounts. The current repository is a working Phase 0 foundation and Phase 1 Signal & Ripple slice. The next phase is **Phase 2 — Axiom & Temporal RAG**.

Do not describe deferred features as complete. Do not replace real infrastructure with frontend-only simulations.

## Current architecture rules

- Modular monolith: FastAPI + Next.js; no microservices, Kubernetes or Kafka.
- Pydantic schemas in `backend/app/schemas/` are the contract source of truth.
- SQL migrations are numbered, transactional, checksum-verified and append-only.
- PostgreSQL stores aggregates and professor identity only. Never add a student table or individual signal history.
- Redis keys are TTL-scoped and lecture-scoped. Never put raw tokens in logs or PostgreSQL.
- Student credentials are pseudonymous; never claim absolute anonymity.
- Signal and Replay token scopes are separate. Replay must never authorize live signals or professor actions.
- The Ripple engine must stay deterministic, browser-free and independently testable.
- Silence is `few_signals`, never universal understanding. Small groups are `insufficient_participation`.
- API/WebSocket changes are additive after the baseline. Regenerate contracts; never hand-edit `types.gen.ts`.
- One API worker is the supported Phase 1 shape. Do not claim multi-worker readiness without implementing evaluator ownership.

## Repository layout

- `backend/app/api/v1/` — versioned HTTP routes.
- `backend/app/realtime/` — gateway, signal processor, Ripple engine/runtime, Pub/Sub.
- `backend/app/services/` — auth, lectures, tokens, analytics, privacy.
- `backend/app/axiom/` — interfaces/models only until Phase 2.
- `backend/migrations/` — raw SQL.
- `frontend/src/app/` — App Router routes.
- `frontend/src/features/` — product flows.
- `frontend/src/components/ui/` — accessible design system.
- `frontend/src/lib/` — API client, WS, IndexedDB, i18n, theme.
- `docs/` — audit, ADRs, contracts, reports and handover.
- `scripts/` — export contracts, icons, smoke, load test.

## Before changing code

1. Read `docs/HANDOVER.md`, `docs/SPEC_AUDIT.md` and relevant ADRs.
2. Inspect the working tree and current branch. Do not overwrite uncommitted work.
3. Preserve existing team commits and authorship. Never force-push or rewrite shared history.
4. Confirm the change fits Phase 1/2 scope. Do not add unrelated features to inflate the project.

## Security invariants

- No secrets in Git. Local `.env` only.
- No raw student tokens, IPs, bodies, authorization headers or cookies in logs/metrics.
- No student identity fields. Extend the privacy allowlist only with explicit review.
- Keep CSRF irrelevant by using header bearer auth, not cookies.
- Validate Origin on WebSocket and CORS on REST.
- Keep payload limits and rate limits.
- Treat transcripts as untrusted input for future LLM prompts.
- Do not claim grounded AI cannot hallucinate.

## Testing requirements

Run before every push:

```bash
cd backend
ruff check app tests
mypy app
pytest -q

cd ../frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

E2E requires a running API and web server:

```bash
cd frontend
pnpm e2e
```

Load testing:

```bash
python scripts/loadtest.py --students 30 --duration 20
```

Report actual output. Never invent a passing test, benchmark, commit SHA, deployment or uptime value. If an environment cannot run Docker or remote CI, say so explicitly.

## Contract generation

```bash
python scripts/export_schemas.py
cd frontend && pnpm contracts
```

CI fails on committed contract drift. Add fixtures for every new event or endpoint.

## Definition of Done

- The feature works through the real application infrastructure.
- Unit/integration coverage exists for the behavior, not just for line count.
- Security and privacy invariants hold.
- Accessibility, keyboard use and reduced motion are considered.
- Locale dictionaries are updated for primary flows (EN/RU/KK).
- Contracts and docs are regenerated/updated.
- Lint, type checks, tests and production build pass locally.
- No secrets or generated build artifacts are staged.
- The verification output is recorded in `docs/BUILD_LOG.md`.
- The change is committed with a Conventional Commit and the resulting SHA is recorded.
- Deferred work is named honestly; nothing is presented as complete when it is not.

## Phase 2 starting point

Read `docs/HANDOVER.md` §"Exact recommended next task". Implement Axiom provider interfaces and transcript-grounded retrieval behind feature flags, with deterministic fallbacks, before generating any student-visible AI output. Do not build the 90-second demo until Replay and BriefNext are real.
