from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _login(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/professor", json={"invite_code": "TEST-INVITE-CODE"}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _lecture(client: TestClient, token: str) -> dict:
    course = client.get(
        "/api/v1/courses", headers={"Authorization": f"Bearer {token}"}
    ).json()[0]
    response = client.post(
        "/api/v1/lectures",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course["id"],
            "title": f"P3 integration {uuid.uuid4().hex[:6]}",
            "language": "en",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _import_transcript(client: TestClient, token: str, lecture_id: str) -> None:
    response = client.post(
        f"/api/v1/lectures/{lecture_id}/transcript/import",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "language": "en",
            "segments": [
                {
                    "start_ms": 0,
                    "end_ms": 10_000,
                    "text": "Pressure is force per unit area in a fluid.",
                },
                {
                    "start_ms": 10_000,
                    "end_ms": 20_000,
                    "text": "When a pipe narrows, the flow speed increases.",
                },
                {
                    "start_ms": 20_000,
                    "end_ms": 30_000,
                    "text": "The pressure falls in the narrow section because energy is conserved.",
                },
            ],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["segments"] == 3
    assert body["degraded"] is False


def _ready_lecture(client: TestClient, token: str) -> tuple[dict, str]:
    lecture = _lecture(client, token)
    started = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "start"},
    )
    assert started.status_code == 200, started.text
    joined = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
    assert joined.status_code == 200, joined.text
    replay_token = joined.json()["replay_token"]
    ended = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control",
        headers={"Authorization": f"Bearer {token}"},
        json={"action": "end"},
    )
    assert ended.status_code == 200, ended.text
    _import_transcript(client, token, lecture["lecture_id"])
    return lecture, replay_token


def test_transcript_replay_and_gapcards_are_lecture_scoped(client: TestClient) -> None:
    professor = _login(client)
    lecture, replay_token = _ready_lecture(client, professor)
    headers = {"X-Replay-Token": replay_token}

    transcript = client.get(
        f"/api/v1/lectures/{lecture['lecture_id']}/transcript",
        headers={"Authorization": f"Bearer {professor}"},
    )
    assert transcript.status_code == 200, transcript.text
    assert transcript.json()["total_segments"] == 3
    assert transcript.json()["embedded_segments"] == 3

    start = client.post(
        "/api/v1/replay/start",
        headers=headers,
        json={
            "lecture_id": lecture["lecture_id"],
            "flagged_offsets_ms": [1_000, 25_000],
        },
    )
    assert start.status_code == 200, start.text
    body = start.json()
    assert len(body["moments"]) == 2
    moment = body["moments"][0]
    assert moment["moment_id"].startswith("mom1.")
    assert moment["recap"]["citations"]

    first = client.post(
        "/api/v1/replay/turn",
        headers=headers,
        json={
            "lecture_id": lecture["lecture_id"],
            "moment_id": moment["moment_id"],
            "stage": "mcq",
            "history": [],
            "input": None,
        },
    )
    assert first.status_code == 200, first.text
    turn = first.json()["turn"]
    assert turn["kind"] in {"mcq", "question"}
    assert turn["citations"]
    assert turn["validation"]["citations_ok"] is True
    state_token = first.json()["state_token"]

    second = client.post(
        "/api/v1/replay/turn",
        headers=headers,
        json={
            "lecture_id": lecture["lecture_id"],
            "moment_id": moment["moment_id"],
            "stage": "socratic",
            "history": [
                {"role": "axiom", "text": turn["text"]},
                {"role": "student", "text": "The pressure changes."},
            ],
            "input": {"text": "The pressure changes."},
            "state_token": state_token,
        },
    )
    assert second.status_code == 200, second.text
    assert second.json()["turn_number"] == 2

    cards = client.post(
        "/api/v1/gapcards/generate",
        headers=headers,
        json={
            "lecture_id": lecture["lecture_id"],
            "moments": [{"moment_id": moment["moment_id"], "outcome": "unclear"}],
        },
    )
    assert cards.status_code == 200, cards.text
    assert cards.json()["cards"]
    assert cards.json()["cards"][0]["back"]["quote"]

    other = _lecture(client, professor)
    cross = client.post(
        "/api/v1/replay/start",
        headers=headers,
        json={"lecture_id": other["lecture_id"], "flagged_offsets_ms": [1_000]},
    )
    assert cross.status_code == 401


def test_teacher_intelligence_enters_pending_approval(client: TestClient) -> None:
    professor = _login(client)
    lecture, _ = _ready_lecture(client, professor)
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    client.portal.call(
        ctx.db.execute,
        """
        INSERT INTO confusion_clusters
            (lecture_id, start_ms, end_ms, peak_intensity, unique_tokens)
        VALUES ($1, 10000, 20000, 0.8, 6)
        """,
        uuid.UUID(lecture["lecture_id"]),
    )

    response = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/generate",
        headers={"Authorization": f"Bearer {professor}"},
        json={"kind": "brief_next", "max_concepts": 3},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "template"
    assert body["insight"]["status"] == "pending_approval"
    assert body["insight"]["content"]["concepts"]
    assert body["insight"]["content"]["concepts"][0]["citations"]

    handoff = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/generate",
        headers={"Authorization": f"Bearer {professor}"},
        json={"kind": "handoff", "max_concepts": 2},
    )
    assert handoff.status_code == 200, handoff.text
    assert handoff.json()["insight"]["status"] == "pending_approval"
    assert handoff.json()["insight"]["content"]["task"]
