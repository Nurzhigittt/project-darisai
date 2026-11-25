from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.lectures import elapsed_lecture_ms

START = datetime(2026, 11, 25, 10, 0, tzinfo=UTC)


def test_scheduled_lecture_has_zero_elapsed_time() -> None:
    assert elapsed_lecture_ms({"started_at": None}, START) == 0


def test_live_lecture_uses_server_clock() -> None:
    lecture = {"started_at": START, "paused_at": None, "ended_at": None, "paused_total_ms": 0}
    assert elapsed_lecture_ms(lecture, START + timedelta(seconds=90)) == 90_000


def test_pause_freezes_time_and_resume_excludes_pause() -> None:
    paused = {
        "started_at": START,
        "paused_at": START + timedelta(minutes=5),
        "ended_at": None,
        "paused_total_ms": 0,
    }
    assert elapsed_lecture_ms(paused, START + timedelta(minutes=9)) == 300_000

    resumed = {
        "started_at": START,
        "paused_at": None,
        "ended_at": None,
        "paused_total_ms": 180_000,
    }
    assert elapsed_lecture_ms(resumed, START + timedelta(minutes=10)) == 420_000


def test_ended_at_freezes_duration() -> None:
    ended = {
        "started_at": START,
        "paused_at": None,
        "ended_at": START + timedelta(minutes=8),
        "paused_total_ms": 60_000,
    }
    assert elapsed_lecture_ms(ended, START + timedelta(hours=4)) == 420_000
