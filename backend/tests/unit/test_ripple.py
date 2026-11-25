from __future__ import annotations

from app.realtime.ripple import (
    RippleEngine,
    active_threshold,
    raw_intensity,
    status_label_for,
)
from hypothesis import given
from hypothesis import settings as hypothesis_settings
from hypothesis import strategies as st


def feed(
    engine: RippleEngine,
    *,
    active: int,
    unique: int,
    duration_ms: int,
    step_ms: int = 500,
    start_now_ms: int = 0,
    start_offset_ms: int = 0,
) -> list:
    snapshots = []
    for now in range(0, duration_ms + 1, step_ms):
        snapshots.append(
            engine.update(
                active_participants=active,
                unique_in_window=unique,
                now_ms=start_now_ms + now,
                offset_ms=start_offset_ms + now,
            )
        )
    return snapshots


def test_threshold_and_intensity_follow_specification() -> None:
    assert active_threshold(0) == 3
    assert active_threshold(20) == 3
    assert active_threshold(40) == 6
    assert active_threshold(300) == 45
    assert raw_intensity(3, 3) == 0.5
    assert raw_intensity(99, 3) == 1.0


def test_silence_is_few_signals_not_understanding() -> None:
    engine = RippleEngine()
    snapshot = engine.update(
        active_participants=12,
        unique_in_window=0,
        now_ms=0,
        offset_ms=0,
    )
    assert snapshot.intensity == 0
    assert snapshot.state == "connected"
    assert snapshot.status_label == "few_signals"
    assert status_label_for("connected", 12) == "few_signals"


def test_small_group_never_forms_a_cluster() -> None:
    engine = RippleEngine()
    snapshots = feed(engine, active=2, unique=2, duration_ms=12_000)
    assert all(item.state != "cluster" for item in snapshots)
    assert snapshots[-1].availability == "insufficient_participation"
    assert snapshots[-1].status_label == "insufficient_participation"


def test_sustained_threshold_creates_one_cluster() -> None:
    engine = RippleEngine()
    snapshots = feed(engine, active=40, unique=6, duration_ms=7_000)
    entered = [item for item in snapshots if item.just_entered_cluster]
    assert len(entered) == 1
    assert entered[0].state == "cluster"
    assert entered[0].cluster_started_offset_ms == 0
    assert entered[0].cluster_peak == 0.5
    assert snapshots[-1].state == "cluster"
    assert snapshots[-1].status_label == "clarification_may_be_helpful"


def test_cluster_closes_and_recovers() -> None:
    engine = RippleEngine()
    feed(engine, active=40, unique=6, duration_ms=6_000)
    snapshots = feed(
        engine,
        active=40,
        unique=0,
        duration_ms=12_000,
        start_now_ms=6_000,
        start_offset_ms=6_000,
    )
    closed = [item for item in snapshots if item.just_closed_cluster]
    assert len(closed) == 1
    assert any(item.state == "recovering" for item in snapshots)
    assert snapshots[-1].state == "connected"


def test_rising_state_uses_hysteresis() -> None:
    engine = RippleEngine()
    feed(engine, active=40, unique=6, duration_ms=1_500)
    snapshots = feed(
        engine,
        active=40,
        unique=2,
        duration_ms=10_000,
        start_now_ms=1_500,
        start_offset_ms=1_500,
    )
    states = [item.state for item in snapshots]
    assert "rising" in states
    assert states[-1] == "connected"
    assert not any(item.just_entered_cluster for item in snapshots)


def test_consecutive_clusters_are_distinguishable() -> None:
    engine = RippleEngine()
    first = feed(engine, active=40, unique=6, duration_ms=6_000)
    assert sum(item.just_entered_cluster for item in first) == 1
    recovery = feed(
        engine,
        active=40,
        unique=0,
        duration_ms=12_000,
        start_now_ms=6_000,
        start_offset_ms=6_000,
    )
    assert sum(item.just_closed_cluster for item in recovery) == 1
    second = feed(
        engine,
        active=40,
        unique=6,
        duration_ms=12_000,
        start_now_ms=18_000,
        start_offset_ms=18_000,
    )
    assert sum(item.just_entered_cluster for item in second) == 1


def test_engine_state_round_trip() -> None:
    engine = RippleEngine()
    feed(engine, active=40, unique=6, duration_ms=6_000)
    restored = RippleEngine.from_dict(engine.to_dict())
    assert restored.state == "cluster"
    assert restored.ewma == engine.ewma
    assert restored.cluster_started_offset_ms == engine.cluster_started_offset_ms


@given(
    active=st.integers(min_value=0, max_value=500),
    unique=st.integers(min_value=0, max_value=500),
)
@hypothesis_settings(max_examples=50, deadline=None)
def test_intensity_always_bounded(active: int, unique: int) -> None:
    engine = RippleEngine()
    result = engine.update(
        active_participants=active,
        unique_in_window=unique,
        now_ms=0,
        offset_ms=0,
    )
    assert 0 <= result.intensity <= 1
    assert 0 <= result.raw_intensity <= 1
    if active < 3:
        assert result.state != "cluster"
