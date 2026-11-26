from __future__ import annotations

import uuid

from app.axiom.models import Citation, RetrievalContext, SocraticTurn, TranscriptSegment
from app.axiom.validators import (
    AnswerLeakValidator,
    DeterministicCitationValidator,
    GroundednessValidator,
    SocraticBehaviorValidator,
)


def build_context() -> tuple[RetrievalContext, TranscriptSegment]:
    lecture_id = uuid.uuid4()
    segment = TranscriptSegment(
        lecture_id=lecture_id,
        start_ms=10_000,
        end_ms=20_000,
        text="Pressure falls when the flow speeds up in a narrow pipe.",
    )
    return (
        RetrievalContext(
            lecture_id=lecture_id,
            focus_offset_ms=15_000,
            window_start_ms=0,
            window_end_ms=30_000,
            temporal_segments=[segment],
        ),
        segment,
    )


def test_valid_citation_is_canonicalized() -> None:
    context, segment = build_context()
    validator = DeterministicCitationValidator()
    accepted, errors = validator.validate_and_canonicalize(
        citations=[
            {
                "segment_id": str(segment.segment_id),
                "start_ms": 10_000,
                "end_ms": 15_000,
                "quote": "Pressure falls when the flow speeds up",
            }
        ],
        context=context,
    )
    assert not errors
    assert accepted[0].segment_id == segment.segment_id
    assert accepted[0].quote == "Pressure falls when the flow speeds up"


def test_fabricated_citation_and_bad_timestamp_are_rejected() -> None:
    context, segment = build_context()
    validator = DeterministicCitationValidator()
    for data in (
        {
            "segment_id": str(uuid.uuid4()),
            "start_ms": 10_000,
            "end_ms": 15_000,
            "quote": "Pressure falls",
        },
        {
            "segment_id": str(segment.segment_id),
            "start_ms": 0,
            "end_ms": 15_000,
            "quote": "Pressure falls",
        },
        {
            "segment_id": str(segment.segment_id),
            "start_ms": 10_000,
            "end_ms": 15_000,
            "quote": "This sentence is not in the lecture.",
        },
    ):
        _, errors = validator.validate_and_canonicalize(citations=[data], context=context)
        assert errors


async def test_answer_leak_and_groundedness() -> None:
    context, segment = build_context()
    citation = Citation(
        segment_id=segment.segment_id,
        start_ms=10_000,
        end_ms=20_000,
        quote="Pressure falls when the flow speeds up in a narrow pipe.",
    )
    leak = await AnswerLeakValidator().validate(
        turn=SocraticTurn(
            kind="question",
            text="The answer is 42. What did the lecturer mean?",
            citations=[citation],
        )
    )
    assert leak.answer_leak is True

    clean = await AnswerLeakValidator().validate(
        turn=SocraticTurn(
            kind="question",
            text="How would you explain the pressure change in your own words?",
            citations=[citation],
        )
    )
    assert clean.answer_leak is False

    grounded = await GroundednessValidator().validate(
        answer="Pressure falls when the flow speeds up in a narrow pipe.",
        context=context,
    )
    assert grounded.grounded_score >= 0.8


def test_socratic_mcq_structure_is_checked() -> None:
    validator = SocraticBehaviorValidator()
    valid = SocraticTurn(
        kind="mcq",
        text="Which relationship is described?",
        options=[
            {"id": "a", "text": "Pressure and speed"},
            {"id": "b", "text": "Only temperature"},
        ],
    )
    assert validator.validate(valid) == []

    invalid = SocraticTurn(
        kind="mcq",
        text="Which relationship is described?",
        options=[
            {"id": "a", "text": "Same"},
            {"id": "a", "text": "Same"},
        ],
    )
    assert validator.validate(invalid)
