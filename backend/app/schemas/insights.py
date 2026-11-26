from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.axiom.models import Citation
from app.schemas.common import ApiModel, Language

InsightKind = Literal["brief_next", "handoff"]
InsightStatus = Literal["pending_approval", "approved", "rejected", "edited", "published"]
InsightAudience = Literal["professor", "seminar_leader"]
InsightSource = Literal["live", "prebaked", "template", "manual"]


class InsightConcept(ApiModel):
    title: str = Field(min_length=1, max_length=160)
    detail: str = Field(min_length=1, max_length=1_000)
    citations: list[Citation] = Field(default_factory=list, max_length=8)
    window_start_ms: int | None = Field(default=None, ge=0)
    window_end_ms: int | None = Field(default=None, ge=0)
    unique_signals: int | None = Field(default=None, ge=0)

    @field_validator("title", "detail")
    @classmethod
    def trim_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Text fields must contain non-whitespace characters.")
        return value


class InsightTask(ApiModel):
    title: str = Field(min_length=1, max_length=160)
    instructions: str = Field(min_length=1, max_length=4_000)
    duration_minutes: int | None = Field(default=None, ge=1, le=180)
    grounded_in: list[Citation] = Field(default_factory=list, max_length=8)

    @field_validator("title", "instructions")
    @classmethod
    def trim_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Text fields must contain non-whitespace characters.")
        return value


class InsightContent(ApiModel):
    headline: str = Field(min_length=1, max_length=200)
    read_time_sec: int = Field(ge=1, le=60)
    concepts: list[InsightConcept] = Field(default_factory=list, max_length=12)
    task: InsightTask | None = None

    @field_validator("headline")
    @classmethod
    def trim_headline(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Headline must contain non-whitespace characters.")
        return value


class InsightCreate(ApiModel):
    kind: InsightKind
    content: InsightContent

    @model_validator(mode="after")
    def require_handoff_task(self) -> InsightCreate:
        if self.kind == "handoff" and self.content.task is None:
            raise ValueError("Handoff insights require a task.")
        return self


class InsightEdit(ApiModel):
    reason: str = Field(min_length=1, max_length=1_000)
    content: InsightContent

    @field_validator("reason")
    @classmethod
    def trim_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A reason is required.")
        return value


class InsightReject(ApiModel):
    reason: str = Field(min_length=1, max_length=1_000)

    @field_validator("reason")
    @classmethod
    def trim_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A reason is required.")
        return value


class InsightOut(ApiModel):
    insight_id: UUID
    concept_canonical_id: UUID | None = None
    lecture_id: UUID
    kind: InsightKind
    audience: InsightAudience
    status: InsightStatus
    source: InsightSource
    content: InsightContent
    decision_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    decided_at: datetime | None = None


class InsightDecisionOut(ApiModel):
    decision_id: UUID
    insight_id: UUID
    action: Literal["approve", "edit", "reject", "publish", "revoke"]
    from_status: str
    to_status: str
    reason: str | None = None
    concept_canonical_id: UUID | None = None
    created_at: datetime


class HandoffRevokeRequest(ApiModel):
    reason: str = Field(min_length=1, max_length=200)

    @field_validator("reason")
    @classmethod
    def trim_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A reason is required.")
        return value


class HandoffRevokeOut(ApiModel):
    insight_id: UUID
    revoked: int
    status: InsightStatus


class HandoffLinkOut(ApiModel):
    insight_id: UUID
    handoff_url: str
    expires_at: datetime


class HandoffRedeemRequest(ApiModel):
    token: str = Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class HandoffPublicOut(ApiModel):
    headline: str
    read_time_sec: int
    concepts: list[InsightConcept]
    task: InsightTask
    lecture_title: str
    language: Language
    expires_at: datetime
