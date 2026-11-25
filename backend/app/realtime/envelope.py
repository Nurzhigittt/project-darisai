from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel


def make_envelope(
    event_type: str,
    lecture_id: UUID,
    payload: BaseModel | dict[str, Any],
    *,
    msg_id: UUID | None = None,
    ts: datetime | None = None,
) -> dict[str, Any]:
    payload_data = payload.model_dump(mode="json") if isinstance(payload, BaseModel) else payload
    return {
        "v": 1,
        "type": event_type,
        "msg_id": str(msg_id or uuid4()),
        "ts": (ts or datetime.now(UTC)).isoformat().replace("+00:00", "Z"),
        "lecture_id": str(lecture_id),
        "payload": payload_data,
    }


def lecture_channel(lecture_id: UUID | str) -> str:
    return f"daris:lecture:{lecture_id}"
