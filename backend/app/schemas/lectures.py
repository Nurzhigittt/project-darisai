from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import ApiModel, Language, LectureStatus

ControlAction = Literal["start", "pause", "resume", "end"]


class CourseCreate(ApiModel):
    title: str = Field(min_length=2, max_length=160)


class CourseOut(ApiModel):
    id: UUID
    title: str
    created_at: datetime


class LectureCreate(ApiModel):
    course_id: UUID
    title: str = Field(min_length=2, max_length=200)
    language: Language = "en"


class LectureOut(ApiModel):
    lecture_id: UUID
    course_id: UUID
    course_title: str | None = None
    title: str
    language: Language
    status: LectureStatus
    join_code: str
    join_url: str
    started_at: datetime | None
    ended_at: datetime | None
    offset_ms: int
    accepted_signals: int
    unique_participants: int | None
    created_at: datetime


class ControlRequest(ApiModel):
    action: ControlAction


class ControlResponse(ApiModel):
    lecture_id: UUID
    status: LectureStatus
    started_at: datetime | None
    ended_at: datetime | None
    offset_ms: int


class PublicLecture(ApiModel):
    id: UUID
    title: str
    status: LectureStatus
    language: Language
    course_title: str | None = None


class JoinRequest(ApiModel):
    join_code: str = Field(min_length=4, max_length=12)

    @field_validator("join_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper().replace("-", "").replace(" ", "")


class JoinPreview(ApiModel):
    lecture: PublicLecture
    joinable: bool
    message: str


class JoinResponse(ApiModel):
    signal_token: str
    replay_token: str
    token_type: str = "temporary"
    lecture: PublicLecture
    ws_url: str
    offset_ms: int
    signal_cooldown_ms: int
    signal_token_expires_at: datetime
    replay_token_expires_at: datetime


class HeatmapBucket(ApiModel):
    minute: int
    minute_start_ms: int
    signals: int
    unique: int
    intensity: float
    unique_semantics: str = (
        "Distinct temporary participants observed in this minute; never the sum of "
        "per-bucket unique counts."
    )


class ClusterOut(ApiModel):
    cluster_id: UUID
    start_ms: int
    end_ms: int | None
    peak_intensity: float
    unique_tokens: int


class HeatmapResponse(ApiModel):
    lecture_id: UUID
    bucket_ms: Literal[60000] = 60000
    buckets: list[HeatmapBucket]
    clusters: list[ClusterOut]
    generated_at: datetime
    note: str = (
        "Signal counts are measured events. They are not a comprehension rate and "
        "low activity does not prove understanding."
    )


class LectureSummary(ApiModel):
    lecture_id: UUID
    title: str
    status: LectureStatus
    language: Language
    duration_ms: int
    accepted_signals: int
    unique_participants: int | None
    peak_active_participants: int | None
    clusters: list[ClusterOut]
    timeline: list[HeatmapBucket]
    clarification_moments: list[ClusterOut]
    generated_at: datetime
    interpretation_note: str = (
        "These are measured participation signals and detected time windows. They do "
        "not measure learning outcomes and cannot establish that everyone understood."
    )
