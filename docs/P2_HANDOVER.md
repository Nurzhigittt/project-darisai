# P2 backend handover

**Branch:** `feat/p2-backend-completion`  
**P3 base:** `c21446a6eae7ec94b4c3fa960b8d0964514308a1`  
**Repository:** https://github.com/Nurzhigittt/project-darisai  
**Pull Request:** https://github.com/Nurzhigittt/project-darisai/pull/3  
**Status:** P2 backend completion verified locally and in GitHub CI; Docker/cloud not run.  
**Date:** 26 November 2026 (Asia/Qyzylorda)

## Integration shape

The P2 branch is based on the completed P3 branch so it contains the actual
Axiom engine, hybrid retrieval, live DeepSeek/Groq adapters and all P3 tests. It
does not rewrite P1/P2/P3 history. P3 PR #2 remains open; the P2 PR is the
integration PR to `main`.

## Completed backend surfaces

### Foundation and data

- Clean database migration verified: `001`, `100`, `200`, `300`; pgvector 0.8.1,
  one Uvicorn worker.
- Existing Phase 1 database upgraded to `300_p2_completion` without rewriting
  applied migrations.
- Additive migration `300_p2_completion.sql`: canonical concepts, decision
  history, generation keys, Handoff redemption/revocation, autonomy policy
  metadata, cohort term order, demo sessions.
- `vector(384)` and HNSW cosine index preserved.

### Canonical concepts and cohort

- `ConceptCatalogService` builds a small deterministic concept map from actual
  transcript text and links it to `canonical_concepts` per course. Re-import is
  idempotent; unknown text falls back to a normalized key.
- `GET /api/v1/courses/{course_id}/cohort-memory` now includes
  `structural_gaps` alongside live concept metrics.
- Structural-gap rule: at least **3 consecutive terms**, confusion share
  **≥ 0.60** in each, and **≥ 3 lectures** per term. Synthetic/observed/mixed
  provenance is explicit.
- `scripts/seed_cohort_demo.py` creates only `synthetic=true` rows and never
  touches other courses.

### Autonomy

- `locked` is the default.
- Whitelisting requires **30 days** of observation, **5 approvals**, at most
  **2 rejections**, and at least **5 decisions**. The professor action is
  explicit; reaching the thresholds does not auto-enable anything.
- Approvals/rejections and decision history are written atomically with the
  insight decision.
- No autonomous publication endpoint exists. Handoff publication still requires
  teacher `approved` status; whitelisting does not bypass approval.
- `StagedAutonomyPolicy.can_publish` remains the policy consumption point.

### Insights and Handoff

- `POST /lectures/{id}/insights/generate` remains professor-only and produces
  `pending_approval`.
- Repeated generation uses a stable `generation_key`; the same lecture/kind/
  cluster/max-concepts request returns the existing insight instead of creating
  duplicates.
- Every approve/edit/reject/publish/revoke writes an immutable
  `insight_decisions` row with status transition, reason and content hash.
- `GET /lectures/{id}/insights/{id}/decisions` exposes the audit trail.
- Handoff publish revokes previous active links, stores only the token hash and
  returns the URL-fragment token.
- Redemption increments redeem counters; invalid/expired/revoked links return
  404; redemption is IP rate-limited.
- `POST /lectures/{id}/insights/{id}/handoff/revoke` revokes active links.
- Edit/reject revoke links and require re-approval before publishing again.

### Demo backend

- `GET /api/v1/demo/scenarios`
- `POST /api/v1/demo/lectures` — creates an isolated `is_demo=true` lecture,
  loads the 40-segment Bernoulli scenario, persists embeddings/concepts and
  creates a `demo_sessions` row.
- `POST /api/v1/demo/lectures/{id}/reset` — clears signals, clusters and insights,
  keeps the transcript, returns the lecture to `scheduled`.
- `DELETE /api/v1/demo/lectures/{id}` — deletes only an owned synthetic demo.
- `POST /api/v1/demo/cleanup` — deletes expired demo sessions/lectures.
- P4 can use the normal join/control/WebSocket APIs; no parallel simulator exists.
- Demo actions cannot reset or delete a non-demo lecture.

## API additions

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/lectures/{id}/insights/{insight_id}/decisions` | Professor |
| POST | `/api/v1/lectures/{id}/insights/{insight_id}/handoff/revoke` | Professor |
| GET | `/api/v1/demo/scenarios` | Professor |
| POST | `/api/v1/demo/lectures` | Professor |
| POST | `/api/v1/demo/lectures/{id}/reset` | Professor |
| DELETE | `/api/v1/demo/lectures/{id}` | Professor |
| POST | `/api/v1/demo/cleanup` | Professor |

OpenAPI and generated TypeScript were regenerated. Contract generation is
idempotent.

## Verification

- Backend: **121 tests passed**
- Ruff: clean
- mypy: clean
- Frontend lint/typecheck/unit/build: passed
- Contracts: regenerated
- Clean DB migration: 4 migrations, 19 tables, pgvector 0.8.1
- Phase 1 upgrade: 4 migrations applied successfully
- 300-client load test: **300/300**, 0 errors, ack p95 **14.71 ms**,
  Signal-to-Ripple p95 **396.84 ms**, p99 468.60 ms
- Load-test CPU estimate: ~13.8% of 4 cores; API working set ~164 MB during the
  run. These are single-sample observations, not capacity guarantees.
- Docker/cloud: not run.
- GitHub CI: run `45781063448` success; End-to-end `45781063634` success.

## P1 integration

- Use generated `types.gen.ts`; do not hand-edit it.
- Handoff revocation is a new route; render a revoked-link state.
- Insight decisions are an audit trail; do not expose `content_hash` or
  professor IDs beyond the existing professor context.
- Cohort `structural_gaps` can be empty; `provenance=synthetic` must be visibly
  labeled.
- Autonomy `eligible=false` means the whitelist action will return
  `AUTONOMY_NOT_ELIGIBLE`; do not optimistically enable the toggle.
- Demo routes are professor-only; P4 can reuse the normal join/WS flow.

## P4 integration

- Create a demo with `POST /api/v1/demo/lectures`; response includes
  `lecture_id`, `join_code`, `join_url`, `expires_at`, `transcript_segments`.
- Start/end with the ordinary `/control` route.
- Connect 40 synthetic students through `/join` and `/ws`; no special demo
  WebSocket.
- Reset between runs; cleanup expired runs when needed.
- All demo data is labeled synthetic and isolated by `demo_sessions`.

## Actual request/response examples

### Create an isolated demo (P4)

```http
POST /api/v1/demo/lectures
Authorization: Bearer <professor-jwt>
Content-Type: application/json

{"scenario": "bernoulli_ru"}
```

```json
{
  "lecture_id": "d0f4f4ef-2a3f-4ff5-9e31-8d8f7c1cf001",
  "course_id": "f3a1c1bc-6bf8-4fa8-b28f-7208b84ef002",
  "title": "Bernoulli: pressure and flow",
  "language": "ru",
  "status": "scheduled",
  "join_code": "7K4M2Q",
  "join_url": "http://localhost:3000/join/7K4M2Q",
  "synthetic": true,
  "scenario": "bernoulli_ru",
  "transcript_segments": 40,
  "expires_at": "2026-11-26T10:30:00Z"
}
```

Then P4 starts the lecture with the ordinary control endpoint, joins 40 synthetic
students, and connects them to `/ws`. No demo-specific WebSocket is used.

### Insight decision history

```http
GET /api/v1/lectures/{lecture_id}/insights/{insight_id}/decisions
Authorization: Bearer <professor-jwt>
```

```json
[
  {
    "decision_id": "0d8f2e62-6b2e-4e68-9ca1-5b82f9a2c003",
    "insight_id": "c35a8c40-cb5d-4d30-93a2-bc8e21d9a004",
    "action": "approve",
    "from_status": "pending_approval",
    "to_status": "approved",
    "reason": null,
    "concept_canonical_id": "b0f6d4a6-5b9c-4c1f-9c8d-2e1e6a3f3005",
    "created_at": "2026-11-26T09:00:00Z"
  }
]
```

### Cohort structural gap

```json
{
  "minimum_lectures_required": 5,
  "minimum_participants_per_lecture": 3,
  "concepts": [],
  "structural_gaps": [
    {
      "concept_canonical_id": "b0f6d4a6-5b9c-4c1f-9c8d-2e1e6a3f3005",
      "concept_title": "Pressure and flow",
      "terms": ["2025-Fall", "2026-Spring", "2026-Fall"],
      "consecutive_terms": 3,
      "min_confused_share": 0.66,
      "max_confused_share": 0.74,
      "provenance": "synthetic",
      "note": "Structural-gap rule: at least three consecutive terms ..."
    }
  ],
  "generated_at": "2026-11-26T09:00:00Z",
  "interpretation_note": "Signal and Ripple cluster metrics are observed events..."
}
```

### Autonomy response

```json
{
  "lecture_id": "d0f4f4ef-2a3f-4ff5-9e31-8d8f7c1cf001",
  "course_id": "f3a1c1bc-6bf8-4fa8-b28f-7208b84ef002",
  "concept_canonical_id": "b0f6d4a6-5b9c-4c1f-9c8d-2e1e6a3f3005",
  "concept_title": "Pressure and flow",
  "mode": "locked",
  "approvals": 0,
  "rejections": 0,
  "eligible": false,
  "observation_started_at": "2026-11-26T09:00:00Z",
  "whitelisted_at": null,
  "policy_reason": null,
  "updated_at": "2026-11-26T09:00:00Z"
}
```

## Known limitations

- Demo reset keeps the transcript and embeddings; it does not re-record audio.
- No streaming audio; audio chunks are transcribed synchronously.
- Structural-gap thresholds are engineering defaults; synthetic demo data is
  explicit, not real institutional history.
- Autonomy has no auto-publication UI/path by design; manual approval remains
  mandatory.
- One API worker remains the supported shape.
- No Docker/cloud verification.
- Provider retention and live adversarial safety remain outside P2 scope; see
  `P3_HANDOVER.md` and `GUARDRAILS_REPORT.md`.

## Commit references

| Commit | Meaning |
| --- | --- |
| `c21446a` | P3 base integrated into this branch |
| `775cd96` | P2 backend completion: migration, cohort/autonomy/Handoff/demo, tests |
| `1d9e4b9` | P2 handover, verification matrix, load evidence |
| `ca8b1e3` | Final secret-scan allowlist for a synthetic frontend test fixture |

The CI-verified P2 code commit is `ca8b1e3`; this handover-only update follows it and
does not change backend behavior.
