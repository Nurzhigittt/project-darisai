from __future__ import annotations

import contextlib
import time
import uuid

from fastapi.testclient import TestClient

from tests.integration.test_api_workflow import create_lecture, login


def _hello(lecture_id: str, signal_token: str) -> dict:
    return {
        "v": 1,
        "type": "hello",
        "msg_id": str(uuid.uuid4()),
        "ts": "2026-11-25T00:00:00Z",
        "lecture_id": lecture_id,
        "payload": {"role": "student", "signal_token": signal_token},
    }


def _signal(lecture_id: str, seq: int = 1) -> dict:
    return {
        "v": 1,
        "type": "student_signal",
        "msg_id": str(uuid.uuid4()),
        "ts": "2026-11-25T00:00:00Z",
        "lecture_id": lecture_id,
        "payload": {"client_seq": seq, "kind": "lost"},
    }


def test_three_participants_form_and_persist_a_cluster(client: TestClient) -> None:
    token = login(client)
    lecture = create_lecture(client, token, title="Cluster integration")
    headers = {"Authorization": f"Bearer {token}"}
    assert (
        client.post(
            f"/api/v1/lectures/{lecture['lecture_id']}/control",
            headers=headers,
            json={"action": "start"},
        ).status_code
        == 200
    )

    tokens = [
        client.post("/api/v1/join", json={"join_code": lecture["join_code"]}).json()["signal_token"]
        for _ in range(3)
    ]

    with contextlib.ExitStack() as stack:
        websockets = [stack.enter_context(client.websocket_connect("/ws")) for _ in range(3)]
        for websocket, signal_token in zip(websockets, tokens, strict=True):
            websocket.send_json(_hello(lecture["lecture_id"], signal_token))
            assert websocket.receive_json()["type"] == "hello_ok"
        for websocket in websockets:
            websocket.send_json(_signal(lecture["lecture_id"]))
        for websocket in websockets:
            ack = websocket.receive_json()
            assert ack["type"] == "signal_ack"
            assert ack["payload"]["accepted"] is True

        # The deterministic evaluator evaluates every 100 ms in tests and requires
        # five seconds of sustained intensity before creating one cluster.
        time.sleep(7.0)

        ended = client.post(
            f"/api/v1/lectures/{lecture['lecture_id']}/control",
            headers=headers,
            json={"action": "end"},
        )
        assert ended.status_code == 200

    summary = client.get(f"/api/v1/lectures/{lecture['lecture_id']}/summary", headers=headers)
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["accepted_signals"] == 3
    assert body["unique_participants"] == 3
    assert len(body["clusters"]) == 1
    cluster = body["clusters"][0]
    assert cluster["end_ms"] is not None
    assert cluster["unique_tokens"] == 3
    assert 0 < cluster["peak_intensity"] <= 1

    heatmap = client.get(f"/api/v1/lectures/{lecture['lecture_id']}/heatmap", headers=headers)
    assert heatmap.status_code == 200
    assert sum(bucket["signals"] for bucket in heatmap.json()["buckets"]) == 3
