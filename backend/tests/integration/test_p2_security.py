from __future__ import annotations

import uuid

from app.security import hash_invite_code
from fastapi.testclient import TestClient


def _login(client: TestClient, invite: str = "TEST-INVITE-CODE") -> str:
    response = client.post(
        "/api/v1/auth/professor", json={"invite_code": invite}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _lecture(client: TestClient, token: str) -> dict:
    courses = client.get(
        "/api/v1/courses", headers={"Authorization": f"Bearer {token}"}
    ).json()
    response = client.post(
        "/api/v1/lectures",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": courses[0]["id"],
            "title": f"Security {uuid.uuid4().hex[:6]}",
            "language": "en",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_all_sensitive_routes_require_authentication(client: TestClient) -> None:
    lecture_id = uuid.uuid4()
    course_id = uuid.uuid4()
    paths = [
        f"/api/v1/lectures/{lecture_id}/transcript",
        f"/api/v1/lectures/{lecture_id}/transcript/import",
        f"/api/v1/lectures/{lecture_id}/insights/generate",
        f"/api/v1/lectures/{lecture_id}/concept-autonomy",
        f"/api/v1/courses/{course_id}/cohort-memory",
        "/api/v1/demo/lectures",
        "/api/v1/demo/scenarios",
    ]
    for path in paths:
        response = client.get(path)
        assert response.status_code in {401, 405}, (path, response.status_code)
    for path in (
        f"/api/v1/lectures/{lecture_id}/transcript/import",
        f"/api/v1/lectures/{lecture_id}/insights/generate",
        "/api/v1/demo/lectures",
    ):
        response = client.post(path, json={})
        assert response.status_code == 401, (path, response.status_code)


def test_replay_and_signal_scopes_are_not_interchangeable(client: TestClient) -> None:
    token = _login(client)
    lecture = _lecture(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control",
        headers=headers,
        json={"action": "start"},
    ).raise_for_status()
    joined = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
    joined.raise_for_status()
    signal_token = joined.json()["signal_token"]
    replay_token = joined.json()["replay_token"]
    client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control",
        headers=headers,
        json={"action": "end"},
    ).raise_for_status()
    client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/transcript/import",
        headers=headers,
        json={"language": "en", "segments": [{"start_ms": 0, "end_ms": 1000, "text": "x"}]},
    ).raise_for_status()

    with_signal = client.post(
        "/api/v1/replay/start",
        headers={"X-Replay-Token": signal_token},
        json={"lecture_id": lecture["lecture_id"], "flagged_offsets_ms": [100]},
    )
    assert with_signal.status_code == 401
    with_replay = client.post(
        "/api/v1/replay/start",
        headers={"X-Replay-Token": replay_token},
        json={"lecture_id": lecture["lecture_id"], "flagged_offsets_ms": [100]},
    )
    assert with_replay.status_code == 200


def test_cross_professor_object_access_is_denied(client: TestClient) -> None:
    owner_token = _login(client)
    lecture = _lecture(client, owner_token)
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    client.portal.call(
        ctx.db.execute,
        """
        INSERT INTO professors (name, invite_code_hash)
        VALUES ('Second Professor', $1)
        ON CONFLICT (invite_code_hash) DO NOTHING
        """,
        hash_invite_code(ctx.settings, "SECOND-INVITE-CODE"),
    )
    second_token = _login(client, "SECOND-INVITE-CODE")
    headers = {"Authorization": f"Bearer {second_token}"}
    assert client.get(f"/api/v1/lectures/{lecture['lecture_id']}", headers=headers).status_code == 404
    assert (
        client.get(
            f"/api/v1/lectures/{lecture['lecture_id']}/transcript", headers=headers
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/v1/courses/{lecture['course_id']}/cohort-memory", headers=headers
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/lectures/{lecture['lecture_id']}/insights/generate",
            headers=headers,
            json={"kind": "brief_next"},
        ).status_code
        == 404
    )
