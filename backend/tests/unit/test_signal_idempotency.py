from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.config import Settings
from app.observability import OperationalCounters
from app.realtime.signals import SIGNAL_SCRIPT, SignalProcessor
from app.schemas.ws import InboundEnvelope, StudentSignalPayload

from tests.conftest import make_settings


class IdempotentScript:
    def __init__(self) -> None:
        self.seen_keys: set[str] = set()
        self.calls: list[tuple[list[str], list[Any]]] = []

    async def __call__(self, *, keys: list[str], args: list[Any]) -> list[int]:
        self.calls.append((keys, args))
        if keys[0] in self.seen_keys:
            return [-2, 0]
        self.seen_keys.add(keys[0])
        return [1, 0]


class FakeRedisClient:
    def __init__(self) -> None:
        self.script = IdempotentScript()

    def register_script(self, source: str) -> IdempotentScript:
        assert source == SIGNAL_SCRIPT
        return self.script


class FakeRedis:
    def __init__(self) -> None:
        self.client = FakeRedisClient()


@pytest.mark.asyncio
async def test_signal_retry_deduplicates_by_client_seq_across_msg_ids() -> None:
    settings: Settings = make_settings()
    fake_redis = FakeRedis()
    counters = OperationalCounters()
    processor = SignalProcessor(
        db=cast(Any, None),
        redis_client=cast(Any, fake_redis),
        settings=settings,
        counters=counters,
    )
    processor.mark_heartbeat = AsyncMock()  # type: ignore[method-assign]

    lecture_id = uuid4()
    token_hash = "a" * 64
    now = datetime.now(UTC)
    lecture = {
        "id": lecture_id,
        "status": "live",
        "started_at": now,
        "ended_at": None,
        "paused_at": None,
        "paused_total_ms": 0,
    }
    payload = {"client_seq": 7, "kind": "lost", "client_ts_ms": int(time.time() * 1000)}
    first_event = InboundEnvelope(
        v=1,
        type="student_signal",
        msg_id=uuid4(),
        ts=now,
        lecture_id=lecture_id,
        payload=payload,
    )
    retry_event = first_event.model_copy(update={"msg_id": uuid4()})
    assert first_event.msg_id != retry_event.msg_id

    first = await processor.process(
        lecture=lecture,
        token_hash=token_hash,
        payload=StudentSignalPayload.model_validate(first_event.payload),
    )
    retry = await processor.process(
        lecture=lecture,
        token_hash=token_hash,
        payload=StudentSignalPayload.model_validate(retry_event.payload),
    )

    assert first.accepted and not first.duplicate
    assert not retry.accepted and retry.duplicate and retry.reason == "duplicate"
    assert counters.accepted_signals_total == 1
    assert counters.rejected_signals_total == 1
    keys, args = fake_redis.client.script.calls[0]
    assert keys[0] == f"daris:idem:{lecture_id}:{token_hash}:7"
    assert args[6] == settings.signal_token_ttl_seconds
    assert fake_redis.client.script.calls[0][0][0] == fake_redis.client.script.calls[1][0][0]


def test_lua_duplicate_guard_precedes_aggregate_writes() -> None:
    duplicate_guard = SIGNAL_SCRIPT.index("if redis.call('EXISTS', idem) == 1 then")
    first_aggregate_write = SIGNAL_SCRIPT.index("redis.call('HINCRBY', bucket_signals")

    assert duplicate_guard < first_aggregate_write
    assert "return {-2, 0}" in SIGNAL_SCRIPT[duplicate_guard:first_aggregate_write]
