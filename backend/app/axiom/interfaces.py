from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from app.axiom.models import (
    GapCard,
    Insight,
    RetrievalContext,
    SocraticTurn,
    TranscriptSegment,
    ValidationResult,
)


class AxiomUnavailableError(RuntimeError):
    """Raised when a future Axiom provider is unavailable.

    The Phase 1 application never calls these interfaces and therefore has no paid
    provider dependency.
    """


class LLMClient(Protocol):
    async def complete_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        timeout_seconds: float = 4.0,
    ) -> dict[str, object]: ...


class EmbeddingProvider(Protocol):
    dimension: int

    async def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class TranscriptProvider(Protocol):
    async def segments(self, lecture_id: UUID) -> list[TranscriptSegment]: ...


class TemporalRetriever(Protocol):
    async def retrieve(
        self,
        *,
        lecture_id: UUID,
        focus_offset_ms: int,
        query: str,
        top_k: int = 4,
        before_ms: int = 90_000,
        after_ms: int = 10_000,
    ) -> RetrievalContext: ...


class CitationValidator(Protocol):
    def validate(
        self,
        *,
        citations: Sequence[dict[str, object]],
        context: RetrievalContext,
    ) -> ValidationResult: ...


class GroundednessValidator(Protocol):
    async def validate(
        self,
        *,
        answer: str,
        context: RetrievalContext,
    ) -> ValidationResult: ...


class AnswerLeakValidator(Protocol):
    async def validate(self, *, turn: SocraticTurn) -> ValidationResult: ...


class SocraticEngine(Protocol):
    async def next_turn(
        self,
        *,
        lecture_id: UUID,
        moment_id: str,
        stage: str,
        history: Sequence[dict[str, str]],
        student_input: dict[str, str] | None,
        state_token: str | None,
    ) -> SocraticTurn: ...


class IntelligenceGenerator(Protocol):
    async def generate(
        self,
        *,
        lecture_id: UUID,
        kind: str,
        max_concepts: int,
        language: str,
    ) -> list[Insight]: ...

    async def generate_gap_cards(
        self,
        *,
        lecture_id: UUID,
        moments: Sequence[dict[str, str]],
    ) -> list[GapCard]: ...


class AutonomyPolicy(Protocol):
    def mode_for(self, *, course_id: UUID, concept_id: UUID) -> str: ...

    def can_publish(self, *, course_id: UUID, concept_id: UUID) -> bool: ...
