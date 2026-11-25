from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.config import Settings
from app.errors import AppError
from app.redis_client import RedisClient


class GenerationBudget:
    """Lecture-scoped daily budget for AI work.

    The counter is short-lived and contains no student identity. It is a safety
    valve against a public demo generating unlimited paid provider calls.
    """

    def __init__(self, redis_client: RedisClient, settings: Settings) -> None:
        self._redis = redis_client
        self._settings = settings

    async def consume(self, lecture_id: UUID, *, amount: int = 1) -> int:
        if self._settings.axiom_daily_generation_budget <= 0:
            raise AppError(
                429,
                "AI_BUDGET_EXHAUSTED",
                "AI generation is disabled by the daily budget.",
            )
        day = datetime.now(UTC).strftime("%Y-%m-%d")
        key = f"daris:axiom:budget:{day}:{lecture_id}"
        client = self._redis.client
        value = int(await client.incrby(key, amount))
        if value == amount:
            await client.expire(key, 86_400)
        if value > self._settings.axiom_daily_generation_budget:
            raise AppError(
                429,
                "AI_BUDGET_EXHAUSTED",
                "The daily AI generation budget for this lecture is exhausted.",
            )
        return max(0, self._settings.axiom_daily_generation_budget - value)
