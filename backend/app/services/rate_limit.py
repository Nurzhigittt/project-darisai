from __future__ import annotations

from datetime import UTC, datetime

from app.config import Settings
from app.errors import AppError
from app.redis_client import RedisClient
from app.security import pseudonymous_rate_key

_FIXED_WINDOW_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""


class RateLimiter:
    def __init__(self, redis_client: RedisClient, settings: Settings) -> None:
        self._redis = redis_client
        self._settings = settings
        self._script: object | None = None

    async def enforce_join(self, ip_address: str) -> None:
        day = datetime.now(UTC).strftime("%Y-%m-%d")
        key = "daris:rl:join:" + pseudonymous_rate_key(self._settings, ip_address, day)
        await self._enforce(key, self._settings.rate_limit_join_per_minute)

    async def enforce_auth(self, ip_address: str) -> None:
        day = datetime.now(UTC).strftime("%Y-%m-%d")
        key = "daris:rl:auth:" + pseudonymous_rate_key(self._settings, ip_address, day)
        await self._enforce(key, self._settings.rate_limit_auth_per_minute)

    async def _enforce(self, key: str, limit: int) -> None:
        if self._script is None:
            self._script = self._redis.client.register_script(_FIXED_WINDOW_SCRIPT)
        current = int(await self._script(keys=[key], args=[60]))  # type: ignore[operator]
        if current > limit:
            raise AppError(
                429,
                "RATE_LIMITED",
                "Too many attempts. Please wait a moment and try again.",
                headers={"Retry-After": "60"},
            )
