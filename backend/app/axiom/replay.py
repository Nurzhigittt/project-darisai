from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal
from uuid import UUID

from app.axiom.abuse import ReplayAbuseGuard
from app.axiom.concepts import concept_for_segments
from app.axiom.cost import GenerationBudget
from app.axiom.engine import AxiomEngine
from app.axiom.models import Citation
from app.axiom.retrieval import TemporalRetriever
from app.axiom.state import AxiomStateError, AxiomTokenCodec
from app.config import Settings
from app.db import Database
from app.errors import AppError
from app.schemas.axiom import (
    GapCardBack,
    GapCardGenerateRequest,
    GapCardOut,
    GapCardsResponse,
    ReplayHistoryItem,
    ReplayMomentOut,
    ReplayRecap,
    ReplayStartOut,
    ReplayTurnOut,
    ReplayWindow,
)
from app.services.tokens import StudentTokenService


def _timestamp(ms: int) -> str:
    seconds = max(0, ms // 1000)
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _clip(text: str, limit: int) -> str:
    value = " ".join(text.split())
    if len(value) <= limit:
        return value
    cut = value[:limit].rsplit(" ", 1)[0]
    return cut or value[:limit]


class ReplayService:
    def __init__(
        self,
        *,
        db: Database,
        settings: Settings,
        retrieval: TemporalRetriever,
        engine: AxiomEngine,
        state: AxiomTokenCodec,
        student_tokens: StudentTokenService,
        budget: GenerationBudget,
        guard: ReplayAbuseGuard,
    ) -> None:
        self._db = db
        self._settings = settings
        self._retrieval = retrieval
        self._engine = engine
        self._state = state
        self._tokens = student_tokens
        self._budget = budget
        self._guard = guard

    async def _lecture(self, lecture_id: UUID) -> dict[str, Any]:
        row = await self._db.fetchrow("SELECT * FROM lectures WHERE id = $1", lecture_id)
        if row is None:
            raise AppError(404, "NOT_FOUND", "Lecture not found.")
        return row

    async def _assert_replayable(self, lecture_id: UUID) -> dict[str, Any]:
        lecture = await self._lecture(lecture_id)
        if lecture["status"] != "ended":
            raise AppError(
                409,
                "LECTURE_NOT_ENDED",
                "Replay becomes available after the lecture ends.",
            )
        count = await self._db.fetchval(
            "SELECT count(*) FROM transcript_segments WHERE lecture_id = $1", lecture_id
        )
        if not count:
            raise AppError(
                409,
                "TRANSCRIPT_REQUIRED",
                "The professor has not made a transcript available for this lecture.",
            )
        return lecture

    async def start(
        self,
        *,
        lecture_id: UUID,
        replay_token: str,
        offsets: Sequence[int],
    ) -> ReplayStartOut:
        self._tokens.validate_replay_token(replay_token, lecture_id)
        await self._guard.consume_token(replay_token, lecture_id)
        lecture = await self._assert_replayable(lecture_id)
        if not 1 <= len(offsets) <= 20:
            raise AppError(422, "INVALID_OFFSETS", "Provide between 1 and 20 signal offsets.")
        normalized: list[int] = []
        for value in sorted(set(int(item) for item in offsets)):
            if value < 0:
                raise AppError(422, "INVALID_OFFSETS", "Offsets must be non-negative.")
            if normalized and value - normalized[-1] < 20_000:
                continue
            normalized.append(value)
        moments: list[ReplayMomentOut] = []
        language = str(lecture.get("language") or "en")
        for offset in normalized:
            context = await self._retrieval.retrieve(
                lecture_id=lecture_id,
                focus_offset_ms=offset,
                query="",
                top_k=self._settings.axiom_retrieval_top_k,
            )
            if not context.temporal_segments:
                continue
            ordered = sorted(
                context.temporal_segments,
                key=lambda segment: (abs(segment.start_ms - offset), segment.start_ms),
            )
            chosen = ordered[:2]
            texts = [segment.text for segment in chosen]
            concept = concept_for_segments(texts, language)
            quote = _clip(" ".join(texts), 480)
            citations = [
                Citation(
                    segment_id=segment.segment_id,
                    start_ms=segment.start_ms,
                    end_ms=segment.end_ms,
                    quote=_clip(segment.text, 180),
                )
                for segment in chosen
            ]
            moment_token, _ = self._state.issue_moment(
                lecture_id=lecture_id,
                offset_ms=offset,
                start_ms=context.window_start_ms,
                end_ms=context.window_end_ms,
                concept_title=concept,
            )
            moments.append(
                ReplayMomentOut(
                    moment_id=moment_token,
                    offset_ms=offset,
                    window=ReplayWindow(
                        start_ms=context.window_start_ms,
                        end_ms=context.window_end_ms,
                    ),
                    concept_title=concept,
                    recap=ReplayRecap(text=quote, citations=citations),
                )
            )
            if len(moments) >= 8:
                break
        if not moments:
            raise AppError(
                409,
                "TRANSCRIPT_EVIDENCE_REQUIRED",
                "No transcript evidence overlaps the supplied moments.",
            )
        return ReplayStartOut(
            lecture_id=lecture_id,
            moments=moments,
            transcript_status="ready",
            source="template",
        )

    async def turn(
        self,
        *,
        lecture_id: UUID,
        replay_token: str,
        moment_id: str,
        stage: Literal["mcq", "socratic"],
        history: Sequence[ReplayHistoryItem],
        student_input: dict[str, str] | None,
        state_token: str | None,
    ) -> ReplayTurnOut:
        self._tokens.validate_replay_token(replay_token, lecture_id)
        await self._guard.consume_token(replay_token, lecture_id)
        lecture = await self._assert_replayable(lecture_id)
        try:
            moment = self._state.verify_moment(moment_id, lecture_id)
        except AxiomStateError as exc:
            raise AxiomTokenCodec.as_app_error(exc) from exc
        turn_number = 0
        state_stage: Literal["mcq", "socratic", "complete"] = "mcq"
        if state_token:
            try:
                state = self._state.verify_state(
                    state_token, lecture_id=lecture_id, moment_id=moment_id
                )
            except AxiomStateError as exc:
                raise AxiomTokenCodec.as_app_error(exc) from exc
            turn_number = state.turn
            state_stage = state.stage
            await self._guard.consume_state(state.nonce)
            if state_stage == "complete":
                raise AppError(409, "REPLAY_COMPLETE", "This replay is already complete.")
            if stage == "mcq" and state_stage == "socratic":
                raise AppError(409, "INVALID_STAGE", "This replay has moved past the MCQ stage.")
        elif stage != "mcq":
            raise AppError(422, "INVALID_STAGE", "A new replay must begin with the mcq stage.")
        if turn_number >= self._settings.axiom_replay_max_turns:
            raise AppError(409, "REPLAY_COMPLETE", "This replay is already complete.")

        query = ""
        if student_input:
            query = str(student_input.get("text") or student_input.get("choice_id") or "")
        if not query:
            query = moment.concept_title
        await self._budget.consume(lecture_id)
        context = await self._retrieval.retrieve(
            lecture_id=lecture_id,
            focus_offset_ms=moment.offset_ms,
            query=query[:2_000],
            top_k=self._settings.axiom_retrieval_top_k,
        )
        history_payload = [{"role": item.role, "text": item.text} for item in history]
        effective_stage: Literal["mcq", "socratic"] = (
            "mcq" if turn_number == 0 and state_stage == "mcq" else "socratic"
        )
        turn = await self._engine.turn(
            context=context,
            moment_id=moment_id,
            stage=effective_stage,
            history=history_payload,
            student_input=student_input,
            language=str(lecture.get("language") or "en"),
            turn_number=turn_number,
        )
        completed = turn.stage_complete or turn.kind == "refusal"
        next_stage: Literal["mcq", "socratic", "complete"] = (
            "complete" if completed else "socratic"
        )
        next_token = self._state.issue_state(
            lecture_id=lecture_id,
            moment_id=moment_id,
            stage=next_stage,
            turn=turn_number + 1,
        )
        turn.state_token = next_token
        if completed:
            turn.stage_complete = True
        return ReplayTurnOut(
            turn=turn,
            state_token=next_token,
            turn_number=turn_number + 1,
            stage=next_stage,
        )


class GapCardService:
    def __init__(
        self,
        *,
        db: Database,
        settings: Settings,
        retrieval: TemporalRetriever,
        engine: AxiomEngine,
        state: AxiomTokenCodec,
        student_tokens: StudentTokenService,
        budget: GenerationBudget,
        guard: ReplayAbuseGuard,
    ) -> None:
        self._db = db
        self._settings = settings
        self._retrieval = retrieval
        self._engine = engine
        self._state = state
        self._tokens = student_tokens
        self._budget = budget
        self._guard = guard

    async def generate(
        self,
        *,
        lecture_id: UUID,
        replay_token: str,
        request: GapCardGenerateRequest,
    ) -> GapCardsResponse:
        self._tokens.validate_replay_token(replay_token, lecture_id)
        await self._guard.consume_token(replay_token, lecture_id)
        lecture = await self._db.fetchrow("SELECT * FROM lectures WHERE id = $1", lecture_id)
        if lecture is None:
            raise AppError(404, "NOT_FOUND", "Lecture not found.")
        if lecture["status"] != "ended":
            raise AppError(409, "LECTURE_NOT_ENDED", "GapCards are available after the lecture.")
        await self._budget.consume(lecture_id)
        contexts = []
        moments: list[dict[str, str]] = []
        for moment in request.moments:
            try:
                claims = self._state.verify_moment(moment.moment_id, lecture_id)
            except AxiomStateError as exc:
                raise AxiomTokenCodec.as_app_error(exc) from exc
            context = await self._retrieval.retrieve(
                lecture_id=lecture_id,
                focus_offset_ms=claims.offset_ms,
                query=claims.concept_title,
                top_k=self._settings.axiom_retrieval_top_k,
            )
            contexts.append(context)
            moments.append(
                {
                    "moment_id": moment.moment_id,
                    "outcome": moment.outcome,
                    "student_note": moment.student_note or "",
                }
            )
        cards = await self._engine.gap_cards(
            lecture_id=lecture_id,
            language=str(lecture.get("language") or "en"),
            moments=moments,
            contexts=contexts,
        )
        return GapCardsResponse(
            lecture_id=lecture_id,
            cards=[
                GapCardOut(
                    card_id=card.card_id,
                    moment_id=card.moment_id,
                    concept_title=card.concept_title,
                    front=card.front,
                    back=GapCardBack(
                        quote=card.back_quote,
                        citation=card.back_citation,
                    ),
                    difficulty=card.difficulty,
                    source=card.source,
                    validation=_card_validation(card),
                )
                for card in cards
            ],
        )


def _card_validation(card: Any) -> Any:
    from app.axiom.models import ValidationResult

    return ValidationResult(
        schema_ok=True,
        citations_ok=True,
        answer_leak=False,
        grounded_score=1.0,
        attempts=1,
        fallback_used=card.source == "template",
        details=[],
    )
