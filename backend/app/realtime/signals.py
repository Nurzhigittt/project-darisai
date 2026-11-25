from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.config import Settings
from app.db import Database
from app.observability import OperationalCounters
from app.redis_client import RedisClient
from app.schemas.ws import SignalAckPayload, StudentSignalPayload
from app.services.lectures import elapsed_lecture_ms

SIGNAL_SCRIPT = """
local idem = KEYS[1]
local cooldown = KEYS[2]
local signals = KEYS[3]
local bucket_signals = KEYS[4]
local bucket_unique = KEYS[5]
local minute_signals = KEYS[6]
local minute_unique = KEYS[7]
local bucket_registry = KEYS[8]
local minute_registry = KEYS[9]
local all_unique = KEYS[10]
local total = KEYS[11]

if redis.call('EXISTS', idem) == 1 then
  return {-2, 0}
end
local cooldown_ttl = redis.call('PTTL', cooldown)
if cooldown_ttl > 0 then
  return {-1, cooldown_ttl}
end

local token_hash = ARGV[1]
local now_ms = ARGV[2]
local seq = ARGV[3]
local cooldown_ms = ARGV[4]
local bucket_start = ARGV[5]
local minute_start = ARGV[6]
local idem_ttl = tonumber(ARGV[7])
local bucket_ttl = tonumber(ARGV[8])
local all_ttl = tonumber(ARGV[9])

redis.call('SET', idem, seq, 'EX', idem_ttl)
redis.call('SET', cooldown, '1', 'PX', cooldown_ms)
redis.call('ZADD', signals, now_ms, token_hash)
redis.call('EXPIRE', signals, 900)

redis.call('HINCRBY', bucket_signals, 'signals', 1)
redis.call('SADD', bucket_unique, token_hash)
redis.call('EXPIRE', bucket_signals, bucket_ttl)
redis.call('EXPIRE', bucket_unique, bucket_ttl)
redis.call('SADD', bucket_registry, bucket_start)

redis.call('HINCRBY', minute_signals, 'signals', 1)
redis.call('SADD', minute_unique, token_hash)
redis.call('EXPIRE', minute_signals, bucket_ttl)
redis.call('EXPIRE', minute_unique, bucket_ttl)
redis.call('SADD', minute_registry, minute_start)

redis.call('SADD', all_unique, token_hash)
redis.call('EXPIRE', all_unique, all_ttl)
redis.call('INCR', total)
redis.call('EXPIRE', total, all_ttl)
return {1, 0}
"""


@dataclass
class SignalResult:
    accepted: bool
    reason: str | None
    retry_after_ms: int | None
    duplicate: bool


class SignalProcessor:
    def __init__(
        self,
        db: Database,
        redis_client: RedisClient,
        settings: Settings,
        counters: OperationalCounters,
    ) -> None:
        self._db = db
        self._redis = redis_client
        self._settings = settings
        self._counters = counters
        self._script: Any | None = None

    @staticmethod
    def _signal_key(lecture_id: UUID) -> str:
        return f"daris:sig:{lecture_id}"

    @staticmethod
    def _active_key(lecture_id: UUID) -> str:
        return f"daris:active:{lecture_id}"

    @staticmethod
    def _bucket_start(offset_ms: int, bucket_ms: int) -> int:
        return max(0, offset_ms // bucket_ms * bucket_ms)

    async def mark_heartbeat(self, lecture_id: UUID, token_hash: str) -> None:
        now_ms = int(time.time() * 1000)
        key = self._active_key(lecture_id)
        pipe = self._redis.client.pipeline()
        pipe.zadd(key, {token_hash: now_ms})
        pipe.zremrangebyscore(key, 0, now_ms - self._settings.ripple_active_window_ms)
        pipe.expire(key, 180)
        await pipe.execute()

    async def remove_active(self, lecture_id: UUID, token_hash: str) -> None:
        await self._redis.client.zrem(self._active_key(lecture_id), token_hash)

    async def process(
        self,
        *,
        lecture: dict[str, Any],
        token_hash: str,
        payload: StudentSignalPayload,
    ) -> SignalAckPayload:
        lecture_id = UUID(str(lecture["id"]))
        now_wall_ms = int(time.time() * 1000)
        offset_ms = elapsed_lecture_ms(lecture)
        if lecture["status"] != "live":
            return SignalAckPayload(
                client_seq=payload.client_seq,
                accepted=False,
                offset_ms=offset_ms,
                reason="not_live",
            )
        if payload.client_ts_ms is not None:
            skew = now_wall_ms - payload.client_ts_ms
            if skew > self._settings.stale_signal_grace_ms:
                self._counters.rejected("stale_signal")
                return SignalAckPayload(
                    client_seq=payload.client_seq,
                    accepted=False,
                    offset_ms=offset_ms,
                    reason="stale_signal",
                )

        bucket_start = self._bucket_start(offset_ms, self._settings.signal_bucket_ms)
        minute_start = self._bucket_start(offset_ms, 60_000)
        lecture_key = str(lecture_id)
        token_key = token_hash[:16]
        keys = [
            f"daris:idem:{lecture_key}:{token_key}:{payload.client_seq}",
            f"daris:cd:{lecture_key}:{token_key}",
            self._signal_key(lecture_id),
            f"daris:bucket:signals:{lecture_key}:{bucket_start}",
            f"daris:bucket:unique:{lecture_key}:{bucket_start}",
            f"daris:minute:signals:{lecture_key}:{minute_start}",
            f"daris:minute:unique:{lecture_key}:{minute_start}",
            f"daris:buckets:{lecture_key}",
            f"daris:minutes:{lecture_key}",
            f"daris:all_unique:{lecture_key}",
            f"daris:total:{lecture_key}",
        ]
        if self._script is None:
            self._script = self._redis.client.register_script(SIGNAL_SCRIPT)
        result = await self._script(
            keys=keys,
            args=[
                token_hash,
                now_wall_ms,
                payload.client_seq,
                self._settings.signal_cooldown_ms,
                bucket_start,
                minute_start,
                3600,
                7200,
                86400,
            ],
        )
        status = int(result[0])
        retry_after = int(result[1]) if len(result) > 1 else 0
        await self.mark_heartbeat(lecture_id, token_hash)
        if status == 1:
            self._counters.accepted()
            return SignalAckPayload(
                client_seq=payload.client_seq,
                accepted=True,
                offset_ms=offset_ms,
            )
        if status == -1:
            self._counters.rejected("cooldown")
            return SignalAckPayload(
                client_seq=payload.client_seq,
                accepted=False,
                offset_ms=offset_ms,
                reason="cooldown",
                retry_after_ms=max(0, retry_after),
            )
        self._counters.rejected("duplicate")
        return SignalAckPayload(
            client_seq=payload.client_seq,
            accepted=False,
            offset_ms=offset_ms,
            reason="duplicate",
            duplicate=True,
        )

    async def active_count(self, lecture_id: UUID) -> int:
        now_ms = int(time.time() * 1000)
        key = self._active_key(lecture_id)
        pipe = self._redis.client.pipeline()
        pipe.zremrangebyscore(key, 0, now_ms - self._settings.ripple_active_window_ms)
        pipe.zcard(key)
        result = await pipe.execute()
        return int(result[1])

    async def unique_in_window(self, lecture_id: UUID) -> int:
        now_ms = int(time.time() * 1000)
        return int(
            await self._redis.client.zcount(
                self._signal_key(lecture_id),
                now_ms - self._settings.ripple_window_ms,
                now_ms,
            )
        )

    async def current_window_hashes(self, lecture_id: UUID) -> list[str]:
        now_ms = int(time.time() * 1000)
        return list(
            await self._redis.client.zrangebyscore(
                self._signal_key(lecture_id),
                now_ms - self._settings.ripple_window_ms,
                now_ms,
            )
        )

    async def total_accepted(self, lecture_id: UUID) -> int:
        raw = await self._redis.client.get(f"daris:total:{lecture_id}")
        return int(raw or 0)

    async def unique_total(self, lecture_id: UUID) -> int:
        return int(await self._redis.client.scard(f"daris:all_unique:{lecture_id}"))

    async def peak_active(self, lecture_id: UUID) -> int:
        raw = await self._redis.client.get(f"daris:peak_active:{lecture_id}")
        return int(raw or 0)

    async def update_peak_active(self, lecture_id: UUID, active: int) -> None:
        key = f"daris:peak_active:{lecture_id}"
        current = int(await self._redis.client.get(key) or 0)
        if active > current:
            await self._redis.client.set(key, active, ex=86400)

    async def cache_snapshot(self, lecture_id: UUID, state: dict[str, Any]) -> None:
        await self._redis.client.set(
            f"daris:ripple:{lecture_id}",
            json.dumps(state, default=str),
            ex=21_600,
        )

    async def get_cached_snapshot(self, lecture_id: UUID) -> dict[str, Any] | None:
        raw = await self._redis.client.get(f"daris:ripple:{lecture_id}")
        if not isinstance(raw, str):
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
