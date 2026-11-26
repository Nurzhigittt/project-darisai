#!/usr/bin/env python3
"""Real 40-student, 90-second DärisAI judge-demo orchestration.

This script does not inject Ripple state. It creates an isolated synthetic demo
through the demo backend, joins 40 students through the real REST/WebSocket
protocol, sends real Signal events, and exercises the real post-lecture APIs.
AI source is whatever the running API is configured for; with providers disabled
the result is explicitly `template`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import websockets

ORIGIN = "http://localhost:3000"


def envelope(event_type: str, lecture_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "v": 1,
        "type": event_type,
        "msg_id": str(uuid.uuid4()),
        "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "lecture_id": lecture_id,
        "payload": payload,
    }


async def recv_json(ws: Any) -> dict[str, Any]:
    raw = await ws.recv()
    return json.loads(raw.decode() if isinstance(raw, bytes) else raw)


async def wait_hello(ws: Any) -> None:
    while True:
        message = await asyncio.wait_for(recv_json(ws), timeout=15)
        if message.get("type") == "hello_ok":
            return
        if message.get("type") == "error":
            raise RuntimeError(f"WebSocket rejected hello: {message['payload']}")


async def professor_listener(
    ws_url: str, lecture_id: str, access_token: str, observed: list[dict[str, Any]]
) -> None:
    async with websockets.connect(ws_url, origin=ORIGIN, ping_interval=None) as ws:
        await ws.send(json.dumps(envelope("hello", lecture_id, {"role": "professor", "access_token": access_token})))
        await wait_hello(ws)
        while True:
            message = await asyncio.wait_for(recv_json(ws), timeout=30)
            if message.get("type") == "ripple_update":
                observed.append(message["payload"])
            elif message.get("type") == "ping":
                await ws.send(json.dumps(envelope("pong", lecture_id, {})))


async def student_signal(
    ws_url: str, lecture_id: str, signal_token: str, delay: float, hold_seconds: float
) -> bool:
    await asyncio.sleep(delay)
    async with websockets.connect(ws_url, origin=ORIGIN, ping_interval=None) as ws:
        await ws.send(json.dumps(envelope("hello", lecture_id, {"role": "student", "signal_token": signal_token})))
        await wait_hello(ws)
        await ws.send(
            json.dumps(
                envelope(
                    "student_signal",
                    lecture_id,
                    {"client_seq": 1, "kind": "lost", "client_ts_ms": int(time.time() * 1000)},
                )
            )
        )
        while True:
            message = await asyncio.wait_for(recv_json(ws), timeout=10)
            if message.get("type") == "signal_ack":
                accepted = bool(message["payload"].get("accepted"))
                await asyncio.sleep(hold_seconds)
                return accepted
            if message.get("type") == "error":
                return False


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--ws-url", default="ws://127.0.0.1:8000/ws")
    parser.add_argument("--invite", default="DARIS-TEACH-2026")
    parser.add_argument("--students", type=int, default=40)
    parser.add_argument("--duration", type=float, default=90.0)
    parser.add_argument("--output", default="artifacts/judge-demo/latest.json")
    args = parser.parse_args()
    started_at = time.perf_counter()
    result: dict[str, Any] = {"synthetic": True, "students": args.students}

    with httpx.Client(base_url=args.base_url, timeout=180) as client:
        login = client.post("/api/v1/auth/professor", json={"invite_code": args.invite})
        login.raise_for_status()
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        demo = client.post("/api/v1/demo/lectures", headers=headers, json={"scenario": "bernoulli_ru"})
        demo.raise_for_status()
        lecture = demo.json()
        lecture_id = lecture["lecture_id"]
        result["lecture"] = lecture
        client.post(f"/api/v1/lectures/{lecture_id}/control", headers=headers, json={"action": "start"}).raise_for_status()

        joins = []
        for _ in range(args.students):
            joined = client.post("/api/v1/join", json={"join_code": lecture["join_code"]})
            joined.raise_for_status()
            joins.append(joined.json())
        result["joined"] = len(joins)

        observed: list[dict[str, Any]] = []
        professor_task = asyncio.create_task(professor_listener(args.ws_url, lecture_id, headers["Authorization"].split(" ", 1)[1], observed))
        await asyncio.sleep(1)
        # Spread the first accepted signal across ten seconds so the real window
        # sees a rising aggregate rather than one instantaneous pile-up.
        hold_seconds = max(7.0, args.duration - 20.0)
        signals = await asyncio.gather(
            *[
                student_signal(
                    args.ws_url,
                    lecture_id,
                    item["signal_token"],
                    i * 0.25,
                    hold_seconds,
                )
                for i, item in enumerate(joins)
            ]
        )
        result["accepted_signals"] = sum(1 for accepted in signals if accepted)
        await asyncio.sleep(1.0)
        result["ripple_updates"] = len(observed)
        client.post(f"/api/v1/lectures/{lecture_id}/control", headers=headers, json={"action": "end"}).raise_for_status()
        professor_task.cancel()

        def generate(kind: str, max_concepts: int = 2) -> dict[str, Any]:
            response = client.post(
                f"/api/v1/lectures/{lecture_id}/insights/generate",
                headers=headers,
                json={"kind": kind, "max_concepts": max_concepts},
            )
            if response.status_code >= 400:
                raise RuntimeError(f"generate {kind}: {response.status_code} {response.text[:500]}")
            return response.json()

        brief = generate("brief_next")
        client.post(f"/api/v1/lectures/{lecture_id}/insights/{brief['insight']['insight_id']}/approve", headers=headers).raise_for_status()
        handoff = generate("handoff")
        client.post(f"/api/v1/lectures/{lecture_id}/insights/{handoff['insight']['insight_id']}/approve", headers=headers).raise_for_status()
        published = client.post(f"/api/v1/lectures/{lecture_id}/insights/{handoff['insight']['insight_id']}/publish", headers=headers)
        published.raise_for_status()
        result["brief_source"] = brief["source"]
        result["handoff_source"] = handoff["source"]
        result["handoff_url_issued"] = bool(published.json().get("handoff_url"))
        result["handoff_expires_at"] = published.json().get("expires_at")

        replay = client.post(
            "/api/v1/replay/start",
            headers={"X-Replay-Token": joins[0]["replay_token"]},
            json={"lecture_id": lecture_id, "flagged_offsets_ms": [1000, 10000]},
        )
        replay.raise_for_status()
        moments = replay.json()["moments"]
        result["replay_moments"] = len(moments)
        result["replay_source"] = replay.json()["source"]
        if moments:
            cards = client.post(
                "/api/v1/gapcards/generate",
                headers={"X-Replay-Token": joins[0]["replay_token"]},
                json={"lecture_id": lecture_id, "moments": [{"moment_id": moments[0]["moment_id"], "outcome": "unclear"}]},
            )
            cards.raise_for_status()
            result["gapcards"] = len(cards.json().get("cards", []))
            result["gapcards_source"] = cards.json().get("source")

        cohort = client.get(f"/api/v1/courses/{lecture['course_id']}/cohort-memory", headers=headers)
        cohort.raise_for_status()
        result["cohort_concepts"] = len(cohort.json().get("concepts", []))
        result["cohort_structural_gaps"] = len(cohort.json().get("structural_gaps", []))

        reset = client.post(f"/api/v1/demo/lectures/{lecture_id}/reset", headers=headers)
        reset.raise_for_status()
        result["reset_status"] = reset.json().get("status")
        result["reset_transcript_segments"] = reset.json().get("transcript_segments")
        result["wall_seconds"] = round(time.perf_counter() - started_at, 2)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
