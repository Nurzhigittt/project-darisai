# Contributing

DärisAI is a working Phase 1 vertical slice. The next milestone is Phase 2 (Axiom & Temporal RAG), but the Signal & Ripple boundary must stay stable.

## Before you start

Read:

1. [AGENTS.md](AGENTS.md) — architecture, security and definition of done.
2. [docs/HANDOVER.md](docs/HANDOVER.md) — current state and the exact next task.
3. [docs/SPEC_AUDIT.md](docs/SPEC_AUDIT.md) — the decisions behind the implementation.

## Workflow

```bash
git switch -c feat/phase-2-short-topic
# make focused changes
make lint
make typecheck
make test
cd frontend && pnpm build
git add -A
git commit -m "feat(axiom): describe the verified change"
git push -u origin HEAD
```

- Use Conventional Commits.
- Do not force-push shared branches or rewrite history.
- Keep PRs focused. One concern per PR.
- Regenerate contracts with `make contracts`; never hand-edit `types.gen.ts`.
- Add or update tests for behavior, not for coverage theatre.
- Record actual verification in [docs/BUILD_LOG.md](docs/BUILD_LOG.md).

## Non-negotiables

- No student account, student identity column, or individual student signal history.
- Signal and Replay tokens remain separately scoped.
- No raw tokens, IPs, request bodies or cookies in logs.
- Silence is never reported as understanding.
- Small groups are labelled insufficient participation, not forced into a cluster.
- No secret, generated build directory or dependency directory in Git.
- No invented test result, benchmark, deployment or uptime value.

## Pull request checklist

- [ ] Lint, typecheck and tests pass with real infrastructure.
- [ ] Production build succeeds.
- [ ] Contracts/types regenerated.
- [ ] Privacy and security invariants preserved.
- [ ] Accessibility and EN/RU/KK copy considered.
- [ ] Screenshots/docs updated if the UI changed.
- [ ] Verification output and limitations recorded honestly.

## Reporting a security issue

Please do not open a public issue. Follow [SECURITY.md](SECURITY.md).
