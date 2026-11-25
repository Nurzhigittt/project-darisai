from __future__ import annotations

import time
from typing import Any

import redis.asyncio as redis

from app.config import Settings


class RedisClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: redis.Redis | None = None

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            raise RuntimeError("Redis is not connected")
        return self._client

    async def connect(self) -> None:
        if self._client is not None:
            return
        self._client = redis.from_url(
            self._settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=5,
            health_check_interval=30,
        )
        await self._client.ping()

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def health(self) -> tuple[bool, float | None]:
        start = time.perf_counter()
        try:
            await self.client.ping()
        except Exception:
            return False, None
        return True, round((time.perf_counter() - start) * 1000, 2)

    async def publish_json(self, channel: str, payload: str) -> int:
        return int(await self.client.publish(channel, payload))

    async def close(self) -> None:
        await self.disconnect()

    async def info(self, section: str | None = None) -> dict[str, Any]:
        result = await self.client.info(section) if section else await self.client.info()
        return dict(result)
