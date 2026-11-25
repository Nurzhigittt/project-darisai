from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

RippleState = Literal["connected", "rising", "cluster", "recovering"]
Availability = Literal["ok", "insufficient_participation", "connection_unavailable"]
StatusLabel = Literal[
    "few_signals",
    "signals_increasing",
    "clarification_may_be_helpful",
    "signals_decreasing",
    "insufficient_participation",
    "connection_unavailable",
]

CLUSTER_THRESHOLD = 0.5
RISING_THRESHOLD = 0.25
RISING_RELEASE = 0.18
CLUSTER_RELEASE = 0.35
MIN_CLUSTER_MS = 5_000
MIN_RECOVERY_MS = 10_000
MIN_QUIET_RECOVERY_MS = 5_000
MIN_ACTIVE_FOR_CLUSTER = 3


def active_threshold(active_participants: int) -> int:
    """Specification threshold with a conservative small-group floor."""

    return max(3, math.ceil(0.15 * max(0, active_participants)))


def raw_intensity(unique_in_window: int, threshold: int) -> float:
    if threshold <= 0:
        return 0.0
    return min(1.0, max(0, unique_in_window) / (2.0 * threshold))


def status_label_for(state: RippleState, active_participants: int) -> StatusLabel:
    if active_participants < MIN_ACTIVE_FOR_CLUSTER:
        return "insufficient_participation"
    if state == "cluster":
        return "clarification_may_be_helpful"
    if state == "rising":
        return "signals_increasing"
    if state == "recovering":
        return "signals_decreasing"
    # Silence is not comprehension. Even with zero signals this remains factual.
    return "few_signals"


@dataclass
class RippleSnapshot:
    intensity: float
    raw_intensity: float
    state: RippleState
    threshold: int
    active_participants: int
    unique_in_window: int
    offset_ms: int
    availability: Availability
    status_label: StatusLabel
    just_entered_cluster: bool = False
    just_closed_cluster: bool = False
    cluster_started_offset_ms: int | None = None
    cluster_peak: float | None = None
    window_ms: int = 20_000


@dataclass
class RippleEngine:
    """Deterministic, browser-free Ripple state machine.

    Cadence is owned by the caller (500 ms by default). EWMA smoothing is applied
    once per evaluation, not once per incoming message, so bursty arrival does not
    change the result.
    """

    alpha: float = 0.4
    window_ms: int = 20_000
    ewma: float = 0.0
    state: RippleState = "connected"
    candidate_since_ms: int | None = None
    candidate_started_offset_ms: int | None = None
    recovering_since_ms: int | None = None
    cluster_started_offset_ms: int | None = None
    cluster_peak: float = 0.0
    last_offset_ms: int = 0
    evaluations: int = 0
    _last: RippleSnapshot | None = field(default=None, init=False, repr=False)

    def update(
        self,
        *,
        active_participants: int,
        unique_in_window: int,
        now_ms: int,
        offset_ms: int,
        lecture_live: bool = True,
    ) -> RippleSnapshot:
        threshold = active_threshold(active_participants)
        raw = raw_intensity(unique_in_window, threshold)
        entered = False
        closed = False

        if not lecture_live:
            snapshot = self._snapshot(
                raw=raw,
                threshold=threshold,
                active=active_participants,
                unique=unique_in_window,
                offset=offset_ms,
            )
            self._last = snapshot
            return snapshot

        if self.evaluations == 0 and self.ewma == 0:
            self.ewma = raw
        else:
            self.ewma = self.alpha * raw + (1.0 - self.alpha) * self.ewma
        self.evaluations += 1
        self.last_offset_ms = offset_ms
        small_group = active_participants < MIN_ACTIVE_FOR_CLUSTER
        # Raw intensity drives threshold crossings; EWMA drives the displayed
        # intensity and release hysteresis. This prevents an exact 0.5 raw signal
        # from approaching 0.5 asymptotically and never forming a cluster.
        signal_level = max(self.ewma, raw)

        if self.state == "connected":
            if signal_level >= RISING_THRESHOLD:
                self.state = "rising"
                self.candidate_since_ms = now_ms
                self.candidate_started_offset_ms = offset_ms
        elif self.state == "rising":
            if self.ewma < RISING_RELEASE:
                self.state = "connected"
                self._clear_candidate()
            elif raw >= CLUSTER_THRESHOLD and self.ewma >= CLUSTER_RELEASE:
                if self.candidate_since_ms is None:
                    self.candidate_since_ms = now_ms
                    self.candidate_started_offset_ms = offset_ms
                if not small_group and now_ms - self.candidate_since_ms >= MIN_CLUSTER_MS:
                    self.state = "cluster"
                    self.cluster_started_offset_ms = (
                        self.candidate_started_offset_ms
                        if self.candidate_started_offset_ms is not None
                        else offset_ms
                    )
                    self.cluster_peak = signal_level
                    self._clear_candidate()
                    entered = True
            else:
                self._clear_candidate()
        elif self.state == "cluster":
            self.cluster_peak = max(self.cluster_peak, signal_level)
            if self.ewma < CLUSTER_RELEASE:
                self.state = "recovering"
                self.recovering_since_ms = now_ms
                closed = True
        elif self.state == "recovering":
            if raw >= CLUSTER_THRESHOLD and self.ewma >= CLUSTER_RELEASE:
                if self.candidate_since_ms is None:
                    self.candidate_since_ms = now_ms
                    self.candidate_started_offset_ms = offset_ms
                if not small_group and now_ms - self.candidate_since_ms >= MIN_CLUSTER_MS:
                    self.state = "cluster"
                    self.cluster_started_offset_ms = (
                        self.candidate_started_offset_ms
                        if self.candidate_started_offset_ms is not None
                        else offset_ms
                    )
                    self.cluster_peak = signal_level
                    self._clear_candidate()
                    self.recovering_since_ms = None
                    entered = True
            else:
                self._clear_candidate()
                recovered_for = (
                    now_ms - self.recovering_since_ms if self.recovering_since_ms is not None else 0
                )
                if (
                    self.ewma >= 0.15
                    and self.ewma < CLUSTER_RELEASE
                    and recovered_for >= MIN_RECOVERY_MS
                ) or (self.ewma < 0.15 and recovered_for >= MIN_QUIET_RECOVERY_MS):
                    self.state = "connected"
                    self.recovering_since_ms = None
                    self.cluster_started_offset_ms = None
                    self.cluster_peak = 0.0

        snapshot = self._snapshot(
            raw=raw,
            threshold=threshold,
            active=active_participants,
            unique=unique_in_window,
            offset=offset_ms,
            entered=entered,
            closed=closed,
        )
        self._last = snapshot
        return snapshot

    def _snapshot(
        self,
        *,
        raw: float,
        threshold: int,
        active: int,
        unique: int,
        offset: int,
        entered: bool = False,
        closed: bool = False,
    ) -> RippleSnapshot:
        if active < MIN_ACTIVE_FOR_CLUSTER:
            availability: Availability = "insufficient_participation"
        else:
            availability = "ok"
        return RippleSnapshot(
            intensity=round(max(0.0, min(1.0, self.ewma)), 4),
            raw_intensity=round(raw, 4),
            state=self.state,
            threshold=threshold,
            active_participants=active,
            unique_in_window=unique,
            offset_ms=offset,
            availability=availability,
            status_label=status_label_for(self.state, active),
            just_entered_cluster=entered,
            just_closed_cluster=closed,
            cluster_started_offset_ms=self.cluster_started_offset_ms,
            cluster_peak=round(self.cluster_peak, 4) if self.cluster_peak else None,
            window_ms=self.window_ms,
        )

    def _clear_candidate(self) -> None:
        self.candidate_since_ms = None
        self.candidate_started_offset_ms = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> RippleEngine:
        allowed = {
            "alpha",
            "window_ms",
            "ewma",
            "state",
            "candidate_since_ms",
            "candidate_started_offset_ms",
            "recovering_since_ms",
            "cluster_started_offset_ms",
            "cluster_peak",
            "last_offset_ms",
            "evaluations",
        }
        kwargs = {key: value[key] for key in allowed if key in value}
        if kwargs.get("state") == "cluster" and not kwargs.get("ewma"):
            kwargs["ewma"] = max(float(kwargs.get("cluster_peak") or 0), 0.5)
        return cls(**kwargs)
