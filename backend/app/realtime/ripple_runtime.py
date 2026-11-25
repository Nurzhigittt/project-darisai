from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import ValidationError

from app.config import Settings
from app.db import Database
from app.observability import RIPPLE_UPDATES
from app.realtime.envelope import make_envelope
from app.realtime.pubsub import LectureEventBus
from app.realtime.ripple import RippleEngine, RippleSnapshot
from app.realtime.signals import SignalProcessor
from app.redis_client import RedisClient
from app.schemas.ws import RippleCluster, RippleUpdatePayload
from app.services.analytics import AnalyticsService
from app.services.lectures import elapsed_lecture_ms

logger = logging.getLogger("daris.ripple")

BROADCAST_INTERVAL_MS = 500


@dataclass
class RuntimeState:
    lecture_id: UUID
    engine: RippleEngine
    cluster_id: UUID | None = None
    ripple_seq: int = 0
    last_sent_wall_ms: int = 0
    last_payload: dict[str, Any] | None = None
    last_cluster_db_update_ms: int = 0
    sequence: int = field(default=0)


class RippleRuntime:
    def __init__(
        self,
        db: Database,
        redis_client: RedisClient,
        settings: Settings,
        signals: SignalProcessor,
        analytics: AnalyticsService,
        event_bus: LectureEventBus,
    ) -> None:
        self._db = db
        self._redis = redis_client
        self._settings = settings
        self._signals = signals
        self._analytics = analytics
        self._event_bus = event_bus
        self._runtimes: dict[UUID, RuntimeState] = {}
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._wake = asyncio.Event()
        self._worker_id = str(uuid4())
        self._live_cache: list[dict[str, Any]] = []
        self._cache_refreshed_ms = 0

    def notify_signal(self) -> None:
        """Wake the evaluator immediately instead of waiting for the next tick."""
        self._wake.set()

    def _state_key(self, lecture_id: UUID) -> str:
        return f"daris:ripple_engine:{lecture_id}"

    async def _load_runtime(self, lecture: dict[str, Any]) -> RuntimeState:
        lecture_id = UUID(str(lecture["id"]))
        runtime = self._runtimes.get(lecture_id)
        if runtime is not None:
            return runtime
        raw = await self._redis.client.get(self._state_key(lecture_id))
        if raw:
            try:
                state = json.loads(raw)
                engine_data = state.get("engine", {})
                runtime = RuntimeState(
                    lecture_id=lecture_id,
                    engine=RippleEngine.from_dict(engine_data),
                    cluster_id=UUID(state["cluster_id"]) if state.get("cluster_id") else None,
                    ripple_seq=int(state.get("ripple_seq", 0)),
                    last_sent_wall_ms=int(state.get("last_sent_wall_ms", 0)),
                    last_payload=state.get("last_payload"),
                )
            except (json.JSONDecodeError, KeyError, ValueError):
                runtime = RuntimeState(lecture_id=lecture_id, engine=RippleEngine())
        else:
            runtime = RuntimeState(lecture_id=lecture_id, engine=RippleEngine())
        if runtime.cluster_id is None and runtime.engine.state == "cluster":
            open_cluster = await self._analytics.open_cluster(lecture_id)
            if open_cluster is not None:
                runtime.cluster_id = UUID(str(open_cluster["id"]))
        self._runtimes[lecture_id] = runtime
        return runtime

    async def _persist_runtime(self, runtime: RuntimeState) -> None:
        payload = {
            "engine": runtime.engine.to_dict(),
            "cluster_id": str(runtime.cluster_id) if runtime.cluster_id else None,
            "ripple_seq": runtime.ripple_seq,
            "last_sent_wall_ms": runtime.last_sent_wall_ms,
            "last_payload": runtime.last_payload,
        }
        await self._redis.client.set(
            self._state_key(runtime.lecture_id),
            json.dumps(payload, default=str),
            ex=21_600,
        )

    async def evaluate(
        self, lecture: dict[str, Any], *, publish: bool = True
    ) -> RippleUpdatePayload:
        runtime = await self._load_runtime(lecture)
        lecture_id = runtime.lecture_id
        active = await self._signals.active_count(lecture_id)
        unique = await self._signals.unique_in_window(lecture_id)
        await self._signals.update_peak_active(lecture_id, active)
        offset_ms = elapsed_lecture_ms(lecture)
        now_wall_ms = int(time.time() * 1000)
        snapshot: RippleSnapshot = runtime.engine.update(
            active_participants=active,
            unique_in_window=unique,
            now_ms=now_wall_ms,
            offset_ms=offset_ms,
            lecture_live=lecture["status"] == "live",
        )

        if snapshot.just_entered_cluster:
            runtime.cluster_id = await self._analytics.create_cluster(
                lecture_id,
                snapshot.cluster_started_offset_ms or offset_ms,
                snapshot.cluster_peak or snapshot.intensity,
            )
            await self._redis.client.delete(f"daris:cluster_unique:{runtime.cluster_id}")

        cluster_unique = 0
        if runtime.cluster_id is not None:
            hashes = await self._signals.current_window_hashes(lecture_id)
            if hashes:
                key = f"daris:cluster_unique:{runtime.cluster_id}"
                await self._redis.client.sadd(key, *hashes)
                await self._redis.client.expire(key, 21_600)
            cluster_unique = int(
                await self._redis.client.scard(f"daris:cluster_unique:{runtime.cluster_id}")
            )
            if now_wall_ms - runtime.last_cluster_db_update_ms >= 1_000:
                await self._analytics.update_cluster(
                    runtime.cluster_id,
                    peak_intensity=snapshot.cluster_peak or snapshot.intensity,
                    unique_tokens=cluster_unique,
                )
                runtime.last_cluster_db_update_ms = now_wall_ms

        if snapshot.just_closed_cluster and runtime.cluster_id is not None:
            await self._analytics.close_cluster(
                runtime.cluster_id,
                end_ms=offset_ms,
                unique_tokens=cluster_unique,
            )
            runtime.cluster_id = None

        cluster = None
        if runtime.cluster_id is not None and snapshot.state == "cluster":
            cluster = RippleCluster(
                cluster_id=runtime.cluster_id,
                started_offset_ms=snapshot.cluster_started_offset_ms or offset_ms,
                peak_intensity=round(snapshot.cluster_peak or snapshot.intensity, 4),
            )

        payload = RippleUpdatePayload(
            ripple_seq=runtime.ripple_seq,
            offset_ms=offset_ms,
            intensity=round(snapshot.intensity, 4),
            state=snapshot.state,
            availability=snapshot.availability,
            status_label=snapshot.status_label,
            cluster=cluster,
            active_participants=active,
            unique_in_window=unique,
            threshold=snapshot.threshold,
            window_ms=snapshot.window_ms,
        )

        previous = runtime.last_payload or {}
        previous_intensity = float(previous.get("intensity", -1))
        previous_state = previous.get("state")
        previous_unique = int(previous.get("unique_in_window", -1))
        changed = (
            previous_state != payload.state
            or abs(payload.intensity - previous_intensity)
            >= self._settings.ripple_broadcast_min_delta
            or payload.unique_in_window != previous_unique
        )
        can_send = now_wall_ms - runtime.last_sent_wall_ms >= BROADCAST_INTERVAL_MS
        if publish and changed and can_send:
            runtime.ripple_seq += 1
            payload = payload.model_copy(update={"ripple_seq": runtime.ripple_seq})
            runtime.last_sent_wall_ms = now_wall_ms
            runtime.last_payload = payload.model_dump(mode="json")
            event = make_envelope("ripple_update", lecture_id, payload)
            await self._event_bus.publish(lecture_id, event)
            RIPPLE_UPDATES.inc()
            await self._signals.cache_snapshot(lecture_id, payload.model_dump(mode="json"))
        elif runtime.last_payload is None:
            runtime.last_payload = payload.model_dump(mode="json")
            await self._signals.cache_snapshot(lecture_id, payload.model_dump(mode="json"))

        await self._persist_runtime(runtime)
        return payload

    async def snapshot_for(self, lecture: dict[str, Any]) -> RippleUpdatePayload:
        lecture_id = UUID(str(lecture["id"]))
        cached = await self._signals.get_cached_snapshot(lecture_id)
        if cached:
            try:
                return RippleUpdatePayload.model_validate(cached)
            except ValidationError:
                return await self.evaluate(lecture, publish=False)
        return await self.evaluate(lecture, publish=False)

    async def _acquire_eval_lock(self, lecture_id: UUID) -> bool:
        key = f"daris:eval_lock:{lecture_id}"
        result = await self._redis.client.set(key, self._worker_id, nx=True, px=5_000)
        return bool(result)

    async def _release_eval_lock(self, lecture_id: UUID) -> None:
        key = f"daris:eval_lock:{lecture_id}"
        current = await self._redis.client.get(key)
        if current == self._worker_id:
            await self._redis.client.delete(key)

    async def _refresh_live(self, now_wall_ms: int) -> None:
        if now_wall_ms - self._cache_refreshed_ms < 1_000:
            return
        self._live_cache = await self._db.fetch(
            "SELECT * FROM lectures WHERE status = 'live' ORDER BY created_at"
        )
        self._cache_refreshed_ms = now_wall_ms

    async def run(self) -> None:
        self._stop.clear()
        while not self._stop.is_set():
            started = time.monotonic()
            try:
                now_wall_ms = int(time.time() * 1000)
                await self._refresh_live(now_wall_ms)
                for lecture in self._live_cache:
                    lecture_id = UUID(str(lecture["id"]))
                    acquired = await self._acquire_eval_lock(lecture_id)
                    if not acquired:
                        continue
                    try:
                        await self.evaluate(lecture)
                    finally:
                        await self._release_eval_lock(lecture_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("ripple evaluation cycle failed")
            elapsed = (time.monotonic() - started) * 1000
            timeout = max(0.02, (self._settings.ripple_eval_interval_ms - elapsed) / 1000)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=timeout)
            self._wake.clear()

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self.run(), name="daris-ripple-evaluator")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def publish_lecture_state(self, lecture: dict[str, Any], status: str) -> None:
        offset_ms = elapsed_lecture_ms(lecture)
        self._cache_refreshed_ms = 0
        if status == "ended":
            await self._analytics.finalize_lecture(lecture)
        elif status == "live":
            await self._analytics.flush_metrics(lecture)
        event = make_envelope(
            "lecture_state",
            UUID(str(lecture["id"])),
            {
                "status": status,
                "offset_ms": offset_ms,
            },
            ts=datetime.now(UTC),
        )
        try:
            await self._event_bus.publish(UUID(str(lecture["id"])), event)
        except Exception:
            logger.exception(
                "failed to publish lecture state",
                extra={"lecture_id": str(lecture["id"]), "event": "lecture_state"},
            )
