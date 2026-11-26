from __future__ import annotations

import uuid
from typing import Any

import pytest
from app.axiom.abuse import ReplayAbuseGuard
from app.errors import AppError

from tests.conftest import make_settings


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}
        self.seen: set[str] = set()

    async def incr(self, key: str) -> int:
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    async def expire(self, key: str, seconds: int) -> bool:
        _ = seconds
        return True

    async def set(self, key: str, value: str, *, nx: bool = False, ex: int | None = None) -> Any:
        _ = value, ex
        if nx and key in self.seen:
            return None
        self.seen.add(key)
        return True


class FakeRedisClient:
    def __init__(self) -> None:
        self.client = FakeRedis()


async def test_replay_token_request_limit() -> None:
    settings = make_settings(axiom_replay_requests_per_token=1)
    guard = ReplayAbuseGuard(FakeRedisClient(), settings)  # type: ignore[arg-type]
    lecture_id = uuid.uuid4()
    assert await guard.consume_token("token-a", lecture_id) == 1
    with pytest.raises(AppError) as error:
        await guard.consume_token("token-a", lecture_id)
    assert error.value.status_code == 429
    assert error.value.code == "AI_RATE_LIMITED"


async def test_state_nonce_is_single_use() -> None:
    guard = ReplayAbuseGuard(FakeRedisClient(), make_settings())  # type: ignore[arg-type]
    await guard.consume_state("nonce-1")
    with pytest.raises(AppError) as error:
        await guard.consume_state("nonce-1")
    assert error.value.status_code == 409
    assert error.value.code == "REPLAY_STATE_REPLAYED"
