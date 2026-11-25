from __future__ import annotations

from typing import cast
from uuid import uuid4

from app.realtime.connection import LiveConnection
from fastapi import WebSocket


def test_live_connection_tracks_token_expiry() -> None:
    connection = LiveConnection(
        websocket=cast(WebSocket, object()),
        role="student",
        lecture_id=uuid4(),
        auth_expires_at=1,
    )

    assert connection.authorization_expired
