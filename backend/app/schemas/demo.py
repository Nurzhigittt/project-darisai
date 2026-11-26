from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel, Language, LectureStatus


class DemoScenarioOut(ApiModel):
    key: str
    title: str
    language: Language
    segment_count: int
    synthetic: Literal[True] = True


class DemoLectureCreate(ApiModel):
    scenario: str = Field(default="bernoulli_ru", min_length=1, max_length=160)
    title: str | None = Field(default=None, min_length=2, max_length=200)


class DemoLectureOut(ApiModel):
    lecture_id: UUID
    course_id: UUID
    title: str
    language: Language
    status: LectureStatus
    join_code: str
    join_url: str
    synthetic: Literal[True] = True
    scenario: str
    transcript_segments: int
    expires_at: datetime


class DemoResetOut(ApiModel):
    lecture_id: UUID
    status: LectureStatus
    cleared_signals: bool = True
    cleared_clusters: bool = True
    cleared_insights: bool = True
    transcript_segments: int


class DemoCleanupOut(ApiModel):
    deleted_lectures: int
