from __future__ import annotations

from collections.abc import Sequence
from typing import Literal
from uuid import UUID

from pydantic import Field, ValidationError

from app.axiom.concepts import concept_title
from app.axiom.interfaces import LLMClient
from app.axiom.llm import LLMError
from app.axiom.models import (
    AxiomModel,
    Citation,
    GapCard,
    RetrievalContext,
    SocraticTurn,
    ValidationResult,
)
from app.axiom.prompts import (
    PROMPT_VERSION,
    gapcards_user_prompt,
    prompt,
    socratic_user_prompt,
)
from app.axiom.validators import (
    AnswerLeakValidator,
    DeterministicCitationValidator,
    GroundednessValidator,
    PromptInjectionValidator,
    SocraticBehaviorValidator,
    combine_validation,
)
from app.config import Settings


class GeneratedOption(AxiomModel):
    id: str = Field(min_length=1, max_length=8)
    text: str = Field(min_length=1, max_length=240)


class GeneratedTurn(AxiomModel):
    kind: Literal["mcq", "question", "reflection", "refusal"]
    text: str = Field(min_length=1, max_length=1_200)
    citations: list[Citation] = Field(default_factory=list)
    options: list[GeneratedOption] = Field(default_factory=list)
    stage_complete: bool = False


class GeneratedGapCard(AxiomModel):
    moment_id: str
    concept_title: str = Field(min_length=1, max_length=160)
    front: str = Field(min_length=1, max_length=500)
    quote: str = Field(min_length=1, max_length=200)
    segment_id: UUID
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    difficulty: Literal[1, 2, 3] = 1


class GeneratedGapCards(AxiomModel):
    cards: list[GeneratedGapCard] = Field(default_factory=list, max_length=3)


def _clip(text: str, limit: int = 180) -> str:
    value = " ".join(text.split())
    if len(value) <= limit:
        return value
    cut = value[:limit].rsplit(" ", 1)[0]
    return cut or value[:limit]


def _first_evidence(context: RetrievalContext) -> tuple[str, int, int, UUID] | None:
    segments = [
        segment
        for segment in context.temporal_segments + context.semantic_segments
        if segment.text.strip()
    ]
    if not segments:
        return None
    focus = context.focus_offset_ms
    segments.sort(key=lambda segment: (abs(segment.start_ms - focus), segment.start_ms))
    segment = segments[0]
    return _clip(segment.text), segment.start_ms, segment.end_ms, segment.segment_id


def _timestamp(ms: int) -> str:
    seconds = max(0, ms // 1000)
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


class AxiomEngine:
    """Generation pipeline with deterministic validation and fallback.

    No unvalidated model output reaches a student. When the LLM is unavailable or
    validation fails, the fallback is built only from retrieved transcript text.
    """

    def __init__(self, settings: Settings, llm: LLMClient | None) -> None:
        self._settings = settings
        self._llm = llm
        self._citations = DeterministicCitationValidator()
        self._socratic = SocraticBehaviorValidator()
        self._injection = PromptInjectionValidator()
        self._leaks = AnswerLeakValidator(llm)
        self._grounding = GroundednessValidator(llm)

    @property
    def prompt_version(self) -> str:
        return PROMPT_VERSION

    @property
    def llm_usage(self) -> dict[str, int]:
        usage = getattr(self._llm, "usage", None)
        return usage.as_dict() if usage is not None else {}

    async def turn(
        self,
        *,
        context: RetrievalContext,
        moment_id: str,
        stage: Literal["mcq", "socratic"],
        history: Sequence[dict[str, str]],
        student_input: dict[str, str] | None,
        language: str,
        turn_number: int,
    ) -> SocraticTurn:
        untrusted = [str(value) for value in (student_input or {}).values()]
        untrusted.extend(str(item.get("text", "")) for item in history)
        if any(self._injection.check(text) for text in untrusted):
            return self._refusal(
                language,
                details=["Student-controlled text contained an instruction-manipulation pattern."],
            )
        if not context.evidence_sufficient:
            return self._refusal(language)
        if self._llm is None:
            return self._template_turn(context, language, turn_number)
        prompt_input = socratic_user_prompt(
            context=context,
            stage=stage,
            history=list(history),
            student_input=student_input,
            language=language,
            moment_id=moment_id,
        )
        attempts = 0
        last_errors: list[str] = []
        for stricter in (False, True):
            attempts += 1
            system = prompt("socratic_system.md")
            if stricter:
                system += (
                    "\nSTRICT RETRY: the previous response failed validation. "
                    "Return only one grounded Socratic turn with a real citation."
                )
            try:
                raw = await self._llm.complete_json(
                    system_prompt=system,
                    user_prompt=prompt_input,
                    timeout_seconds=self._settings.axiom_llm_timeout_seconds,
                )
                generated = GeneratedTurn.model_validate(raw)
                canonical, citation_errors = self._citations.validate_and_canonicalize(
                    citations=generated.citations, context=context
                )
                candidate = SocraticTurn(
                    kind=generated.kind,
                    text=generated.text,
                    citations=canonical,
                    options=[option.model_dump() for option in generated.options],
                    stage_complete=generated.stage_complete,
                    source="live",
                )
                socratic_errors = self._socratic.validate(candidate)
                if not canonical and generated.kind != "refusal":
                    socratic_errors.append("A grounded Socratic turn needs a citation.")
                leak_result = await self._leaks.validate(turn=candidate)
                grounded = await self._grounding.validate(answer=candidate.text, context=context)
                validation = combine_validation(
                    citation_result=ValidationResult(
                        schema_ok=True,
                        citations_ok=not citation_errors,
                        answer_leak=False,
                        grounded_score=1.0 if not citation_errors else 0.0,
                        attempts=attempts,
                        details=citation_errors,
                    ),
                    socratic_errors=socratic_errors,
                    leak_result=leak_result,
                    grounded_result=grounded,
                    attempts=attempts,
                )
                if (
                    not citation_errors
                    and not socratic_errors
                    and not leak_result.answer_leak
                    and grounded.grounded_score >= 0.8
                ):
                    candidate.validation = validation
                    return candidate
                last_errors = validation.details or ["Groundedness below threshold."]
            except (ValidationError, LLMError, ValueError, TypeError) as exc:
                last_errors = [type(exc).__name__]
        fallback = self._template_turn(context, language, turn_number)
        fallback.validation = ValidationResult(
            schema_ok=True,
            citations_ok=bool(fallback.citations),
            answer_leak=False,
            grounded_score=1.0 if fallback.citations else 0.0,
            attempts=attempts,
            fallback_used=True,
            details=["Validated live output was unavailable; transcript fallback used.", *last_errors[:5]],
        )
        return fallback

    def _refusal(self, language: str, details: list[str] | None = None) -> SocraticTurn:
        text = {
            "ru": "В этой лекции недостаточно проверяемых фрагментов, чтобы ответить. Попросите преподавателя загрузить транскрипт.",
            "kk": "Бұл дәрісте жауап беруге жеткілікті тексерілген үзінді жоқ. Оқытушыдан транскрипт жүктеуді сұраңыз.",
            "en": "There is not enough verified lecture evidence to answer. Ask the professor to upload the transcript.",
        }.get(language, "There is not enough verified lecture evidence to answer.")
        return SocraticTurn(
            kind="refusal",
            text=text,
            stage_complete=True,
            source="template",
            validation=ValidationResult(
                schema_ok=True,
                citations_ok=False,
                answer_leak=False,
                grounded_score=0.0,
                attempts=1,
                fallback_used=True,
                details=details or ["No retrieved transcript evidence."],
            ),
        )

    def _template_turn(
        self, context: RetrievalContext, language: str, turn_number: int
    ) -> SocraticTurn:
        evidence = _first_evidence(context)
        if evidence is None:
            return self._refusal(language)
        quote, start, end, segment_id = evidence
        citation = Citation(
            segment_id=segment_id, start_ms=start, end_ms=end, quote=quote
        )
        if turn_number >= self._settings.axiom_replay_max_turns - 1:
            text = {
                "ru": f"Вернёмся к фрагменту {_timestamp(start)}–{_timestamp(end)}: «{quote}». Что изменилось в вашем понимании после этого разговора?",
                "kk": f"{_timestamp(start)}–{_timestamp(end)} үзіндісіне оралайық: «{quote}». Бұл әңгімеден кейін түсінігіңізде не өзгерді?",
                "en": f"Let us return to {_timestamp(start)}–{_timestamp(end)}: “{quote}”. What changed in your understanding after this conversation?",
            }.get(language, f"Let us return to {_timestamp(start)}–{_timestamp(end)}: “{quote}”. What changed in your understanding?")
            return SocraticTurn(
                kind="reflection",
                text=text,
                citations=[citation],
                stage_complete=True,
                source="template",
                validation=_template_validation(citation),
            )
        text = {
            "ru": f"Преподаватель сказал в {_timestamp(start)}–{_timestamp(end)}: «{quote}». Как бы вы объяснили эту мысль своими словами и почему она следует из примера?",
            "kk": f"Оқытушы {_timestamp(start)}–{_timestamp(end)} уақытында: «{quote}» деді. Бұл ойды өз сөзіңізбен қалай түсіндіресіз және ол мысалдан неге шығады?",
            "en": f"At {_timestamp(start)}–{_timestamp(end)}, the lecturer said: “{quote}”. How would you explain this idea in your own words, and why does it follow from the example?",
        }.get(language, f"At {_timestamp(start)}–{_timestamp(end)}, the lecturer said: “{quote}”. How would you explain this idea in your own words?")
        return SocraticTurn(
            kind="question",
            text=text,
            citations=[citation],
            source="template",
            validation=_template_validation(citation),
        )

    async def gap_cards(
        self,
        *,
        lecture_id: UUID,
        language: str,
        moments: Sequence[dict[str, str]],
        contexts: Sequence[RetrievalContext],
    ) -> list[GapCard]:
        cards: list[GapCard] = []
        if self._llm is not None:
            for moment, context in zip(moments, contexts, strict=True):
                if not context.evidence_sufficient:
                    continue
                try:
                    raw = await self._llm.complete_json(
                        system_prompt=prompt("gapcards_generation.md"),
                        user_prompt=gapcards_user_prompt(
                            context=context,
                            moment_id=str(moment["moment_id"]),
                            outcome=str(moment.get("outcome", "unclear")),
                            student_note=str(moment.get("student_note", "")) or None,
                            language=language,
                        ),
                    )
                    generated = GeneratedGapCards.model_validate(raw)
                    for item in generated.cards:
                        citation_data = {
                            "segment_id": str(item.segment_id),
                            "start_ms": item.start_ms,
                            "end_ms": item.end_ms,
                            "quote": item.quote,
                        }
                        canonical, errors = self._citations.validate_and_canonicalize(
                            citations=[citation_data], context=context
                        )
                        if errors or not canonical:
                            continue
                        cards.append(
                            GapCard(
                                moment_id=str(moment["moment_id"]),
                                concept_title=item.concept_title,
                                front=item.front,
                                back_quote=canonical[0].quote,
                                back_citation=canonical[0],
                                difficulty=item.difficulty,
                                source="live",
                            )
                        )
                except (ValidationError, LLMError, ValueError, TypeError):
                    continue
        if not cards:
            cards = self._template_gap_cards(language=language, moments=moments, contexts=contexts)
        return self._dedupe_cards(cards)

    def _template_gap_cards(
        self,
        *,
        language: str,
        moments: Sequence[dict[str, str]],
        contexts: Sequence[RetrievalContext],
    ) -> list[GapCard]:
        cards: list[GapCard] = []
        for moment, context in zip(moments, contexts, strict=True):
            evidence = _first_evidence(context)
            if evidence is None:
                continue
            quote, start, end, segment_id = evidence
            concept = concept_title(quote, language)
            front = {
                "ru": f"Что означает «{concept}» в этом фрагменте?",
                "kk": f"Бұл үзіндіде «{concept}» нені білдіреді?",
                "en": f"What does “{concept}” mean in this moment?",
            }.get(language, f"What does “{concept}” mean here?")
            cards.append(
                GapCard(
                    moment_id=str(moment["moment_id"]),
                    concept_title=concept,
                    front=front,
                    back_quote=quote,
                    back_citation=Citation(
                        segment_id=segment_id, start_ms=start, end_ms=end, quote=quote
                    ),
                    difficulty=2,
                    source="template",
                )
            )
        return cards

    @staticmethod
    def _dedupe_cards(cards: Sequence[GapCard]) -> list[GapCard]:
        seen: set[tuple[str, str]] = set()
        result: list[GapCard] = []
        for card in cards:
            key = (card.concept_title, card.back_quote)
            if key in seen:
                continue
            seen.add(key)
            result.append(card)
            if len(result) >= 10:
                break
        return result


def _template_validation(citation: Citation | None) -> ValidationResult:
    return ValidationResult(
        schema_ok=True,
        citations_ok=citation is not None,
        answer_leak=False,
        grounded_score=1.0 if citation is not None else 0.0,
        attempts=1,
        fallback_used=False,
        details=["Deterministic template built from a verified transcript quote."],
    )
