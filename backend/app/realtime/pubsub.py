from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

from app.realtime.connection import ConnectionManager
from app.realtime.envelope import lecture_channel
from app.redis_client import RedisClient

logger = logging.getLogger("daris.pubsub")


class LectureEventBus:
    """Redis Pub/Sub fan-out scoped to one channel per lecture."""

    def __init__(self, redis_client: RedisClient, manager: ConnectionManager) -> None:
        self._redis = redis_client
        self._manager = manager
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def publish(self, lecture_id: Any, event: dict[str, Any]) -> None:
        await self._redis.client.publish(
            lecture_channel(lecture_id),
            json.dumps(event, separators=(",", ":")),
        )

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="daris-lecture-event-bus")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _run(self) -> None:
        pubsub = self._redis.client.pubsub()
        await pubsub.psubscribe("daris:lecture:*")
        try:
            while not self._stop.is_set():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    continue
                data = message.get("data")
                if not isinstance(data, str):
                    continue
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    logger.warning("discarding malformed pubsub event")
                    continue
                if not isinstance(event, dict):
                    continue
                await self._manager.dispatch(event)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("lecture event bus stopped unexpectedly")
            raise
        finally:
            with contextlib.suppress(Exception):
                await pubsub.punsubscribe("daris:lecture:*")
            with contextlib.suppress(Exception):
                await pubsub.aclose()
