# Contributing to DärisAI

DärisAI is a student-first classroom intelligence product. Small, focused
changes are preferred over large rewrites. Read [AGENTS.md](AGENTS.md),
[docs/ONBOARDING.md](docs/ONBOARDING.md) and [docs/SECURITY_PRIVACY.md](docs/SECURITY_PRIVACY.md)
before touching data boundaries or credentials.

## Setup

```bash
cp .env.example .env
cd backend
python -m venv .venv
python -m pip install -e ".[dev]"
python -m app.migrate
python -m app.seed
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

## Workflow

```bash
git switch -c feat/short-topic
# implement and test
ruff check app tests
mypy app
pytest -q
cd ../frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

- Use Conventional Commits.
- Never force-push shared branches or rewrite history.
- Keep one concern per pull request.
- Regenerate contracts with `python scripts/export_schemas.py` and `pnpm contracts`; never hand-edit `types.gen.ts`.
- Record actual verification and limitations in [docs/BUILD_LOG.md](docs/BUILD_LOG.md).
- Use the existing **ä** mark and official mint/berry identity. Read [docs/BRAND.md](docs/BRAND.md) before adding visual assets.

## Non-negotiables

- No student account, name, email, phone, device fingerprint or individual signal history.
- No persistent student dialogue table.
- Signal and Replay tokens remain separately scoped.
- No raw tokens, IPs, request bodies, audio or cookies in logs or Git.
- Silence is never reported as understanding; small groups are `insufficient_participation`.
- Teacher approval cannot be bypassed by AI generation.
- Do not claim offline/local AI, cloud deployment, physical-device or accessibility success without actual evidence.

## Pull request checklist

- [ ] Backend lint, types and tests pass.
- [ ] Frontend lint, types, tests and production build pass.
- [ ] Playwright and axe pass for affected flows.
- [ ] Contracts regenerated and stable.
- [ ] EN/RU/KK copy updated for visible changes.
- [ ] Light/dark and reduced-motion behaviour checked.
- [ ] Screenshots/docs updated if visuals changed.
- [ ] No secret, raw audio, model cache or personal data staged.

## Security

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
