from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel

AutonomyMode = Literal["locked", "whitelisted"]


class AutonomyUpdate(ApiModel):
    mode: AutonomyMode
    reason: str | None = Field(default=None, min_length=1, max_length=500)


class AutonomyOut(ApiModel):
    lecture_id: UUID
    course_id: UUID
    concept_canonical_id: UUID
    concept_title: str = Field(min_length=1, max_length=200)
    mode: AutonomyMode
    approvals: int = Field(ge=0)
    rejections: int = Field(ge=0)
    eligible: bool = False
    observation_started_at: datetime | None = None
    whitelisted_at: datetime | None = None
    policy_reason: str | None = None
    updated_at: datetime | None = None
