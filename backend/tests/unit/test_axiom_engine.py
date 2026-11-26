from __future__ import annotations

import uuid

from app.axiom.engine import AxiomEngine
from app.axiom.models import RetrievalContext, TranscriptSegment

from tests.conftest import make_settings


class JudgeLLM:
    def __init__(self, *, bad_citation: bool = False) -> None:
        self.bad_citation = bad_citation
        self.calls = 0

    async def complete_json(
        self, *, system_prompt: str, user_prompt: str, timeout_seconds: float = 4.0
    ) -> dict[str, object]:
        self.calls += 1
        if "groundedness judge" in system_prompt:
            return {"score": 1.0, "supported": [], "unsupported": []}
        if "answer-leakage judge" in system_prompt:
            return {"leak": False, "reasons": []}
        segment_id = "00000000-0000-0000-0000-000000000000" if self.bad_citation else self.segment_id
        return {
            "kind": "question",
            "text": "Why does the pressure change when the flow speeds up?",
            "citations": [
                {
                    "segment_id": segment_id,
                    "start_ms": 0,
                    "end_ms": 10_000,
                    "quote": "Pressure falls when flow speeds up.",
                }
            ],
            "options": [],
            "stage_complete": False,
        }

    @property
    def segment_id(self) -> str:
        return str(uuid.UUID("11111111-1111-4111-8111-111111111111"))


def _context() -> RetrievalContext:
    segment = TranscriptSegment(
        segment_id=uuid.UUID("11111111-1111-4111-8111-111111111111"),
        lecture_id=uuid.UUID("22222222-2222-4222-8222-222222222222"),
        start_ms=0,
        end_ms=10_000,
        text="Pressure falls when flow speeds up.",
    )
    return RetrievalContext(
        lecture_id=segment.lecture_id,
        focus_offset_ms=0,
        window_start_ms=0,
        window_end_ms=10_000,
        temporal_segments=[segment],
    )


async def test_live_turn_is_returned_only_after_validation() -> None:
    engine = AxiomEngine(make_settings(), JudgeLLM())
    turn = await engine.turn(
        context=_context(),
        moment_id="moment",
        stage="socratic",
        history=[],
        student_input={"text": "Why?"},
        language="en",
        turn_number=1,
    )
    assert turn.source == "live"
    assert turn.validation is not None
    assert turn.validation.citations_ok is True
    assert turn.validation.grounded_score >= 0.8


async def test_fabricated_live_citation_falls_back_to_template() -> None:
    engine = AxiomEngine(make_settings(), JudgeLLM(bad_citation=True))
    turn = await engine.turn(
        context=_context(),
        moment_id="moment",
        stage="socratic",
        history=[],
        student_input={"text": "Why?"},
        language="en",
        turn_number=1,
    )
    assert turn.source == "template"
    assert turn.validation is not None
    assert turn.validation.fallback_used is True
    assert turn.citations
    assert turn.text
