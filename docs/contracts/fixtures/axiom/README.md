# Axiom integration fixtures

Examples for P1 and P2. They are **synthetic contract examples**, not captured
live-model outputs. `_comment` fields are explanatory and are not sent.

| File | Endpoint | Auth |
| --- | --- | --- |
| `transcript-import.json` | `POST /api/v1/lectures/{lecture_id}/transcript/import` | Professor Bearer |
| `replay-start.json` | `POST /api/v1/replay/start` | `X-Replay-Token` |
| `replay-turn.json` | `POST /api/v1/replay/turn` | `X-Replay-Token` |
| `gapcards.json` | `POST /api/v1/gapcards/generate` | `X-Replay-Token` |
| `intelligence.json` | `POST /api/v1/lectures/{lecture_id}/insights/generate` | Professor Bearer |
| `failures.json` | Loading, error and template-fallback shapes for P1 | mixed |
| `mcq.json` | Stable MCQ turn shape | `X-Replay-Token` |

The actual OpenAPI contract is `docs/contracts/openapi.json`. The generated
TypeScript types are `frontend/src/lib/api/types.gen.ts`.

## Integration rules

- Replay Token scope is separate from Signal Token scope.
- A replay is available only after the lecture has ended and a transcript exists.
- `moment_id` and `state_token` are signed; never create or edit them in the client.
- Send the latest `state_token` on every turn.
- `history` is bounded and untrusted; the server does not treat it as proof.
- `source=template` means deterministic fallback, not live AI generation.
- Generated insights enter `pending_approval`; P2 owns approval and publication.
