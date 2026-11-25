from __future__ import annotations

import uuid

import pytest
from app.axiom.state import AxiomStateError, AxiomTokenCodec

from tests.conftest import make_settings


def test_moment_and_state_are_lecture_bound() -> None:
    codec = AxiomTokenCodec(make_settings())
    lecture_a = uuid.uuid4()
    lecture_b = uuid.uuid4()
    moment_token, claims = codec.issue_moment(
        lecture_id=lecture_a,
        offset_ms=252_000,
        start_ms=162_000,
        end_ms=262_000,
        concept_title="Pressure and speed",
    )
    assert codec.verify_moment(moment_token, lecture_a) == claims

    with pytest.raises(AxiomStateError, match="wrong_lecture"):
        codec.verify_moment(moment_token, lecture_b)

    state_token = codec.issue_state(
        lecture_id=lecture_a, moment_id=moment_token, stage="socratic", turn=2
    )
    state = codec.verify_state(state_token, lecture_id=lecture_a, moment_id=moment_token)
    assert state.turn == 2
    assert state.stage == "socratic"

    with pytest.raises(AxiomStateError, match="wrong_moment"):
        codec.verify_state(state_token, lecture_id=lecture_a, moment_id="other")


def test_tampered_state_is_rejected() -> None:
    codec = AxiomTokenCodec(make_settings())
    token = codec.issue_state(
        lecture_id=uuid.uuid4(), moment_id="moment", stage="mcq", turn=0
    )
    parts = token.split(".")
    parts[1] = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
    with pytest.raises(AxiomStateError):
        codec.verify_state(".".join(parts), lecture_id=uuid.uuid4(), moment_id="moment")


def test_expired_moment_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.axiom.state as state_module

    settings = make_settings(axiom_moment_ttl_minutes=1)
    codec = AxiomTokenCodec(settings)
    lecture_id = uuid.uuid4()
    monkeypatch.setattr(state_module.time, "time", lambda: 1_000)
    token, _ = codec.issue_moment(
        lecture_id=lecture_id,
        offset_ms=0,
        start_ms=0,
        end_ms=10_000,
        concept_title="x",
    )
    monkeypatch.setattr(state_module.time, "time", lambda: 2_000)
    with pytest.raises(AxiomStateError, match="expired"):
        codec.verify_moment(token, lecture_id)
