from __future__ import annotations

from uuid import UUID

from app.config import Settings
from app.errors import AppError
from app.redis_client import RedisClient
from app.security import sha256_hex


class ReplayAbuseGuard:
    """Bounded, pseudonymous Replay abuse controls.

    A Replay Token is not a unique person; this limits repeated use of one
    credential and prevents a signed state token from being replayed after a
    successful transition. Redis keys contain only a SHA-256 token hash.
    """

    def __init__(self, redis_client: RedisClient, settings: Settings) -> None:
        self._redis = redis_client
        self._settings = settings

    async def consume_token(self, raw_token: str, lecture_id: UUID) -> int:
        digest = sha256_hex(raw_token)
        key = f"daris:axiom:replay:{digest}"
        value = int(await self._redis.client.incr(key))
        if value == 1:
            await self._redis.client.expire(key, 86_400)
        if value > self._settings.axiom_replay_requests_per_token:
            raise AppError(
                429,
                "AI_RATE_LIMITED",
                "This replay credential has reached its request limit.",
            )
        # lecture_id is deliberately not added to the key: the same token is
        # lecture-bound by signature. It is accepted for logging-free scoping
        # clarity and future metrics.
        _ = lecture_id
        return value

    async def consume_state(self, nonce: str) -> None:
        if not self._settings.axiom_state_single_use:
            return
        key = f"daris:axiom:state:{nonce}"
        created = await self._redis.client.set(
            key,
            "1",
            nx=True,
            ex=self._settings.axiom_state_ttl_minutes * 60,
        )
        if not created:
            raise AppError(
                409,
                "REPLAY_STATE_REPLAYED",
                "This replay state has already been used. Start a new turn.",
            )
