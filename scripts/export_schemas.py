#!/usr/bin/env python3
"""Export committed API and WebSocket contracts from Pydantic models.

Run from the repository root:
    python scripts/export_schemas.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402
from app.schemas.ws import EVENT_PAYLOAD_SCHEMAS  # noqa: E402

CONTRACTS = ROOT / "docs" / "contracts"
FIXTURES = CONTRACTS / "fixtures"

LECTURE_ID = "c2a7e1d4-5b0f-4e63-a1c9-7d3f2b8e4a50"
MSG_ID = "6b1f0c3e-8a52-4d0e-9d57-2f0b7c1a9e11"
PROFESSOR_ID = "2f2b49e9-4e93-48c6-8e57-5497038a04b2"


def envelope(event_type: str, payload: dict[str, object]) -> dict[str, object]:
    return {
        "v": 1,
        "type": event_type,
        "msg_id": MSG_ID,
        "ts": "2026-11-25T16:24:11.123Z",
        "lecture_id": LECTURE_ID,
        "payload": payload,
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    CONTRACTS.mkdir(parents=True, exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)

    openapi = app.openapi()
    write_json(CONTRACTS / "openapi.json", openapi)

    envelope_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["v", "type", "msg_id", "ts", "lecture_id", "payload"],
        "properties": {
            "v": {"const": 1},
            "type": {"type": "string"},
            "msg_id": {"type": "string", "format": "uuid"},
            "ts": {"type": "string", "format": "date-time"},
            "lecture_id": {"type": "string", "format": "uuid"},
            "payload": {"type": "object"},
        },
    }
    events = {
        name: model.model_json_schema(ref_template="#/$defs/{model}")
        for name, model in sorted(EVENT_PAYLOAD_SCHEMAS.items())
    }
    ws_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "DärisAI WebSocket protocol v1",
        "description": (
            "One lecture-scoped envelope per message. Credentials travel inside the "
            "hello payload, never in the WebSocket URL."
        ),
        "envelope": envelope_schema,
        "events": events,
        "direction": {
            "client_to_server": ["hello", "student_signal", "lecture_control", "ping", "pong"],
            "server_to_client": [
                "hello_ok",
                "signal_ack",
                "ripple_update",
                "lecture_state",
                "ping",
                "pong",
                "error",
            ],
        },
        "close_codes": {
            "4401": "unauthorized",
            "4403": "origin not allowed",
            "4408": "hello timeout",
            "4409": "lecture ended",
            "4429": "rate limit",
        },
        "error_codes": [
            "UNAUTHORIZED",
            "HELLO_REQUIRED",
            "HELLO_TIMEOUT",
            "INVALID_MESSAGE",
            "INVALID_HELLO",
            "ROLE_FORBIDDEN",
            "CROSS_LECTURE_DENIED",
            "MESSAGE_TOO_LARGE",
            "RATE_LIMITED",
            "LECTURE_ENDED",
            "SIGNAL_PROCESSING_FAILED",
            "INTERNAL",
        ],
    }
    write_json(CONTRACTS / "ws-events.schema.json", ws_schema)

    write_json(
        FIXTURES / "ws-hello-student.json",
        envelope(
            "hello",
            {
                "role": "student",
                "signal_token": "daris1.signal.<fixture-payload>.<fixture-signature>",
            },
        ),
    )
    write_json(
        FIXTURES / "ws-hello-professor.json",
        envelope(
            "hello",
            {
                "role": "professor",
                "access_token": "<fixture-professor-jwt-not-a-real-secret>",
            },
        ),
    )
    write_json(
        FIXTURES / "ws-hello-ok.json",
        envelope(
            "hello_ok",
            {
                "offset_ms": 251_340,
                "lecture_status": "live",
                "signal_cooldown_ms": 15_000,
                "connecting_role": "student",
                "replay_scope_available": True,
                "server_time": "2026-11-25T16:24:11.127Z",
            },
        ),
    )
    write_json(
        FIXTURES / "ws-student-signal.json",
        envelope(
            "student_signal",
            {"client_seq": 3, "kind": "lost", "client_ts_ms": 1_795_603_451_123},
        ),
    )
    write_json(
        FIXTURES / "ws-signal-ack.json",
        envelope(
            "signal_ack",
            {
                "client_seq": 3,
                "accepted": True,
                "offset_ms": 251_340,
                "reason": None,
                "retry_after_ms": None,
                "duplicate": False,
            },
        ),
    )
    write_json(
        FIXTURES / "ws-ripple-update.json",
        envelope(
            "ripple_update",
            {
                "ripple_seq": 142,
                "offset_ms": 251_340,
                "intensity": 0.86,
                "state": "cluster",
                "availability": "ok",
                "status_label": "clarification_may_be_helpful",
                "cluster": {
                    "cluster_id": "a91d2c40-7e55-4f1b-b3a8-0c6d9e2f1a47",
                    "started_offset_ms": 243_000,
                    "peak_intensity": 0.91,
                },
                "active_participants": 40,
                "unique_in_window": 14,
                "threshold": 6,
                "window_ms": 20_000,
            },
        ),
    )
    write_json(
        FIXTURES / "ws-lecture-state.json",
        envelope("lecture_state", {"status": "paused", "offset_ms": 251_340}),
    )
    write_json(
        FIXTURES / "ws-error.json",
        envelope(
            "error",
            {
                "code": "RATE_LIMITED",
                "message": "Too many WebSocket messages.",
                "request_id": None,
                "retryable": True,
            },
        ),
    )
    write_json(
        FIXTURES / "rest-auth-professor-request.json",
        {"invite_code": "FIXTURE-INVITE-CODE"},
    )
    write_json(
        FIXTURES / "rest-auth-professor-response.json",
        {
            "access_token": "<fixture-professor-jwt-not-a-real-secret>",
            "token_type": "bearer",
            "expires_in": 43_200,
            "professor": {"id": PROFESSOR_ID, "name": "Professor Fixture"},
        },
    )
    write_json(
        FIXTURES / "rest-lecture-create-request.json",
        {
            "course_id": "9c2e1acc-d484-4dee-b8d8-af043e88b0f7",
            "title": "Signals and Bernoulli",
            "language": "en",
        },
    )
    write_json(
        FIXTURES / "rest-lecture-response.json",
        {
            "lecture_id": LECTURE_ID,
            "course_id": "9c2e1acc-d484-4dee-b8d8-af043e88b0f7",
            "course_title": "Applied Physics",
            "title": "Signals and Bernoulli",
            "language": "en",
            "status": "scheduled",
            "join_code": "MRYA6R",
            "join_url": "http://localhost:3000/join/MRYA6R",
            "started_at": None,
            "ended_at": None,
            "offset_ms": 0,
            "accepted_signals": 0,
            "unique_participants": None,
            "created_at": "2026-11-25T16:24:11.123Z",
        },
    )
    write_json(
        FIXTURES / "rest-join-response.json",
        {
            "signal_token": "daris1.signal.<fixture-payload>.<fixture-signature>",
            "replay_token": "daris1.replay.<fixture-payload>.<fixture-signature>",
            "token_type": "temporary",
            "lecture": {
                "id": LECTURE_ID,
                "title": "Signals and Bernoulli",
                "status": "live",
                "language": "en",
                "course_title": "Applied Physics",
            },
            "ws_url": "ws://localhost:8000/ws",
            "offset_ms": 251_340,
            "signal_cooldown_ms": 15_000,
            "signal_token_expires_at": "2026-11-25T20:24:11Z",
            "replay_token_expires_at": "2026-11-26T16:24:11Z",
        },
    )
    write_json(
        FIXTURES / "rest-heatmap-response.json",
        {
            "lecture_id": LECTURE_ID,
            "bucket_ms": 60_000,
            "buckets": [
                {
                    "minute": 1,
                    "minute_start_ms": 60_000,
                    "signals": 4,
                    "unique": 4,
                    "intensity": 0.5,
                    "unique_semantics": (
                        "Distinct temporary participants observed in this minute; "
                        "never the sum of per-bucket unique counts."
                    ),
                }
            ],
            "clusters": [
                {
                    "cluster_id": "a91d2c40-7e55-4f1b-b3a8-0c6d9e2f1a47",
                    "start_ms": 243_000,
                    "end_ms": 258_000,
                    "peak_intensity": 0.91,
                    "unique_tokens": 14,
                }
            ],
            "generated_at": "2026-11-25T16:24:11Z",
            "note": (
                "Signal counts are measured events. They are not a comprehension rate "
                "and low activity does not prove understanding."
            ),
        },
    )

    # A UUID must remain parseable in every fixture; this assertion catches accidental
    # placeholder corruption early.
    UUID(LECTURE_ID)
    print("Exported OpenAPI, WebSocket schema and fixtures.")


if __name__ == "__main__":
    main()
