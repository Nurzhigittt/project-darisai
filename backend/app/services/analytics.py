from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.config import Settings
from app.db import Database
from app.redis_client import RedisClient
from app.schemas.lectures import (
    ClusterOut,
    HeatmapBucket,
    HeatmapResponse,
    LectureSummary,
)
from app.services.lectures import elapsed_lecture_ms


class AnalyticsService:
    def __init__(self, db: Database, redis_client: RedisClient, settings: Settings) -> None:
        self._db = db
        self._redis = redis_client
        self._settings = settings

    async def flush_metrics(self, lecture: dict[str, Any], *, force: bool = False) -> None:
        lecture_id = UUID(str(lecture["id"]))
        offset_ms = elapsed_lecture_ms(lecture)
        await self._flush_buckets(lecture_id, offset_ms, force=force)
        await self._flush_minutes(lecture_id, offset_ms, force=force)

    async def _flush_buckets(self, lecture_id: UUID, offset_ms: int, *, force: bool) -> None:
        registry = f"daris:buckets:{lecture_id}"
        members = await self._redis.client.smembers(registry)
        for raw_start in sorted(members, key=int):
            bucket_start = int(raw_start)
            if not force and bucket_start + self._settings.signal_bucket_ms + 2_000 > offset_ms:
                continue
            count, unique = await self._take_pair(
                f"daris:bucket:signals:{lecture_id}:{bucket_start}",
                f"daris:bucket:unique:{lecture_id}:{bucket_start}",
                suffix=str(bucket_start),
            )
            if count > 0:
                await self._db.execute(
                    """
                    INSERT INTO signal_buckets
                        (lecture_id, bucket_start_ms, bucket_ms, signals, unique_tokens)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (lecture_id, bucket_start_ms) DO UPDATE SET
                        signals = signal_buckets.signals + EXCLUDED.signals,
                        unique_tokens = GREATEST(
                            signal_buckets.unique_tokens, EXCLUDED.unique_tokens
                        )
                    """,
                    lecture_id,
                    bucket_start,
                    self._settings.signal_bucket_ms,
                    count,
                    unique,
                )
            await self._redis.client.srem(registry, raw_start)

    async def _flush_minutes(self, lecture_id: UUID, offset_ms: int, *, force: bool) -> None:
        registry = f"daris:minutes:{lecture_id}"
        members = await self._redis.client.smembers(registry)
        for raw_start in sorted(members, key=int):
            minute_start = int(raw_start)
            if not force and minute_start + 60_000 + 5_000 > offset_ms:
                continue
            count, unique = await self._take_pair(
                f"daris:minute:signals:{lecture_id}:{minute_start}",
                f"daris:minute:unique:{lecture_id}:{minute_start}",
                suffix=str(minute_start),
            )
            if count > 0:
                await self._db.execute(
                    """
                    INSERT INTO lecture_minutes
                        (lecture_id, minute_start_ms, signals, unique_tokens)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (lecture_id, minute_start_ms) DO UPDATE SET
                        signals = lecture_minutes.signals + EXCLUDED.signals,
                        unique_tokens = GREATEST(
                            lecture_minutes.unique_tokens, EXCLUDED.unique_tokens
                        )
                    """,
                    lecture_id,
                    minute_start,
                    count,
                    unique,
                )
            await self._redis.client.srem(registry, raw_start)

    async def _take_pair(
        self, signals_key: str, unique_key: str, *, suffix: str
    ) -> tuple[int, int]:
        temp_signals = f"{signals_key}:flush:{suffix}"
        temp_unique = f"{unique_key}:flush:{suffix}"
        moved_signals = await self._redis.client.renamenx(signals_key, temp_signals)
        moved_unique = await self._redis.client.renamenx(unique_key, temp_unique)
        count = 0
        unique = 0
        if moved_signals:
            raw = await self._redis.client.hgetall(temp_signals)
            count = int(raw.get("signals", 0))
            await self._redis.client.delete(temp_signals)
        if moved_unique:
            unique = int(await self._redis.client.scard(temp_unique))
            await self._redis.client.delete(temp_unique)
        return count, unique

    async def heatmap(self, lecture: dict[str, Any]) -> HeatmapResponse:
        lecture_id = UUID(str(lecture["id"]))
        rows = await self._db.fetch(
            """
            SELECT minute_start_ms, signals, unique_tokens
            FROM lecture_minutes WHERE lecture_id = $1 ORDER BY minute_start_ms
            """,
            lecture_id,
        )
        peak_active = int(lecture.get("peak_active_participants") or 0)
        threshold = max(3, math.ceil(0.15 * peak_active)) if peak_active else 3
        buckets = [
            HeatmapBucket(
                minute=int(row["minute_start_ms"] // 60_000),
                minute_start_ms=int(row["minute_start_ms"]),
                signals=int(row["signals"]),
                unique=int(row["unique_tokens"]),
                intensity=round(min(1.0, row["unique_tokens"] / (2 * threshold)), 4),
            )
            for row in rows
        ]
        clusters = await self.clusters_for_lecture(lecture_id)
        return HeatmapResponse(
            lecture_id=lecture_id,
            buckets=buckets,
            clusters=clusters,
            generated_at=datetime.now(UTC),
        )

    async def clusters_for_lecture(
        self, lecture_id: UUID, *, include_open: bool = True
    ) -> list[ClusterOut]:
        rows = await self._db.fetch(
            """
            SELECT id, start_ms, end_ms, peak_intensity, unique_tokens
            FROM confusion_clusters
            WHERE lecture_id = $1 AND ($2 OR end_ms IS NOT NULL)
            ORDER BY start_ms
            """,
            lecture_id,
            include_open,
        )
        return [
            ClusterOut(
                cluster_id=row["id"],
                start_ms=int(row["start_ms"]),
                end_ms=int(row["end_ms"]) if row["end_ms"] is not None else None,
                peak_intensity=float(row["peak_intensity"]),
                unique_tokens=int(row["unique_tokens"]),
            )
            for row in rows
        ]

    async def summary(self, lecture: dict[str, Any]) -> LectureSummary:
        lecture_id = UUID(str(lecture["id"]))
        heatmap = await self.heatmap(lecture)
        now = datetime.now(UTC)
        duration_ms = elapsed_lecture_ms(lecture, now)
        clusters = heatmap.clusters
        return LectureSummary(
            lecture_id=lecture_id,
            title=str(lecture["title"]),
            status=lecture["status"],
            language=lecture["language"],
            duration_ms=duration_ms,
            accepted_signals=int(lecture.get("accepted_signals") or 0),
            unique_participants=lecture.get("unique_participants"),
            peak_active_participants=lecture.get("peak_active_participants"),
            clusters=clusters,
            timeline=heatmap.buckets,
            clarification_moments=clusters,
            generated_at=now,
        )

    async def create_cluster(self, lecture_id: UUID, start_ms: int, peak_intensity: float) -> UUID:
        cluster_id = await self._db.fetchval(
            """
            INSERT INTO confusion_clusters
                (lecture_id, start_ms, peak_intensity, unique_tokens)
            VALUES ($1, $2, $3, 0)
            RETURNING id
            """,
            lecture_id,
            start_ms,
            round(max(0.0, min(1.0, peak_intensity)), 4),
        )
        return UUID(str(cluster_id))

    async def update_cluster(
        self,
        cluster_id: UUID,
        *,
        peak_intensity: float,
        unique_tokens: int,
    ) -> None:
        await self._db.execute(
            """
            UPDATE confusion_clusters
            SET peak_intensity = GREATEST(peak_intensity, $2),
                unique_tokens = GREATEST(unique_tokens, $3),
                updated_at = now()
            WHERE id = $1
            """,
            cluster_id,
            round(max(0.0, min(1.0, peak_intensity)), 4),
            max(0, unique_tokens),
        )

    async def close_cluster(self, cluster_id: UUID, *, end_ms: int, unique_tokens: int) -> None:
        await self._db.execute(
            """
            UPDATE confusion_clusters
            SET end_ms = GREATEST(start_ms, $2),
                unique_tokens = GREATEST(unique_tokens, $3),
                updated_at = now()
            WHERE id = $1 AND end_ms IS NULL
            """,
            cluster_id,
            max(0, end_ms),
            max(0, unique_tokens),
        )

    async def open_cluster(self, lecture_id: UUID) -> dict[str, Any] | None:
        return await self._db.fetchrow(
            """
            SELECT * FROM confusion_clusters
            WHERE lecture_id = $1 AND end_ms IS NULL
            ORDER BY start_ms DESC LIMIT 1
            """,
            lecture_id,
        )

    async def finalize_lecture(
        self, lecture: dict[str, Any], *, end_offset_ms: int | None = None
    ) -> None:
        lecture_id = UUID(str(lecture["id"]))
        offset = end_offset_ms if end_offset_ms is not None else elapsed_lecture_ms(lecture)
        await self.flush_metrics(lecture, force=True)
        open_cluster = await self.open_cluster(lecture_id)
        if open_cluster is not None:
            unique = int(
                await self._redis.client.scard(f"daris:cluster_unique:{open_cluster['id']}")
            )
            await self.close_cluster(
                UUID(str(open_cluster["id"])),
                end_ms=offset,
                unique_tokens=unique,
            )
        total = int(await self._redis.client.get(f"daris:total:{lecture_id}") or 0)
        unique_total = int(await self._redis.client.scard(f"daris:all_unique:{lecture_id}"))
        peak_active = int(await self._redis.client.get(f"daris:peak_active:{lecture_id}") or 0)
        await self._db.execute(
            """
            UPDATE lectures
            SET accepted_signals = GREATEST(accepted_signals, $2),
                unique_participants = GREATEST(COALESCE(unique_participants, 0), $3),
                peak_active_participants = GREATEST(
                    COALESCE(peak_active_participants, 0), $4
                ),
                updated_at = now()
            WHERE id = $1
            """,
            lecture_id,
            total,
            unique_total,
            peak_active,
        )
