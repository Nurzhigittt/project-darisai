from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

Source = Literal["live", "prebaked", "template"]


class AxiomModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TranscriptSegment(AxiomModel):
    segment_id: UUID = Field(default_factory=uuid4)
    lecture_id: UUID
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=8_000)


class Citation(AxiomModel):
    segment_id: UUID
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    quote: str = Field(min_length=1, max_length=200)


class RetrievalContext(AxiomModel):
    lecture_id: UUID
    focus_offset_ms: int = Field(ge=0)
    window_start_ms: int = Field(ge=0)
    window_end_ms: int = Field(ge=0)
    temporal_segments: list[TranscriptSegment]
    semantic_segments: list[TranscriptSegment] = Field(default_factory=list)
    retrieval_similarity: float | None = Field(default=None, ge=0, le=1)
    raw_similarity: float | None = None
    evidence_sufficient: bool = True
    degraded: bool = False


class ValidationResult(AxiomModel):
    schema_ok: bool
    citations_ok: bool
    answer_leak: bool
    grounded_score: float = Field(ge=0, le=1)
    attempts: int = Field(ge=1)
    fallback_used: bool = False
    details: list[str] = Field(default_factory=list)


class SocraticTurn(AxiomModel):
    kind: Literal["mcq", "question", "reflection", "refusal"]
    text: str
    citations: list[Citation] = Field(default_factory=list)
    options: list[dict[str, str]] = Field(default_factory=list)
    stage_complete: bool = False
    state_token: str | None = None
    validation: ValidationResult | None = None
    source: Source = "template"


class GapCard(AxiomModel):
    card_id: UUID = Field(default_factory=uuid4)
    moment_id: str
    concept_title: str
    front: str
    back_quote: str
    back_citation: Citation
    difficulty: Literal[1, 2, 3] = 1
    source: Source = "template"


class Insight(AxiomModel):
    insight_id: UUID = Field(default_factory=uuid4)
    lecture_id: UUID
    kind: Literal["brief_next", "handoff"]
    audience: Literal["professor", "seminar_leader"]
    status: Literal["pending_approval", "approved", "rejected", "edited", "published"]
    headline: str
    read_time_sec: int = Field(le=60)
    concepts: list[dict[str, object]] = Field(default_factory=list)
    task: dict[str, object] | None = None
    validation: ValidationResult
    source: Source = "template"
    created_at: datetime
