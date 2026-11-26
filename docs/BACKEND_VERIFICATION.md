# Backend verification matrix

**Scope:** P2 completion on the P3-integrated branch.  
**Legend:** ✅ verified locally · ⚠️ implemented but limited/unverified · ⛔ missing/blocked.

| Requirement | Status | Evidence |
| --- | --- | --- |
| PostgreSQL connectivity/pooling | ✅ | 121 tests; `/ready`; clean migration |
| pgvector `vector(384)` + HNSW cosine | ✅ | migration 001/200; clean DB 0.8.1 |
| Migration ordering/idempotency | ✅ | clean DB: 4 migrations; Phase 1 upgrade: 4 applied |
| Foreign keys/constraints | ✅ | clean DB 19 tables; tests exercise ownership |
| Redis TTL/windows/Lua/idempotency | ✅ | Phase 1 tests + 300-client load |
| Professor invite/JWT issuer/audience/expiry | ✅ | auth tests; security integration |
| Student Signal/Replay scope separation | ✅ | P3 tests + `test_p2_security` |
| Course/lecture object ownership | ✅ | cross-professor test returns 404 |
| Lecture lifecycle and concurrent control | ✅ | transition tests; row lock |
| Signal/Ripple, clusters, analytics | ✅ | Phase 1/2 tests + load test |
| Axiom lifecycle/ingestion/retrieval | ✅ | P3 tests; live provider smoke |
| Transcript API and audio constraints | ⚠️ | P3 tests/import; real audio provider path live-verified, audio endpoint itself not live-tested with a real lecture recording |
| Replay/GapCards auth/state | ✅ | P3 tests; live smoke |
| Insight decisions/history | ✅ | P2 integration test; decision endpoint |
| Handoff publish/redeem/revoke/rate limit | ✅ | P2 integration; unit tests; rate limiter wired |
| BriefNext/Handoff live generation | ✅ | live DeepSeek smoke + live P2 API check |
| Approval state machine | ✅ | unit tests + integration |
| Canonical concept mapping | ✅ | concept catalog + P2 integration; 7 concepts from Bernoulli |
| Cohort structural gaps | ✅ | synthetic 3-term test; provenance labeled |
| Staged autonomy eligibility | ✅ | 30-day/5-approval test; locked default |
| Demo backend isolation/reset | ✅ | demo integration test (40 segments) |
| Security route coverage | ✅ | no-auth + cross-professor tests |
| Privacy/no student tables | ✅ | existing privacy tests/schema |
| API contracts | ✅ | OpenAPI generated; drift stable |
| 300-client performance | ✅ | 300/300, 0 errors, p95 396.84 ms |
| Docker/Compose | ⛔ | Docker unavailable |
| Cloud deployment | ⛔ | out of scope |
| Multi-worker evaluator | ⛔ | single-worker architecture |

## Test commands

```bash
cd backend
ruff check app tests evals
mypy app
pytest -q
```

## Actual results

- `pytest -q`: **121 passed**
- Ruff: clean
- mypy: clean
- Frontend: ESLint, TypeScript, Vitest 11/11, production build passed
- CI: pending this branch's push; prior P3 CI was green
- Secret scanning: prior P3 CI green; no keys committed
- Load test: `artifacts/loadtest/loadtest-20261126T075720Z.json`

## Not verified

- Docker Compose build/boot and model-cache volume permissions.
- Cloud/proxy/TLS behavior.
- Real 40-student simulator timing (P4 owns).
- Broad live adversarial safety and human evaluation.
- Long-duration memory stability.
