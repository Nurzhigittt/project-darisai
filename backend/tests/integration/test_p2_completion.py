from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient


def _login(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/professor", json={"invite_code": "TEST-INVITE-CODE"}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _lecture(client: TestClient, token: str) -> dict:
    courses = client.get(
        "/api/v1/courses", headers={"Authorization": f"Bearer {token}"}
    ).json()
    course_id = courses[0]["id"]
    response = client.post(
        "/api/v1/lectures",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course_id,
            "title": f"P2 completion {uuid.uuid4().hex[:6]}",
            "language": "en",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _prepare(client: TestClient, token: str) -> tuple[dict, str]:
    lecture = _lecture(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control",
        headers=headers,
        json={"action": "start"},
    ).raise_for_status()
    joined = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
    joined.raise_for_status()
    client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/control",
        headers=headers,
        json={"action": "end"},
    ).raise_for_status()
    imported = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/transcript/import",
        headers=headers,
        json={
            "language": "en",
            "segments": [
                {"start_ms": 0, "end_ms": 9000, "text": "Pressure is force per area."},
                {
                    "start_ms": 9000,
                    "end_ms": 18000,
                    "text": "When the pipe narrows, the flow speed increases.",
                },
                {
                    "start_ms": 18000,
                    "end_ms": 27000,
                    "text": "The pressure falls in the narrow section.",
                },
            ],
        },
    )
    assert imported.status_code == 201, imported.text
    return lecture, joined.json()["replay_token"]


def _cluster(client: TestClient, lecture_id: str) -> None:
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    client.portal.call(
        ctx.db.execute,
        """
        INSERT INTO confusion_clusters
            (lecture_id, start_ms, end_ms, peak_intensity, unique_tokens)
        VALUES ($1, 9000, 18000, 0.8, 5)
        """,
        uuid.UUID(lecture_id),
    )


def test_canonical_concepts_insight_history_and_handoff_lifecycle(
    client: TestClient,
) -> None:
    token = _login(client)
    lecture, _ = _prepare(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    _cluster(client, lecture["lecture_id"])

    transcript = client.get(
        f"/api/v1/lectures/{lecture['lecture_id']}/transcript", headers=headers
    )
    assert transcript.status_code == 200, transcript.text
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    concept_count = client.portal.call(
        ctx.db.fetchval,
        "SELECT count(*) FROM concepts WHERE lecture_id = $1",
        uuid.UUID(lecture["lecture_id"]),
    )
    assert int(concept_count) > 0

    first = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/generate",
        headers=headers,
        json={"kind": "brief_next", "max_concepts": 2},
    )
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["insight"]["status"] == "pending_approval"
    assert first_body["insight"]["concept_canonical_id"]
    second = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/generate",
        headers=headers,
        json={"kind": "brief_next", "max_concepts": 2},
    )
    assert second.status_code == 200, second.text
    assert second.json()["insight"]["insight_id"] == first_body["insight"]["insight_id"]

    insight_id = first_body["insight"]["insight_id"]
    approved = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/{insight_id}/approve",
        headers=headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    decisions = client.get(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/{insight_id}/decisions",
        headers=headers,
    )
    assert decisions.status_code == 200, decisions.text
    assert decisions.json()[0]["action"] == "approve"

    handoff = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/generate",
        headers=headers,
        json={"kind": "handoff", "max_concepts": 2},
    )
    assert handoff.status_code == 200, handoff.text
    handoff_id = handoff.json()["insight"]["insight_id"]
    assert handoff.json()["insight"]["content"]["task"]
    client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/{handoff_id}/approve",
        headers=headers,
    ).raise_for_status()
    published = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/{handoff_id}/publish",
        headers=headers,
    )
    assert published.status_code == 200, published.text
    url = published.json()["handoff_url"]
    raw_token = url.split("#token=", 1)[1]
    redeemed = client.post("/api/v1/handoff/redeem", json={"token": raw_token})
    assert redeemed.status_code == 200, redeemed.text
    revoked = client.post(
        f"/api/v1/lectures/{lecture['lecture_id']}/insights/{handoff_id}/handoff/revoke",
        headers=headers,
        json={"reason": "Demo cleanup"},
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["revoked"] == 1
    assert client.post("/api/v1/handoff/redeem", json={"token": raw_token}).status_code == 404


def test_cohort_structural_gap_is_labeled_synthetic(client: TestClient) -> None:
    token = _login(client)
    lecture, _ = _prepare(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    course_id = uuid.UUID(lecture["course_id"])
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    canonical = client.portal.call(
        ctx.db.fetchrow,
        """
        INSERT INTO canonical_concepts (course_id, normalized_key, title)
        VALUES ($1, 'test-pressure', 'Pressure and flow')
        ON CONFLICT (course_id, normalized_key) DO UPDATE SET title = EXCLUDED.title
        RETURNING id
        """,
        course_id,
    )
    for term, order, share in (
        ("2025-Fall", 1, 0.7),
        ("2026-Spring", 2, 0.72),
        ("2026-Fall", 3, 0.74),
    ):
        client.portal.call(
            ctx.db.execute,
            """
            INSERT INTO cohort_stats
                (course_id, concept_canonical_id, term, confused_share, lectures,
                 synthetic, term_order)
            VALUES ($1, $2, $3, $4, 6, true, $5)
            ON CONFLICT (course_id, concept_canonical_id, term) DO UPDATE SET
                confused_share = EXCLUDED.confused_share,
                term_order = EXCLUDED.term_order
            """,
            course_id,
            canonical["id"],
            term,
            share,
            order,
        )
    response = client.get(
        f"/api/v1/courses/{lecture['course_id']}/cohort-memory", headers=headers
    )
    assert response.status_code == 200, response.text
    gaps = response.json()["structural_gaps"]
    assert len(gaps) == 1
    assert gaps[0]["provenance"] == "synthetic"
    assert gaps[0]["consecutive_terms"] == 3
    assert gaps[0]["terms"] == ["2025-Fall", "2026-Spring", "2026-Fall"]


def test_autonomy_requires_observation_and_explicit_eligibility(client: TestClient) -> None:
    token = _login(client)
    lecture, _ = _prepare(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    listed = client.get(
        f"/api/v1/lectures/{lecture['lecture_id']}/concept-autonomy", headers=headers
    )
    assert listed.status_code == 200, listed.text
    concepts = listed.json()
    assert concepts
    assert concepts[0]["mode"] == "locked"
    assert concepts[0]["eligible"] is False
    denied = client.put(
        f"/api/v1/lectures/{lecture['lecture_id']}/concept-autonomy/"
        f"{concepts[0]['concept_canonical_id']}",
        headers=headers,
        json={"mode": "whitelisted"},
    )
    assert denied.status_code == 409
    assert denied.json()["error"]["code"] == "AUTONOMY_NOT_ELIGIBLE"

    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    client.portal.call(
        ctx.db.execute,
        """
        INSERT INTO concept_autonomy
            (course_id, concept_canonical_id, mode, approvals, rejections,
             observation_started_at)
        VALUES ($1, $2, 'locked', 5, 0, $3)
        ON CONFLICT (course_id, concept_canonical_id) DO UPDATE SET
            approvals = 5, rejections = 0,
            observation_started_at = EXCLUDED.observation_started_at
        """,
        uuid.UUID(lecture["course_id"]),
        uuid.UUID(concepts[0]["concept_canonical_id"]),
        datetime.now(UTC) - timedelta(days=31),
    )
    allowed = client.put(
        f"/api/v1/lectures/{lecture['lecture_id']}/concept-autonomy/"
        f"{concepts[0]['concept_canonical_id']}",
        headers=headers,
        json={"mode": "whitelisted", "reason": "Reviewed over 30 days"},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["mode"] == "whitelisted"
    assert allowed.json()["eligible"] is True


def test_demo_backend_is_isolated_and_resettable(client: TestClient) -> None:
    token = _login(client)
    headers = {"Authorization": f"Bearer {token}"}
    scenarios = client.get("/api/v1/demo/scenarios", headers=headers)
    assert scenarios.status_code == 200, scenarios.text
    assert any(item["key"] == "bernoulli_ru" for item in scenarios.json())

    created = client.post(
        "/api/v1/demo/lectures",
        headers=headers,
        json={"scenario": "bernoulli_ru"},
    )
    assert created.status_code == 201, created.text
    demo = created.json()
    assert demo["synthetic"] is True
    assert demo["transcript_segments"] == 40
    assert demo["status"] == "scheduled"

    reset = client.post(
        f"/api/v1/demo/lectures/{demo['lecture_id']}/reset", headers=headers
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["status"] == "scheduled"
    deleted = client.delete(
        f"/api/v1/demo/lectures/{demo['lecture_id']}", headers=headers
    )
    assert deleted.status_code == 204, deleted.text
