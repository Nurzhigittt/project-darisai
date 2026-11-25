from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import UUID

from app.axiom.embeddings import EmbeddingError
from app.axiom.lexical import rank_hybrid, temporal_overlap
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
    """Lecture-isolated hybrid temporal, dense and lexical retrieval.

    Dense search is exact filtered cosine (not an approximate global HNSW scan).
    Lexical BM25 uses a language-neutral prefix stemmer and a small, lecture-
    grounded multilingual alias vocabulary. RRF combines both with a temporal
    window preference. Every SQL query is still restricted by `lecture_id`.
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

        rows = await self._db.fetch(
            """
            SELECT id, lecture_id, start_ms, end_ms, text
            FROM transcript_segments
            WHERE lecture_id = $1
            ORDER BY start_ms, id
            LIMIT $2
            """,
            lecture_id,
            self._settings.axiom_max_transcript_segments,
        )
        segments = [_segment(row) for row in rows]
        temporal = [
            segment
            for segment in segments
            if temporal_overlap(
                start_ms=segment.start_ms,
                end_ms=segment.end_ms,
                focus_ms=focus,
                before_ms=before,
                after_ms=after,
            )
        ]
        dense_scores = [-1.0] * len(segments)
        raw_similarity: float | None = None
        degraded = False
        semantic: list[TranscriptSegment] = []
        if query.strip() and segments:
            try:
                vector = await self._embeddings.embed_query(query[:2_000])
                dense_rows = await self._db.fetch(
                    """
                    SELECT id, 1 - (embedding <=> $2::vector) AS similarity
                    FROM transcript_segments
                    WHERE lecture_id = $1 AND embedding IS NOT NULL
                    ORDER BY embedding <=> $2::vector
                    LIMIT $3
                    """,
                    lecture_id,
                    _vector_literal(vector),
                    self._settings.axiom_dense_candidates,
                )
                by_id = {str(segment.segment_id): index for index, segment in enumerate(segments)}
                for row in dense_rows:
                    index = by_id.get(str(row["id"]))
                    if index is None:
                        continue
                    similarity = float(row.get("similarity") or 0.0)
                    dense_scores[index] = similarity
                    raw_similarity = (
                        similarity if raw_similarity is None else max(raw_similarity, similarity)
                    )
            except (EmbeddingError, OSError, RuntimeError, ValueError):
                degraded = True
                self._embedding_failure = "embedding_unavailable"

        if query.strip() and segments:
            if self._settings.axiom_retrieval_mode == "dense":
                dense_order = sorted(
                    range(len(segments)),
                    key=lambda index: (-dense_scores[index], segments[index].start_ms),
                )
                semantic = [
                    segments[index]
                    for index in dense_order[:top_k]
                    if dense_scores[index] >= self._settings.axiom_similarity_floor
                ]
            else:
                selected = rank_hybrid(
                    segments=segments,
                    dense_scores=dense_scores,
                    query=query,
                    focus_ms=focus,
                    before_ms=before,
                    after_ms=after,
                    top_k=max(top_k, self._settings.axiom_retrieval_top_k),
                    dense_candidates=self._settings.axiom_dense_candidates,
                    lexical_candidates=self._settings.axiom_lexical_candidates,
                    rrf_k=self._settings.axiom_rrf_k,
                    dense_weight=self._settings.axiom_dense_weight,
                    lexical_weight=self._settings.axiom_lexical_weight,
                    temporal_weight=self._settings.axiom_temporal_weight,
                    dense_floor=self._settings.axiom_similarity_floor,
                    use_temporal=True,
                    use_expansion=self._settings.axiom_query_expansion,
                )
                temporal_ids = {str(segment.segment_id) for segment in temporal}
                semantic = [
                    segments[index]
                    for index in selected
                    if str(segments[index].segment_id) not in temporal_ids
                ][:top_k]

        limited_temporal: list[TranscriptSegment] = []
        limited_semantic: list[TranscriptSegment] = []
        chars = 0
        for segment in temporal:
            if chars + len(segment.text) > self._settings.axiom_max_context_chars:
                break
            limited_temporal.append(segment)
            chars += len(segment.text)
        seen = {str(segment.segment_id) for segment in limited_temporal}
        for segment in semantic:
            key = str(segment.segment_id)
            if key in seen:
                continue
            if chars + len(segment.text) > self._settings.axiom_max_context_chars:
                break
            limited_semantic.append(segment)
            seen.add(key)
            chars += len(segment.text)

        return RetrievalContext(
            lecture_id=lecture_id,
            focus_offset_ms=focus,
            window_start_ms=window_start,
            window_end_ms=window_end,
            temporal_segments=limited_temporal,
            semantic_segments=limited_semantic,
            retrieval_similarity=round(max(0.0, raw_similarity or 0.0), 4)
            if raw_similarity is not None
            else None,
            raw_similarity=raw_similarity,
            evidence_sufficient=bool(limited_temporal or limited_semantic),
            degraded=degraded,
        )
