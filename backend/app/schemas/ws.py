from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from app.schemas.common import Language, LectureStatus

T = TypeVar("T")
EventType = Literal[
    "hello",
    "hello_ok",
    "student_signal",
    "signal_ack",
    "ripple_update",
    "lecture_control",
    "lecture_state",
    "ping",
    "pong",
    "error",
]


class Envelope(BaseModel, Generic[T]):
    model_config = ConfigDict(extra="forbid")

    v: Literal[1] = 1
    type: EventType
    msg_id: UUID
    ts: datetime
    lecture_id: UUID
    payload: T


class InboundEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    v: Literal[1]
    type: EventType
    msg_id: UUID
    ts: datetime
    lecture_id: UUID
    payload: dict[str, Any]


class StudentHello(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["student"]
    signal_token: str = Field(
        min_length=20,
        max_length=2048,
        validation_alias=AliasChoices("signal_token", "blind_token"),
        serialization_alias="signal_token",
    )


class ProfessorHello(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["professor"]
    access_token: str = Field(min_length=20, max_length=4096)


HelloPayload = Annotated[
    StudentHello | ProfessorHello,
    Field(discriminator="role"),
]


class HelloOkPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offset_ms: int = Field(ge=0)
    lecture_status: LectureStatus
    signal_cooldown_ms: int
    connecting_role: Literal["student", "professor"]
    replay_scope_available: bool
    server_time: datetime


class StudentSignalPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_seq: int = Field(ge=0)
    kind: Literal["lost"] = "lost"
    client_ts_ms: int | None = Field(default=None, ge=0)


SignalReason = Literal[
    "cooldown",
    "not_live",
    "rate_limited",
    "duplicate",
    "stale_signal",
    "invalid_token",
    "lecture_ended",
    "invalid_payload",
]


class SignalAckPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_seq: int
    accepted: bool
    offset_ms: int
    reason: SignalReason | None = None
    retry_after_ms: int | None = None
    duplicate: bool = False


RippleState = Literal["connected", "rising", "cluster", "recovering"]
RippleAvailability = Literal["ok", "insufficient_participation", "connection_unavailable"]
RippleStatusLabel = Literal[
    "few_signals",
    "signals_increasing",
    "clarification_may_be_helpful",
    "signals_decreasing",
    "insufficient_participation",
    "connection_unavailable",
]


class RippleCluster(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cluster_id: UUID
    started_offset_ms: int
    peak_intensity: float = Field(ge=0, le=1)


class RippleUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ripple_seq: int = Field(ge=0)
    offset_ms: int = Field(ge=0)
    intensity: float = Field(ge=0, le=1)
    state: RippleState
    availability: RippleAvailability = "ok"
    status_label: RippleStatusLabel = "few_signals"
    cluster: RippleCluster | None = None
    active_participants: int = Field(default=0, ge=0)
    unique_in_window: int = Field(default=0, ge=0)
    threshold: int = Field(default=3, ge=1)
    window_ms: int = Field(default=20_000, ge=1)


class LectureControlPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["start", "pause", "resume", "end"]


class LectureStatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["live", "paused", "ended"]
    offset_ms: int = Field(ge=0)


class EmptyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WsErrorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    request_id: str | None = None
    retryable: bool = False


class WsFixtureEnvelope(BaseModel):
    """A union-shaped fixture used only to export the protocol schema."""

    model_config = ConfigDict(extra="forbid")

    v: Literal[1] = 1
    type: EventType
    msg_id: UUID
    ts: datetime
    lecture_id: UUID
    payload: dict[str, Any]


EVENT_PAYLOAD_SCHEMAS: dict[str, type[BaseModel]] = {
    "hello": StudentHello,
    "hello_ok": HelloOkPayload,
    "student_signal": StudentSignalPayload,
    "signal_ack": SignalAckPayload,
    "ripple_update": RippleUpdatePayload,
    "lecture_control": LectureControlPayload,
    "lecture_state": LectureStatePayload,
    "ping": EmptyPayload,
    "pong": EmptyPayload,
    "error": WsErrorPayload,
}


class WsEventProtocol(BaseModel):
    """Serializable protocol document, exported by scripts/export_schemas.py."""

    version: Literal[1] = 1
    language: Language | None = None
    server_to_client: list[str] = [
        "hello_ok",
        "signal_ack",
        "ripple_update",
        "lecture_state",
        "ping",
        "pong",
        "error",
    ]
    client_to_server: list[str] = ["hello", "student_signal", "lecture_control", "ping", "pong"]
