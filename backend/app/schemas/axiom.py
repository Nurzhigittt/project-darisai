from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.axiom.models import Citation, SocraticTurn, ValidationResult
from app.schemas.common import ApiModel, Language
from app.schemas.insights import InsightOut

TranscriptSource = Literal["fixture", "audio", "manual"]
IngestStatus = Literal["queued", "processing", "completed", "degraded", "failed"]


class TranscriptSegmentIn(ApiModel):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=8_000)

    @model_validator(mode="after")
    def valid_interval(self) -> TranscriptSegmentIn:
        if self.end_ms < self.start_ms:
            raise ValueError("end_ms must be greater than or equal to start_ms")
        if not self.text.strip():
            raise ValueError("text must not be blank")
        return self


class TranscriptImportRequest(ApiModel):
    language: Language
    segments: list[TranscriptSegmentIn] = Field(min_length=1, max_length=2_000)
    synthetic: bool = False


class TranscriptSegmentOut(ApiModel):
    segment_id: UUID
    lecture_id: UUID
    start_ms: int
    end_ms: int
    text: str
    language: str | None = None
    has_embedding: bool = False


class TranscriptRunOut(ApiModel):
    run_id: UUID
    source: TranscriptSource
    status: IngestStatus
    segment_count: int
    embedded_count: int
    embedding_model: str | None = None
    error_code: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class TranscriptImportOut(ApiModel):
    lecture_id: UUID
    run: TranscriptRunOut
    segments: int
    embedded: int
    degraded: bool


class TranscriptOut(ApiModel):
    lecture_id: UUID
    language: Language
    segments: list[TranscriptSegmentOut]
    total_segments: int
    embedded_segments: int
    latest_run: TranscriptRunOut | None = None


class AudioChunkOut(ApiModel):
    lecture_id: UUID
    chunk_index: int
    status: Literal["completed", "failed"]
    run_id: UUID | None = None
    segments: int = 0
    embedded: int = 0
    degraded: bool = False
    error_code: str | None = None


class ReplayStartRequest(ApiModel):
    lecture_id: UUID
    flagged_offsets_ms: list[int] = Field(min_length=1, max_length=20)

    @field_validator("flagged_offsets_ms")
    @classmethod
    def validate_offsets(cls, values: list[int]) -> list[int]:
        if any(value < 0 for value in values):
            raise ValueError("offsets must be non-negative")
        return values


class ReplayWindow(ApiModel):
    start_ms: int
    end_ms: int


class ReplayRecap(ApiModel):
    text: str
    citations: list[Citation] = Field(default_factory=list)


class ReplayMomentOut(ApiModel):
    moment_id: str
    offset_ms: int
    window: ReplayWindow
    concept_title: str
    recap: ReplayRecap


class ReplayStartOut(ApiModel):
    lecture_id: UUID
    moments: list[ReplayMomentOut]
    transcript_status: str
    source: Literal["template", "prebaked", "live"]


class ReplayHistoryItem(ApiModel):
    role: Literal["axiom", "student"]
    text: str = Field(min_length=1, max_length=2_000)


class ReplayTurnRequest(ApiModel):
    lecture_id: UUID
    moment_id: str = Field(min_length=16, max_length=2_048)
    stage: Literal["mcq", "socratic"]
    history: list[ReplayHistoryItem] = Field(default_factory=list, max_length=12)
    input: dict[str, str] | None = None
    state_token: str | None = Field(default=None, max_length=4_096)

    @model_validator(mode="after")
    def validate_input(self) -> ReplayTurnRequest:
        if self.input is not None:
            text = self.input.get("text")
            if text is not None and len(text) > 600:
                raise ValueError("input.text must be at most 600 characters")
            if text is not None and not text.strip():
                raise ValueError("input.text must not be blank")
        if sum(len(item.text) for item in self.history) > 4_000:
            raise ValueError("history is too large")
        if self.input is not None and sum(len(value) for value in self.input.values()) > 1_000:
            raise ValueError("input is too large")
        return self


class ReplayTurnOut(ApiModel):
    turn: SocraticTurn
    state_token: str
    turn_number: int
    stage: Literal["mcq", "socratic", "complete"]


class GapCardMomentIn(ApiModel):
    moment_id: str = Field(min_length=16, max_length=2_048)
    outcome: Literal["unclear", "partial", "clear"] = "unclear"
    student_note: str | None = Field(default=None, max_length=600)


class GapCardGenerateRequest(ApiModel):
    lecture_id: UUID
    moments: list[GapCardMomentIn] = Field(min_length=1, max_length=20)


class GapCardBack(ApiModel):
    type: Literal["transcript_quote"] = "transcript_quote"
    quote: str
    citation: Citation


class GapCardOut(ApiModel):
    card_id: UUID
    moment_id: str
    concept_title: str
    front: str
    back: GapCardBack
    difficulty: Literal[1, 2, 3]
    source: Literal["template", "prebaked", "live"]
    validation: ValidationResult


class GapCardsResponse(ApiModel):
    lecture_id: UUID
    cards: list[GapCardOut]


class IntelligenceGenerateRequest(ApiModel):
    kind: Literal["brief_next", "handoff"]
    max_concepts: int = Field(default=3, ge=1, le=3)


class IntelligenceGenerateResponse(ApiModel):
    insight: InsightOut
    selection: str
    source: Literal["template", "prebaked", "live"]
