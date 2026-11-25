from __future__ import annotations

import contextlib
import time
import uuid

from fastapi.testclient import TestClient

from tests.conftest import make_settings


def login(client: TestClient, invite: str = "TEST-INVITE-CODE") -> str:
    response = client.post("/api/v1/auth/professor", json={"invite_code": invite})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def create_lecture(client: TestClient, token: str, title: str | None = None) -> dict:
    courses = client.get("/api/v1/courses", headers={"Authorization": f"Bearer {token}"})
    assert courses.status_code == 200, courses.text
    course_id = courses.json()[0]["id"]
    response = client.post(
        "/api/v1/lectures",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course_id,
            "title": title or f"Integration lecture {uuid.uuid4().hex[:6]}",
            "language": "en",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_health_readiness_and_privacy_manifest(client: TestClient) -> None:
    assert client.get("/health").json()["status"] == "ok"
    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"

    status = client.get("/api/v1/status")
    assert status.status_code == 200
    body = status.json()
    assert body["components"][0]["name"] == "PostgreSQL"

    manifest = client.get("/api/v1/privacy/manifest")
    assert manifest.status_code == 200
    tables = {table["name"] for table in manifest.json()["tables"]}
    assert {"professors", "lectures", "confusion_clusters", "signal_buckets"} <= tables
    assert "students" not in tables
    professor = next(table for table in manifest.json()["tables"] if table["name"] == "professors")
    assert any(column["name"] == "name" for column in professor["columns"])


def test_invalid_invite_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/auth/professor", json={"invite_code": "NOT-A-REAL-INVITE"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_professor_creates_lecture_and_student_joins(client: TestClient) -> None:
    token = login(client)
    lecture = create_lecture(client, token)
    assert len(lecture["join_code"]) == 6
    assert lecture["join_url"].endswith(f"/join/{lecture['join_code']}")

    preview = client.get(f"/api/v1/join/{lecture['join_code']}/preview")
    assert preview.status_code == 200
    assert preview.json()["joinable"] is True

    joined = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
    assert joined.status_code == 200, joined.text
    body = joined.json()
    assert body["signal_token"].startswith("daris1.signal.")
    assert body["replay_token"].startswith("daris1.replay.")
    assert body["lecture"]["id"] == lecture["lecture_id"]
    assert body["signal_cooldown_ms"] == 15_000

    unauthorized = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control", json={"action": "start"}
    )
    assert unauthorized.status_code == 401


def test_ws_signal_ack_duplicate_and_cooldown(client: TestClient) -> None:
    token = login(client)
    lecture = create_lecture(client, token)
    joined = client.post("/api/v1/join", json={"join_code": lecture["join_code"]}).json()
    started = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "start"},
    )
    assert started.status_code == 200

    def hello(ws) -> dict:
        ws.send_json(
            {
                "v": 1,
                "type": "hello",
                "msg_id": str(uuid.uuid4()),
                "ts": "2026-11-25T00:00:00Z",
                "lecture_id": lecture["lecture_id"],
                "payload": {"role": "student", "signal_token": joined["signal_token"]},
            }
        )
        return ws.receive_json()

    with client.websocket_connect("/ws") as ws:
        assert hello(ws)["type"] == "hello_ok"
        message = {
            "v": 1,
            "type": "student_signal",
            "msg_id": str(uuid.uuid4()),
            "ts": "2026-11-25T00:00:00Z",
            "lecture_id": lecture["lecture_id"],
            "payload": {"client_seq": 1, "kind": "lost"},
        }
        ws.send_json(message)
        ack = ws.receive_json()
        assert ack["type"] == "signal_ack"
        assert ack["payload"]["accepted"] is True

        message["msg_id"] = str(uuid.uuid4())
        ws.send_json(message)
        duplicate = ws.receive_json()
        assert duplicate["payload"]["accepted"] is False
        assert duplicate["payload"]["duplicate"] is True

        message["msg_id"] = str(uuid.uuid4())
        message["payload"]["client_seq"] = 2
        message["payload"]["client_ts_ms"] = int(time.time() * 1000) - 31_000
        ws.send_json(message)
        stale = ws.receive_json()
        assert stale["payload"]["reason"] == "stale_signal"

        message["msg_id"] = str(uuid.uuid4())
        message["payload"].pop("client_ts_ms")
        ws.send_json(message)
        cooldown = ws.receive_json()
        assert cooldown["payload"]["accepted"] is False
        assert cooldown["payload"]["reason"] == "cooldown"
        assert cooldown["payload"]["retry_after_ms"] > 0

    assert (
        client.post(
            f"/api/v1/lectures/{lecture['lecture_id']}/control",
            headers={"Authorization": f"Bearer {token}"},
            json={"action": "end"},
        ).status_code
        == 200
    )
    summary = client.get(
        f"/api/v1/lectures/{lecture['lecture_id']}/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert summary.status_code == 200
    assert summary.json()["accepted_signals"] == 1
    assert summary.json()["unique_participants"] == 1


def test_pause_resume_and_ended_rejection(client: TestClient) -> None:
    token = login(client)
    lecture = create_lecture(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    base = f"/api/v1/lectures/{lecture['lecture_id']}/control"
    assert client.post(base, headers=headers, json={"action": "start"}).status_code == 200
    time.sleep(0.25)
    paused = client.post(base, headers=headers, json={"action": "pause"})
    assert paused.status_code == 200
    time.sleep(0.25)
    still_paused = client.get(f"/api/v1/lectures/{lecture['lecture_id']}", headers=headers)
    assert still_paused.status_code == 200
    assert still_paused.json()["offset_ms"] == paused.json()["offset_ms"]
    resumed = client.post(base, headers=headers, json={"action": "resume"})
    assert resumed.status_code == 200
    time.sleep(0.25)
    after_resume = client.get(f"/api/v1/lectures/{lecture['lecture_id']}", headers=headers)
    assert after_resume.json()["offset_ms"] > still_paused.json()["offset_ms"]

    ended = client.post(base, headers=headers, json={"action": "end"})
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"
    rejected = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "LECTURE_NOT_LIVE"
    invalid_transition = client.post(base, headers=headers, json={"action": "start"})
    assert invalid_transition.status_code == 409


def test_cross_lecture_access_is_denied(client: TestClient) -> None:
    token = login(client)
    first = create_lecture(client, token)
    second = create_lecture(client, token)
    joined = client.post("/api/v1/join", json={"join_code": first["join_code"]}).json()
    with client.websocket_connect("/ws") as ws:
        ws.send_json(
            {
                "v": 1,
                "type": "hello",
                "msg_id": str(uuid.uuid4()),
                "ts": "2026-11-25T00:00:00Z",
                "lecture_id": second["lecture_id"],
                "payload": {"role": "student", "signal_token": joined["signal_token"]},
            }
        )
        first_event = ws.receive_json()
        assert first_event["type"] == "error"
        with contextlib.suppress(Exception):
            ws.receive_json()
    unauthorized_control = client.post(
        f"/api/v1/lectures/{second['lecture_id']}/control",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "start"},
    )
    assert unauthorized_control.status_code == 200
    assert (
        client.get(
            f"/api/v1/lectures/{first['lecture_id']}",
            headers={"Authorization": "Bearer not-a-token"},
        ).status_code
        == 401
    )


def test_signal_token_ttl_is_configured(client: TestClient) -> None:
    settings = make_settings()
    assert settings.signal_token_ttl_seconds == 3600
    assert settings.replay_token_ttl_seconds == 10800
