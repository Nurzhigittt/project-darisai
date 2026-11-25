from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import UUID

from app.axiom.embeddings import EmbeddingError
from app.axiom.models import RetrievalContext, TranscriptSegment
from app.config import Settings
from app.db import Database


def _vector_literal(vector: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"


def _segment(row: dict[str, Any]) -> TranscriptSegment:
    return TranscriptSegment(
        segment_id=row["id"],
        lecture_id=row["lecture_id"],
        start_ms=int(row["start_ms"]),
        end_ms=int(row["end_ms"]),
        text=row["text"],
    )


class TemporalRetriever:
    """Lecture-isolated temporal + exact-cosine retrieval.

    The transcript is small, so exact filtered cosine search is preferred over an
    approximate HNSW scan with an additional lecture filter. The query never leaves
    the requested lecture.
    """

    def __init__(self, db: Database, settings: Settings, embeddings: Any) -> None:
        self._db = db
        self._settings = settings
        self._embeddings = embeddings
        self._embedding_failure: str | None = None

    @property
    def embedding_degraded(self) -> bool:
        return self._embedding_failure is not None

    async def retrieve(
        self,
        *,
        lecture_id: UUID,
        focus_offset_ms: int,
        query: str,
        top_k: int | None = None,
        before_ms: int | None = None,
        after_ms: int | None = None,
    ) -> RetrievalContext:
        focus = max(0, int(focus_offset_ms))
        top_k = max(1, min(top_k or self._settings.axiom_retrieval_top_k, 8))
        before = self._settings.axiom_before_ms if before_ms is None else max(0, before_ms)
        after = self._settings.axiom_after_ms if after_ms is None else max(0, after_ms)
        window_start = max(0, focus - before)
        window_end = focus + after

        temporal_rows = await self._db.fetch(
            """
            SELECT id, lecture_id, start_ms, end_ms, text
            FROM transcript_segments
            WHERE lecture_id = $1
              AND start_ms <= $3
              AND end_ms >= $2
            ORDER BY start_ms, id
            """,
            lecture_id,
            window_start,
            window_end,
        )
        temporal = [_segment(row) for row in temporal_rows]
        semantic: list[TranscriptSegment] = []
        raw_similarity: float | None = None
        degraded = False
        if query.strip():
            try:
                vector = await self._embeddings.embed_query(query[:2_000])
                rows = await self._db.fetch(
                    """
                    SELECT id, lecture_id, start_ms, end_ms, text,
                           1 - (embedding <=> $2::vector) AS similarity
                    FROM transcript_segments
                    WHERE lecture_id = $1 AND embedding IS NOT NULL
                    ORDER BY embedding <=> $2::vector
                    LIMIT $3
                    """,
                    lecture_id,
                    _vector_literal(vector),
                    top_k,
                )
                for row in rows:
                    similarity = float(row.get("similarity") or 0.0)
                    if similarity < self._settings.axiom_similarity_floor:
                        continue
                    raw_similarity = (
                        similarity if raw_similarity is None else max(raw_similarity, similarity)
                    )
                    semantic.append(_segment(row))
            except (EmbeddingError, OSError, RuntimeError, ValueError):
                degraded = True
                self._embedding_failure = "embedding_unavailable"

        seen = {str(segment.segment_id) for segment in temporal}
        semantic = [segment for segment in semantic if str(segment.segment_id) not in seen]
        all_segments = temporal + semantic
        limited: list[TranscriptSegment] = []
        chars = 0
        for segment in all_segments:
            if chars + len(segment.text) > self._settings.axiom_max_context_chars and limited:
                break
            limited.append(segment)
            chars += len(segment.text)
        temporal_ids = {str(segment.segment_id) for segment in temporal}
        semantic_ids = {str(segment.segment_id) for segment in semantic}
        temporal_out = [s for s in limited if str(s.segment_id) in temporal_ids]
        semantic_out = [
            s
            for s in limited
            if str(s.segment_id) in semantic_ids and str(s.segment_id) not in temporal_ids
        ]
        return RetrievalContext(
            lecture_id=lecture_id,
            focus_offset_ms=focus,
            window_start_ms=window_start,
            window_end_ms=window_end,
            temporal_segments=temporal_out,
            semantic_segments=semantic_out,
            retrieval_similarity=round(max(0.0, raw_similarity or 0.0), 4)
            if raw_similarity is not None
            else None,
            raw_similarity=raw_similarity,
            evidence_sufficient=bool(temporal_out or semantic_out),
            degraded=degraded,
        )
