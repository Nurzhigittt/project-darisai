from __future__ import annotations

from uuid import uuid4

import pytest
from app.security import (
    TokenCodec,
    TokenError,
    generate_invite_code,
    generate_join_code,
    hash_invite_code,
)

from tests.conftest import make_settings


def test_signal_and_replay_scopes_are_separate() -> None:
    settings = make_settings()
    codec = TokenCodec(settings)
    lecture_id = uuid4()
    signal = codec.issue(scope="signal", lecture_id=lecture_id, ttl_seconds=600)
    replay = codec.issue(scope="replay", lecture_id=lecture_id, ttl_seconds=86_400)

    assert codec.verify(signal.raw_token, expected_scope="signal").lecture_id == lecture_id
    assert codec.verify(replay.raw_token, expected_scope="replay").lecture_id == lecture_id

    with pytest.raises(TokenError, match="wrong_scope"):
        codec.verify(signal.raw_token, expected_scope="replay")
    with pytest.raises(TokenError, match="wrong_scope"):
        codec.verify(replay.raw_token, expected_scope="signal")


def test_signal_token_cannot_cross_lectures() -> None:
    codec = TokenCodec(make_settings())
    first = uuid4()
    second = uuid4()
    token = codec.issue(scope="signal", lecture_id=first, ttl_seconds=600)
    with pytest.raises(TokenError, match="wrong_lecture"):
        codec.verify(token.raw_token, expected_lecture=second)


def test_expired_token_is_rejected() -> None:
    codec = TokenCodec(make_settings())
    token = codec.issue(scope="replay", lecture_id=uuid4(), ttl_seconds=-10)
    with pytest.raises(TokenError, match="expired"):
        codec.verify(token.raw_token)


def test_tampered_signature_is_rejected() -> None:
    codec = TokenCodec(make_settings())
    token = codec.issue(scope="signal", lecture_id=uuid4(), ttl_seconds=600)
    tampered = token.raw_token[:-2] + ("aa" if not token.raw_token.endswith("aa") else "bb")
    with pytest.raises(TokenError):
        codec.verify(tampered)


def test_join_and_invite_codes_use_safe_alphabet() -> None:
    for _ in range(50):
        code = generate_join_code()
        assert len(code) == 6
        assert set(code) <= set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
    invite = generate_invite_code()
    assert invite.startswith("DARIS-")
    assert len(invite) == 20


def test_invite_hash_is_keyed_and_normalized() -> None:
    settings = make_settings()
    assert hash_invite_code(settings, " teach-me ") == hash_invite_code(settings, "TEACH-ME")
    assert hash_invite_code(settings, "TEACH-ME") != hash_invite_code(settings, "TEACH-ME2")
    assert len(hash_invite_code(settings, "TEACH-ME")) == 64


def test_professor_jwt_round_trip_and_wrong_secret() -> None:
    settings = make_settings()
    codec = TokenCodec(settings)
    professor_id = uuid4()
    token, expires_in, _ = codec.issue_professor_access(professor_id)
    claims = codec.verify_professor_access(token)
    assert claims.professor_id == professor_id
    assert expires_in == settings.professor_jwt_ttl_seconds

    from app.errors import AppError

    other = TokenCodec(make_settings(jwt_secret="another-secret-" + "z" * 40))
    with pytest.raises(AppError):
        other.verify_professor_access(token)
