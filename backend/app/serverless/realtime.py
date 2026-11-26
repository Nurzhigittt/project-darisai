from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import Database
from app.realtime.pubsub import LectureEventBus
from app.realtime.ripple_runtime import RippleRuntime
from app.schemas.ws import RippleUpdatePayload
from app.serverless.store import STATE_LOCK


class SupabaseEventBus(LectureEventBus):
    def __init__(self, db: Database) -> None:
        self.db = db

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    async def publish(self, lecture_id: Any, event: dict[str, Any]) -> None:
        roles = ("professor",) if event["type"] == "ripple_update" else ("professor", "student")
        for role in roles:
            await self.db.execute(
                "SELECT daris_private.broadcast($1,$2)", f"daris:{lecture_id}:{role}", event
            )


class DurableRipple(RippleRuntime):
    async def start(self) -> None:
        # Never spawn a task that needs to outlive a Vercel request.
        pass

    async def stop(self) -> None:
        pass

    async def evaluate(self, lecture: dict[str, Any], *, publish: bool = True) -> RippleUpdatePayload:
        async with self._db.transaction():
            await self._db.fetchval("SELECT pg_advisory_xact_lock($1)", STATE_LOCK)
            lecture_id = UUID(str(lecture["id"]))
            # A different function may have advanced the engine since this object
            # was created. The database is authoritative on EVERY evaluation.
            self._runtimes.clear()
            tick_key = f"daris:tick:{lecture_id}"
            now = float(await self._db.fetchval("SELECT extract(epoch FROM clock_timestamp())::float8")) * 1000
            last = float(await self._redis.client.get(tick_key) or 0)
            cached = await self._signals.get_cached_snapshot(lecture_id)
            if cached and now - last < self._settings.serverless_tick_ms:
                return RippleUpdatePayload.model_validate(cached)
            current = await self._db.fetchrow("SELECT * FROM lectures WHERE id=$1", lecture_id)
            assert current is not None
            payload = await super().evaluate(current, publish=publish)
            await self._signals.cache_snapshot(lecture_id, payload.model_dump(mode="json"))
            await self._redis.client.set(tick_key, now, ex=21_600)
            await self._analytics.flush_metrics(current)
            return payload

    async def snapshot_for(self, lecture: dict[str, Any]) -> RippleUpdatePayload:
        return await self.evaluate(lecture)

    async def publish_lecture_state(self, lecture: dict[str, Any], status: str) -> None:
        async with self._db.transaction():
            await self._db.fetchval("SELECT pg_advisory_xact_lock($1)", STATE_LOCK)
            await super().publish_lecture_state(lecture, status)
