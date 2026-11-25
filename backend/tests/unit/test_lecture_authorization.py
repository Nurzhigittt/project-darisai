from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.config import Settings
from app.errors import AppError
from app.realtime.connection import LiveConnection
from app.realtime.gateway import WebSocketGateway
from app.services.lectures import LectureService
from fastapi import WebSocket

from tests.conftest import make_settings


class QueryRecorder:
    query: str = ""
    args: tuple[Any, ...] = ()

    async def fetchrow(self, query: str, *args: Any) -> None:
        self.query = query
        self.args = args
        return None


@pytest.mark.asyncio
async def test_professor_lecture_lookup_is_scoped_to_owner() -> None:
    db = QueryRecorder()
    settings: Settings = make_settings()
    service = LectureService(db, settings)  # type: ignore[arg-type]
    lecture_id = uuid4()
    other_professor_id = uuid4()

    with pytest.raises(AppError) as error:
        await service.get_owned(lecture_id, other_professor_id)

    assert error.value.status_code == 404
    assert "l.id = $1 AND l.professor_id = $2" in db.query
    assert db.args == (lecture_id, other_professor_id)


@pytest.mark.asyncio
async def test_student_websocket_cannot_issue_professor_controls() -> None:
    websocket = SimpleNamespace(send_json=AsyncMock())
    gateway = WebSocketGateway.__new__(WebSocketGateway)
    student = LiveConnection(
        websocket=cast(WebSocket, websocket),
        role="student",
        lecture_id=uuid4(),
        auth_expires_at=2**31,
    )

    await gateway._handle_control(student, {"action": "end"})

    websocket.send_json.assert_awaited_once()
    event = websocket.send_json.await_args.args[0]
    assert event["type"] == "error"
    assert event["payload"]["code"] == "ROLE_FORBIDDEN"
