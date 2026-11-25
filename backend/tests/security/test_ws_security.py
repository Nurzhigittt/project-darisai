from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tests.integration.test_api_workflow import create_lecture, login


def test_hello_is_required_within_timeout(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "error"
        assert message["payload"]["code"] == "HELLO_TIMEOUT"
        with pytest.raises(WebSocketDisconnect) as exc:
            websocket.receive_json()
        assert exc.value.code == 4408


def test_invalid_signal_token_is_rejected(client: TestClient) -> None:
    token = login(client)
    lecture = create_lecture(client, token)
    with client.websocket_connect("/ws") as websocket:
        websocket.send_json(
            {
                "v": 1,
                "type": "hello",
                "msg_id": str(uuid.uuid4()),
                "ts": "2026-11-25T00:00:00Z",
                "lecture_id": lecture["lecture_id"],
                "payload": {
                    "role": "student",
                    "signal_token": "daris1.signal.invalid.invalid",
                },
            }
        )
        error = websocket.receive_json()
        assert error["type"] == "error"
        assert error["payload"]["code"] == "UNAUTHORIZED"
        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_oversized_message_is_closed(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        websocket.send_text("x" * 5000)
        with pytest.raises(WebSocketDisconnect) as exc:
            websocket.receive_text()
        assert exc.value.code == 1009
