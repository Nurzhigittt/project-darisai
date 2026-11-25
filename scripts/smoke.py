#!/usr/bin/env python3
"""Development-only REST smoke test against a running DärisAI API.

It creates and ends one lecture, so it never claims to test a live classroom.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import uuid

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--invite-code",
        default=os.getenv("SEED_PROFESSOR_INVITE_CODE", "DARIS-TEACH-2026"),
    )
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url, timeout=20) as client:
        health = client.get("/health")
        assert health.status_code == 200, health.text
        ready = client.get("/ready")
        assert ready.status_code == 200, ready.text
        print("health/ready: ok")

        login = client.post(
            "/api/v1/auth/professor", json={"invite_code": args.invite_code}
        )
        if login.status_code != 200:
            print(f"auth: failed ({login.status_code}); check the dev invite code")
            return 1
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("professor auth: ok")

        courses = client.get("/api/v1/courses", headers=headers).json()
        if not courses:
            print("courses: no course available; run the development seed")
            return 1
        created = client.post(
            "/api/v1/lectures",
            headers=headers,
            json={
                "course_id": courses[0]["id"],
                "title": f"Smoke lecture {uuid.uuid4().hex[:6]}",
                "language": "en",
            },
        )
        assert created.status_code == 201, created.text
        lecture = created.json()
        lecture_id = lecture["lecture_id"]
        print(f"lecture create: ok ({lecture['join_code']})")

        preview = client.get(f"/api/v1/join/{lecture['join_code']}/preview")
        assert preview.status_code == 200, preview.text
        joined = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
        assert joined.status_code == 200, joined.text
        assert joined.json()["signal_token"].startswith("daris1.signal.")
        assert joined.json()["replay_token"].startswith("daris1.replay.")
        print("anonymous join and scoped tokens: ok")

        started = client.post(
            f"/api/v1/lectures/{lecture_id}/control",
            headers=headers,
            json={"action": "start"},
        )
        assert started.status_code == 200, started.text
        time.sleep(0.2)
        paused = client.post(
            f"/api/v1/lectures/{lecture_id}/control",
            headers=headers,
            json={"action": "pause"},
        )
        assert paused.status_code == 200, paused.text
        resumed = client.post(
            f"/api/v1/lectures/{lecture_id}/control",
            headers=headers,
            json={"action": "resume"},
        )
        assert resumed.status_code == 200, resumed.text
        ended = client.post(
            f"/api/v1/lectures/{lecture_id}/control",
            headers=headers,
            json={"action": "end"},
        )
        assert ended.status_code == 200, ended.text
        print("start/pause/resume/end: ok")

        heatmap = client.get(
            f"/api/v1/lectures/{lecture_id}/heatmap", headers=headers
        )
        assert heatmap.status_code == 200, heatmap.text
        summary = client.get(f"/api/v1/lectures/{lecture_id}/summary", headers=headers)
        assert summary.status_code == 200, summary.text
        print("heatmap and factual summary: ok")
        print("Note: this smoke test does not open a WebSocket or submit a live signal.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
