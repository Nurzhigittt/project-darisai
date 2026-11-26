from __future__ import annotations

import contextlib
import hashlib
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from app.axiom.embeddings import EmbeddingError
from app.axiom.models import TranscriptSegment
from app.config import Settings
from app.db import Database
from app.errors import AppError
from app.schemas.axiom import (
    AudioChunkOut,
    TranscriptImportOut,
    TranscriptRunOut,
    TranscriptSegmentOut,
)
from app.stt.interfaces import SttError, SttProvider


def _content_hash(start_ms: int, end_ms: int, text: str) -> str:
    normalized = " ".join(text.split()).casefold()
    return hashlib.sha256(f"{start_ms}|{end_ms}|{normalized}".encode()).hexdigest()


def _vector_literal(vector: Sequence[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in vector) + "]"


def _run_out(row: dict[str, Any]) -> TranscriptRunOut:
    return TranscriptRunOut(
        run_id=row["id"],
        source=row["source"],
        status=row["status"],
        segment_count=int(row["segment_count"]),
        embedded_count=int(row["embedded_count"]),
        embedding_model=row.get("embedding_model"),
        error_code=row.get("error_code"),
        created_at=row["created_at"],
        completed_at=row.get("completed_at"),
    )


class TranscriptService:
    def __init__(
        self,
        db: Database,
        settings: Settings,
        embeddings: Any,
        stt: SttProvider | None,
        concepts: Any | None = None,
    ) -> None:
        self._db = db
        self._settings = settings
        self._embeddings = embeddings
        self._stt = stt
        self._concepts = concepts

    async def get_owned_lecture(self, lecture_id: UUID, professor_id: UUID) -> dict[str, Any]:
        row = await self._db.fetchrow(
            "SELECT * FROM lectures WHERE id = $1 AND professor_id = $2",
            lecture_id,
            professor_id,
        )
        if row is None:
            raise AppError(404, "NOT_FOUND", "Lecture not found.")
        return row

    async def import_segments(
        self,
        *,
        lecture_id: UUID,
        language: str,
        segments: Sequence[Any],
        source: str,
    ) -> TranscriptImportOut:
        if not segments:
            raise AppError(422, "INVALID_TRANSCRIPT", "At least one transcript segment is required.")
        if len(segments) > self._settings.axiom_max_transcript_segments:
            raise AppError(413, "TRANSCRIPT_TOO_LARGE", "The transcript has too many segments.")
        if language not in {"ru", "kk", "en"}:
            raise AppError(422, "UNSUPPORTED_LANGUAGE", "Unsupported transcript language.")
        for segment in segments:
            if segment.start_ms < 0 or segment.end_ms < segment.start_ms:
                raise AppError(422, "INVALID_TIMESTAMP", "Transcript timestamps are invalid.")
            if not segment.text.strip():
                raise AppError(422, "INVALID_TRANSCRIPT", "Transcript text is empty.")
        run = await self._db.fetchrow(
            """
            INSERT INTO transcript_ingestion_runs (lecture_id, source, status, started_at)
            VALUES ($1, $2, 'processing', now())
            RETURNING *
            """,
            lecture_id,
            source,
        )
        assert run is not None
        run_id = run["id"]
        texts = [str(segment.text).strip() for segment in segments]
        embeddings: list[list[float] | None]
        embedding_model: str | None = None
        degraded = False
        try:
            vectors = await self._embeddings.embed_passages(texts)
            if len(vectors) != len(texts):
                raise EmbeddingError("Embedding count does not match transcript count.")
            embeddings = list(vectors)
            embedding_model = str(getattr(self._embeddings, "model_version", "unknown"))
        except (EmbeddingError, OSError, RuntimeError, ValueError):
            embeddings = [None] * len(texts)
            degraded = True

        embedded_count = 0
        async with self._db.transaction() as connection:
            for segment, embedding in zip(segments, embeddings, strict=True):
                vector = _vector_literal(embedding) if embedding is not None else None
                if vector is not None:
                    embedded_count += 1
                await connection.execute(
                    """
                    INSERT INTO transcript_segments
                        (lecture_id, start_ms, end_ms, text, embedding, content_hash,
                         language, source, embedding_model, embedding_updated_at)
                    VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9,
                            CASE WHEN $5::vector IS NULL THEN NULL ELSE now() END)
                    ON CONFLICT (lecture_id, content_hash) WHERE content_hash IS NOT NULL
                    DO UPDATE SET
                        start_ms = EXCLUDED.start_ms,
                        end_ms = EXCLUDED.end_ms,
                        text = EXCLUDED.text,
                        embedding = COALESCE(EXCLUDED.embedding, transcript_segments.embedding),
                        language = EXCLUDED.language,
                        source = EXCLUDED.source,
                        embedding_model = COALESCE(
                            EXCLUDED.embedding_model, transcript_segments.embedding_model
                        ),
                        embedding_updated_at = CASE
                            WHEN EXCLUDED.embedding IS NULL
                            THEN transcript_segments.embedding_updated_at
                            ELSE now()
                        END
                    """,
                    lecture_id,
                    int(segment.start_ms),
                    int(segment.end_ms),
                    str(segment.text).strip(),
                    vector,
                    _content_hash(int(segment.start_ms), int(segment.end_ms), str(segment.text)),
                    language,
                    source,
                    embedding_model,
                )
            status = "degraded" if degraded else "completed"
            updated_run = await connection.fetchrow(
                """
                UPDATE transcript_ingestion_runs
                SET status = $2, segment_count = $3, embedded_count = $4,
                    embedding_model = $5, completed_at = now(),
                    error_code = CASE WHEN $6 THEN 'EMBEDDING_DEGRADED' ELSE NULL END
                WHERE id = $1
                RETURNING *
                """,
                run_id,
                status,
                len(segments),
                embedded_count,
                embedding_model,
                degraded,
            )
        assert updated_run is not None
        if self._concepts is not None:
            with contextlib.suppress(Exception):
                await self._concepts.ensure_for_lecture(lecture_id)
        return TranscriptImportOut(
            lecture_id=lecture_id,
            run=_run_out(dict(updated_run)),
            segments=len(segments),
            embedded=embedded_count,
            degraded=degraded,
        )

    async def ingest_fixture(
        self, *, lecture_id: UUID, language: str, segments: Sequence[Any]
    ) -> TranscriptImportOut:
        return await self.import_segments(
            lecture_id=lecture_id, language=language, segments=segments, source="fixture"
        )

    async def get_transcript(self, lecture_id: UUID) -> tuple[list[TranscriptSegmentOut], TranscriptRunOut | None]:
        rows = await self._db.fetch(
            """
            SELECT id, lecture_id, start_ms, end_ms, text, language,
                   embedding IS NOT NULL AS has_embedding
            FROM transcript_segments
            WHERE lecture_id = $1
            ORDER BY start_ms, id
            """,
            lecture_id,
        )
        segments = [
            TranscriptSegmentOut(
                segment_id=row["id"],
                lecture_id=row["lecture_id"],
                start_ms=int(row["start_ms"]),
                end_ms=int(row["end_ms"]),
                text=row["text"],
                language=row.get("language"),
                has_embedding=bool(row["has_embedding"]),
            )
            for row in rows
        ]
        latest = await self._db.fetchrow(
            """
            SELECT * FROM transcript_ingestion_runs
            WHERE lecture_id = $1 ORDER BY created_at DESC LIMIT 1
            """,
            lecture_id,
        )
        return segments, _run_out(latest) if latest else None

    async def ingest_audio_chunk(
        self,
        *,
        lecture_id: UUID,
        chunk_index: int,
        start_ms: int,
        mime_type: str,
        filename: str,
        audio: bytes,
        language: str,
        professor_id: UUID,
    ) -> AudioChunkOut:
        await self.get_owned_lecture(lecture_id, professor_id)
        if self._stt is None:
            raise AppError(503, "STT_NOT_CONFIGURED", "Speech-to-text is not configured.")
        if len(audio) > self._settings.axiom_stt_max_file_bytes:
            raise AppError(413, "AUDIO_TOO_LARGE", "The audio chunk is too large.")
        allowed = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg"}
        if mime_type not in allowed:
            raise AppError(415, "UNSUPPORTED_AUDIO", "Unsupported audio format.")
        digest = hashlib.sha256(audio).hexdigest()
        existing = await self._db.fetchrow(
            "SELECT * FROM audio_chunks WHERE lecture_id = $1 AND chunk_index = $2",
            lecture_id,
            chunk_index,
        )
        if existing is not None:
            if existing["chunk_sha256"] != digest:
                raise AppError(
                    409,
                    "AUDIO_CHUNK_CONFLICT",
                    "A different audio payload was already uploaded with this chunk index.",
                )
            if existing["status"] == "completed":
                run = await self._db.fetchrow(
                    "SELECT * FROM transcript_ingestion_runs WHERE id = $1",
                    existing["run_id"],
                )
                return AudioChunkOut(
                    lecture_id=lecture_id,
                    chunk_index=chunk_index,
                    status="completed",
                    run_id=existing["run_id"],
                    segments=int(run["segment_count"]) if run else 0,
                    embedded=int(run["embedded_count"]) if run else 0,
                    degraded=bool(run and run["status"] == "degraded"),
                )
            raise AppError(409, "AUDIO_CHUNK_IN_PROGRESS", "This audio chunk is already processing.")
        chunk = await self._db.fetchrow(
            """
            INSERT INTO audio_chunks
                (lecture_id, chunk_index, start_ms, mime_type, chunk_sha256, status)
            VALUES ($1, $2, $3, $4, $5, 'processing')
            ON CONFLICT (lecture_id, chunk_index) DO NOTHING
            RETURNING *
            """,
            lecture_id,
            chunk_index,
            start_ms,
            mime_type,
            digest,
        )
        if chunk is None:
            raise AppError(409, "AUDIO_CHUNK_IN_PROGRESS", "This audio chunk is already processing.")
        try:
            result = await self._stt.transcribe(
                audio=audio,
                filename=filename,
                mime_type=mime_type,
                language=language,
            )
        except SttError as exc:
            await self._db.execute(
                "UPDATE audio_chunks SET status = 'failed', error_code = $2, completed_at = now() WHERE id = $1",
                chunk["id"],
                exc.code,
            )
            raise AppError(502, exc.code, "Speech-to-text failed for this chunk.") from exc
        except Exception as exc:
            await self._db.execute(
                "UPDATE audio_chunks SET status = 'failed', error_code = 'STT_ERROR', completed_at = now() WHERE id = $1",
                chunk["id"],
            )
            raise AppError(502, "STT_ERROR", "Speech-to-text failed for this chunk.") from exc

        from app.schemas.axiom import TranscriptSegmentIn

        offset_segments = [
            TranscriptSegmentIn(
                start_ms=start_ms + segment.start_ms,
                end_ms=start_ms + max(segment.end_ms, segment.start_ms),
                text=segment.text,
            )
            for segment in result.segments
        ]
        imported = await self.import_segments(
            lecture_id=lecture_id,
            language=language,
            segments=offset_segments,
            source="audio",
        )
        await self._db.execute(
            """
            UPDATE audio_chunks
            SET status = 'completed', run_id = $2, completed_at = now()
            WHERE id = $1
            """,
            chunk["id"],
            imported.run.run_id,
        )
        return AudioChunkOut(
            lecture_id=lecture_id,
            chunk_index=chunk_index,
            status="completed",
            run_id=imported.run.run_id,
            segments=imported.segments,
            embedded=imported.embedded,
            degraded=imported.degraded,
        )

    async def segments_for_retrieval(
        self, lecture_id: UUID, *, start_ms: int | None = None, end_ms: int | None = None
    ) -> list[TranscriptSegment]:
        conditions = ["lecture_id = $1"]
        args: list[object] = [lecture_id]
        if start_ms is not None:
            args.append(start_ms)
            conditions.append(f"end_ms >= ${len(args)}")
        if end_ms is not None:
            args.append(end_ms)
            conditions.append(f"start_ms <= ${len(args)}")
        query = (
            "SELECT id, lecture_id, start_ms, end_ms, text "
            "FROM transcript_segments WHERE " + " AND ".join(conditions) +
            " ORDER BY start_ms, id"
        )
        rows = await self._db.fetch(query, *args)
        return [
            TranscriptSegment(
                segment_id=row["id"],
                lecture_id=row["lecture_id"],
                start_ms=int(row["start_ms"]),
                end_ms=int(row["end_ms"]),
                text=row["text"],
            )
            for row in rows
        ]
