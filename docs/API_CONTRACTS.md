# API contracts

The primary source of truth is Pydantic. Committed artifacts:

- [`contracts/openapi.json`](contracts/openapi.json)
- [`contracts/ws-events.schema.json`](contracts/ws-events.schema.json)
- [`contracts/fixtures/`](contracts/fixtures/)
- [`../frontend/src/lib/api/types.gen.ts`](../frontend/src/lib/api/types.gen.ts)

Regenerate with `make contracts`. CI fails if the committed generated files drift.

## REST

Base URL: `http://<api-host>:8000/api/v1` locally. JSON UTF-8. IDs are UUID v4. Lecture time is `offset_ms` (integer, server clock, excluding pauses). Calendar time is ISO-8601 UTC.

### Authentication

Professor endpoints use `Authorization: Bearer <JWT>`. Replay and GapCards use `X-Replay-Token`; a Signal Token must not authorize them. Temporary credentials are never placed in query strings.

### Endpoints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Process liveness only |
| GET | `/ready` | public | PostgreSQL + Redis dependency check; 503 if unavailable |
| GET | `/api/v1/status` | public | Factual component status, connection count, process counters and limits |
| GET | `/api/v1/metrics` | public | Prometheus text metrics |
| GET | `/api/v1/privacy/manifest` | public | Manifest generated from the live schema |
| POST | `/api/v1/auth/professor` | public | `{invite_code}` → professor JWT |
| GET | `/api/v1/courses` | professor | Owned courses |
| POST | `/api/v1/courses` | professor | Create/idempotently get a course |
| POST | `/api/v1/lectures` | professor | Create lecture; returns join code and join URL |
| GET | `/api/v1/lectures` | professor | Owned lectures |
| GET | `/api/v1/lectures/{id}` | professor | Owned lecture detail |
| POST | `/api/v1/lectures/{id}/control` | professor | `start`, `pause`, `resume`, `end` |
| GET | `/api/v1/lectures/{id}/heatmap` | professor | Minute aggregates and clusters |
| GET | `/api/v1/lectures/{id}/summary` | professor | Factual post-lecture aggregate summary |
| GET | `/api/v1/join/{code}/preview` | public | Validate a code and preview a lecture |
| POST | `/api/v1/join` | public | Anonymous join; Signal + Replay tokens |
| POST | `/api/v1/lectures/{id}/transcript/import` | professor | Timestamped JSON transcript import; idempotent segments |
| POST | `/api/v1/lectures/{id}/audio-chunks` | professor | Multipart audio chunk → Whisper-compatible STT |
| GET | `/api/v1/lectures/{id}/transcript` | professor | Owned transcript, embedding counts and latest run |
| POST | `/api/v1/replay/start` | Replay Token | Signed replay moments from flagged offsets |
| POST | `/api/v1/replay/turn` | Replay Token | Stateless Socratic turn with signed state |
| POST | `/api/v1/gapcards/generate` | Replay Token | Grounded review cards from signed moments |
| POST | `/api/v1/lectures/{id}/insights/generate` | professor | BriefNext/Handoff → P2 `pending_approval` |
| GET | `/api/v1/lectures/{id}/insights/{insight_id}/decisions` | professor | Immutable decision history |
| POST | `/api/v1/lectures/{id}/insights/{insight_id}/handoff/revoke` | professor | Revoke active Handoff links |
| GET | `/api/v1/lectures/{id}/concept-autonomy` | professor | Concept autonomy policy and eligibility |
| PUT | `/api/v1/lectures/{id}/concept-autonomy/{concept_id}` | professor | Explicit lock/whitelist decision |
| GET | `/api/v1/courses/{id}/cohort-memory` | professor | Cohort metrics and structural gaps |
| GET | `/api/v1/demo/scenarios` | professor | Synthetic scenarios |
| POST | `/api/v1/demo/lectures` | professor | Create isolated synthetic demo |
| POST | `/api/v1/demo/lectures/{id}/reset` | professor | Reset signals/clusters/insights |
| DELETE | `/api/v1/demo/lectures/{id}` | professor | Delete isolated demo |
| POST | `/api/v1/demo/cleanup` | professor | Delete expired demos |

### Key request/response shapes

```json
POST /api/v1/lectures
{
  "course_id": "9c2e1acc-d484-4dee-b8d8-af043e88b0f7",
  "title": "Signals and Bernoulli",
  "language": "en"
}
→ 201
{
  "lecture_id": "c2a7e1d4-5b0f-4e63-a1c9-7d3f2b8e4a50",
  "join_code": "MRYA6R",
  "join_url": "https://app.example/join/MRYA6R",
  "status": "scheduled",
  "offset_ms": 0
}
```

```json
POST /api/v1/join
{ "join_code": "MRYA6R" }
→ 200
{
  "signal_token": "daris1.signal.<payload>.<signature>",
  "replay_token": "daris1.replay.<payload>.<signature>",
  "lecture": {
    "id": "c2a7e1d4-5b0f-4e63-a1c9-7d3f2b8e4a50",
    "title": "Signals and Bernoulli",
    "status": "live",
    "language": "en"
  },
  "ws_url": "wss://api.example/ws",
  "offset_ms": 251340,
  "signal_cooldown_ms": 15000,
  "signal_token_expires_at": "2026-11-25T20:24:11Z",
  "replay_token_expires_at": "2026-11-26T16:24:11Z"
}
```

```json
POST /api/v1/lectures/{id}/control
{ "action": "pause" }
→ 200
{
  "lecture_id": "c2a7e1d4-5b0f-4e63-a1c9-7d3f2b8e4a50",
  "status": "paused",
  "started_at": "2026-11-25T16:20:00Z",
  "ended_at": null,
  "offset_ms": 251340
}
```

### Error format

Every REST error:

```json
{
  "error": {
    "code": "LECTURE_NOT_LIVE",
    "message": "This lecture has ended. Ask your professor for a new join code.",
    "request_id": "5d2d..."
  }
}
```

Codes: `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `INVALID_TRANSITION` 409, `LECTURE_NOT_LIVE` 409, `VALIDATION_FAILED` 422, `RATE_LIMITED` 429, `SERVICE_UNAVAILABLE` 503, `INTERNAL` 500. Validation errors list field paths but never echo submitted values.

## WebSocket

Endpoint: `/ws`. Credentials travel **inside the first hello payload**, never in the URL. Every message is one JSON envelope:

```ts
type Envelope<T> = {
  v: 1;
  type: string;
  msg_id: string;     // UUID generated by sender
  ts: string;         // ISO-8601 UTC
  lecture_id: string; // must match the authenticated lecture
  payload: T;
};
```

### Handshake

1. Open `wss://.../ws` with an allowed browser Origin.
2. Send `hello` within 3 seconds.
3. Student hello: `{role:"student", signal_token:"daris1.signal...."}`.
4. Professor hello: `{role:"professor", access_token:"<JWT>"}`.
5. Server sends `hello_ok` with offset, lecture status, cooldown, role and replay availability.
6. Professor additionally receives the current `ripple_update` snapshot.

### Events

| Direction | Type | Payload |
| --- | --- | --- |
| C→S | `hello` | `{role:"student",signal_token}` or `{role:"professor",access_token}` |
| S→C | `hello_ok` | `{offset_ms, lecture_status, signal_cooldown_ms, connecting_role, replay_scope_available, server_time}` |
| C→S | `student_signal` | `{client_seq, kind:"lost", client_ts_ms?}` |
| S→C | `signal_ack` | `{client_seq, accepted, offset_ms, reason?, retry_after_ms?, duplicate}` |
| S→C | `ripple_update` | `{ripple_seq, offset_ms, intensity, state, availability, status_label, cluster?, active_participants, unique_in_window, threshold, window_ms}` |
| C→S | `lecture_control` | `{action:"start"|"pause"|"resume"|"end"}` (professor) |
| S→C | `lecture_state` | `{status:"live"|"paused"|"ended", offset_ms}` |
| Both | `ping` / `pong` | `{}` |
| S→C | `error` | `{code, message, retryable}` |

`ripple_update.state` is exactly `connected | rising | cluster | recovering`. Additive status fields prevent silence from being interpreted as understanding. Aggregate counts are provided for the professor UI's optional details; no token hashes are sent.

### Close codes

| Code | Meaning |
| --- | --- |
| 4401 | Unauthorized / invalid hello |
| 4403 | Origin not allowed |
| 4408 | Hello timeout |
| 4409 | Lecture ended |
| 4429 | WebSocket rate limit |
| 1008 | Invalid message schema |
| 1009 | Message too large |
| 1001 | Server shutdown / heartbeat timeout |

### Limits

- Incoming message limit: 4096 bytes (configurable; documented deviation from the PDF's 1 KB).
- Per-connection rate: 10 messages/s with burst 20.
- Heartbeat: server ping every 20 s; idle timeout 75 s.
- Ripple broadcast: 500 ms minimum spacing; sent on state change, intensity delta ≥ 0.02, or unique-window change.
- Signals: 15 s server cooldown; 30 s maximum offline queue age.

### Idempotency

The server computes a SHA-256 Signal Token hash and atomically checks `(token_hash, client_seq)` before cooldown. A duplicate returns `accepted=false, duplicate=true` and is not counted again. This survives reconnects because the key lives for one hour.

### Contract fixtures

| Fixture | Purpose |
| --- | --- |
| `ws-hello-student.json` | student handshake |
| `ws-hello-professor.json` | professor handshake |
| `ws-hello-ok.json` | successful handshake |
| `ws-student-signal.json` | signal |
| `ws-signal-ack.json` | acknowledgement |
| `ws-ripple-update.json` | cluster update |
| `ws-lecture-state.json` | pause state |
| `ws-error.json` | error |
| `rest-*.json` | auth, lecture, join, heatmap examples |

Fixtures contain placeholder credentials, not usable secrets.

## P2 completion notes

- Insight decisions are append-only; `GET .../decisions` returns action, status transition, reason and timestamp. It does not expose professor IDs or content hashes to students.
- Handoff publication revokes prior active links; redeem is rate-limited per IP, expiry/revocation are enforced, and `revoke` is professor-only.
- Cohort `structural_gaps` carries `provenance` (`synthetic`, `observed`, `mixed`). The demo seed is explicitly synthetic.
- Autonomy defaults to `locked`; whitelist returns `AUTONOMY_NOT_ELIGIBLE` until the 30-day/approval/rejection/decision thresholds are met. No automatic publication path exists.
- Demo endpoints only operate on `is_demo=true` lectures with an owned `demo_sessions` row.

## Axiom (P3)

- Full source of truth: `backend/app/schemas/axiom.py`, plus `InsightOut` from P2.
- Examples: [`contracts/fixtures/axiom/`](contracts/fixtures/axiom/).
- Transcript import: professor-only, 1..400 segments by runtime config, max 8,000 chars each, `end_ms >= start_ms`.
- Audio: multipart `file`, `chunk_index`, `start_ms`, `mime_type`; max 25 MiB; `completed` means transcription and persistence finished.
- Replay start: 1..20 offsets, 20 s dedupe, lecture must be ended with a transcript.
- Replay turn: `state_token` is required after the first turn; request `history` is bounded and untrusted.
- GapCards: 1..20 signed moments; max 10 unique cards returned.
- Intelligence: professor-only, ended lecture with a persisted cluster; result enters `pending_approval`.
- AI errors use the normal error envelope: `TRANSCRIPT_REQUIRED`, `LECTURE_NOT_ENDED`, `REPLAY_STATE_INVALID`, `REPLAY_STATE_EXPIRED`, `REPLAY_COMPLETE`, `AI_BUDGET_EXHAUSTED`, `STT_NOT_CONFIGURED`.

Replay/GapCards require `X-Replay-Token`. No AI endpoint accepts a Signal Token.

## Change policy

After the Phase 0/1 baseline, prefer additive changes with optional fields. Regenerate artifacts rather than hand-editing generated TypeScript. Breaking changes require an explicit ADR and coordinated frontend update.
