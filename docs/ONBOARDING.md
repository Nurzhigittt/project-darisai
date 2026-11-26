# Developer onboarding

This is the fastest path from a clean checkout to a working local DärisAI lecture. The project is a FastAPI + Next.js modular monolith. There is no microservice to start.

## 1. Prerequisites

- Python 3.12+
- Node 24 and pnpm
- PostgreSQL 16+ with the `pgvector` extension
- Redis 5+
- Optional: Docker Compose (the Compose path is committed but was not verified locally)

```bash
cp .env.example .env
```

Development defaults use the seeded professor **`DARIS-TEACH-2026`**. Never use that code in a deployed environment.

## 2. Backend

```bash
cd backend
python -m venv .venv
# Windows: .\.venv\Scripts\python -m pip install -e ".[dev]"
# Unix:    source .venv/bin/activate && pip install -e ".[dev]"
python -m app.migrate
python -m app.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check:

```bash
curl http://127.0.0.1:8000/ready
```

The readiness probe requires PostgreSQL and Redis. A successful `/health` is only process liveness.

## 3. Frontend

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. Use the seeded invite code, create a course lecture, start it, and join from a second browser/incognito window.

## 4. Tests and contracts

```bash
cd backend
ruff check app tests
mypy app
pytest -q
```

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Regenerate contracts after any Pydantic or route change:

```bash
python scripts/export_schemas.py
cd frontend && pnpm contracts
```

Never hand-edit `frontend/src/lib/api/types.gen.ts`.

## 5. Architecture map

| Area | Path |
| --- | --- |
| REST routes | `backend/app/api/v1/` |
| Realtime gateway and Ripple | `backend/app/realtime/` |
| Axiom retrieval, generation, validation | `backend/app/axiom/` |
| Services and ownership | `backend/app/services/` |
| SQL migrations | `backend/migrations/` |
| App Router screens | `frontend/src/app/` |
| Product flows | `frontend/src/features/` |
| API client and generated types | `frontend/src/lib/api/` |
| Brand assets | `brand/`; guide: `docs/BRAND.md` |

Read [ARCHITECTURE.md](../ARCHITECTURE.md), [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md) and [API_CONTRACTS.md](API_CONTRACTS.md) before changing data boundaries.

## 6. Privacy invariants

Do not add:

- a student account, name, email, phone or device fingerprint;
- a persistent individual signal history;
- a persistent student dialogue table;
- raw tokens in logs or PostgreSQL;
- raw audio retention without an explicit product decision.

Professor identity is the only persistent personal identity. Signal and Replay tokens are separate capabilities. See [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md).

## 7. Local AI

The core Signal/Ripple loop never calls an LLM. To enable transcript-grounded generation, configure an OpenAI-compatible provider and/or Groq Whisper:

- [AI provider setup](AI_PROVIDER_SETUP.md)
- [AI production readiness](AI_PRODUCTION_READINESS.md)
- [Guardrails](GUARDRAILS_REPORT.md)

Template fallback is a real supported path and is labelled `source=template`.

## 8. Demo data

- Synthetic transcript: `backend/app/demo/scenarios/bernoulli_ru.json`
- Isolated demo backend: `POST /api/v1/demo/lectures` (professor only)
- Seed synthetic cohort history: `python scripts/seed_cohort_demo.py --course-id <uuid>`

All demo/cohort data is labelled synthetic. Do not present it as real institutional history.

## 9. Visual verification

Brand assets are generated from the supplied mark, not redrawn:

```bash
python scripts/build_brand_assets.py
python scripts/render_brand_banners.py
python scripts/render_brand_diagrams.py
python scripts/build_signal_gif.py
```

Product screenshots are captured from the running application with synthetic test data. Do not add fake customers, funding or performance claims.

## 10. Before a pull request

- [ ] Backend lint, types and tests pass.
- [ ] Frontend lint, types, unit tests and production build pass.
- [ ] Playwright and axe pass for affected flows.
- [ ] Contracts regenerated and stable.
- [ ] No secret, raw audio, model cache or personal data committed.
- [ ] Docs/handover updated with actual results.
- [ ] New UI copy exists in EN/RU/KK.
- [ ] Accessibility and reduced motion checked.

Open a PR using the repository template. Do not merge without team authorization.
