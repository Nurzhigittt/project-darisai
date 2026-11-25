#!/usr/bin/env python3
"""Synthetic WebSocket load test for DärisAI.

Every generated student is explicitly synthetic. The script uses the real REST
join flow and the real WebSocket protocol; it does not inject server state or
mock success responses.
"""

from __future__ import annotations

import argparse
import asyncio
import bisect
import contextlib
import json
import os
import platform
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import websockets
from websockets.exceptions import ConnectionClosed


@dataclass
class LoadStats:
    expected_students: int = 0
    connected_students: int = 0
    failed_connections: int = 0
    accepted_signals: int = 0
    rejected_signals: int = 0
    duplicate_rejections: int = 0
    reconnect_probes: int = 0
    reconnect_duplicate_acks: int = 0
    ack_latencies_ms: list[float] = field(default_factory=list)
    signal_events: list[tuple[str, float]] = field(default_factory=list)
    ripple_times: dict[str, list[float]] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    def fail(self, message: str) -> None:
        if len(self.errors) < 100:
            self.errors.append(message)


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)
    index = (len(ordered) - 1) * pct
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = index - lower
    return round(ordered[lower] * (1 - fraction) + ordered[upper] * fraction, 2)


def envelope(
    event_type: str, lecture_id: str, payload: dict[str, Any]
) -> dict[str, Any]:
    return {
        "v": 1,
        "type": event_type,
        "msg_id": str(uuid.uuid4()),
        "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "lecture_id": lecture_id,
        "payload": payload,
    }


async def recv_json(websocket: Any) -> dict[str, Any]:
    raw = await websocket.recv()
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)


async def wait_hello_ok(websocket: Any) -> dict[str, Any]:
    for _ in range(10):
        message = await asyncio.wait_for(recv_json(websocket), timeout=10)
        if message.get("type") == "hello_ok":
            return message
        if message.get("type") == "error":
            raise RuntimeError(f"server rejected hello: {message['payload'].get('code')}")
    raise RuntimeError("hello_ok not received")


async def professor_worker(
    ws_url: str,
    lecture_id: str,
    access_token: str,
    stats: LoadStats,
    stop: asyncio.Event,
    origin: str,
) -> None:
    try:
        async with websockets.connect(
            ws_url,
            origin=origin,
            open_timeout=15,
            max_size=8192,
            ping_interval=None,
        ) as websocket:
            await websocket.send(
                json.dumps(
                    envelope(
                        "hello",
                        lecture_id,
                        {"role": "professor", "access_token": access_token},
                    )
                )
            )
            await wait_hello_ok(websocket)
            while not stop.is_set():
                try:
                    message = await asyncio.wait_for(recv_json(websocket), timeout=0.5)
                except TimeoutError:
                    continue
                if message.get("type") == "ping":
                    await websocket.send(
                        json.dumps(envelope("pong", lecture_id, {}))
                    )
                elif message.get("type") == "ripple_update":
                    stats.ripple_times.setdefault(lecture_id, []).append(
                        time.perf_counter()
                    )
    except (ConnectionClosed, OSError, RuntimeError) as exc:
        stats.fail(f"professor websocket: {type(exc).__name__}: {exc}")
    except Exception as exc:
        stats.fail(f"professor websocket: {type(exc).__name__}: {exc}")
    except asyncio.CancelledError:
        raise


async def student_worker(
    *,
    index: int,
    ws_url: str,
    lecture_id: str,
    signal_token: str,
    stats: LoadStats,
    stop_ready: asyncio.Event,
    stop: asyncio.Event,
    signal_interval: float,
    duration: float,
    origin: str,
    stagger: float,
    signal_stagger: float,
) -> None:
    await asyncio.sleep(min(stagger * index, max(0.0, duration / 4)))
    acknowledgements: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    try:
        async with websockets.connect(
            ws_url,
            origin=origin,
            open_timeout=20,
            max_size=8192,
            ping_interval=None,
        ) as websocket:
            await websocket.send(
                json.dumps(
                    envelope(
                        "hello",
                        lecture_id,
                        {"role": "student", "signal_token": signal_token},
                    )
                )
            )
            await wait_hello_ok(websocket)
            stats.connected_students += 1

            async def receiver() -> None:
                while not stop.is_set():
                    try:
                        message = await asyncio.wait_for(
                            recv_json(websocket), timeout=0.5
                        )
                    except TimeoutError:
                        continue
                    if message.get("type") == "ping":
                        await websocket.send(
                            json.dumps(envelope("pong", lecture_id, {}))
                        )
                    elif message.get("type") == "signal_ack":
                        await acknowledgements.put(message["payload"])
                    elif message.get("type") == "error":
                        stats.fail(
                            f"server error: {message['payload'].get('code')}"
                        )

            receiver_task = asyncio.create_task(receiver())
            await stop_ready.wait()
            if signal_stagger > 0:
                await asyncio.sleep(index * signal_stagger)
            deadline = time.perf_counter() + duration
            seq = 0
            try:
                while not stop.is_set() and time.perf_counter() < deadline:
                    seq += 1
                    payload = {
                        "client_seq": seq,
                        "kind": "lost",
                        "client_ts_ms": int(time.time() * 1000),
                    }
                    started = time.perf_counter()
                    await websocket.send(
                        json.dumps(envelope("student_signal", lecture_id, payload))
                    )
                    try:
                        ack = await asyncio.wait_for(acknowledgements.get(), timeout=8)
                        latency_ms = (time.perf_counter() - started) * 1000
                        stats.ack_latencies_ms.append(latency_ms)
                        if ack.get("accepted"):
                            stats.accepted_signals += 1
                            if seq == 1:
                                # Later signals can be absorbed by an already
                                # saturated aggregate without changing Ripple.
                                stats.signal_events.append((lecture_id, started))
                            await websocket.send(
                                json.dumps(
                                    envelope("student_signal", lecture_id, payload)
                                )
                            )
                            duplicate = await asyncio.wait_for(
                                acknowledgements.get(), timeout=8
                            )
                            if duplicate.get("duplicate"):
                                stats.duplicate_rejections += 1
                            else:
                                stats.fail("duplicate signal was not flagged")
                        else:
                            stats.rejected_signals += 1
                            stats.fail(
                                f"signal rejected: {ack.get('reason')} "
                                f"retry_after={ack.get('retry_after_ms')}"
                            )
                    except TimeoutError:
                        stats.fail("signal acknowledgement timed out")
                    with contextlib.suppress(TimeoutError):
                        # Sleep relative to the acknowledgement, not the send,
                        # so a delayed client write cannot shrink the server
                        # cooldown gap.
                        await asyncio.wait_for(stop.wait(), timeout=signal_interval)
            finally:
                receiver_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await receiver_task
    except (ConnectionClosed, OSError, RuntimeError) as exc:
        stats.failed_connections += 1
        stats.fail(f"student websocket: {type(exc).__name__}: {exc}")
    except Exception as exc:
        stats.failed_connections += 1
        stats.fail(f"student websocket: {type(exc).__name__}: {exc}")
    except asyncio.CancelledError:
        raise


async def reconnect_probe(
    *,
    ws_url: str,
    lecture_id: str,
    signal_token: str,
    origin: str,
    stats: LoadStats,
) -> None:
    """Reconnect with an existing token and prove duplicate suppression survives."""
    try:
        async with websockets.connect(
            ws_url, origin=origin, open_timeout=15, max_size=8192, ping_interval=None
        ) as websocket:
            await websocket.send(
                json.dumps(
                    envelope(
                        "hello",
                        lecture_id,
                        {"role": "student", "signal_token": signal_token},
                    )
                )
            )
            await wait_hello_ok(websocket)
            await websocket.send(
                json.dumps(
                    envelope(
                        "student_signal",
                        lecture_id,
                        {
                            "client_seq": 1,
                            "kind": "lost",
                            "client_ts_ms": int(time.time() * 1000),
                        },
                    )
                )
            )
            ack = await asyncio.wait_for(recv_json(websocket), timeout=8)
            stats.reconnect_probes += 1
            if ack.get("payload", {}).get("duplicate"):
                stats.reconnect_duplicate_acks += 1
            else:
                stats.fail("reconnect duplicate probe was not flagged duplicate")
    except Exception as exc:
        stats.fail(f"reconnect probe: {type(exc).__name__}: {exc}")


def compute_report(
    stats: LoadStats,
    *,
    args: argparse.Namespace,
    started_at: datetime,
    wall_seconds: float,
) -> dict[str, Any]:
    ripple_latencies: list[float] = []
    for lecture_id, sent_at in stats.signal_events:
        times = stats.ripple_times.get(lecture_id, [])
        index = bisect.bisect_left(times, sent_at)
        if index < len(times):
            delta = (times[index] - sent_at) * 1000
            if 0 <= delta <= 2_500:
                ripple_latencies.append(delta)
    accepted = stats.accepted_signals
    ack = stats.ack_latencies_ms
    return {
        "synthetic": True,
        "label": "All participants and signals in this report are synthetic load.",
        "generated_at": datetime.now(UTC).isoformat(),
        "started_at": started_at.isoformat(),
        "environment": {
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "server_base_url": args.base_url,
            "note": "Client-side run against the real local API, not a cloud benchmark.",
        },
        "configuration": {
            "students": args.students,
            "lectures": args.lectures,
            "duration_seconds": args.duration,
            "signal_interval_seconds": args.signal_interval,
            "signal_stagger_seconds": args.signal_stagger,
            "warmup_seconds": args.warmup,
            "reconnect_probes": args.reconnect_probes,
            "connect_concurrency": args.connect_concurrency,
        },
        "results": {
            "wall_seconds": round(wall_seconds, 2),
            "expected_students": stats.expected_students,
            "connected_students": stats.connected_students,
            "connection_success_rate": round(
                stats.connected_students / max(1, stats.expected_students), 4
            ),
            "failed_connections": stats.failed_connections,
            "accepted_signals": accepted,
            "rejected_signals": stats.rejected_signals,
            "duplicate_rejections": stats.duplicate_rejections,
            "reconnect_probes": stats.reconnect_probes,
            "reconnect_duplicate_acks": stats.reconnect_duplicate_acks,
            "ack_latency_ms": {
                "count": len(ack),
                "p50": percentile(ack, 0.5),
                "p95": percentile(ack, 0.95),
                "p99": percentile(ack, 0.99),
                "max": round(max(ack), 2) if ack else None,
            },
            "signal_to_next_ripple_ms": {
                "count": len(ripple_latencies),
                "p50": percentile(ripple_latencies, 0.5),
                "p95": percentile(ripple_latencies, 0.95),
                "p99": percentile(ripple_latencies, 0.99),
                "max": round(max(ripple_latencies), 2) if ripple_latencies else None,
                "semantics": (
                    "Time from each synthetic participant's first accepted signal to "
                    "the next Ripple broadcast. Later signals may not change an already "
                    "saturated aggregate. Values are an upper bound, not per-signal causality."
                ),
            },
            "errors": stats.errors,
            "error_count": len(stats.errors),
            "ripple_broadcasts_observed": sum(
                len(times) for times in stats.ripple_times.values()
            ),
        },
    }


async def run(args: argparse.Namespace) -> int:
    started_at = datetime.now(UTC)
    started = time.perf_counter()
    stats = LoadStats(expected_students=args.students)
    stop = asyncio.Event()
    stop_ready = asyncio.Event()
    tasks: list[asyncio.Task[None]] = []

    async with httpx.AsyncClient(base_url=args.base_url, timeout=30) as client:
        login = await client.post(
            "/api/v1/auth/professor", json={"invite_code": args.invite_code}
        )
        if login.status_code != 200:
            print(f"Auth failed ({login.status_code}); set --invite-code.")
            return 1
        professor_token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {professor_token}"}
        courses = (await client.get("/api/v1/courses", headers=headers)).json()
        if not courses:
            print("No course available; run the development seed.")
            return 1

        lectures: list[dict[str, Any]] = []
        for index in range(args.lectures):
            response = await client.post(
                "/api/v1/lectures",
                headers=headers,
                json={
                    "course_id": courses[0]["id"],
                    "title": f"SYNTHETIC load test {started_at:%H%M%S} #{index + 1}",
                    "language": "en",
                },
            )
            if response.status_code != 201:
                print(f"Lecture creation failed: {response.status_code} {response.text}")
                return 1
            lecture = response.json()
            started_response = await client.post(
                f"/api/v1/lectures/{lecture['lecture_id']}/control",
                headers=headers,
                json={"action": "start"},
            )
            if started_response.status_code != 200:
                print(f"Lecture start failed: {started_response.text}")
                return 1
            lectures.append(lecture)

        per_lecture = max(1, args.students // max(1, args.lectures))
        join_semaphore = asyncio.Semaphore(args.connect_concurrency)
        tokens_by_lecture: list[list[str]] = []
        for lecture in lectures:
            count = min(per_lecture, args.students - sum(len(x) for x in tokens_by_lecture))
            tokens: list[str] = []

            async def join_one(lecture: dict[str, Any], tokens: list[str]) -> None:
                async with join_semaphore:
                    response = await client.post(
                        "/api/v1/join", json={"join_code": lecture["join_code"]}
                    )
                    if response.status_code == 200:
                        tokens.append(response.json()["signal_token"])
                    else:
                        stats.fail(f"join failed: {response.status_code}")

            await asyncio.gather(*(join_one(lecture, tokens) for _ in range(count)))
            tokens_by_lecture.append(tokens)
            stats.expected_students = sum(len(t) for t in tokens_by_lecture)

    ws_url = args.ws_url
    for lecture in lectures:
        tasks.append(
            asyncio.create_task(
                professor_worker(
                    ws_url,
                    lecture["lecture_id"],
                    professor_token,
                    stats,
                    stop,
                    args.origin,
                )
            )
        )
    student_index = 0
    for lecture, tokens in zip(lectures, tokens_by_lecture, strict=True):
        for signal_token in tokens:
            tasks.append(
                asyncio.create_task(
                    student_worker(
                        index=student_index,
                        ws_url=ws_url,
                        lecture_id=lecture["lecture_id"],
                        signal_token=signal_token,
                        stats=stats,
                        stop_ready=stop_ready,
                        stop=stop,
                        signal_interval=args.signal_interval,
                        duration=args.duration,
                        origin=args.origin,
                        stagger=args.stagger,
                        signal_stagger=args.signal_stagger,
                    )
                )
            )
            student_index += 1

    connect_deadline = time.perf_counter() + 10
    while stats.connected_students < stats.expected_students and time.perf_counter() < connect_deadline:
        await asyncio.sleep(0.2)
    print(
        f"Connected {stats.connected_students}/{stats.expected_students} synthetic "
        f"students across {len(lectures)} lecture(s). Warming up the evaluator..."
    )
    await asyncio.sleep(args.warmup)
    stop_ready.set()
    await asyncio.sleep(args.duration + 1.0)
    stop.set()
    await asyncio.gather(*tasks, return_exceptions=True)

    for probe_index in range(min(args.reconnect_probes, len(tokens_by_lecture[0]))):
        await reconnect_probe(
            ws_url=ws_url,
            lecture_id=lectures[0]["lecture_id"],
            signal_token=tokens_by_lecture[0][probe_index],
            origin=args.origin,
            stats=stats,
        )

    async with httpx.AsyncClient(base_url=args.base_url, timeout=30) as client:
        headers = {"Authorization": f"Bearer {professor_token}"}
        for lecture in lectures:
            with contextlib.suppress(httpx.HTTPError):
                await client.post(
                    f"/api/v1/lectures/{lecture['lecture_id']}/control",
                    headers=headers,
                    json={"action": "end"},
                )

    report = compute_report(
        stats,
        args=args,
        started_at=started_at,
        wall_seconds=time.perf_counter() - started,
    )
    output_dir = Path(__file__).resolve().parent.parent / "artifacts" / "loadtest"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"loadtest-{started_at:%Y%m%dT%H%M%SZ}.json"
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["results"], indent=2))
    print(f"Raw report: {output_path}")
    return 0 if stats.failed_connections == 0 else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--ws-url", default="ws://127.0.0.1:8000/ws")
    parser.add_argument(
        "--invite-code",
        default=os.getenv("SEED_PROFESSOR_INVITE_CODE", "DARIS-TEACH-2026"),
    )
    parser.add_argument("--students", type=int, default=30)
    parser.add_argument("--lectures", type=int, default=1)
    parser.add_argument("--duration", type=float, default=20.0)
    parser.add_argument("--signal-interval", type=float, default=16.0)
    parser.add_argument("--connect-concurrency", type=int, default=25)
    parser.add_argument("--stagger", type=float, default=0.03)
    parser.add_argument("--signal-stagger", type=float, default=0.05)
    parser.add_argument("--warmup", type=float, default=2.0)
    parser.add_argument("--reconnect-probes", type=int, default=5)
    parser.add_argument("--origin", default="http://127.0.0.1:3000")
    args = parser.parse_args()
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
